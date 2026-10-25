/**
 * Master data: lokasi, kategori, unit, alasan, mesin/aset, pengguna.
 *
 * Semua rute ini dipakai form di UI (dropdown alasan, pilih lokasi, dsb),
 * jadi bentuk responsnya harus persis seperti kontrak klien.
 */

import type { Sql } from "postgres";
import { z } from "zod";
import { hashSecret } from "@/server/crypto";
import { sql, tenantPool } from "@/server/db";
import { errors, ok, parseBody, requireRole } from "@/server/http";

const roleSchema = z.enum(["worker", "supervisor", "admin"]);

/* ------------------------------------------------------------------ meta */

export async function getMeta(tenant: string): Promise<Response> {
  const db = tenantPool(tenant);

  const warehouses = await db<{ id: string; code: string; name: string }[]>`
    SELECT id, code, name FROM warehouses WHERE active ORDER BY name
  `;
  const categories = await db<{ id: string; name: string; active: boolean }[]>`
    SELECT id, name, true AS active FROM categories ORDER BY name
  `;
  const units = await db<{ id: string; name: string; symbol: string; decimals: number }[]>`
    SELECT id, name, symbol, decimals FROM units ORDER BY name
  `;
  const reasons = await db<{ id: string; name: string; requires_wo: boolean; active: boolean }[]>`
    SELECT id, name, requires_wo, active FROM reasons WHERE active ORDER BY name
  `;
  const equipment = await db<{ id: string; code: string; name: string; active: boolean }[]>`
    SELECT id, code, name, active FROM equipment WHERE active ORDER BY name
  `;
  const locations = await db<
    { id: string; name: string; code: string; path: string; type: string }[]
  >`SELECT id, name, code, path, type FROM locations WHERE active ORDER BY path`;

  return ok({
    warehouses,
    categories,
    units,
    reasons: reasons.map((r) => ({
      id: r.id,
      name: r.name,
      requiresWo: r.requires_wo,
      active: r.active,
    })),
    equipment: equipment.map((e) => ({ ...e, locationId: null })),
    locations,
  });
}

/* -------------------------------------------------------------- lokasi */

export async function listLocations(request: Request, tenant: string): Promise<Response> {
  const db = tenantPool(tenant);
  const url = new URL(request.url);
  const warehouseId = url.searchParams.get("warehouseId");
  const type = url.searchParams.get("type");
  const includeInactive = url.searchParams.get("all") === "1";

  // itemCount & totalQty dihitung di database, bukan di klien: dengan 300 item
  // dan puluhan lokasi, menghitung di JS akan mengirim data yang tidak perlu.
  const rows = await db<
    {
      id: string;
      warehouse_id: string;
      parent_id: string | null;
      type: string;
      code: string;
      name: string;
      path: string;
      active: boolean;
      item_count: number;
      total_qty: number;
    }[]
  >`
    SELECT l.id, l.warehouse_id, l.parent_id, l.type, l.code, l.name, l.path, l.active,
           COALESCE(i.cnt, 0)::int AS item_count,
           COALESCE(s.qty, 0)::int AS total_qty
    FROM locations l
    LEFT JOIN LATERAL (
      SELECT count(*) AS cnt FROM items WHERE primary_location_id = l.id AND active
    ) i ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(qty), 0) AS qty FROM stock_levels WHERE location_id = l.id
    ) s ON true
    WHERE (${includeInactive} OR l.active)
      AND (${warehouseId ?? null}::text IS NULL OR l.warehouse_id = ${warehouseId ?? null})
      AND (${type ?? null}::text IS NULL OR l.type::text = ${type ?? null})
    ORDER BY l.path
  `;

  return ok({
    data: rows.map((r) => ({
      id: r.id,
      warehouseId: r.warehouse_id,
      parentId: r.parent_id,
      type: r.type as "warehouse" | "zone" | "rack" | "bin",
      code: r.code,
      name: r.name,
      path: r.path,
      active: r.active,
      itemCount: r.item_count,
      totalQty: r.total_qty,
    })),
    total: rows.length,
  });
}

const locationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(32),
  parentId: z.string().nullable(),
  type: z.enum(["warehouse", "zone", "rack", "bin"]),
  active: z.boolean().default(true),
});

export async function createLocation(request: Request, tenant: string): Promise<Response> {
  const session = await requireRole("admin");
  const db = tenantPool(tenant);
  const body = await parseBody(request, locationSchema);

  // Path dibangun dari induk supaya hierarki konsisten dan tidak bisa dipalsukan.
  let warehouseId: string;
  let path: string;

  if (body.parentId) {
    const parent = await db<{ id: string; warehouse_id: string; path: string }[]>`
      SELECT id, warehouse_id, path FROM locations WHERE id = ${body.parentId}
    `;
    const p = parent[0];
    if (!p) throw errors.badRequest("Lokasi induk tidak ditemukan.");
    warehouseId = p.warehouse_id;
    path = body.code;
  } else {
    const wh = await db<{ id: string }[]>`SELECT id FROM warehouses ORDER BY name LIMIT 1`;
    const first = wh[0];
    if (!first) throw errors.badRequest("Belum ada gudang.");
    warehouseId = first.id;
    path = body.code;
  }

  const id = `loc_${crypto.randomUUID().slice(0, 8)}`;
  try {
    await db`
      INSERT INTO locations (id, warehouse_id, parent_id, code, name, type, path, active)
      VALUES (${id}, ${warehouseId}, ${body.parentId}, ${body.code}, ${body.name},
              ${body.type}, ${path}, ${body.active})
    `;
  } catch {
    throw errors.conflict("LOCATION_DUPLICATE", "Kode lokasi sudah dipakai di gudang ini.");
  }

  await audit(db, session.user.id, "location", id, "create", null, { name: body.name });
  return ok(
    {
      location: {
        id,
        warehouseId,
        parentId: body.parentId,
        type: body.type,
        code: body.code,
        name: body.name,
        path,
        active: body.active,
      },
    },
    { status: 201 },
  );
}

export async function updateLocation(
  request: Request,
  id: string,
  tenant: string,
): Promise<Response> {
  const session = await requireRole("admin");
  const db = tenantPool(tenant);
  const body = await parseBody(request, locationSchema.partial());

  const before = await db<{ id: string; name: string; path: string; code: string }[]>`
    SELECT id, name, path, code FROM locations WHERE id = ${id}
  `;
  const current = before[0];
  if (!current) throw errors.notFound("Lokasi");

  const name = body.name ?? current.name;
  const code = body.code ?? current.code;
  // Path ikut berubah bila nama berubah, supaya tampilan tidak menyesatkan.
  const newPath =
    name === current.name
      ? current.path
      : current.path.replace(new RegExp(`${escapeRegex(current.name)}$`), name);

  await db`
    UPDATE locations SET name = ${name}, code = ${code}, path = ${newPath},
      active = ${body.active ?? true}, updated_at = now()
    WHERE id = ${id}
  `;

  await audit(db, session.user.id, "location", id, "update", current, { name, code });
  return ok({ location: { id, name, code, path: newPath, active: body.active ?? true } });
}

/* ------------------------------------------------------- kategori & unit */

export async function listCategories(tenant: string): Promise<Response> {
  const db = tenantPool(tenant);
  const rows = await db<{ id: string; name: string; item_count: number }[]>`
    SELECT c.id, c.name, COALESCE(i.cnt, 0)::int AS item_count
    FROM categories c
    LEFT JOIN LATERAL (SELECT count(*) AS cnt FROM items WHERE category_id = c.id) i ON true
    ORDER BY c.name
  `;
  return ok({
    data: rows.map((r) => ({ id: r.id, name: r.name, active: true, itemCount: r.item_count })),
    total: rows.length,
  });
}

export async function upsertCategory(
  request: Request,
  tenant: string,
  id?: string,
): Promise<Response> {
  const session = await requireRole("admin");
  const db = tenantPool(tenant);
  const body = await parseBody(request, z.object({ name: z.string().trim().min(1).max(80) }));

  if (id) {
    await db`UPDATE categories SET name = ${body.name} WHERE id = ${id}`;
    await audit(db, session.user.id, "category", id, "update", null, body);
    return ok({ category: { id, name: body.name, active: true } });
  }

  const newId = `cat_${crypto.randomUUID().slice(0, 8)}`;
  try {
    await db`INSERT INTO categories (id, name) VALUES (${newId}, ${body.name})`;
  } catch {
    throw errors.conflict("CATEGORY_DUPLICATE", "Nama kategori sudah ada.");
  }
  await audit(db, session.user.id, "category", newId, "create", null, body);
  return ok({ category: { id: newId, name: body.name, active: true } }, { status: 201 });
}

export async function listUnits(tenant: string): Promise<Response> {
  const db = tenantPool(tenant);
  const rows = await db<{ id: string; name: string; symbol: string; decimals: number }[]>`
    SELECT id, name, symbol, decimals FROM units ORDER BY name
  `;
  return ok({ data: rows, total: rows.length });
}

export async function upsertUnit(request: Request, tenant: string, id?: string): Promise<Response> {
  const session = await requireRole("admin");
  const db = tenantPool(tenant);
  const body = await parseBody(
    request,
    z.object({
      name: z.string().trim().min(1).max(60),
      symbol: z.string().trim().min(1).max(12),
      decimals: z.number().int().min(0).max(4).default(0),
    }),
  );

  if (id) {
    await db`UPDATE units SET name = ${body.name}, symbol = ${body.symbol},
      decimals = ${body.decimals} WHERE id = ${id}`;
    await audit(db, session.user.id, "unit", id, "update", null, body);
    return ok({ unit: { id, ...body } });
  }

  const newId = `un_${crypto.randomUUID().slice(0, 8)}`;
  try {
    await db`INSERT INTO units (id, name, symbol, decimals)
      VALUES (${newId}, ${body.name}, ${body.symbol}, ${body.decimals})`;
  } catch {
    throw errors.conflict("UNIT_DUPLICATE", "Simbol satuan sudah ada.");
  }
  await audit(db, session.user.id, "unit", newId, "create", null, body);
  return ok({ unit: { id: newId, ...body } }, { status: 201 });
}

/* --------------------------------------------------------------- alasan */

export async function listReasons(request: Request, tenant: string): Promise<Response> {
  const db = tenantPool(tenant);
  const url = new URL(request.url);
  const all = url.searchParams.get("all") === "1";
  const rows = await db<
    { id: string; name: string; requires_wo: boolean; requires_note: boolean; active: boolean }[]
  >`
    SELECT id, name, requires_wo, requires_note, active FROM reasons
    WHERE (${all} OR active) ORDER BY name
  `;
  return ok({
    data: rows.map((r) => ({
      id: r.id,
      name: r.name,
      requiresWo: r.requires_wo,
      requiresNote: r.requires_note,
      active: r.active,
    })),
    total: rows.length,
  });
}

export async function upsertReason(
  request: Request,
  tenant: string,
  id?: string,
): Promise<Response> {
  const session = await requireRole("admin");
  const db = tenantPool(tenant);
  const body = await parseBody(
    request,
    z.object({
      name: z.string().trim().min(1).max(80).optional(),
      requiresWo: z.boolean().optional(),
      active: z.boolean().optional(),
    }),
  );

  if (id) {
    const cur = await db<{ name: string; requires_wo: boolean; active: boolean }[]>`
      SELECT name, requires_wo, active FROM reasons WHERE id = ${id}
    `;
    const c = cur[0];
    if (!c) throw errors.notFound("Alasan");
    const name = body.name ?? c.name;
    const requiresWo = body.requiresWo ?? c.requires_wo;
    const active = body.active ?? c.active;
    await db`UPDATE reasons SET name = ${name}, requires_wo = ${requiresWo}, active = ${active}
      WHERE id = ${id}`;
    await audit(db, session.user.id, "reason", id, "update", c, body);
    return ok({ reason: { id, name, requiresWo, active } });
  }

  if (!body.name) throw errors.badRequest("Nama alasan wajib diisi.");
  const newId = `rs_${crypto.randomUUID().slice(0, 8)}`;
  try {
    await db`INSERT INTO reasons (id, name, requires_wo, active)
      VALUES (${newId}, ${body.name}, ${body.requiresWo ?? false}, ${body.active ?? true})`;
  } catch {
    throw errors.conflict("REASON_DUPLICATE", "Nama alasan sudah ada.");
  }
  await audit(db, session.user.id, "reason", newId, "create", null, body);
  return ok(
    { reason: { id: newId, name: body.name, requiresWo: body.requiresWo ?? false, active: true } },
    { status: 201 },
  );
}

/* --------------------------------------------------------------- mesin */

export async function listEquipment(tenant: string): Promise<Response> {
  const db = tenantPool(tenant);
  const rows = await db<{ id: string; code: string; name: string; active: boolean }[]>`
    SELECT id, code, name, active FROM equipment ORDER BY name
  `;
  return ok({
    data: rows.map((r) => ({ ...r, locationId: null })),
    total: rows.length,
  });
}

export async function upsertEquipment(
  request: Request,
  tenant: string,
  id?: string,
): Promise<Response> {
  const session = await requireRole("admin");
  const db = tenantPool(tenant);
  const body = await parseBody(
    request,
    z.object({
      code: z.string().trim().min(1).max(32).optional(),
      name: z.string().trim().min(1).max(120).optional(),
      active: z.boolean().optional(),
    }),
  );

  if (id) {
    const cur = await db<{ code: string; name: string; active: boolean }[]>`
      SELECT code, name, active FROM equipment WHERE id = ${id}
    `;
    const c = cur[0];
    if (!c) throw errors.notFound("Mesin");
    const code = body.code ?? c.code;
    const name = body.name ?? c.name;
    const active = body.active ?? c.active;
    await db`UPDATE equipment SET code = ${code}, name = ${name}, active = ${active}
      WHERE id = ${id}`;
    await audit(db, session.user.id, "equipment", id, "update", c, body);
    return ok({ equipment: { id, code, name, locationId: null, active } });
  }

  if (!body.code || !body.name) throw errors.badRequest("Kode dan nama mesin wajib diisi.");
  const newId = `eq_${crypto.randomUUID().slice(0, 8)}`;
  try {
    await db`INSERT INTO equipment (id, code, name, active)
      VALUES (${newId}, ${body.code}, ${body.name}, ${body.active ?? true})`;
  } catch {
    throw errors.conflict("EQUIPMENT_DUPLICATE", "Kode mesin sudah ada.");
  }
  await audit(db, session.user.id, "equipment", newId, "create", null, body);
  return ok(
    { equipment: { id: newId, code: body.code, name: body.name, locationId: null, active: true } },
    { status: 201 },
  );
}

/* ------------------------------------------------------------ pengguna */

export async function listUsers(tenant: string): Promise<Response> {
  await requireRole("admin");
  const rows = await sql<
    {
      id: string;
      code: string;
      name: string;
      role: string;
      email: string | null;
      active: boolean;
      shift_ends_at: string | null;
      last_login_at: Date | null;
      created_at: Date;
    }[]
  >`
    SELECT id, code, name, role, email, active, shift_ends_at, last_login_at, created_at
    FROM users WHERE tenant_slug = ${tenant} ORDER BY role, name
  `;
  return ok({
    data: rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      role: r.role,
      email: r.email,
      active: r.active,
      shiftEndsAt: r.shift_ends_at,
      lastLoginAt: r.last_login_at ? r.last_login_at.toISOString() : null,
      createdAt: r.created_at.toISOString(),
    })),
    total: rows.length,
  });
}

export async function createUser(request: Request, tenant: string): Promise<Response> {
  const session = await requireRole("admin");
  const body = await parseBody(
    request,
    z.object({
      name: z.string().trim().min(1).max(120),
      code: z.string().trim().min(2).max(24),
      role: roleSchema,
      email: z.string().trim().email().nullable().optional(),
    }),
  );

  // PIN awal dibuat acak, bukan dari input admin: mencegah PIN seragam.
  const initialPin = String(Math.floor(1000 + Math.random() * 9000));
  const pinHash = await hashSecret(initialPin);
  const passwordHash = body.role === "worker" ? null : await hashSecret(initialPin);
  const id = `usr_${crypto.randomUUID().slice(0, 8)}`;

  try {
    await sql`
      INSERT INTO users (id, code, name, role, email, pin_hash, password_hash,
                         shift_ends_at, tenant_slug)
      VALUES (${id}, ${body.code.toUpperCase()}, ${body.name}, ${body.role},
              ${body.email ?? null}, ${pinHash}, ${passwordHash},
              ${body.role === "worker" ? "16:00" : null}, ${tenant})
    `;
  } catch {
    throw errors.conflict("USER_DUPLICATE", "Kode atau email pengguna sudah dipakai.");
  }

  await audit(sql, session.user.id, "user", id, "create", null, {
    code: body.code,
    role: body.role,
  });
  return ok(
    {
      user: {
        id,
        code: body.code.toUpperCase(),
        name: body.name,
        role: body.role,
        email: body.email ?? null,
        active: true,
        shiftEndsAt: body.role === "worker" ? "16:00" : null,
        lastLoginAt: null,
        createdAt: new Date().toISOString(),
      },
      initialPin,
    },
    { status: 201 },
  );
}

export async function updateUser(request: Request, id: string, _tenant: string): Promise<Response> {
  const session = await requireRole("admin");
  const body = await parseBody(
    request,
    z.object({
      name: z.string().trim().min(1).max(120).optional(),
      role: roleSchema.optional(),
      email: z.string().trim().email().nullable().optional(),
      active: z.boolean().optional(),
      resetPin: z.boolean().optional(),
    }),
  );

  const cur = await sql<
    { name: string; role: string; email: string | null; active: boolean }[]
  >`SELECT name, role, email, active FROM users WHERE id = ${id}`;
  const c = cur[0];
  if (!c) throw errors.notFound("Pengguna");

  const name = body.name ?? c.name;
  const role = body.role ?? (c.role as "worker" | "supervisor" | "admin");
  const email = body.email === undefined ? c.email : body.email;
  const active = body.active ?? c.active;

  let initialPin: string | undefined;
  if (body.resetPin) {
    initialPin = String(Math.floor(1000 + Math.random() * 9000));
    const hash = await hashSecret(initialPin);
    await sql`UPDATE users SET pin_hash = ${hash}, password_hash = ${
      role === "worker" ? null : hash
    } WHERE id = ${id}`;
    // Reset PIN mencabut semua sesi pengguna itu — token lama tidak boleh
    // tetap berlaku setelah kredensial diganti.
    await sql`UPDATE sessions SET revoked_at = now() WHERE user_id = ${id}`;
  }

  await sql`UPDATE users SET name = ${name}, role = ${role}, email = ${email},
    active = ${active}, updated_at = now() WHERE id = ${id}`;

  await audit(sql, session.user.id, "user", id, "update", c, body);
  return ok({
    user: { id, name, role, email, active },
    ...(initialPin ? { initialPin } : {}),
  });
}

/* ---------------------------------------------------------------- audit */

export async function listAudit(request: Request, tenant: string): Promise<Response> {
  await requireRole("admin");
  const url = new URL(request.url);
  const entity = url.searchParams.get("entity");
  const db = tenantPool(tenant);
  const rows = await db<
    {
      id: string;
      entity: string;
      entity_id: string;
      action: string;
      before: unknown;
      after: unknown;
      actor_id: string | null;
      actor_name: string | null;
      source: string;
      created_at: Date;
    }[]
  >`
    SELECT a.id::text, a.entity, a.entity_id, a.action, a.before, a.after,
           a.actor_id, u.name AS actor_name, a.source, a.created_at
    FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
    WHERE (${entity ?? null}::text IS NULL OR a.entity = ${entity ?? null})
    ORDER BY a.created_at DESC LIMIT 500
  `;
  return ok({
    data: rows.map((r) => ({
      id: r.id,
      entity: r.entity,
      entityId: r.entity_id,
      action: r.action,
      before: (r.before as Record<string, unknown> | null) ?? null,
      after: (r.after as Record<string, unknown> | null) ?? null,
      actorId: r.actor_id ?? "",
      actorName: r.actor_name ?? "sistem",
      source: r.source,
      createdAt: r.created_at.toISOString(),
    })),
    total: rows.length,
  });
}

/* ------------------------------------------------------------ utilitas */

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function audit(
  db: Sql,
  actorId: string,
  entity: string,
  entityId: string,
  action: "create" | "update" | "delete",
  before: unknown,
  after: unknown,
) {
  await db`
    INSERT INTO audit_log (entity, entity_id, action, before, after, actor_id, source)
    VALUES (${entity}, ${entityId}, ${action},
            ${before ? db.json(before as never) : null},
            ${after ? db.json(after as never) : null}, ${actorId}, 'dashboard')
  `;
}

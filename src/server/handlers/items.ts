/**
 * Item: pencarian, detail per kode, CRUD.
 *
 * Catatan performa: saldo diambil lewat LEFT JOIN LATERAL ke `stock_levels`,
 * satu query per permintaan. Pola N+1 (loop item lalu query stok masing-masing)
 * dihindari karena dashboard memuat 20-50 baris sekaligus.
 */

import type { Sql } from "postgres";
import { z } from "zod";
import { itemWriteSchema } from "@/lib/api/schemas";
import { sql, tenantPool } from "@/server/db";
import { errors, ok, paginate, parseBody, requireRole, requireSession } from "@/server/http";

interface ItemRow {
  id: string;
  sku: string;
  code: string;
  name: string;
  category_id: string;
  unit_id: string;
  min_stock: number;
  unit_value: string | null;
  is_bulk: boolean;
  primary_location_id: string | null;
  active: boolean;
  photo_url: string | null;
  created_at: Date;
  updated_at: Date;
}

function toItem(row: ItemRow) {
  return {
    id: row.id,
    sku: row.sku,
    code: row.code,
    name: row.name,
    categoryId: row.category_id,
    unitId: row.unit_id,
    minStock: row.min_stock,
    unitValue: row.unit_value === null ? null : Number(row.unit_value),
    isBulk: row.is_bulk,
    primaryLocationId: row.primary_location_id,
    active: row.active,
    photoUrl: row.photo_url,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Skor keyakinan stok.
 *
 * Dihitung dari seberapa baru dan seberapa sering stok diverifikasi lewat
 * konfirmasi sisa (PRD 4.9). Tanpa verifikasi sama sekali = `never`.
 */
function confidenceFor(lastVerifiedAt: Date | null, verifyCount: number) {
  if (!lastVerifiedAt) {
    return { score: 0, level: "never" as const, lastVerifiedAt: null, verifyCount: 0 };
  }
  const ageDays = (Date.now() - lastVerifiedAt.getTime()) / 86_400_000;
  // Makin lama tidak diverifikasi, makin turun; makin sering, makin naik.
  const recency = Math.max(0, 100 - ageDays * 4);
  const frequency = Math.min(100, verifyCount * 12);
  const score = Math.round(recency * 0.7 + frequency * 0.3);
  const level = score >= 80 ? "high" : score >= 50 ? "medium" : "low";
  return { score, level, lastVerifiedAt: lastVerifiedAt.toISOString(), verifyCount };
}

export async function searchItems(request: Request): Promise<Response> {
  const session = await requireSession();
  const db = tenantPool(session.tenant);
  const started = Date.now();
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20) || 20));
  const cursor = url.searchParams.get("cursor");

  // Cari berdasarkan nama/SKU/kode. ILIKE dipakai untuk substring; untuk
  // dataset besar ini bisa diganti full-text index `items_search_idx`.
  const rows = await db<
    (ItemRow & {
      loc_id: string | null;
      loc_qty: number | null;
      loc_path: string | null;
      loc_type: string | null;
      last_verified: Date | null;
      verify_count: number;
    })[]
  >`
    SELECT i.*,
           l.location_id AS loc_id,
           l.qty  AS loc_qty,
           lc.path AS loc_path,
           lc.type AS loc_type,
           v.last_verified,
           COALESCE(v.verify_count, 0)::int AS verify_count
    FROM items i
    LEFT JOIN LATERAL (
      SELECT item_id, location_id, qty
      FROM stock_levels
      WHERE item_id = i.id
      ORDER BY qty DESC
      LIMIT 1
    ) l ON true
    LEFT JOIN locations lc ON lc.id = l.location_id
    LEFT JOIN LATERAL (
      SELECT max(answered_at) AS last_verified, count(*) AS verify_count
      FROM verifications
      WHERE item_id = i.id AND status IN ('recorded','approved')
    ) v ON true
    WHERE i.active
      AND (${q} = '' OR i.name ILIKE ${`%${q}%`} OR i.sku ILIKE ${`%${q}%`}
           OR i.code ILIKE ${`%${q}%`})
    ORDER BY i.name
    LIMIT 500
  `;

  // Ambil semua level stok untuk baris yang lolos filter, sekali jalan.
  const ids = rows.map((r) => r.id);
  const levels = ids.length
    ? await db<
        {
          item_id: string;
          location_id: string;
          qty: number;
          warehouse_id: string;
          parent_id: string | null;
          type: string;
          code: string;
          name: string;
          path: string;
          active: boolean;
        }[]
      >`
        SELECT sl.item_id, sl.location_id, sl.qty,
               lc.warehouse_id, lc.parent_id, lc.type, lc.code, lc.name, lc.path, lc.active
        FROM stock_levels sl
        JOIN locations lc ON lc.id = sl.location_id
        WHERE sl.item_id IN ${sql(ids)}
        ORDER BY lc.path
      `
    : [];

  const byItem = new Map<
    string,
    {
      locationId: string;
      qty: number;
      location: {
        id: string;
        warehouseId: string;
        parentId: string | null;
        type: "warehouse" | "zone" | "rack" | "bin";
        code: string;
        name: string;
        path: string;
        active: boolean;
      };
    }[]
  >();
  for (const level of levels) {
    const list = byItem.get(level.item_id) ?? [];
    list.push({
      locationId: level.location_id,
      qty: level.qty,
      location: toLocation(level),
    });
    byItem.set(level.item_id, list);
  }

  // Unit diambil sekali untuk semua baris (menghindari N+1).
  const unitIds = [...new Set(rows.map((r) => r.unit_id))];
  const unitRows = unitIds.length
    ? await db<{ id: string; name: string; symbol: string; decimals: number }[]>`
        SELECT id, name, symbol, decimals FROM units WHERE id IN ${sql(unitIds)}
      `
    : [];
  const unitsById = new Map(unitRows.map((u) => [u.id, u]));
  const levelUnit = (unitId: string) => unitsById.get(unitId) ?? null;

  const mapped = rows.map((row) => {
    const stock = byItem.get(row.id) ?? [];
    const totalQty = stock.reduce((sum, level) => sum + level.qty, 0);
    const confidence = confidenceFor(row.last_verified, row.verify_count);
    return {
      item: toItem(row),
      stock: stock.map((level) => ({
        itemId: row.id,
        locationId: level.locationId,
        qty: level.qty,
        version: 1,
        updatedAt: new Date().toISOString(),
        lastVerifiedAt: null,
        lastVerifiedQty: null,
        txSinceVerified: 0,
        lastVarianceRatio: 0,
        confidence,
        location: level.location,
      })),
      totalQty,
      confidence,
      unit: levelUnit(row.unit_id),
      primaryLocation: stock[0]?.location ?? null,
    };
  });

  const page = paginate(mapped, cursor, limit);
  // Kontrak klien: data + nextCursor + total + tookMs.
  return ok({ ...page, total: mapped.length, tookMs: Date.now() - started });
}

export async function itemByCode(request: Request, code: string): Promise<Response> {
  const session = await requireSession();
  const db = tenantPool(session.tenant);

  const rows = await db<(ItemRow & { last_verified: Date | null; verify_count: number })[]>`
    SELECT i.*, v.last_verified, COALESCE(v.verify_count, 0)::int AS verify_count
    FROM items i
    LEFT JOIN LATERAL (
      SELECT max(answered_at) AS last_verified, count(*) AS verify_count
      FROM verifications
      WHERE item_id = i.id AND status IN ('recorded','approved')
    ) v ON true
    WHERE upper(i.code) = ${code.toUpperCase()}
  `;

  const row = rows[0];
  if (!row) throw errors.notFound("Item");
  if (!row.active) throw errors.conflict("ITEM_INACTIVE", "Item ini sudah dinonaktifkan.");

  // Satu query untuk semua level + lokasi lengkap. Klien membutuhkan objek
  // `location` utuh (bukan hanya path), jadi kolomnya diambil sekalian.
  const levels = await db<
    {
      location_id: string;
      qty: number;
      warehouse_id: string;
      parent_id: string | null;
      type: string;
      code: string;
      name: string;
      path: string;
      active: boolean;
      last_verified: Date | null;
      verify_count: number;
    }[]
  >`
    SELECT sl.location_id, sl.qty,
           lc.warehouse_id, lc.parent_id, lc.type, lc.code, lc.name, lc.path, lc.active,
           v.last_verified, COALESCE(v.verify_count, 0)::int AS verify_count
    FROM stock_levels sl
    JOIN locations lc ON lc.id = sl.location_id
    LEFT JOIN LATERAL (
      SELECT max(answered_at) AS last_verified, count(*) AS verify_count
      FROM verifications
      WHERE item_id = ${row.id} AND location_id = sl.location_id
        AND status IN ('recorded','approved')
    ) v ON true
    WHERE sl.item_id = ${row.id}
    ORDER BY lc.path
  `;

  const unitRows = await db<{ id: string; name: string; symbol: string; decimals: number }[]>`
    SELECT id, name, symbol, decimals FROM units WHERE id = ${row.unit_id}
  `;
  const categoryRows = await db<{ id: string; name: string; active: boolean }[]>`
    SELECT id, name, true AS active FROM categories WHERE id = ${row.category_id}
  `;
  const primaryRows = await db<
    {
      id: string;
      warehouse_id: string;
      parent_id: string | null;
      type: string;
      code: string;
      name: string;
      path: string;
      active: boolean;
    }[]
  >`
    SELECT id, warehouse_id, parent_id, type, code, name, path, active
    FROM locations WHERE id = ${row.primary_location_id ?? ""}
  `;

  const totalQty = levels.reduce((sum, level) => sum + level.qty, 0);

  return ok({
    item: toItem(row),
    unit: unitRows[0] ?? null,
    category: categoryRows[0] ?? null,
    primaryLocation: primaryRows[0] ? toLocation(primaryRows[0]) : null,
    stock: levels.map((level) => ({
      itemId: row.id,
      locationId: level.location_id,
      qty: level.qty,
      version: 1,
      updatedAt: new Date().toISOString(),
      lastVerifiedAt: level.last_verified ? level.last_verified.toISOString() : null,
      lastVerifiedQty: null,
      txSinceVerified: 0,
      lastVarianceRatio: 0,
      confidence: confidenceFor(level.last_verified, level.verify_count),
      location: toLocation(level),
    })),
    totalQty,
    // Berapa yang sedang dibawa orang lain — dipakai UI untuk peringatan.
    takenByOthers: await custodyOpenQty(db, row.id),
  });
}

/** Qty item yang sedang dibawa pengguna lain (belum diselesaikan). */
async function custodyOpenQty(db: Sql, itemId: string): Promise<number> {
  const rows = await db<{ qty: number }[]>`
    SELECT COALESCE(SUM(qty - qty_settled), 0)::int AS qty
    FROM custody WHERE item_id = ${itemId} AND status = 'open'
  `;
  return rows[0]?.qty ?? 0;
}

/** Bentuk `location` sesuai kontrak klien. */
function toLocation(row: {
  id?: string;
  location_id?: string;
  warehouse_id: string;
  parent_id: string | null;
  type: string;
  code: string;
  name: string;
  path: string;
  active: boolean;
}) {
  return {
    id: row.id ?? row.location_id ?? "",
    warehouseId: row.warehouse_id,
    parentId: row.parent_id,
    type: row.type as "warehouse" | "zone" | "rack" | "bin",
    code: row.code,
    name: row.name,
    path: row.path,
    active: row.active,
  };
}

export async function listItems(request: Request): Promise<Response> {
  const session = await requireRole("supervisor");
  const db = tenantPool(session.tenant);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 100) || 100));
  const cursor = url.searchParams.get("cursor");
  const includeInactive = url.searchParams.get("all") === "1";

  const rows = await db<ItemRow[]>`
    SELECT * FROM items
    WHERE (${includeInactive} OR active)
      AND (${q} = '' OR name ILIKE ${`%${q}%`} OR sku ILIKE ${`%${q}%`})
    ORDER BY name
    LIMIT 1000
  `;

  const totals = await db<{ item_id: string; qty: number }[]>`
    SELECT item_id, SUM(qty)::int AS qty FROM stock_levels GROUP BY item_id
  `;
  const totalByItem = new Map(totals.map((t) => [t.item_id, t.qty]));

  return ok(
    paginate(
      rows.map((row) => ({ ...toItem(row), totalQty: totalByItem.get(row.id) ?? 0 })),
      cursor,
      limit,
    ),
  );
}

export async function createItem(request: Request): Promise<Response> {
  const session = await requireRole("admin");
  const db = tenantPool(session.tenant);
  const body = await parseBody(request, itemWriteSchema);

  const id = `itm_${crypto.randomUUID().slice(0, 8)}`;
  // Kode QR dibuat di server, bukan klien: harus unik dan tidak bisa dipalsukan.
  const code = generateItemCode();

  await db`
    INSERT INTO items (id, sku, code, name, category_id, unit_id, min_stock,
      unit_value, is_bulk, primary_location_id)
    VALUES (${id}, ${body.sku}, ${code}, ${body.name}, ${body.categoryId}, ${body.unitId},
            ${body.minStock ?? 0}, ${body.unitValue ?? null}, ${body.isBulk ?? false},
            ${body.primaryLocationId ?? null})
  `;

  await audit(db, session.user.id, "item", id, "create", null, { sku: body.sku, name: body.name });
  return ok({ item: { id, code } }, { status: 201 });
}

export async function updateItem(request: Request, id: string): Promise<Response> {
  const session = await requireRole("admin");
  const db = tenantPool(session.tenant);
  const body = await parseBody(request, itemWriteSchema.partial());

  const before = await db<ItemRow[]>`SELECT * FROM items WHERE id = ${id}`;
  if (!before[0]) throw errors.notFound("Item");

  await db`
    UPDATE items SET
      name = ${body.name ?? before[0].name},
      sku = ${body.sku ?? before[0].sku},
      category_id = ${body.categoryId ?? before[0].category_id},
      unit_id = ${body.unitId ?? before[0].unit_id},
      min_stock = ${body.minStock ?? before[0].min_stock},
      is_bulk = ${body.isBulk ?? before[0].is_bulk},
      active = ${body.active ?? before[0].active},
      updated_at = now()
    WHERE id = ${id}
  `;

  await audit(db, session.user.id, "item", id, "update", toItem(before[0]), body);
  return ok({ item: { id } });
}

async function audit(
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
    VALUES (${entity}, ${entityId}, ${action}, ${before ? db.json(before as never) : null},
            ${after ? db.json(after as never) : null}, ${actorId}, 'dashboard')
  `;
}

/** Kode QR Crockford base32, 9 karakter, tanpa huruf ambigu. */
function generateItemCode(): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export const bulkItemSchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  action: z.enum(["activate", "deactivate", "delete"]),
});

export async function bulkItems(request: Request): Promise<Response> {
  const session = await requireRole("admin");
  const db = tenantPool(session.tenant);
  const body = await parseBody(request, bulkItemSchema);

  if (body.action === "delete") {
    // Hapus permanen ditolak bila item punya riwayat transaksi — log harus utuh.
    const used = await db<{ count: number }[]>`
      SELECT count(*)::int AS count FROM transactions WHERE item_id IN ${sql(body.ids)}
    `;
    if ((used[0]?.count ?? 0) > 0) {
      throw errors.conflict(
        "ITEM_HAS_HISTORY",
        "Item yang punya riwayat transaksi tidak boleh dihapus; nonaktifkan saja.",
      );
    }
    await db`DELETE FROM items WHERE id IN ${sql(body.ids)}`;
  } else {
    await db`UPDATE items SET active = ${body.action === "activate"}, updated_at = now()
      WHERE id IN ${sql(body.ids)}`;
  }

  await audit(db, session.user.id, "item", body.ids.join(","), "update", null, body);
  return ok({ ok: true, affected: body.ids.length });
}

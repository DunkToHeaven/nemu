/**
 * Kustodi (barang dibawa), verifikasi sisa, dan opname.
 *
 * Kustodi dibuka otomatis saat pengambilan bila flag aktif: barang yang diambil
 * berstatus "dibawa" sampai ditandai terpakai/kembali/rusak (PRD CU).
 */
import { z } from "zod";
import type { AuthUser } from "@/server/auth";
import { tenantPool } from "@/server/db";
import { errors, ok, parseBody } from "@/server/http";
import { checkRateLimit, RATE_RULES } from "@/server/rate-limit";
import { moveStock } from "@/server/services/stock";

const outcomeSchema = z.enum(["used", "returned", "damaged_lost"]);

/* -------------------------------------------------------------- kustodi */

export async function listCustody(
  request: Request,
  user: AuthUser,
  tenant: string,
): Promise<Response> {
  const db = tenantPool(tenant);
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");
  // `scope=team` hanya supervisor+ (PRD).
  const team = scope === "team";
  if (team && user.role === "worker") throw errors.forbidden(user.role);

  const rows = await db<
    {
      id: string;
      item_id: string;
      item_name: string;
      item_code: string;
      qty: number;
      qty_settled: number;
      status: string;
      outcome: string | null;
      opened_at: Date;
      closed_at: Date | null;
      user_id: string;
      user_name: string;
      unit: string;
      from_path: string | null;
    }[]
  >`
    SELECT c.id, c.item_id, i.name AS item_name, i.code AS item_code, c.qty, c.qty_settled,
           c.status::text AS status, c.outcome::text AS outcome, c.created_at AS opened_at,
           c.closed_at, c.user_id, u.name AS user_name, un.symbol AS unit,
           l.path AS from_path
    FROM custody c
    JOIN items i ON i.id = c.item_id
    JOIN users u ON u.id = c.user_id
    JOIN units un ON un.id = i.unit_id
    LEFT JOIN locations l ON l.id = c.from_location_id
    WHERE (${team} OR c.user_id = ${user.id})
      AND (${team} OR c.status = 'open')
    ORDER BY c.created_at DESC LIMIT 200
  `;

  return ok({
    data: rows.map((r) => ({
      id: r.id,
      itemId: r.item_id,
      itemName: r.item_name,
      itemCode: r.item_code,
      qty: r.qty - r.qty_settled,
      qtyTotal: r.qty,
      status: r.status,
      outcome: r.outcome,
      openedAt: r.opened_at.toISOString(),
      closedAt: r.closed_at ? r.closed_at.toISOString() : null,
      userId: r.user_id,
      userName: r.user_name,
      unit: r.unit,
      locationPath: r.from_path,
    })),
    total: rows.length,
  });
}

const settleSchema = z.object({
  outcome: outcomeSchema,
  qty: z.number().int().positive().max(100_000),
  equipmentId: z.string().nullable().optional(),
  equipmentText: z.string().max(120).nullable().optional(),
  refNo: z.string().max(120).nullable().optional(),
  toLocationId: z.string().nullable().optional(),
  idempotencyKey: z.string().min(8).max(120),
  scanMethod: z.enum(["qr_camera", "in_app_scanner", "manual_code"]).optional(),
});

export async function settleCustody(
  request: Request,
  id: string,
  user: AuthUser,
  tenant: string,
): Promise<Response> {
  const db = tenantPool(tenant);
  const body = await parseBody(request, settleSchema);

  const rows = await db<
    {
      id: string;
      item_id: string;
      user_id: string;
      qty: number;
      qty_settled: number;
      status: string;
      from_location_id: string | null;
    }[]
  >`
    SELECT id, item_id, user_id, qty, qty_settled, status::text AS status, from_location_id
    FROM custody WHERE id = ${id}
  `;
  const entry = rows[0];
  if (!entry) throw errors.notFound("Entri kustodi");
  if (entry.status !== "open") throw errors.conflict("CUSTODY_CLOSED", "Entri sudah ditutup.");
  if (entry.user_id !== user.id && user.role === "worker") {
    throw errors.forbidden(user.role);
  }

  const remaining = entry.qty - entry.qty_settled;
  if (body.qty > remaining) {
    throw errors.conflict("CUSTODY_OVER", `Qty melebihi yang dibawa (sisa ${remaining}).`, {
      remaining,
    });
  }

  // "kembali" wajib menyebut lokasi tujuan (PRD: wajib scan rak).
  if (body.outcome === "returned" && !body.toLocationId) {
    throw errors.badRequest("Pengembalian butuh lokasi tujuan (scan rak).");
  }

  const txType = body.outcome === "returned" ? "return" : "issue";
  const moved = await moveStock(user, tenant, {
    type: txType,
    itemId: entry.item_id,
    fromLocationId: body.outcome === "returned" ? null : entry.from_location_id,
    toLocationId: body.outcome === "returned" ? body.toLocationId : null,
    qty: body.qty,
    idempotencyKey: body.idempotencyKey,
    refNo: body.refNo ?? null,
    note: `kustodi ${body.outcome}`,
    equipmentId: body.equipmentId ?? null,
  });

  if (!moved.ok) {
    if (moved.code === "insufficient_stock") {
      throw errors.conflict("INSUFFICIENT_STOCK", moved.message);
    }
    throw errors.badRequest(moved.message);
  }

  const newSettled = entry.qty_settled + body.qty;
  const fullySettled = newSettled >= entry.qty;
  await db`
    UPDATE custody SET qty_settled = ${newSettled},
      status = ${fullySettled ? "closed" : "open"},
      outcome = ${fullySettled ? body.outcome : null},
      closed_at = ${fullySettled ? new Date() : null}
    WHERE id = ${id}
  `;

  return ok({
    custody: {
      id,
      itemId: entry.item_id,
      qty: entry.qty - newSettled,
      qtyTotal: entry.qty,
      status: fullySettled ? "closed" : "open",
      outcome: fullySettled ? body.outcome : null,
    },
    transaction: { id: moved.txId },
  });
}

export async function settleBatch(
  request: Request,
  user: AuthUser,
  tenant: string,
): Promise<Response> {
  const body = await parseBody(
    request,
    z.object({
      entries: z
        .array(
          z.object({ id: z.string(), outcome: outcomeSchema, qty: z.number().int().positive() }),
        )
        .min(1)
        .max(50),
    }),
  );

  // Hasil per entri: satu gagal tidak membatalkan yang lain (akhir shift).
  const results: { id: string; ok: boolean; message: string }[] = [];
  for (const entry of body.entries) {
    try {
      const fake = new Request("http://nemu.local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome: entry.outcome,
          qty: entry.qty,
          idempotencyKey: `batch-${entry.id}-${Date.now()}`,
        }),
      });
      await settleCustody(fake, entry.id, user, tenant);
      results.push({ id: entry.id, ok: true, message: "ditutup" });
    } catch (error) {
      results.push({
        id: entry.id,
        ok: false,
        message: error instanceof Error ? error.message : "gagal",
      });
    }
  }

  return ok({ results });
}

/* ---------------------------------------------------------- verifikasi */

export async function submitVerification(
  request: Request,
  user: AuthUser,
  tenant: string,
): Promise<Response> {
  const db = tenantPool(tenant);
  const limit = await checkRateLimit({
    bucket: `verify:${user.id}`,
    ...RATE_RULES.verification,
  });
  if (!limit.allowed) throw errors.rateLimited(limit.retryAfterSeconds);

  const body = await parseBody(
    request,
    z.object({
      promptId: z.string(),
      result: z.enum(["match", "mismatch", "skipped"]),
      countedQty: z.number().int().min(0).max(1_000_000).nullable().optional(),
      stockVersion: z.number().int().optional(),
      idempotencyKey: z.string().min(8).max(120),
    }),
  );

  const rows = await db<
    { id: string; item_id: string; location_id: string; user_id: string; prompt_mode: string }[]
  >`
    SELECT id, item_id, location_id, user_id, prompt_mode::text AS prompt_mode
    FROM verifications WHERE id = ${body.promptId}
  `;
  const prompt = rows[0];
  if (!prompt) throw errors.notFound("Prompt verifikasi");
  if (prompt.user_id !== user.id) throw errors.forbidden(user.role);

  // `mismatch` wajib menyertakan angka hitung; kalau tidak, hasilnya tidak
  // bisa dipakai untuk mengoreksi apa pun.
  if (body.result === "mismatch" && (body.countedQty === null || body.countedQty === undefined)) {
    throw errors.badRequest("Hasil 'mismatch' wajib menyertakan countedQty.");
  }

  await db`
    UPDATE verifications SET result = ${body.result},
      counted_qty = ${body.countedQty ?? null},
      status = ${body.result === "skipped" ? "recorded" : "recorded"},
      answered_at = now()
    WHERE id = ${body.promptId}
  `;

  // Selisih masuk antrean supervisor untuk ditinjau, bukan langsung mengubah stok.
  if (body.result === "mismatch") {
    await db`UPDATE transactions SET review_status = 'needs_review'
      WHERE item_id = ${prompt.item_id} AND id IN (
        SELECT opened_tx_id FROM custody WHERE item_id = ${prompt.item_id}
      )`.catch(() => undefined);
  }

  return ok({
    status: body.result === "mismatch" ? "needs_review" : "recorded",
    message:
      body.result === "mismatch"
        ? "Selisih dicatat dan masuk antrean tinjauan supervisor."
        : "Terima kasih, konfirmasi tercatat.",
  });
}

export async function listVerifications(request: Request, tenant: string): Promise<Response> {
  const db = tenantPool(tenant);
  const url = new URL(request.url);
  const status = url.searchParams.get("status") ?? "pending";

  const rows = await db<
    {
      id: string;
      item_id: string;
      item_name: string;
      location_id: string;
      location_path: string;
      expected_qty: number | null;
      counted_qty: number | null;
      result: string | null;
      status: string;
      created_at: Date;
      user_name: string;
    }[]
  >`
    SELECT v.id, v.item_id, i.name AS item_name, v.location_id, l.path AS location_path,
           v.expected_qty, v.counted_qty, v.result::text AS result, v.status::text AS status,
           v.created_at, u.name AS user_name
    FROM verifications v
    JOIN items i ON i.id = v.item_id
    JOIN locations l ON l.id = v.location_id
    JOIN users u ON u.id = v.user_id
    WHERE (${status} = 'all' OR v.status::text = ${status})
    ORDER BY v.created_at DESC LIMIT 200
  `;

  return ok({
    data: rows.map((r) => ({
      id: r.id,
      itemId: r.item_id,
      itemName: r.item_name,
      locationId: r.location_id,
      locationPath: r.location_path,
      expectedQty: r.expected_qty,
      countedQty: r.counted_qty,
      result: r.result,
      status: r.status,
      createdAt: r.created_at.toISOString(),
      userName: r.user_name,
    })),
    total: rows.length,
  });
}

export async function reviewVerification(
  request: Request,
  id: string,
  user: AuthUser,
  tenant: string,
): Promise<Response> {
  const db = tenantPool(tenant);
  const body = await parseBody(
    request,
    z.object({ decision: z.enum(["approved", "rejected"]), note: z.string().max(500).optional() }),
  );

  const rows = await db<
    {
      id: string;
      item_id: string;
      location_id: string;
      expected_qty: number | null;
      counted_qty: number | null;
    }[]
  >`SELECT id, item_id, location_id, expected_qty, counted_qty FROM verifications WHERE id = ${id}`;
  const v = rows[0];
  if (!v) throw errors.notFound("Verifikasi");

  // Penolakan wajib beralasan (PRD).
  if (body.decision === "rejected" && !body.note) {
    throw errors.badRequest("Alasan wajib diisi bila menolak selisih.");
  }

  await db`UPDATE verifications SET status = ${body.decision} WHERE id = ${id}`;

  // Disetujui -> koreksi stok lewat transaksi `adjust`, bukan UPDATE saldo.
  if (body.decision === "approved" && v.counted_qty !== null) {
    const current = await db<{ qty: number }[]>`
      SELECT stock_at(${v.item_id}, ${v.location_id}) AS qty
    `;
    const diff = v.counted_qty - (current[0]?.qty ?? 0);
    if (diff !== 0) {
      await moveStock(user, tenant, {
        type: "adjust",
        itemId: v.item_id,
        fromLocationId: diff < 0 ? v.location_id : null,
        toLocationId: diff > 0 ? v.location_id : null,
        qty: Math.abs(diff),
        idempotencyKey: `verify-adj-${id}`,
        note: `koreksi opname (${body.note ?? "disetujui"})`,
      });
    }
  }

  return ok({ verification: { id, status: body.decision } });
}

/* -------------------------------------------------------------- opname */

export async function listCounts(tenant: string): Promise<Response> {
  const db = tenantPool(tenant);
  const rows = await db<
    {
      id: string;
      warehouse_id: string;
      status: string;
      created_at: Date;
      approved_at: Date | null;
      created_by: string;
      created_by_name: string | null;
    }[]
  >`
    SELECT c.id, c.warehouse_id, c.status::text AS status, c.created_at, c.approved_at,
           c.created_by, u.name AS created_by_name
    FROM stock_counts c LEFT JOIN users u ON u.id = c.created_by
    ORDER BY c.created_at DESC LIMIT 50
  `;

  // Semua baris diambil sekali untuk seluruh opname — menghindari N+1.
  const ids = rows.map((r) => r.id);
  const lines =
    ids.length === 0
      ? []
      : await db<
          {
            id: string;
            count_id: string;
            item_id: string;
            location_id: string;
            expected_qty: number;
            counted_qty: number | null;
            note: string | null;
            item_name: string;
            item_code: string;
            location_path: string;
            unit: string;
          }[]
        >`
          SELECT l.id, l.count_id, l.item_id, l.location_id, l.expected_qty, l.counted_qty, l.note,
                 i.name AS item_name, i.code AS item_code, loc.path AS location_path,
                 un.symbol AS unit
          FROM stock_count_lines l
          JOIN items i ON i.id = l.item_id
          JOIN locations loc ON loc.id = l.location_id
          JOIN units un ON un.id = i.unit_id
          WHERE l.count_id IN ${db(ids)}
          ORDER BY loc.path, i.name
        `;

  const byCount = new Map<string, (typeof lines)[number][]>();
  for (const line of lines) {
    const bucket = byCount.get(line.count_id) ?? [];
    bucket.push(line);
    byCount.set(line.count_id, bucket);
  }

  return ok({
    data: rows.map((r) => {
      const countLines = byCount.get(r.id) ?? [];
      return {
        id: r.id,
        name: `Opname ${r.created_at.toISOString().slice(0, 10)}`,
        warehouseId: r.warehouse_id,
        zoneId: countLines[0]?.location_id ?? null,
        blind: true,
        status: r.status === "approved" ? "closed" : r.status === "open" ? "open" : "review",
        createdBy: r.created_by,
        createdByName: r.created_by_name ?? "—",
        createdAt: r.created_at.toISOString(),
        closedAt: r.approved_at ? r.approved_at.toISOString() : null,
        source: "manual",
        locationPath: countLines[0]?.location_path ?? null,
        lines: countLines.map((line) => ({
          id: line.id,
          itemId: line.item_id,
          itemName: line.item_name,
          itemCode: line.item_code,
          locationId: line.location_id,
          locationPath: line.location_path,
          systemQty: line.expected_qty,
          countedQty: line.counted_qty,
          variance: line.counted_qty === null ? null : line.counted_qty - line.expected_qty,
          status: line.counted_qty === null ? "pending" : "counted",
          note: line.note,
          unitSymbol: line.unit,
        })),
      };
    }),
  });
}

export async function createCount(
  request: Request,
  user: AuthUser,
  tenant: string,
): Promise<Response> {
  const db = tenantPool(tenant);
  const body = await parseBody(
    request,
    z.object({
      zoneId: z.string(),
      name: z.string().max(120).optional(),
      blind: z.boolean().optional(),
      source: z.string().optional(),
    }),
  );

  const loc = await db<{ warehouse_id: string }[]>`
    SELECT warehouse_id FROM locations WHERE id = ${body.zoneId}
  `;
  const w = loc[0];
  if (!w) throw errors.badRequest("Zona tidak ditemukan.");

  const id = `cnt_${crypto.randomUUID().slice(0, 8)}`;
  await db`INSERT INTO stock_counts (id, warehouse_id, created_by)
    VALUES (${id}, ${w.warehouse_id}, ${user.id})`;

  // Baris opname dibuat dari saldo saat ini, disnapshot ke expected_qty.
  await db`
    INSERT INTO stock_count_lines (id, count_id, item_id, location_id, expected_qty)
    SELECT 'scl_' || gen_random_uuid()::text, ${id}, sl.item_id, sl.location_id, sl.qty
    FROM stock_levels sl
    JOIN locations l ON l.id = sl.location_id
    WHERE l.id = ${body.zoneId} OR l.parent_id = ${body.zoneId}
  `;

  return ok({ count: { id, warehouseId: w.warehouse_id, status: "open" } }, { status: 201 });
}

export async function setCountLine(
  request: Request,
  countId: string,
  lineId: string,
  tenant: string,
): Promise<Response> {
  const db = tenantPool(tenant);
  const body = await parseBody(request, z.object({ countedQty: z.number().int().min(0) }));
  const rows = await db<{ id: string }[]>`
    UPDATE stock_count_lines SET counted_qty = ${body.countedQty}
    WHERE id = ${lineId} AND count_id = ${countId} RETURNING id
  `;
  if (!rows[0]) throw errors.notFound("Baris opname");
  return ok({ line: { id: lineId, countedQty: body.countedQty } });
}

export async function approveCount(
  _request: Request,
  countId: string,
  user: AuthUser,
  tenant: string,
): Promise<Response> {
  const db = tenantPool(tenant);

  const lines = await db<
    {
      id: string;
      item_id: string;
      location_id: string;
      expected_qty: number;
      counted_qty: number | null;
    }[]
  >`
    SELECT id, item_id, location_id, expected_qty, counted_qty
    FROM stock_count_lines WHERE count_id = ${countId}
  `;
  if (lines.length === 0) throw errors.notFound("Opname");

  let adjusted = 0;
  for (const line of lines) {
    if (line.counted_qty === null) continue;
    const diff = line.counted_qty - line.expected_qty;
    if (diff === 0) continue;
    // Koreksi lewat transaksi, bukan UPDATE saldo — log tetap utuh.
    await moveStock(user, tenant, {
      type: "adjust",
      itemId: line.item_id,
      fromLocationId: diff < 0 ? line.location_id : null,
      toLocationId: diff > 0 ? line.location_id : null,
      qty: Math.abs(diff),
      idempotencyKey: `count-${countId}-${line.id}`,
      note: "opname disetujui",
    });
    adjusted += 1;
  }

  await db`UPDATE stock_counts SET status = 'approved', approved_by = ${user.id},
    approved_at = now() WHERE id = ${countId}`;

  return ok({ count: { id: countId, status: "approved" }, adjusted });
}

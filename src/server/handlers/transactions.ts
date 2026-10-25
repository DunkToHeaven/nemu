/**
 * Transaksi: pengambilan, penerimaan, pengembalian, transfer, pembalik.
 *
 * Jalur `issue` WAJIB lewat `issueStock()` yang memanggil fungsi database
 * atomik. Jangan pernah menggantinya dengan pola "cek saldo di TypeScript lalu
 * INSERT" — itu menghasilkan oversell saat dua pengambil bersamaan, sudah
 * dibuktikan di db/test/concurrent-issue.sql.
 */
import { z } from "zod";
import { tenantPool } from "@/server/db";
import { loadCustody, loadStockLevel, loadTransaction } from "@/server/handlers/tx-shape";
import { errors, ok, paginate, parseBody, requireSession } from "@/server/http";
import { checkRateLimit, RATE_RULES } from "@/server/rate-limit";
import { issueStock, moveStock, reverseTransaction } from "@/server/services/stock";

const scanMethod = z.enum(["qr_camera", "in_app_scanner", "manual_code"]).nullable().optional();

export const transactionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("issue"),
    itemId: z.string().min(1),
    locationId: z.string().min(1),
    qty: z.number().int().positive().max(100_000),
    idempotencyKey: z.string().min(8).max(120),
    reasonId: z.string().nullable().optional(),
    scanMethod,
    refNo: z.string().max(120).nullable().optional(),
    note: z.string().max(500).nullable().optional(),
  }),
  z.object({
    type: z.enum(["receive", "return", "transfer", "adjust"]),
    itemId: z.string().min(1),
    fromLocationId: z.string().nullable().optional(),
    toLocationId: z.string().nullable().optional(),
    qty: z.number().int().positive().max(100_000),
    idempotencyKey: z.string().min(8).max(120),
    reasonId: z.string().nullable().optional(),
    refNo: z.string().max(120).nullable().optional(),
    note: z.string().max(500).nullable().optional(),
    /** Harga per unit — hanya bermakna untuk receive; diabaikan untuk jenis lain. */
    unitPrice: z.number().min(0).max(1_000_000_000).nullable().optional(),
  }),
]);

export async function createTransaction(request: Request): Promise<Response> {
  const session = await requireSession();
  const db = tenantPool(session.tenant);

  const limit = await checkRateLimit({
    bucket: `tx:${session.user.id}`,
    ...RATE_RULES.writeTransaction,
  });
  if (!limit.allowed) throw errors.rateLimited(limit.retryAfterSeconds);

  // Alur scan mengirim `itemCode` (hasil QR) dan `locationId` tunggal; kontrak
  // server memakai `itemId` (+ to/fromLocationId). Kode QR tidak pernah berubah,
  // jadi join lewat `code` adalah jembatan yang sah. Tanpa ini, POST dari layar
  // scan selalu 400 "Data tidak valid" di mode database.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw errors.badRequest("Body harus JSON yang valid.");
  }
  if (raw && typeof raw === "object") {
    const b = raw as Record<string, unknown>;
    if (!b.itemId && typeof b.itemCode === "string" && b.itemCode) {
      const [item] = await db<{ id: string }[]>`
        SELECT id FROM items WHERE code = ${b.itemCode}
      `;
      if (!item) throw errors.notFound("Item dengan kode itu");
      b.itemId = item.id;
      if (b.type !== "issue" && typeof b.locationId === "string" && !b.toLocationId) {
        b.toLocationId = b.locationId;
      }
    }
  }
  let body: z.infer<typeof transactionSchema>;
  try {
    body = transactionSchema.parse(raw);
  } catch (error) {
    const issues =
      typeof error === "object" && error !== null && "issues" in error
        ? (error as { issues: unknown }).issues
        : undefined;
    throw errors.badRequest("Data tidak valid.", issues);
  }

  if (body.type === "issue") {
    const result = await issueStock(session.user, session.tenant, {
      itemId: body.itemId,
      locationId: body.locationId,
      qty: body.qty,
      idempotencyKey: body.idempotencyKey,
      reasonId: body.reasonId,
      scanMethod: body.scanMethod,
      refNo: body.refNo,
      note: body.note,
    });

    if (!result.ok) {
      if (result.code === "insufficient_stock") {
        // 409 + saldo terbaru supaya UI bisa menampilkan angka jujur (RT-02).
        throw errors.conflict("INSUFFICIENT_STOCK", result.message, {
          balance: result.balance,
        });
      }
      throw errors.notFound("Item");
    }

    // Idempotency: kiriman ulang mengembalikan 200 dengan penanda duplicate,
    // bukan membuat transaksi kedua.
    const tx = await loadTransaction(db, result.txId);
    const stock = await loadStockLevel(db, body.itemId, body.locationId);

    // Kustodi dibuka otomatis bila fitur aktif (PRD CU-01). Barang yang diambil
    // berstatus "dibawa" sampai ditutup, supaya tidak hilang dari pengawasan.
    let custody = null;
    if (result.code !== "duplicate" && result.txId) {
      custody = await openCustodyIfEnabled(session.tenant, {
        txId: result.txId,
        userId: session.user.id,
        itemId: body.itemId,
        locationId: body.locationId,
        qty: body.qty,
        refNo: body.refNo ?? null,
      });
    }

    return ok(
      {
        transaction: tx,
        duplicate: result.code === "duplicate",
        stock,
        custody,
        verificationPrompt: null,
        message:
          result.code === "duplicate"
            ? "Transaksi ini sudah tercatat sebelumnya."
            : `${body.qty} diambil. Sisa ${result.balance ?? stock?.qty ?? 0}.`,
      },
      { status: result.code === "duplicate" ? 200 : 201 },
    );
  }

  // Arah wajib konsisten dengan jenisnya; CHECK di database juga menjaga ini.
  if (body.type === "transfer" && (!body.fromLocationId || !body.toLocationId)) {
    throw errors.badRequest("Transfer butuh lokasi asal dan tujuan.");
  }
  if (body.type === "receive" && !body.toLocationId) {
    throw errors.badRequest("Penerimaan butuh lokasi tujuan.");
  }

  const result = await moveStock(session.user, session.tenant, {
    type: body.type,
    itemId: body.itemId,
    fromLocationId: body.fromLocationId ?? null,
    toLocationId: body.toLocationId ?? null,
    qty: body.qty,
    idempotencyKey: body.idempotencyKey,
    reasonId: body.reasonId,
    refNo: body.refNo,
    note: body.note,
    // Harga hanya bermakna saat receive (barang masuk + uangnya keluar).
    unitPrice: body.type === "receive" ? (body.unitPrice ?? null) : null,
  });

  if (!result.ok) {
    if (result.code === "insufficient_stock") {
      throw errors.conflict("INSUFFICIENT_STOCK", result.message);
    }
    throw errors.badRequest(result.message);
  }

  return ok(
    {
      transaction: await loadTransaction(db, result.txId),
      duplicate: result.duplicate,
      stock: await loadStockLevel(db, body.itemId, body.toLocationId ?? body.fromLocationId ?? ""),
      custody: null,
      verificationPrompt: null,
      message: result.duplicate ? "Transaksi ini sudah tercatat." : "Transaksi tersimpan.",
    },
    { status: result.duplicate ? 200 : 201 },
  );
}

/**
 * Buka entri kustodi untuk transaksi `issue` bila fitur aktif di pengaturan.
 * Mengembalikan null bila fitur mati — bukan error, karena kustodi opsional.
 */
async function openCustodyIfEnabled(
  tenant: string,
  input: {
    txId: string;
    userId: string;
    itemId: string;
    locationId: string;
    qty: number;
    refNo: string | null;
  },
) {
  const db = tenantPool(tenant);
  const enabled = await db<{ custody_enabled: boolean }[]>`
    SELECT custody_enabled FROM settings WHERE id
  `;
  if (!enabled[0]?.custody_enabled) return null;

  const id = `cus_${crypto.randomUUID().slice(0, 8)}`;
  try {
    await db`
      INSERT INTO custody (id, issue_tx_id, user_id, item_id, qty, from_location_id, ref_no)
      VALUES (${id}, ${input.txId}, ${input.userId}, ${input.itemId}, ${input.qty},
              ${input.locationId}, ${input.refNo})
    `;
    await db`UPDATE transactions SET custody_id = ${id} WHERE id = ${input.txId}`;
  } catch {
    // Kustodi gagal tidak boleh membatalkan transaksi yang sudah sah tercatat.
    return null;
  }
  return loadCustody(db, id);
}

export async function listTransactions(request: Request): Promise<Response> {
  const session = await requireSession();
  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? 50) || 50));
  const cursor = url.searchParams.get("cursor");
  const itemId = url.searchParams.get("itemId");
  const type = url.searchParams.get("type");
  // Pekerja hanya melihat transaksinya sendiri; supervisor+ melihat semua.
  const mineOnly = session.user.role === "worker" || url.searchParams.get("scope") === "mine";
  const userId = url.searchParams.get("userId");

  const db = tenantPool(session.tenant);
  const rows = await db<
    {
      id: string;
      type: string;
      item_id: string;
      item_name: string;
      item_code: string;
      from_location_id: string | null;
      to_location_id: string | null;
      qty: number;
      user_id: string;
      user_name: string;
      reason_id: string | null;
      created_at: Date;
      reverses_id: string | null;
      review_status: string;
      unit_price: string | null;
      from_path: string | null;
      to_path: string | null;
    }[]
  >`
    SELECT t.id, t.type, t.item_id, i.name AS item_name, i.code AS item_code,
           t.from_location_id, t.to_location_id, t.qty, t.user_id, u.name AS user_name,
           t.reason_id, t.created_at, t.reverses_id, t.review_status, t.unit_price,
           lf.path AS from_path, lt.path AS to_path
    FROM transactions t
    JOIN items i ON i.id = t.item_id
    JOIN users u ON u.id = t.user_id
    LEFT JOIN locations lf ON lf.id = t.from_location_id
    LEFT JOIN locations lt ON lt.id = t.to_location_id
    WHERE (${!mineOnly} OR t.user_id = ${session.user.id})
      AND (${itemId ?? null}::text IS NULL OR t.item_id = ${itemId ?? null})
      AND (${type ?? null}::text IS NULL OR t.type::text = ${type ?? null})
      AND (${userId ?? null}::text IS NULL OR t.user_id = ${userId ?? null})
    ORDER BY t.created_at DESC
    LIMIT 2000
  `;

  const mapped = rows.map((row) => ({
    id: row.id,
    type: row.type,
    itemId: row.item_id,
    itemName: row.item_name,
    itemCode: row.item_code,
    fromLocationId: row.from_location_id,
    toLocationId: row.to_location_id,
    fromPath: row.from_path,
    toPath: row.to_path,
    qty: row.qty,
    userId: row.user_id,
    userName: row.user_name,
    // numeric Postgres datang sebagai string; kontrak klien butuh number.
    unitPrice: row.unit_price === null ? null : Number(row.unit_price),
    reasonId: row.reason_id,
    createdAt: row.created_at.toISOString(),
    reversesId: row.reverses_id,
    reviewStatus: row.review_status,
  }));

  // Export CSV bila diminta (PRD: Accept: text/csv).
  if (request.headers.get("accept")?.includes("text/csv")) {
    const header = "id,type,item_code,item_name,qty,user,from,to,created_at\n";
    const body = mapped
      .map((row) =>
        [
          row.id,
          row.type,
          row.itemCode,
          `"${row.itemName.replace(/"/g, '""')}"`,
          row.qty,
          `"${row.userName}"`,
          `"${row.fromPath ?? ""}"`,
          `"${row.toPath ?? ""}"`,
          row.createdAt,
        ].join(","),
      )
      .join("\n");
    return new Response(header + body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="transactions.csv"',
      },
    });
  }

  return ok(paginate(mapped, cursor, limit));
}

export async function itemTransactions(_request: Request, itemId: string): Promise<Response> {
  const session = await requireSession();
  const db = tenantPool(session.tenant);
  const rows = await db<
    {
      id: string;
      type: string;
      qty: number;
      created_at: Date;
      user_name: string;
      note: string | null;
      ref_no: string | null;
      from_location_id: string | null;
      to_location_id: string | null;
    }[]
  >`
    SELECT t.id, t.type, t.qty, t.created_at, u.name AS user_name,
           t.note, t.ref_no, t.from_location_id, t.to_location_id, t.unit_price
    FROM transactions t JOIN users u ON u.id = t.user_id
    WHERE t.item_id = ${itemId}
    ORDER BY t.created_at DESC LIMIT 100
  `;
  return ok({
    data: rows.map((row) => ({
      id: row.id,
      type: row.type,
      qty: row.qty,
      createdAt: row.created_at.toISOString(),
      userName: row.user_name,
      note: row.note,
      refNo: row.ref_no,
      fromLocationId: row.from_location_id,
      toLocationId: row.to_location_id,
    })),
  });
}

export async function reverseTx(request: Request, txId: string): Promise<Response> {
  const session = await requireSession();
  const body = await parseBody(request, z.object({ idempotencyKey: z.string().min(8).max(120) }));

  const result = await reverseTransaction(session.user, session.tenant, txId, body.idempotencyKey);
  if (!result.ok) {
    if (result.code === "not_found") throw errors.notFound("Transaksi");
    if (result.code === "too_late") {
      throw errors.conflict("REVERSE_WINDOW_CLOSED", result.message);
    }
    if (result.code === "already_reversed") {
      throw errors.conflict("ALREADY_REVERSED", result.message);
    }
    throw errors.badRequest(result.message);
  }

  return ok({ reversalId: result.reversalId }, { status: 201 });
}

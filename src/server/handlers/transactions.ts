/**
 * Transaksi: pengambilan, penerimaan, pengembalian, transfer, pembalik.
 *
 * Jalur `issue` WAJIB lewat `issueStock()` yang memanggil fungsi database
 * atomik. Jangan pernah menggantinya dengan pola "cek saldo di TypeScript lalu
 * INSERT" — itu menghasilkan oversell saat dua pengambil bersamaan, sudah
 * dibuktikan di db/test/concurrent-issue.sql.
 */
import { z } from "zod";
import { sql } from "@/server/db";
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
  }),
]);

export async function createTransaction(request: Request): Promise<Response> {
  const session = await requireSession();

  const limit = await checkRateLimit({
    bucket: `tx:${session.user.id}`,
    ...RATE_RULES.writeTransaction,
  });
  if (!limit.allowed) throw errors.rateLimited(limit.retryAfterSeconds);

  const body = await parseBody(request, transactionSchema);

  if (body.type === "issue") {
    const result = await issueStock(session.user, {
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
    return ok(
      {
        transaction: { id: result.txId },
        duplicate: result.code === "duplicate",
        balance: result.balance,
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

  const result = await moveStock(session.user, {
    type: body.type,
    itemId: body.itemId,
    fromLocationId: body.fromLocationId ?? null,
    toLocationId: body.toLocationId ?? null,
    qty: body.qty,
    idempotencyKey: body.idempotencyKey,
    reasonId: body.reasonId,
    refNo: body.refNo,
    note: body.note,
  });

  if (!result.ok) {
    if (result.code === "insufficient_stock") {
      throw errors.conflict("INSUFFICIENT_STOCK", result.message);
    }
    throw errors.badRequest(result.message);
  }

  return ok(
    { transaction: { id: result.txId }, duplicate: result.duplicate },
    { status: result.duplicate ? 200 : 201 },
  );
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

  const rows = await sql<
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
      from_path: string | null;
      to_path: string | null;
    }[]
  >`
    SELECT t.id, t.type, t.item_id, i.name AS item_name, i.code AS item_code,
           t.from_location_id, t.to_location_id, t.qty, t.user_id, u.name AS user_name,
           t.reason_id, t.created_at, t.reverses_id, t.review_status,
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

export async function itemTransactions(request: Request, itemId: string): Promise<Response> {
  await requireSession();
  const rows = await sql<
    { id: string; type: string; qty: number; created_at: Date; user_name: string }[]
  >`
    SELECT t.id, t.type, t.qty, t.created_at, u.name AS user_name
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
    })),
  });
}

export async function reverseTx(request: Request, txId: string): Promise<Response> {
  const session = await requireSession();
  const body = await parseBody(request, z.object({ idempotencyKey: z.string().min(8).max(120) }));

  const result = await reverseTransaction(session.user, txId, body.idempotencyKey);
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

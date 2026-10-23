/**
 * Layanan transaksi stok.
 *
 * Semua penulisan stok lewat sini. Yang penting: pengambilan barang memanggil
 * `issue_stock()` di database, bukan melakukan cek-lalu-tulis di TypeScript.
 * Cek dan tulis harus berada dalam satu transaksi dengan item terkunci,
 * kalau tidak dua pengambil bersamaan bisa membuat stok negatif.
 */
import { randomUUID } from "node:crypto";
import type { AuthUser } from "@/server/auth";
import { tenantPool } from "@/server/db";
import { tenantDb } from "@/server/http";

export type TxType = "issue" | "return" | "receive" | "transfer" | "adjust";

export interface IssueInput {
  itemId: string;
  locationId: string;
  qty: number;
  idempotencyKey: string;
  reasonId?: string | null;
  scanMethod?: "qr_camera" | "in_app_scanner" | "manual_code" | null;
  refNo?: string | null;
  note?: string | null;
}

export type IssueOutcome =
  | { ok: true; code: "ok" | "duplicate"; txId: string; balance: number }
  | { ok: false; code: "insufficient_stock"; message: string; balance: number }
  | { ok: false; code: "item_not_found"; message: string };

/**
 * Ambil barang dari satu lokasi. Atomik di database.
 *
 * `duplicate` bukan kegagalan: kiriman ulang dengan idempotency key yang sama
 * mengembalikan hasil yang sama tanpa membuat transaksi kedua.
 */
export async function issueStock(
  user: AuthUser,
  tenant: string,
  input: IssueInput,
): Promise<IssueOutcome> {
  const txId = `tx_${randomUUID()}`;
  const db = tenantPool(tenant);

  const rows = await db<{ ok: boolean; code: string; message: string; balance: number }[]>`
    SELECT * FROM issue_stock(
      ${txId}, ${input.itemId}, ${input.locationId}, ${input.qty},
      ${user.id}, ${input.idempotencyKey}, ${input.reasonId ?? null},
      ${input.scanMethod ?? null}, ${input.refNo ?? null}, ${input.note ?? null}
    )
  `;

  const row = rows[0];
  if (!row) {
    return { ok: false, code: "item_not_found", message: "item tidak ditemukan" };
  }

  if (!row.ok) {
    if (row.code === "insufficient_stock") {
      return { ok: false, code: "insufficient_stock", message: row.message, balance: row.balance };
    }
    return { ok: false, code: "item_not_found", message: row.message };
  }

  return {
    ok: true,
    code: row.code === "duplicate" ? "duplicate" : "ok",
    txId,
    balance: row.balance,
  };
}

export interface MoveInput {
  /**
   * Termasuk `issue`: pembalik dari transaksi `return` adalah pengeluaran,
   * jadi jalur balik juga perlu bisa membuat transaksi issue.
   */
  type: TxType;
  itemId: string;
  fromLocationId?: string | null;
  toLocationId?: string | null;
  qty: number;
  idempotencyKey: string;
  reasonId?: string | null;
  refNo?: string | null;
  note?: string | null;
  reversesId?: string | null;
  /** Mesin/aset terkait (dipakai penutupan kustodi). */
  equipmentId?: string | null;
}

/**
 * Gerakan stok selain pengambilan (terima, kembali, transfer, koreksi).
 *
 * Memakai satu transaksi database; trigger `enforce_no_negative_stock`
 * menolak kalau hasilnya membuat saldo lokasi negatif.
 */
export async function moveStock(
  user: AuthUser,
  tenant: string,
  input: MoveInput,
): Promise<
  { ok: true; txId: string; duplicate: boolean } | { ok: false; code: string; message: string }
> {
  const txId = `tx_${randomUUID()}`;
  const db = tenantPool(tenant);

  try {
    const result = await db.begin(async (tx) => {
      // Idempotency lebih dulu: kiriman ulang tidak membuat baris baru.
      const existing = await tx<{ id: string }[]>`
        SELECT id FROM transactions
        WHERE user_id = ${user.id} AND idempotency_key = ${input.idempotencyKey}
      `;
      const dup = existing[0];
      if (dup) return { txId: dup.id, duplicate: true };

      // Kunci item supaya saldo dibaca setelah lock didapat.
      await tx`SELECT id FROM items WHERE id = ${input.itemId} FOR UPDATE`;

      await tx`
        INSERT INTO transactions (
          id, type, item_id, from_location_id, to_location_id, qty, user_id,
          reason_id, ref_no, note, idempotency_key, reverses_id, equipment_id
        ) VALUES (
          ${txId}, ${input.type}, ${input.itemId}, ${input.fromLocationId ?? null},
          ${input.toLocationId ?? null}, ${input.qty}, ${user.id},
          ${input.reasonId ?? null}, ${input.refNo ?? null}, ${input.note ?? null},
          ${input.idempotencyKey}, ${input.reversesId ?? null}, ${input.equipmentId ?? null}
        )
      `;

      return { txId, duplicate: false };
    });

    return { ok: true, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("stok tidak cukup")) {
      return { ok: false, code: "insufficient_stock", message };
    }
    if (message.includes("append-only")) {
      return { ok: false, code: "immutable", message };
    }
    return { ok: false, code: "error", message };
  }
}

/**
 * Balik transaksi. Bukan UPDATE — membuat baris pembalik, sehingga log tetap
 * utuh dan saldo terkoreksi secara alami.
 */
export async function reverseTransaction(
  user: AuthUser,
  tenant: string,
  txId: string,
  idempotencyKey: string,
): Promise<{ ok: true; reversalId: string } | { ok: false; code: string; message: string }> {
  const db = tenantPool(tenant);
  const rows = await db<
    {
      id: string;
      type: TxType;
      item_id: string;
      from_location_id: string | null;
      to_location_id: string | null;
      qty: number;
      created_at: Date;
    }[]
  >`SELECT id, type, item_id, from_location_id, to_location_id, qty, created_at
      FROM transactions WHERE id = ${txId}`;

  const original = rows[0];
  if (!original) return { ok: false, code: "not_found", message: "transaksi tidak ada" };

  // Pekerja dibatasi 60 detik; supervisor ke atas tanpa batas (PRD).
  if (user.role === "worker") {
    const ageMs = Date.now() - new Date(original.created_at).getTime();
    if (ageMs > 60_000) {
      return {
        ok: false,
        code: "too_late",
        message: "batas 60 detik untuk membatalkan sudah lewat; hubungi supervisor",
      };
    }
  }

  const already = await db<{ id: string }[]>`
    SELECT id FROM transactions WHERE reverses_id = ${txId}
  `;
  if (already.length > 0) {
    return { ok: false, code: "already_reversed", message: "transaksi sudah dibatalkan" };
  }

  // Arah dibalik: issue jadi return, return jadi issue, transfer ditukar.
  const flip = {
    issue: { from: null, to: original.from_location_id, type: "return" as const },
    return: { from: original.to_location_id, to: null, type: "issue" as const },
    receive: { from: original.to_location_id, to: null, type: "issue" as const },
    transfer: {
      from: original.to_location_id,
      to: original.from_location_id,
      type: "transfer" as const,
    },
    adjust: {
      from: original.to_location_id,
      to: original.from_location_id,
      type: "adjust" as const,
    },
  }[original.type];

  const result = await moveStock(user, tenant, {
    type: flip.type,
    itemId: original.item_id,
    fromLocationId: flip.from,
    toLocationId: flip.to,
    qty: original.qty,
    idempotencyKey,
    reversesId: txId,
    note: "pembalik",
  });

  if (!result.ok) return result;

  // Tutup entri kustodi terkait supaya barang tidak "hilang" dari daftar dibawa.
  await db`
    UPDATE custody SET status = 'closed', outcome = 'returned', closed_at = now(),
      qty_settled = qty
    WHERE opened_tx_id = ${txId} AND status = 'open'
  `;

  return { ok: true, reversalId: result.txId };
}

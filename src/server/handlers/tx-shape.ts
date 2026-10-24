/**
 * Bentuk respons transaksi yang dipakai bersama oleh `transactions.ts`.
 *
 * Kontrak ini WAJIB sama dengan `createTransactionResponseSchema` di
 * `src/lib/api/schemas.ts`: klien mem-parse ketat, jadi respons yang kurang
 * satu field akan menggagalkan seluruh alur UI ("Respons tidak sesuai
 * kontrak"), bukan sekadar menampilkan nilai kosong.
 */
import type { Sql } from "postgres";

interface TxRow {
  id: string;
  type: string;
  item_id: string;
  from_location_id: string | null;
  to_location_id: string | null;
  qty: number;
  user_id: string;
  reason_id: string | null;
  ref_no: string | null;
  note: string | null;
  idempotency_key: string;
  device_id: string | null;
  scan_method: string | null;
  custody_id: string | null;
  equipment_id: string | null;
  outcome: string | null;
  client_created_at: Date | null;
  created_at: Date;
  reverses_id: string | null;
  review_status: string;
  user_name: string;
  item_name: string;
}

export async function loadTransaction(db: Sql, id: string) {
  const rows = await db<TxRow[]>`
    SELECT t.id, t.type::text AS type, t.item_id, t.from_location_id, t.to_location_id, t.qty,
           t.user_id, t.reason_id, t.ref_no, t.note, t.idempotency_key, t.device_id,
           t.scan_method::text AS scan_method, t.custody_id, t.equipment_id,
           t.outcome::text AS outcome, t.client_created_at, t.created_at, t.reverses_id,
           t.review_status::text AS review_status,
           u.name AS user_name, i.name AS item_name
    FROM transactions t
    JOIN users u ON u.id = t.user_id
    JOIN items i ON i.id = t.item_id
    WHERE t.id = ${id}
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    type: r.type,
    itemId: r.item_id,
    fromLocationId: r.from_location_id,
    toLocationId: r.to_location_id,
    qty: r.qty,
    userId: r.user_id,
    reasonId: r.reason_id,
    refNo: r.ref_no,
    note: r.note,
    idempotencyKey: r.idempotency_key,
    deviceId: r.device_id,
    scanMethod: r.scan_method,
    custodyId: r.custody_id,
    equipmentId: r.equipment_id,
    outcome: r.outcome,
    clientCreatedAt: r.client_created_at ? r.client_created_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    reversesId: r.reverses_id,
    reviewStatus: r.review_status,
    userName: r.user_name,
    itemName: r.item_name,
  };
}

export async function loadStockLevel(db: Sql, itemId: string, locationId: string) {
  const rows = await db<
    {
      item_id: string;
      location_id: string;
      qty: number;
      version: number;
      updated_at: Date;
      last_verified_at: Date | null;
      last_verified_qty: number | null;
      tx_since_verified: number;
      last_variance_ratio: number;
      w_id: string;
      w_parent: string | null;
      w_type: string;
      w_code: string;
      w_name: string;
      w_path: string;
      w_active: boolean;
    }[]
  >`
    SELECT sl.item_id, sl.location_id, sl.qty,
           COALESCE((SELECT count(*)::int FROM transactions t
                     WHERE t.item_id = sl.item_id AND t.from_location_id = sl.location_id), 0) AS version,
           COALESCE((SELECT max(created_at) FROM transactions t
                     WHERE t.item_id = sl.item_id AND t.from_location_id = sl.location_id),
                    now()) AS updated_at,
           v.last_verified AS last_verified_at,
           v.last_qty AS last_verified_qty,
           COALESCE(v.cnt, 0)::int AS tx_since_verified,
           0::numeric AS last_variance_ratio,
           l.warehouse_id AS w_id, l.parent_id AS w_parent, l.type::text AS w_type,
           l.code AS w_code, l.name AS w_name, l.path AS w_path, l.active AS w_active
    FROM stock_levels sl
    JOIN locations l ON l.id = sl.location_id
    LEFT JOIN LATERAL (
      SELECT max(answered_at) AS last_verified, max(counted_qty) AS last_qty, count(*) AS cnt
      FROM verifications
      WHERE item_id = sl.item_id AND location_id = sl.location_id
        AND status IN ('recorded','approved')
    ) v ON true
    WHERE sl.item_id = ${itemId} AND sl.location_id = ${locationId}
  `;
  const r = rows[0];
  if (!r) return null;

  const hasVerified = Boolean(r.last_verified_at);
  const score = hasVerified ? 78 : 0;
  return {
    itemId: r.item_id,
    locationId: r.location_id,
    qty: r.qty,
    version: r.version,
    updatedAt: new Date(r.updated_at).toISOString(),
    lastVerifiedAt: r.last_verified_at ? new Date(r.last_verified_at).toISOString() : null,
    lastVerifiedQty: r.last_verified_qty ?? null,
    txSinceVerified: r.tx_since_verified,
    lastVarianceRatio: Number(r.last_variance_ratio),
    confidence: {
      score,
      level: score >= 80 ? "high" : score >= 50 ? "medium" : score > 0 ? "low" : "never",
      lastVerifiedAt: r.last_verified_at ? new Date(r.last_verified_at).toISOString() : null,
    },
    location: {
      id: r.location_id,
      warehouseId: r.w_id,
      parentId: r.w_parent,
      type: r.w_type,
      code: r.w_code,
      name: r.w_name,
      path: r.w_path,
      active: r.w_active,
    },
  };
}

export async function loadCustody(db: Sql, id: string) {
  const rows = await db<
    {
      id: string;
      issue_tx_id: string;
      user_id: string;
      item_id: string;
      qty: number;
      qty_settled: number;
      status: string;
      created_at: Date;
      closed_at: Date | null;
      last_reminded_at: Date | null;
      equipment_id: string | null;
      ref_no: string | null;
      from_location_id: string | null;
      user_name: string;
    }[]
  >`
    SELECT c.id, c.issue_tx_id, c.user_id, c.item_id, c.qty, c.qty_settled,
           c.status::text AS status, c.created_at, c.closed_at, c.last_reminded_at,
           c.equipment_id, c.ref_no, c.from_location_id, u.name AS user_name
    FROM custody c JOIN users u ON u.id = c.user_id
    WHERE c.id = ${id}
  `;
  const r = rows[0];
  if (!r) return null;
  const open = r.qty - r.qty_settled;
  const ageHours = (Date.now() - new Date(r.created_at).getTime()) / 3_600_000;
  return {
    id: r.id,
    issueTxId: r.issue_tx_id,
    userId: r.user_id,
    itemId: r.item_id,
    qtyTaken: r.qty,
    qtyOpen: open,
    status: r.status,
    openedAt: new Date(r.created_at).toISOString(),
    closedAt: r.closed_at ? new Date(r.closed_at).toISOString() : null,
    lastRemindedAt: r.last_reminded_at ? new Date(r.last_reminded_at).toISOString() : null,
    equipmentId: r.equipment_id,
    refNo: r.ref_no,
    fromLocationId: r.from_location_id ?? "",
    ageHours: Math.round(ageHours),
    overdue: open > 0 && ageHours > 24,
    userName: r.user_name,
  };
}

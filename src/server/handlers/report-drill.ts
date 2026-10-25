/**
 * Drill-down halaman Laporan.
 *
 * Setiap card angka di laporan adalah HASIL AGREGASI — pengguna ingin tahu
 * "item mana saja yang dimaksud angka ini?". Endpoint ini menjawabnya dengan
 * daftar nyata:
 *
 *   kind item (bucket kesehatan persediaan): belowMin | overMax | healthy |
 *     noThreshold | neverCounted | dead | needsCount | conf
 *     (`conf` butuh `id` = bucket high|medium|low|never)
 *                                           -> daftar item pada kelompok itu
 *   kind transaksi (daftar peringkat): topItem | byUser | byReason | byEquipment
 *     (butuh `id`)                            -> transaksi dalam rentang `days`
 *
 * Aturan proyek: respons selalu camelCase — jangan pernah mengirim baris SQL
 * mentah (snake_case) ke klien.
 */
import { tenantPool } from "@/server/db";
import { errors, ok } from "@/server/http";

const ITEM_KINDS = [
  "belowMin",
  "overMax",
  "healthy",
  "noThreshold",
  "neverCounted",
  "dead",
  "needsCount",
  "conf",
];
const TX_KINDS = ["topItem", "byUser", "byReason", "byEquipment"];

export async function getReportDrill(request: Request, tenant: string): Promise<Response> {
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "";
  const id = url.searchParams.get("id") ?? "";
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") ?? 30) || 30));

  const db = tenantPool(tenant);

  if (ITEM_KINDS.includes(kind)) {
    const rows = await db<
      {
        id: string;
        name: string;
        code: string;
        qty: number;
        min_stock: number;
        max_stock: number | null;
        location_path: string | null;
        unit: string;
        last_counted: Date | null;
        last_moved: Date | null;
      }[]
    >`
      WITH per_item AS (
        SELECT i.id, i.name, i.code, i.min_stock, i.max_stock,
               COALESCE(l.path, '—') AS location_path, u.symbol AS unit,
               COALESCE((SELECT SUM(qty) FROM stock_levels WHERE item_id = i.id), 0)::int AS qty,
               (SELECT max(answered_at) FROM verifications v
                 WHERE v.item_id = i.id AND v.status IN ('recorded','approved')) AS last_counted,
               (SELECT max(created_at) FROM transactions t WHERE t.item_id = i.id) AS last_moved
        FROM items i
        JOIN units u ON u.id = i.unit_id
        LEFT JOIN locations l ON l.id = i.primary_location_id
        WHERE i.active
      )
      SELECT * FROM per_item
      WHERE (
        (${kind} = 'belowMin'      AND min_stock > 0 AND qty < min_stock)
        OR (${kind} = 'overMax'    AND max_stock IS NOT NULL AND qty > max_stock)
        OR (${kind} = 'noThreshold' AND min_stock = 0 AND max_stock IS NULL)
        OR (${kind} = 'healthy'    AND (min_stock = 0 OR qty >= min_stock)
             AND (max_stock IS NULL OR qty <= max_stock))
        OR (${kind} = 'neverCounted' AND last_counted IS NULL)
        OR (${kind} = 'needsCount'   AND (last_counted IS NULL
             OR last_counted < now() - interval '90 days'))
        OR (${kind} = 'dead'       AND qty > 0
             AND (last_moved IS NULL OR last_moved < now() - interval '60 days'))
        OR (${kind} = 'conf' AND (
              (${id} = 'high'   AND last_counted > now() - interval '30 days')
              OR (${id} = 'medium' AND last_counted <= now() - interval '30 days'
                  AND last_counted > now() - interval '90 days')
              OR (${id} = 'low'    AND last_counted <= now() - interval '90 days')
              OR (${id} = 'never'  AND last_counted IS NULL)
            ))
      )
      ORDER BY qty DESC, name
      LIMIT 200
    `;
    return ok({
      kind,
      items: rows.map((row) => ({
        itemId: row.id,
        name: row.name,
        code: row.code,
        qty: row.qty,
        minStock: row.min_stock,
        maxStock: row.max_stock,
        locationPath: row.location_path ?? "—",
        unit: row.unit,
        lastCountedAt: row.last_counted ? row.last_counted.toISOString() : null,
        lastMovedAt: row.last_moved ? row.last_moved.toISOString() : null,
      })),
      tx: [],
    });
  }

  if (TX_KINDS.includes(kind)) {
    if (!id) throw errors.badRequest("id wajib untuk drill-down transaksi.");
    const since = new Date(Date.now() - days * 86_400_000);
    const rows = await db<
      {
        id: string;
        item_id: string;
        item_name: string;
        item_code: string;
        user_name: string;
        type: string;
        qty: number;
        created_at: Date;
        note: string | null;
        ref_no: string | null;
      }[]
    >`
      SELECT t.id, t.item_id, i.name AS item_name, i.code AS item_code,
             u.name AS user_name, t.type, t.qty, t.created_at, t.note, t.ref_no
      FROM transactions t
      JOIN items i ON i.id = t.item_id
      JOIN users u ON u.id = t.user_id
      WHERE t.created_at >= ${since}
        AND (
          (${kind} = 'topItem'     AND t.item_id = ${id} AND t.type = 'issue')
          OR (${kind} = 'byUser'        AND t.user_id = ${id})
          OR (${kind} = 'byReason'   AND COALESCE(t.reason_id, 'none') = ${id})
          OR (${kind} = 'byEquipment' AND COALESCE(t.equipment_id, 'none') = ${id})
        )
      ORDER BY t.created_at DESC
      LIMIT 200
    `;
    return ok({
      kind,
      items: [],
      tx: rows.map((row) => ({
        txId: row.id,
        itemId: row.item_id,
        itemName: row.item_name,
        itemCode: row.item_code,
        userName: row.user_name,
        type: row.type,
        qty: row.qty,
        createdAt: row.created_at.toISOString(),
        note: row.note,
        refNo: row.ref_no,
      })),
    });
  }

  throw errors.badRequest(`Jenis drill-down tidak dikenal: ${kind}`);
}

/**
 * Laporan tren harga perolehan (price history).
 *
 * Menjawab: "harga beli item ini berubah bagaimana dari waktu ke waktu?"
 * Setiap `receive` yang mencatat `unit_price` adalah satu titik data; harga
 * dirata-ratakan per hari supaya beberapa pembelian di tanggal yang sama tidak
 * muncul sebagai baris ganda. Delta dihitung terhadap titik harga sebelumnya.
 *
 * Sama seperti endpoint laporan lain: sesi sudah dijaga di dispatch route,
 * tidak perlu cek peran di sini.
 *
 * Aturan proyek: respons selalu camelCase — jangan pernah mengirim baris SQL
 * mentah (snake_case) ke klien.
 */
import { tenantPool } from "@/server/db";
import { errors, ok } from "@/server/http";

const DAY = 86_400_000;

export interface PriceChangePoint {
  date: string;
  price: number;
  prevPrice: number | null;
  delta: number | null;
  deltaPct: number | null;
  qty: number;
  tx: number;
}

export interface PriceHistoryEntry {
  itemId: string;
  name: string;
  code: string;
  unit: string;
  firstPrice: number;
  lastPrice: number;
  /** Rentang harga terendah–tertinggi pada periode. */
  minPrice: number;
  maxPrice: number;
  changePct: number;
  points: PriceChangePoint[];
}

function buildEntries(
  rows: {
    item_id: string;
    name: string;
    code: string;
    unit: string | null;
    date: string;
    price: string;
    qty: number;
    tx: number;
  }[],
): PriceHistoryEntry[] {
  const byItem = new Map<string, PriceHistoryEntry>();
  for (const row of rows) {
    const price = Math.round(Number(row.price) * 100) / 100;
    let entry = byItem.get(row.item_id);
    if (!entry) {
      entry = {
        itemId: row.item_id,
        name: row.name,
        code: row.code,
        unit: row.unit ?? "",
        firstPrice: price,
        lastPrice: price,
        minPrice: price,
        maxPrice: price,
        changePct: 0,
        points: [],
      };
      byItem.set(row.item_id, entry);
    }
    const prev = entry.points.length > 0 ? entry.lastPrice : null;
    const delta = prev === null ? null : Math.round((price - prev) * 100) / 100;
    entry.points.push({
      date: row.date,
      price,
      prevPrice: prev,
      delta,
      deltaPct: prev && prev > 0 && delta !== null ? Math.round((delta / prev) * 1000) / 10 : null,
      qty: row.qty,
      tx: row.tx,
    });
    entry.lastPrice = price;
    entry.minPrice = Math.min(entry.minPrice, price);
    entry.maxPrice = Math.max(entry.maxPrice, price);
  }

  for (const entry of byItem.values()) {
    entry.changePct =
      entry.firstPrice > 0
        ? Math.round(((entry.lastPrice - entry.firstPrice) / entry.firstPrice) * 1000) / 10
        : 0;
  }

  // Item dengan perubahan harga paling tajam duluan — itu yang dicari pembaca.
  return [...byItem.values()].sort(
    (a, b) => Math.abs(b.changePct) - Math.abs(a.changePct) || b.points.length - a.points.length,
  );
}

export async function getPriceHistory(request: Request, tenant: string): Promise<Response> {
  const url = new URL(request.url);
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") ?? 90) || 90));
  const since = new Date(Date.now() - days * DAY);
  const itemFilter = url.searchParams.get("itemId");

  const db = tenantPool(tenant);
  const rows = await db<
    {
      item_id: string;
      name: string;
      code: string;
      unit: string | null;
      date: string;
      price: string;
      qty: number;
      tx: number;
    }[]
  >`
    SELECT t.item_id, i.name, i.code, u.symbol AS unit,
           to_char(date_trunc('day', t.created_at), 'YYYY-MM-DD') AS date,
           AVG(t.unit_price)::text AS price,
           SUM(t.qty)::int AS qty, count(*)::int AS tx
    FROM transactions t
    JOIN items i ON i.id = t.item_id
    LEFT JOIN units u ON u.id = i.unit_id
    WHERE t.type = 'receive' AND t.unit_price IS NOT NULL
      AND t.created_at >= ${since}
      AND (${itemFilter ?? null}::text IS NULL OR t.item_id = ${itemFilter ?? null})
    GROUP BY t.item_id, i.name, i.code, u.symbol, date_trunc('day', t.created_at)
    ORDER BY t.item_id, date_trunc('day', t.created_at)
  `;

  const entries = buildEntries(rows);
  if (itemFilter && entries.length === 0) {
    throw errors.notFound("Riwayat harga untuk item ini belum ada.");
  }

  return ok({
    rangeDays: days,
    items: entries.slice(0, 30),
    totalItems: entries.length,
  });
}

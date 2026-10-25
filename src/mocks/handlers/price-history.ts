/**
 * Laporan tren harga perolehan — sisi mock.
 *
 * Pair dari `src/server/handlers/price-history.ts`; bentuk respons harus sama
 * persis (camelCase) supaya UI tidak peduli mode mana yang jalan.
 */
import type { ApiRequest, ApiResponse } from "@/mocks/http";
import { ok, requireRole } from "@/mocks/http";
import { data } from "@/mocks/store";

const DAY = 86_400_000;

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function priceHistory(req: ApiRequest): ApiResponse {
  requireRole(req, "supervisor");
  const days = Math.min(365, Math.max(1, Number(req.query.get("days") ?? 90) || 90));
  const itemFilter = req.query.get("itemId");
  const cutoff = Date.now() - days * DAY;

  // Rata-ratakan unit_price per item per hari, sama seperti query server.
  const perItem = new Map<string, Map<string, { sum: number; qty: number; tx: number }>>();
  for (const tx of data().transactions) {
    if (tx.type !== "receive" || tx.unitPrice == null) continue;
    if (Date.parse(tx.createdAt) < cutoff) continue;
    if (itemFilter && tx.itemId !== itemFilter) continue;
    const byDay = perItem.get(tx.itemId) ?? new Map();
    const key = dayKey(tx.createdAt);
    const agg = byDay.get(key) ?? { sum: 0, qty: 0, tx: 0 };
    agg.sum += tx.unitPrice;
    agg.qty += tx.qty;
    agg.tx += 1;
    byDay.set(key, agg);
    perItem.set(tx.itemId, byDay);
  }

  const entries = [...perItem.entries()]
    .map(([itemId, byDay]) => {
      const item = data().items.find((entry) => entry.id === itemId);
      if (!item) return null;
      const unit = data().units.find((entry) => entry.id === item.unitId)?.symbol ?? "";
      const points = [...byDay.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, agg]) => {
          const price = Math.round((agg.sum / agg.tx) * 100) / 100;
          return { date, price, qty: agg.qty, tx: agg.tx };
        });
      // Delta dihitung terhadap titik sebelumnya (identik dengan sisi server).
      let prev: number | null = null;
      const withDelta = points.map((point) => {
        const delta = prev === null ? null : Math.round((point.price - prev) * 100) / 100;
        const deltaPct =
          prev && prev > 0 && delta !== null ? Math.round((delta / prev) * 1000) / 10 : null;
        const row = { ...point, prevPrice: prev, delta, deltaPct };
        prev = point.price;
        return row;
      });
      const firstPrice = withDelta[0]?.price ?? 0;
      const lastPrice = withDelta[withDelta.length - 1]?.price ?? 0;
      const prices = withDelta.map((point) => point.price);
      return {
        itemId,
        name: item.name,
        code: item.code,
        unit,
        firstPrice,
        lastPrice,
        minPrice: Math.min(...prices),
        maxPrice: Math.max(...prices),
        changePct:
          firstPrice > 0 ? Math.round(((lastPrice - firstPrice) / firstPrice) * 1000) / 10 : 0,
        points: withDelta,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort(
      (a, b) => Math.abs(b.changePct) - Math.abs(a.changePct) || b.points.length - a.points.length,
    );

  if (itemFilter && entries.length === 0) {
    return {
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "Riwayat harga untuk item ini belum ada." } },
    };
  }

  return ok({ rangeDays: days, items: entries.slice(0, 30), totalItems: entries.length });
}

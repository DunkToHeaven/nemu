/**
 * Drill-down laporan — sisi mock.
 *
 * Pair dari `src/server/handlers/report-drill.ts`; bentuk respons harus sama
 * persis (camelCase) supaya UI tidak peduli mode mana yang jalan.
 */
import type { Item, Transaction } from "@/lib/types";
import type { ApiRequest, ApiResponse } from "@/mocks/http";
import { ok, requireRole, stockFor, unitOf, worstConfidence } from "@/mocks/http";
import { data } from "@/mocks/store";

const DAY = 86_400_000;

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

function totalQty(itemId: string): number {
  return stockFor(itemId).reduce((sum, level) => sum + level.qty, 0);
}

function lastCountedAt(item: Item): string | null {
  // Setara dengan filter server: verifications.status IN ('recorded','approved').
  const answered = data()
    .verifications.filter(
      (entry) =>
        entry.itemId === item.id &&
        (entry.result === "match" ||
          (entry.result === "mismatch" && entry.reviewStatus === "approved")),
    )
    .map((entry) => entry.createdAt);
  return answered.length > 0 ? (answered.sort().at(-1) as string) : null;
}

function lastMovedAt(item: Item): string | null {
  const moves = data()
    .transactions.filter((tx) => tx.itemId === item.id)
    .map((tx) => tx.createdAt);
  return moves.length > 0 ? (moves.sort().at(-1) as string) : null;
}

function confidenceBucket(item: Item): "high" | "medium" | "low" | "never" {
  const levels = stockFor(item.id);
  if (levels.length === 0) return "never";
  return worstConfidence(levels).level;
}

function itemRow(item: Item) {
  return {
    itemId: item.id,
    name: item.name,
    code: item.code,
    qty: totalQty(item.id),
    minStock: item.minStock,
    maxStock: item.maxStock,
    locationPath:
      data().locations.find((location) => location.id === item.primaryLocationId)?.path ?? "—",
    unit: unitOf(item)?.symbol ?? "",
    lastCountedAt: lastCountedAt(item),
    lastMovedAt: lastMovedAt(item),
  };
}

function txRow(tx: Transaction) {
  return {
    txId: tx.id,
    itemId: tx.itemId,
    itemName: data().items.find((entry) => entry.id === tx.itemId)?.name ?? "",
    itemCode: data().items.find((entry) => entry.id === tx.itemId)?.code ?? "",
    userName: data().users.find((entry) => entry.id === tx.userId)?.name ?? "",
    type: tx.type,
    qty: tx.qty,
    createdAt: tx.createdAt,
    note: tx.note ?? null,
    refNo: tx.refNo ?? null,
  };
}

export function reportDrill(req: ApiRequest): ApiResponse {
  requireRole(req, "supervisor");
  const kind = req.query.get("kind") ?? "";
  const id = req.query.get("id") ?? "";
  const days = Math.min(365, Math.max(1, Number(req.query.get("days") ?? 30) || 30));

  if (ITEM_KINDS.includes(kind)) {
    let items = data()
      .items.filter((item) => item.active)
      .map(itemRow);
    items = items.filter((row) => {
      const item = data().items.find((entry) => entry.id === row.itemId) as Item;
      const dead =
        row.qty > 0 &&
        (row.lastMovedAt === null || Date.parse(row.lastMovedAt) < Date.now() - 60 * DAY);
      const counted = (thresholdDays: number) =>
        row.lastCountedAt !== null &&
        Date.parse(row.lastCountedAt) >= Date.now() - thresholdDays * DAY;
      switch (kind) {
        case "belowMin":
          return row.minStock > 0 && row.qty < row.minStock;
        case "overMax":
          return row.maxStock !== null && row.qty > row.maxStock;
        case "noThreshold":
          return row.minStock === 0 && row.maxStock === null;
        case "healthy":
          return (
            (row.minStock === 0 || row.qty >= row.minStock) &&
            (row.maxStock === null || row.qty <= row.maxStock)
          );
        case "neverCounted":
          return row.lastCountedAt === null;
        case "needsCount":
          return row.lastCountedAt === null || !counted(90);
        case "dead":
          return dead;
        case "conf":
          return confidenceBucket(item) === id;
        default:
          return false;
      }
    });
    items.sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name));
    return ok({ kind, items: items.slice(0, 200), tx: [] });
  }

  if (TX_KINDS.includes(kind)) {
    const cutoff = Date.now() - days * DAY;
    const rows = data()
      .transactions.filter((tx) => {
        if (Date.parse(tx.createdAt) < cutoff) return false;
        switch (kind) {
          case "topItem":
            return tx.itemId === id && tx.type === "issue";
          case "byUser":
            return tx.userId === id;
          case "byReason":
            return (tx.reasonId ?? "none") === id;
          case "byEquipment":
            return (tx.equipmentId ?? "none") === id;
          default:
            return false;
        }
      })
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 200);
    return ok({ kind, items: [], tx: rows.map(txRow) });
  }

  throw new Error(`Jenis drill-down tidak dikenal: ${kind}`);
}

/** Ringkasan kesehatan persediaan untuk reports() — mirror query `health` server. */
export function inventoryHealthMock() {
  const items = data().items.filter((item) => item.active);
  let belowMin = 0;
  let overMax = 0;
  let healthy = 0;
  let noThreshold = 0;
  let neverCounted = 0;
  let zeroStock = 0;
  let stockValue = 0;
  let deadValue = 0;
  let deadCount = 0;
  const age = { d30: 0, d90: 0, d180: 0, older: 0, never: 0 };

  for (const item of items) {
    const qty = totalQty(item.id);
    if (item.minStock > 0 && qty < item.minStock) belowMin += 1;
    if (item.maxStock !== null && qty > item.maxStock) overMax += 1;
    if (
      (item.minStock === 0 || qty >= item.minStock) &&
      (item.maxStock === null || qty <= item.maxStock)
    )
      healthy += 1;
    if (item.minStock === 0 && item.maxStock === null) noThreshold += 1;
    if (qty === 0) zeroStock += 1;
    stockValue += qty * (item.unitValue ?? 0);

    const answered = data()
      .verifications.filter(
        (entry) =>
          entry.itemId === item.id &&
          (entry.result === "match" ||
            (entry.result === "mismatch" && entry.reviewStatus === "approved")),
      )
      .map((entry) => entry.createdAt);
    if (answered.length === 0) {
      neverCounted += 1;
      age.never += 1;
    } else {
      const last = answered.sort().at(-1) as string;
      const ageDays = (Date.now() - Date.parse(last)) / DAY;
      if (ageDays <= 30) age.d30 += 1;
      else if (ageDays <= 90) age.d90 += 1;
      else if (ageDays <= 180) age.d180 += 1;
      else age.older += 1;
    }

    const moved = lastMovedAt(item);
    if (qty > 0 && (moved === null || Date.parse(moved) < Date.now() - 60 * DAY)) {
      deadCount += 1;
      deadValue += qty * (item.unitValue ?? 0);
    }
  }

  return {
    total: items.length,
    belowMin,
    overMax,
    healthy,
    noThreshold,
    neverCounted,
    zeroStock,
    stockValue,
    deadValue,
    deadCount,
    ageBuckets: age,
  };
}

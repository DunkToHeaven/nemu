import type { ConfidenceLevel } from "@/lib/types";

export type StockStatus = "safe" | "low" | "critical" | "empty" | "over";

export interface StockStatusInput {
  qty: number;
  minStock: number;
}

export function stockStatus({ qty, minStock }: StockStatusInput): StockStatus {
  if (qty <= 0) return "empty";
  if (minStock > 0 && qty < minStock) return "critical";
  if (minStock > 0 && qty === minStock) return "low";
  return "safe";
}

export function stockStatusLabelKey(status: StockStatus): string {
  switch (status) {
    case "safe":
      return "stock.safe";
    case "low":
      return "stock.low";
    case "critical":
      return "stock.critical";
    case "empty":
      return "stock.empty";
    default:
      return "stock.over";
  }
}

export function needsCount(level: ConfidenceLevel): boolean {
  return level === "low" || level === "never";
}

/** Opname terarah: item dengan keyakinan rendah / belum dihitung, skor terendah dulu. */
export function sortByConfidenceAsc<T extends { confidence: { score: number } }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.confidence.score - b.confidence.score);
}

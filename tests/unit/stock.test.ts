import { describe, expect, it } from "vitest";
import { needsCount, sortByConfidenceAsc, stockStatus, stockStatusLabelKey } from "@/lib/domain/stock";

describe("status stok (SC-11)", () => {
  it("0 berarti kosong", () => {
    expect(stockStatus({ qty: 0, minStock: 5 })).toBe("empty");
    expect(stockStatus({ qty: -1, minStock: 5 })).toBe("empty");
  });

  it("di bawah minimum berarti kritis", () => {
    expect(stockStatus({ qty: 3, minStock: 5 })).toBe("critical");
  });

  it("tepat di minimum berarti menipis", () => {
    expect(stockStatus({ qty: 5, minStock: 5 })).toBe("low");
  });

  it("di atas minimum berarti aman", () => {
    expect(stockStatus({ qty: 6, minStock: 5 })).toBe("safe");
  });

  it("minimum 0 melewati pemeriksaan minimum", () => {
    expect(stockStatus({ qty: 1, minStock: 0 })).toBe("safe");
  });

  it("setiap status punya kunci label", () => {
    for (const status of ["safe", "low", "critical", "empty", "over"] as const) {
      expect(stockStatusLabelKey(status)).toMatch(/^stock\./);
    }
  });
});

describe("opname terarah (OP-04)", () => {
  it("keyakinan rendah dan belum pernah dihitung perlu dihitung", () => {
    expect(needsCount("low")).toBe(true);
    expect(needsCount("never")).toBe(true);
    expect(needsCount("medium")).toBe(false);
    expect(needsCount("high")).toBe(false);
  });

  it("diurutkan skor terendah dulu", () => {
    const rows = [{ confidence: { score: 70 } }, { confidence: { score: 10 } }, { confidence: { score: 40 } }];
    expect(sortByConfidenceAsc(rows).map((row) => row.confidence.score)).toEqual([10, 40, 70]);
  });

  it("tidak mengubah array masukan", () => {
    const rows = [{ confidence: { score: 70 } }, { confidence: { score: 10 } }];
    const copy = [...rows];
    sortByConfidenceAsc(rows);
    expect(rows).toEqual(copy);
  });
});

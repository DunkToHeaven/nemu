import { describe, expect, it } from "vitest";
import {
  computeConfidence,
  computeConfidenceBreakdown,
  DEFAULT_CONFIDENCE_PARAMS,
  levelFromScore,
} from "@/lib/domain/confidence";

const now = new Date("2026-03-01T00:00:00.000Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

describe("skor keyakinan (CF-01…CF-06)", () => {
  it("item yang baru diverifikasi tanpa pergerakan mendapat 100", () => {
    const result = computeConfidence({
      lastVerifiedAt: now.toISOString(),
      txSinceVerified: 0,
      lastVarianceRatio: 0,
      needsReview: false,
      now,
    });
    expect(result.score).toBe(100);
    expect(result.level).toBe("high");
  });

  it("peluruhan umur maksimal sebesar ageWeight setelah decayDays", () => {
    const result = computeConfidence({
      lastVerifiedAt: daysAgo(DEFAULT_CONFIDENCE_PARAMS.decayDays),
      txSinceVerified: 0,
      lastVarianceRatio: 0,
      needsReview: false,
      now,
    });
    expect(result.breakdown?.agePenalty).toBeCloseTo(DEFAULT_CONFIDENCE_PARAMS.ageWeight, 5);
    expect(result.score).toBe(100 - DEFAULT_CONFIDENCE_PARAMS.ageWeight);
  });

  it("pergerakan dibatasi 25 poin", () => {
    const result = computeConfidence({
      lastVerifiedAt: now.toISOString(),
      txSinceVerified: 1000,
      lastVarianceRatio: 0,
      needsReview: false,
      now,
    });
    expect(result.breakdown?.movementPenalty).toBe(25);
  });

  it("selisih dan kebutuhan tinjauan menurunkan skor", () => {
    const result = computeConfidence({
      lastVerifiedAt: now.toISOString(),
      txSinceVerified: 0,
      lastVarianceRatio: 0.2,
      needsReview: true,
      now,
    });
    expect(result.breakdown?.variancePenalty).toBeCloseTo(20, 5);
    expect(result.breakdown?.reviewPenalty).toBe(10);
    expect(result.score).toBe(70);
  });

  it("belum pernah dihitung dibatasi neverCountedCap dan berlevel never", () => {
    const result = computeConfidence({
      lastVerifiedAt: null,
      txSinceVerified: 0,
      lastVarianceRatio: 0,
      needsReview: false,
      now,
    });
    expect(result.score).toBeLessThanOrEqual(DEFAULT_CONFIDENCE_PARAMS.neverCountedCap);
    expect(result.level).toBe("never");
    expect(result.breakdown?.cappedNeverCounted).toBe(true);
  });

  it("skor tidak pernah negatif", () => {
    const result = computeConfidence({
      lastVerifiedAt: daysAgo(400),
      txSinceVerified: 500,
      lastVarianceRatio: 1,
      needsReview: true,
      now,
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("ambang level konsisten", () => {
    expect(levelFromScore(80, false)).toBe("high");
    expect(levelFromScore(79, false)).toBe("medium");
    expect(levelFromScore(50, false)).toBe("medium");
    expect(levelFromScore(49, false)).toBe("low");
    expect(levelFromScore(100, true)).toBe("never");
  });

  it("breakdown selalu berisi komponen yang bisa dijelaskan", () => {
    const breakdown = computeConfidenceBreakdown({
      lastVerifiedAt: daysAgo(30),
      txSinceVerified: 3,
      lastVarianceRatio: 0.1,
      needsReview: false,
      now,
    });
    expect(breakdown.base).toBe(100);
    expect(breakdown.daysSinceVerified).toBeCloseTo(30, 5);
    expect(breakdown.txSinceVerified).toBe(3);
  });
});

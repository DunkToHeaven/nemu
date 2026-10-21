import type { Confidence, ConfidenceBreakdown, ConfidenceLevel } from "@/lib/types";

export interface ConfidenceParams {
  decayDays: number;
  ageWeight: number;
  movementWeight: number;
  varianceWeight: number;
  reviewPenalty: number;
  neverCountedCap: number;
  highThreshold: number;
  mediumThreshold: number;
}

export const DEFAULT_CONFIDENCE_PARAMS: ConfidenceParams = {
  decayDays: 90,
  ageWeight: 40,
  movementWeight: 2,
  varianceWeight: 100,
  reviewPenalty: 10,
  neverCountedCap: 30,
  highThreshold: 80,
  mediumThreshold: 50,
};

export interface ConfidenceInput {
  lastVerifiedAt: string | null;
  txSinceVerified: number;
  lastVarianceRatio: number;
  needsReview: boolean;
  now?: Date;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / 86_400_000);
}

/** Rumus PRD 5.5 — murni, dapat diuji, dan dapat dijelaskan ke pekerja. */
export function computeConfidenceBreakdown(
  input: ConfidenceInput,
  params: ConfidenceParams = DEFAULT_CONFIDENCE_PARAMS,
): ConfidenceBreakdown {
  const now = input.now ?? new Date();
  const neverCounted = input.lastVerifiedAt === null;
  const days = neverCounted ? null : daysBetween(new Date(input.lastVerifiedAt as string), now);

  const agePenalty = neverCounted
    ? params.ageWeight
    : params.ageWeight * Math.min(1, (days as number) / params.decayDays);
  const movementPenalty = Math.min(25, params.movementWeight * Math.max(0, input.txSinceVerified));
  const variancePenalty = Math.min(
    25,
    params.varianceWeight * Math.max(0, Math.abs(input.lastVarianceRatio)),
  );
  const reviewPenalty = input.needsReview ? params.reviewPenalty : 0;

  return {
    base: 100,
    agePenalty: round2(agePenalty),
    movementPenalty: round2(movementPenalty),
    variancePenalty: round2(variancePenalty),
    reviewPenalty,
    daysSinceVerified: days === null ? null : round2(days),
    txSinceVerified: input.txSinceVerified,
    cappedNeverCounted: neverCounted,
  };
}

export function levelFromScore(
  score: number,
  neverCounted: boolean,
  params: ConfidenceParams = DEFAULT_CONFIDENCE_PARAMS,
): ConfidenceLevel {
  if (neverCounted) return "never";
  if (score >= params.highThreshold) return "high";
  if (score >= params.mediumThreshold) return "medium";
  return "low";
}

export function computeConfidence(
  input: ConfidenceInput,
  params: ConfidenceParams = DEFAULT_CONFIDENCE_PARAMS,
): Confidence {
  const breakdown = computeConfidenceBreakdown(input, params);
  const raw =
    breakdown.base -
    breakdown.agePenalty -
    breakdown.movementPenalty -
    breakdown.variancePenalty -
    breakdown.reviewPenalty;
  const capped = breakdown.cappedNeverCounted ? Math.min(params.neverCountedCap, raw) : raw;
  const score = Math.round(Math.max(0, Math.min(100, capped)));
  return {
    score,
    level: levelFromScore(score, breakdown.cappedNeverCounted, params),
    lastVerifiedAt: input.lastVerifiedAt,
    breakdown,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function confidenceLevelLabelKey(level: ConfidenceLevel): string {
  switch (level) {
    case "high":
      return "confidence.high";
    case "medium":
      return "confidence.medium";
    case "low":
      return "confidence.low";
    default:
      return "confidence.never";
  }
}

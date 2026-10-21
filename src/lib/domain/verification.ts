import type { VerificationMode } from "@/lib/types";
import { clamp } from "@/lib/utils";

export interface PromptParams {
  pMin: number;
  pMax: number;
  bonusValue: number;
  bonusVariance: number;
  mustAskBelow: number;
  quotaPerShift: number;
  cooldownHours: number;
  countThreshold: number;
  blindEveryN: number;
  blindStreakTrigger: number;
  blindStreakLength: number;
}

export const DEFAULT_PROMPT_PARAMS: PromptParams = {
  pMin: 0.05,
  pMax: 0.8,
  bonusValue: 0.15,
  bonusVariance: 0.15,
  mustAskBelow: 30,
  quotaPerShift: 3,
  cooldownHours: 4,
  countThreshold: 50,
  blindEveryN: 4,
  blindStreakTrigger: 10,
  blindStreakLength: 3,
};

/** Hash deterministik → [0,1). Dipakai agar keputusan acak bisa direproduksi di tes. */
export function seededUnit(seed: string): number {
  let h1 = 0xdeadbeef ^ seed.length;
  let h2 = 0x41c6ce57 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const value = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return (value % 1_000_003) / 1_000_003;
}

export interface PromptDecisionInput {
  confidenceScore: number;
  neverCounted: boolean;
  unitValueHigh: boolean;
  hadVariance90d: boolean;
  qtyAfterIssue: number;
  isBulk: boolean;
  askedThisShift: number;
  lastVerifiedAt: string | null;
  hasOpenVariance: boolean;
  consecutiveMatches: number;
  now: Date;
  seed: string;
}

export interface PromptDecision {
  ask: boolean;
  probability: number;
  mode: VerificationMode;
  reason:
    | "quota"
    | "cooldown"
    | "bulk"
    | "threshold"
    | "disabled"
    | "sampled"
    | "must_ask"
    | "random";
}

/** Peluang bertanya — PRD 5.4. */
export function promptProbability(
  input: Pick<PromptDecisionInput, "confidenceScore" | "unitValueHigh" | "hadVariance90d">,
  params: PromptParams = DEFAULT_PROMPT_PARAMS,
): number {
  const base = params.pMin + 0.5 * (1 - input.confidenceScore / 100);
  const bonusValue = input.unitValueHigh ? params.bonusValue : 0;
  const bonusVariance = input.hadVariance90d ? params.bonusVariance : 0;
  return round3(clamp(base + bonusValue + bonusVariance, params.pMin, params.pMax));
}

export function decidePrompt(
  input: PromptDecisionInput,
  params: PromptParams = DEFAULT_PROMPT_PARAMS,
): PromptDecision {
  const probability = promptProbability(input, params);

  if (input.askedThisShift >= params.quotaPerShift) {
    return { ask: false, probability, mode: "confirm", reason: "quota" };
  }
  if (input.isBulk) {
    return { ask: false, probability, mode: "confirm", reason: "bulk" };
  }
  if (input.qtyAfterIssue > params.countThreshold) {
    return { ask: false, probability, mode: "confirm", reason: "threshold" };
  }
  if (input.lastVerifiedAt !== null && !input.hasOpenVariance) {
    const hours = (input.now.getTime() - new Date(input.lastVerifiedAt).getTime()) / 3_600_000;
    if (hours < params.cooldownHours) {
      return { ask: false, probability, mode: "confirm", reason: "cooldown" };
    }
  }

  const mustAsk = input.neverCounted || input.confidenceScore < params.mustAskBelow;
  const roll = seededUnit(input.seed);
  const ask = mustAsk || roll < probability;

  if (!ask) {
    return { ask: false, probability, mode: "confirm", reason: "random" };
  }
  return {
    ask: true,
    probability,
    mode: chooseMode(input, params),
    reason: mustAsk ? "must_ask" : "sampled",
  };
}

/**
 * Mode buta (CV-07): 1 dari N pertanyaan secara berkala, dan otomatis buta
 * selama beberapa pertanyaan setelah ≥10 jawaban "Sesuai" berturut-turut.
 */
export function chooseMode(
  input: Pick<PromptDecisionInput, "consecutiveMatches" | "seed" | "askedThisShift">,
  params: PromptParams = DEFAULT_PROMPT_PARAMS,
): VerificationMode {
  if (input.consecutiveMatches >= params.blindStreakTrigger) return "blind";
  const periodic = (input.askedThisShift + 1) % Math.max(1, params.blindEveryN) === 0;
  if (periodic) return "blind";
  return seededUnit(`${input.seed}:mode`) < 1 / Math.max(1, params.blindEveryN)
    ? "blind"
    : "confirm";
}

export function nextConsecutiveMatches(
  previous: number,
  result: "match" | "mismatch" | "skipped" | "inconclusive",
): number {
  if (result === "match") return previous + 1;
  if (result === "mismatch") return 0;
  return previous;
}

/** Setelah streak panjang, tiga pertanyaan berikutnya buta (CV-07). */
export function isBlindForced(
  consecutiveMatches: number,
  params: PromptParams = DEFAULT_PROMPT_PARAMS,
): boolean {
  return consecutiveMatches >= params.blindStreakTrigger && params.blindStreakLength > 0;
}

export function varianceFor(counted: number, system: number): number {
  return round3(counted - system);
}

export function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROMPT_PARAMS,
  decidePrompt,
  nextConsecutiveMatches,
  promptProbability,
  seededUnit,
  varianceFor,
  type PromptDecisionInput,
} from "@/lib/domain/verification";

const now = new Date("2026-03-01T12:00:00.000Z");

function input(overrides: Partial<PromptDecisionInput> = {}): PromptDecisionInput {
  return {
    confidenceScore: 90,
    neverCounted: false,
    unitValueHigh: false,
    hadVariance90d: false,
    qtyAfterIssue: 5,
    isBulk: false,
    askedThisShift: 0,
    lastVerifiedAt: null,
    hasOpenVariance: false,
    consecutiveMatches: 0,
    now,
    seed: "seed-1",
    ...overrides,
  };
}

describe("selisih (CV-04)", () => {
  it("selisih = fisik − sistem", () => {
    expect(varianceFor(10, 12)).toBe(-2);
    expect(varianceFor(15, 12)).toBe(3);
    expect(varianceFor(12, 12)).toBe(0);
  });

  it("dibulatkan tiga desimal", () => {
    expect(varianceFor(10.1234, 10)).toBe(0.123);
  });
});

describe("peluang bertanya (CV-06)", () => {
  it("keyakinan rendah menaikkan peluang", () => {
    const low = promptProbability({ confidenceScore: 10, unitValueHigh: false, hadVariance90d: false });
    const high = promptProbability({ confidenceScore: 95, unitValueHigh: false, hadVariance90d: false });
    expect(low).toBeGreaterThan(high);
  });

  it("nilai satuan tinggi dan riwayat selisih menambah peluang", () => {
    const base = promptProbability({ confidenceScore: 60, unitValueHigh: false, hadVariance90d: false });
    const boosted = promptProbability({ confidenceScore: 60, unitValueHigh: true, hadVariance90d: true });
    expect(boosted).toBeGreaterThan(base);
  });

  it("selalu dalam batas pMin…pMax", () => {
    for (const score of [0, 25, 50, 75, 100]) {
      const p = promptProbability({ confidenceScore: score, unitValueHigh: true, hadVariance90d: true });
      expect(p).toBeGreaterThanOrEqual(DEFAULT_PROMPT_PARAMS.pMin);
      expect(p).toBeLessThanOrEqual(DEFAULT_PROMPT_PARAMS.pMax);
    }
  });
});

describe("keputusan bertanya (CV-01…CV-10)", () => {
  it("kuota habis berarti tidak bertanya", () => {
    const decision = decidePrompt(input({ askedThisShift: DEFAULT_PROMPT_PARAMS.quotaPerShift }));
    expect(decision.ask).toBe(false);
    expect(decision.reason).toBe("quota");
  });

  it("item curah tidak ditanya", () => {
    const decision = decidePrompt(input({ isBulk: true }));
    expect(decision.ask).toBe(false);
    expect(decision.reason).toBe("bulk");
  });

  it("sisa di atas ambang tidak ditanya", () => {
    const decision = decidePrompt(input({ qtyAfterIssue: DEFAULT_PROMPT_PARAMS.countThreshold + 1 }));
    expect(decision.ask).toBe(false);
    expect(decision.reason).toBe("threshold");
  });

  it("masa tenang setelah verifikasi baru tidak bertanya", () => {
    const decision = decidePrompt(
      input({ lastVerifiedAt: new Date(now.getTime() - 3_600_000).toISOString() }),
    );
    expect(decision.ask).toBe(false);
    expect(decision.reason).toBe("cooldown");
  });

  it("belum pernah dihitung selalu ditanya", () => {
    const decision = decidePrompt(input({ neverCounted: true, confidenceScore: 30 }));
    expect(decision.ask).toBe(true);
    expect(decision.reason).toBe("must_ask");
  });

  it("skor di bawah mustAskBelow selalu ditanya", () => {
    const decision = decidePrompt(
      input({ confidenceScore: DEFAULT_PROMPT_PARAMS.mustAskBelow - 1, lastVerifiedAt: null }),
    );
    expect(decision.ask).toBe(true);
  });

  it("seed sama menghasilkan keputusan sama", () => {
    const a = decidePrompt(input({ confidenceScore: 70, seed: "abc" }));
    const b = decidePrompt(input({ confidenceScore: 70, seed: "abc" }));
    expect(a.ask).toBe(b.ask);
    expect(a.mode).toBe(b.mode);
  });

  it("mode buta muncul pada pertanyaan ke-N", () => {
    const decision = decidePrompt(
      input({
        neverCounted: true,
        askedThisShift: DEFAULT_PROMPT_PARAMS.blindEveryN - 1,
      }),
      { ...DEFAULT_PROMPT_PARAMS, quotaPerShift: 10 },
    );
    expect(decision.ask).toBe(true);
    expect(decision.mode).toBe("blind");
  });

  it("streak Sesuai panjang memaksa mode buta", () => {
    const decision = decidePrompt(
      input({
        neverCounted: true,
        consecutiveMatches: DEFAULT_PROMPT_PARAMS.blindStreakTrigger,
      }),
    );
    expect(decision.mode).toBe("blind");
  });
});

describe("hitungan berturut-turut (CV-10)", () => {
  it("Sesuai menambah, Beda mereset, Lewati tetap", () => {
    expect(nextConsecutiveMatches(5, "match")).toBe(6);
    expect(nextConsecutiveMatches(5, "mismatch")).toBe(0);
    expect(nextConsecutiveMatches(5, "skipped")).toBe(5);
    expect(nextConsecutiveMatches(5, "inconclusive")).toBe(5);
  });
});

describe("seededUnit", () => {
  it("deterministik dan berada di [0,1)", () => {
    for (const seed of ["a", "b", "seed-1", "WRK01:item_1"]) {
      const value = seededUnit(seed);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(seededUnit(seed)).toBe(value);
    }
  });
});

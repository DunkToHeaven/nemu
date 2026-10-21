/** PRNG deterministik agar fixture sama di setiap run dan di CI. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Rng {
  next: () => number;
  int: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
  chance: (probability: number) => boolean;
  weighted: <T>(entries: readonly (readonly [T, number])[]) => T;
}

export function createRng(seed = 20261021): Rng {
  const next = mulberry32(seed);
  const int = (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min;
  return {
    next,
    int,
    pick: <T>(items: readonly T[]): T => items[int(0, items.length - 1)] as T,
    chance: (probability: number) => next() < probability,
    weighted: <T>(entries: readonly (readonly [T, number])[]): T => {
      const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
      let roll = next() * total;
      for (const [value, weight] of entries) {
        roll -= weight;
        if (roll <= 0) return value;
      }
      return entries[entries.length - 1]![0];
    },
  };
}

/** Crockford base32 tanpa I, L, O, U — tidak ambigu saat dibaca manusia (LB-05). */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function crockfordCode(rng: Rng, length = 8): string {
  let body = "";
  for (let i = 0; i < length; i += 1) {
    body += CROCKFORD[rng.int(0, CROCKFORD.length - 1)];
  }
  let sum = 0;
  for (let i = 0; i < body.length; i += 1) {
    sum += CROCKFORD.indexOf(body[i] as string) * (i + 1);
  }
  const check = CROCKFORD[sum % CROCKFORD.length] as string;
  return body + check;
}

export function isCrockfordCode(value: string): boolean {
  return /^[0-9A-HJKMNP-TV-Z]{9}$/.test(value);
}

/**
 * Feature flag UI v0.2. Nilai berasal dari NEXT_PUBLIC_FLAGS (dipisah koma).
 * Di mock, semua flag menyala secara default agar bisa didemokan dan diuji.
 */
export const FLAG_NAMES = ["cv", "cf", "cu", "opname", "offline"] as const;

export type FlagName = (typeof FLAG_NAMES)[number];

const DEFAULT_FLAGS: Record<FlagName, boolean> = {
  cv: true,
  cf: true,
  cu: true,
  opname: true,
  offline: true,
};

function parseFlags(raw: string | undefined): Record<FlagName, boolean> {
  if (raw === undefined) return { ...DEFAULT_FLAGS };
  const value = raw.trim();
  if (value === "" || value === "none") {
    return FLAG_NAMES.reduce(
      (acc, name) => ({ ...acc, [name]: false }),
      {} as Record<FlagName, boolean>,
    );
  }
  const enabled = new Set(
    value
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );
  return FLAG_NAMES.reduce(
    (acc, name) => ({ ...acc, [name]: enabled.has(name) || enabled.has("all") }),
    {} as Record<FlagName, boolean>,
  );
}

export const flags: Record<FlagName, boolean> = parseFlags(process.env.NEXT_PUBLIC_FLAGS);

export function isEnabled(flag: FlagName): boolean {
  return flags[flag];
}

/** Dipakai di tes unit & panel dev untuk membaca daftar flag aktif. */
export function enabledFlags(): FlagName[] {
  return FLAG_NAMES.filter((name) => flags[name]);
}

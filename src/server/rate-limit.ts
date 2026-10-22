/**
 * Rate limit berbasis Postgres (PRD bagian 12: tanpa Redis).
 *
 * Batas ditegakkan per bucket + jendela waktu tetap. Satu statement UPSERT
 * atomik, jadi dua permintaan bersamaan tidak bisa "lolos dua kali" pada
 * hitungan yang sama.
 */
import { sql } from "@/server/db";

export interface RateLimitRule {
  /** Nama bucket, mis. `login:code:WRK01`. */
  bucket: string;
  /** Jumlah maksimum dalam jendela. */
  limit: number;
  /** Panjang jendela dalam detik. */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function checkRateLimit(rule: RateLimitRule): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = rule.windowSeconds * 1000;
  // Awal jendela tetap: hitungan di-reset serentak, bukan bergulir.
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);

  const rows = await sql<{ count: number }[]>`
    INSERT INTO rate_limits (bucket, window_start, count)
    VALUES (${rule.bucket}, ${windowStart}, 1)
    ON CONFLICT (bucket, window_start)
    DO UPDATE SET count = rate_limits.count + 1
    RETURNING count
  `;

  const count = rows[0]?.count ?? 1;
  const retryAfter = Math.max(0, Math.ceil((windowStart.getTime() + windowMs - now) / 1000));

  return {
    allowed: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    retryAfterSeconds: retryAfter,
  };
}

/** Bersihkan jendela lama. Dipanggil berkala oleh worker/cron. */
export async function pruneRateLimits(): Promise<void> {
  await sql`DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'`;
}

/**
 * Aturan sesuai PRD bagian 12.
 *
 * Nilai bisa dinaikkan lewat env khusus pengujian. Alasannya jujur: E2E perlu
 * login puluhan kali dalam hitungan menit, sementara batas produksi 5 percobaan
 * per 5 menit memang harus tetap ketat. Batas default TIDAK dilonggarkan —
 * hanya proses uji yang menaikkannya, dan `scripts/smoke-ratelimit.mjs`
 * memverifikasi batas ketat tetap bekerja pada nilai default.
 */
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const LOGIN_PER_CODE = envInt("RATE_LIMIT_LOGIN_PER_CODE", 5);
const LOGIN_PER_IP = envInt("RATE_LIMIT_LOGIN_PER_IP", 20);

export const RATE_RULES = {
  loginPerCode: { limit: LOGIN_PER_CODE, windowSeconds: 300 },
  loginPerIp: { limit: LOGIN_PER_IP, windowSeconds: 300 },
  writeTransaction: { limit: envInt("RATE_LIMIT_WRITE", 60), windowSeconds: 60 },
  search: { limit: envInt("RATE_LIMIT_SEARCH", 120), windowSeconds: 60 },
  verification: { limit: envInt("RATE_LIMIT_VERIFY", 60), windowSeconds: 60 },
} as const;

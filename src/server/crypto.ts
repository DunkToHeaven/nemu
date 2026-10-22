/**
 * Hash kredensial.
 *
 * PIN pekerja hanya 4-6 digit, jadi hashing biasa (SHA-256) tidak cukup:
 * seluruh ruang PIN bisa di-brute-force dalam hitungan detik. Karena itu
 * dipakai scrypt dengan salt acak per pengguna dan parameter biaya yang
 * membuat percobaan masif jadi mahal.
 *
 * Format tersimpan: `scrypt$N$r$p$<salt-b64>$<hash-b64>`
 * Menyimpan parameter di dalam string membuat hash lama tetap bisa diverifikasi
 * walau parameter dinaikkan di masa depan.
 */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const N = 16_384;
const R = 8;
const P = 1;
const KEYLEN = 32;

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(secret, salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifySecret(secret: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const nStr = parts[1] ?? "";
  const rStr = parts[2] ?? "";
  const pStr = parts[3] ?? "";
  const saltB64 = parts[4] ?? "";
  const hashB64 = parts[5] ?? "";
  if (!saltB64 || !hashB64) return false;

  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");

  const derived = await scrypt(secret, salt, expected.length, {
    N: Number(nStr),
    r: Number(rStr),
    p: Number(pStr),
    maxmem: 64 * 1024 * 1024,
  });

  // Perbandingan waktu-konstan: mencegah penyerang menebak byte demi byte.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

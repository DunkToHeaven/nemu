#!/usr/bin/env node
/**
 * Buat tautan reset kata sandi dari mesin yang punya akses database.
 *
 * KENAPA SKRIP, BUKAN API: endpoint lupa-password tidak boleh mengembalikan
 * token ke peminta — siapa pun yang tahu email admin bisa mengambil alih akun.
 * Selama pengirim email belum dikonfigurasi, satu-satunya kanal aman adalah
 * operator yang punya akses database.
 *
 * Pemakaian:
 *   node scripts/reset-password.mjs --email admin@contoh.com
 *   node scripts/reset-password.mjs --email admin@contoh.com --base https://nemu.vercel.app
 */
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import postgres from "postgres";

function arg(name, fallback = "") {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? (process.argv[i + 1] ?? fallback) : fallback;
}

/** DATABASE_URL dari env atau .env.local (tanpa mencetak nilainya). */
function connection() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const env = readFileSync(".env.local", "utf8");
    const match = env.match(/^DATABASE_URL=(.*)$/m);
    if (match) return match[1].trim();
  } catch {
    /* tidak ada .env.local */
  }
  throw new Error("DATABASE_URL tidak ditemukan.");
}

const email = arg("email").toLowerCase();
if (!email) {
  console.error("Pakai: node scripts/reset-password.mjs --email admin@contoh.com");
  process.exit(1);
}

const sql = postgres(connection(), { max: 1, prepare: false, onnotice: () => {} });

const rows = await sql`
  SELECT id, name, role, tenant_slug FROM users
  WHERE lower(email) = ${email} AND active
  LIMIT 1
`;
const user = rows[0];
if (!user) {
  console.error(`Tidak ada akun aktif dengan email ${email}.`);
  await sql.end();
  process.exit(1);
}
if (user.role === "worker") {
  console.error("Akun pekerja memakai PIN dan tidak punya email. Reset PIN lewat admin gudang.");
  await sql.end();
  process.exit(1);
}

const token = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(token).digest("hex");
const expires = new Date(Date.now() + 60 * 60_000);
const id = `pr_${randomBytes(6).toString("hex")}`;

await sql`
  INSERT INTO password_resets (id, user_id, token_hash, expires_at, requested_ip)
  VALUES (${id}, ${user.id}, ${hash}, ${expires}, 'cli')
`;

const base = arg("base", "http://127.0.0.1:3100");
const url = `${base.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;

console.log(`\n  Akun   : ${user.name} (${user.role}, gudang ${user.tenant_slug})`);
console.log(`  Berlaku: 60 menit, sekali pakai`);
console.log(`\n  Tautan reset:\n  ${url}\n`);
console.log("  Buka tautan itu, isi kata sandi baru. Semua sesi lama akan dicabut.\n");

await sql.end();

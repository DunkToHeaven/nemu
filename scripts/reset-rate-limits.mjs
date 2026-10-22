#!/usr/bin/env node
/**
 * Kosongkan tabel rate_limits.
 *
 * Hanya untuk pengembangan/uji: skrip uji login berkali-kali dan menabrak
 * batas 5 percobaan per 5 menit yang justru bukti rate limit bekerja.
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/nemu";
const sql = postgres(url, { max: 1 });

const before = await sql`SELECT count(*)::int AS n FROM rate_limits`;
await sql`DELETE FROM rate_limits`;
console.log(`rate_limits dibersihkan (${before[0].n} baris).`);
await sql.end();

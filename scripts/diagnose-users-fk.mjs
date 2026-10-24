#!/usr/bin/env node
import { readFileSync } from "node:fs";
/**
 * Diagnosis: kenapa DELETE FROM users gagal?
 *
 * Versi lama skrip pembersih menelan error dan tetap mencetak "1 pengguna",
 * padahal akun lama masih ada. Skrip ini menampilkan penyebab sebenarnya.
 */
import postgres from "postgres";

const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

const counts = await sql`
  SELECT (SELECT count(*)::int FROM users) AS users,
         (SELECT count(*)::int FROM tenants) AS tenants,
         (SELECT count(*)::int FROM sessions) AS sessions
`;
console.log("sebelum:", JSON.stringify(counts[0]));

// Cari semua FK yang menunjuk users, beserta jumlah barisnya.
const fks = await sql`
  SELECT c.conname, c.conrelid::regclass::text AS tbl, n.nspname
  FROM pg_constraint c
  JOIN pg_namespace n ON n.oid = c.conrelid::regnamespace
  WHERE c.contype = 'f' AND c.confrelid = 'public.users'::regclass
  ORDER BY 3, 2
`;
console.log(`\nFK yang menunjuk public.users (${fks.length}):`);
for (const fk of fks) {
  const { rows } = await sql
    .unsafe(`SELECT count(*)::int AS n FROM ${fk.tbl} WHERE true`)
    .then((r) => ({ rows: r }));
  console.log(`  ${fk.nspname}.${fk.tbl}  (${fk.conname})  -> ${rows[0].n} baris`);
}

// Coba hapus dan tampilkan error aslinya.
try {
  const res = await sql`DELETE FROM users`;
  console.log(`\nDELETE FROM users -> berhasil, ${res.count} baris`);
} catch (error) {
  console.log(`\nDELETE FROM users -> GAGAL: ${error.message.slice(0, 200)}`);
  console.log(`  constraint: ${error.constraint_name ?? "-"}`);
  console.log(`  detail    : ${(error.detail ?? "-").slice(0, 160)}`);
}

const after = await sql`SELECT count(*)::int AS n FROM users`;
console.log(`\nsisa pengguna: ${after[0].n}`);

await sql.end();

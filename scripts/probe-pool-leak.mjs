/**
 * Apakah `tenantPool` membuka koneksi yang tidak pernah dipakai lagi?
 *
 * Koneksi baru selalu cepat (150ms), tapi lewat aplikasi menggantung. Curiga
 * setiap request membuat pool baru yang tidak ditutup, sehingga slot koneksi
 * Supavisor habis dan request berikutnya menunggu selamanya.
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();

const slug = (() => {
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  return sql`SELECT slug FROM tenants LIMIT 1`.then((r) => {
    void sql.end();
    return r[0].slug;
  });
})();
const tenant = await slug;
console.log(`schema: tenant_${tenant}`);

const count = async () => {
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  const r =
    await sql`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database()`;
  await sql.end();
  return r[0].n;
};

console.log("koneksi sebelum:", await count());

// Tiru pola aplikasi: buat pool baru per "request" lalu TIDAK ditutup.
const leaks = [];
for (let i = 0; i < 6; i += 1) {
  const pool = postgres(url, {
    max: 2,
    prepare: false,
    idle_timeout: 15,
    connect_timeout: 15,
    connection: { search_path: `tenant_${tenant},public` },
  });
  leaks.push(pool);
  const r = await pool`SELECT count(*)::int AS n FROM items`;
  console.log(`  pool #${i + 1}: items=${r[0].n}`);
}

console.log("koneksi setelah 6 pool:", await count());

// Sekarang coba pool ke-7 — meniru request baru saat slot menipis.
const t0 = Date.now();
try {
  const extra = postgres(url, {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    connection: { search_path: `tenant_${tenant},public` },
  });
  const r = await Promise.race([
    extra`SELECT count(*)::int AS n FROM items`,
    new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT 10s")), 10_000)),
  ]);
  console.log(`pool ke-7: ${Date.now() - t0}ms -> ${r[0].n}`);
  await extra.end();
} catch (e) {
  console.log(`pool ke-7: ${Date.now() - t0}ms -> ${e.message}`);
}

for (const p of leaks) await p.end();
console.log("koneksi setelah ditutup:", await count());

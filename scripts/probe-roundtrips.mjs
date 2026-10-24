/**
 * Berapa round-trip database per request?
 *
 * Supavisor (pooler Supabase) menambah ~100-150 ms per round-trip. Endpoint
 * yang menjalankan 15 query berurutan jadi 2+ detik walau datanya cuma 4 baris.
 * Saat 12 pengguna membuka halaman bersamaan, antreannya meledak dan UI tampak
 * "load terus".
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();

// Proxy sederhana: hitung setiap query yang lewat.
const real = postgres(url, { max: 1, prepare: false, connect_timeout: 15, onnotice: () => {} });
let count = 0;
const proxy = new Proxy(real, {
  apply(target, thisArg, args) {
    count += 1;
    return Reflect.apply(target, thisArg, args);
  },
});

const measure = async (label, fn) => {
  count = 0;
  const t0 = Date.now();
  await fn();
  console.log(`  ${label.padEnd(22)} ${String(Date.now() - t0).padStart(5)}ms  ${count} query`);
};

const slug = (await real`SELECT slug FROM tenants LIMIT 1`)[0].slug;
const s = `tenant_${slug}`;

// Tiru urutan query dashboard (perkiraan dari handler).
console.log("Round-trip per kelompok query:\n");
await measure("1 query", () => proxy.unsafe("SELECT 1"));
await measure("5 query berurutan", async () => {
  for (let i = 0; i < 5; i += 1) await proxy.unsafe("SELECT 1");
});
await measure("10 query berurutan", async () => {
  for (let i = 0; i < 10; i += 1) await proxy.unsafe("SELECT 1");
});
await measure("1 query gabungan", () =>
  proxy.unsafe("SELECT (SELECT 1) a, (SELECT 2) b, (SELECT 3) c, (SELECT 4) d, (SELECT 5) e"),
);

await measure("stock_levels", () => proxy.unsafe(`SELECT count(*) FROM "${s}".stock_levels`));

await real.end();

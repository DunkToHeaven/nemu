/**
 * Apakah pool tenant macet karena antrean internal postgres.js?
 *
 * Diuji langsung di dalam proses Node — tanpa HTTP, tanpa Next.js — supaya
 * jelas apakah masalahnya di driver/pool atau di lapisan aplikasi.
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const slug = (() => {
  const s = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  return s`SELECT slug FROM tenants LIMIT 1`.then(async (r) => {
    await s.end();
    return r[0].slug;
  });
})();
const tenant = await slug;
console.log(`schema: tenant_${tenant}`);

// Tiru tenantPool persis.
const db = postgres(url, {
  max: 6,
  prepare: false,
  idle_timeout: 15,
  connect_timeout: 15,
  transform: { undefined: null },
  onnotice: () => {},
  connection: { statement_timeout: 15_000, search_path: `tenant_${tenant},public` },
});

const time = async (label, fn) => {
  const t0 = Date.now();
  try {
    const r = await Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT 8s")), 8000)),
    ]);
    console.log(
      `  ${label.padEnd(30)} ${String(Date.now() - t0).padStart(5)}ms  ${Array.isArray(r) ? r.length : "?"} baris`,
    );
    return r;
  } catch (e) {
    console.log(
      `  ${label.padEnd(30)} ${String(Date.now() - t0).padStart(5)}ms  ${e.message.slice(0, 40)}`,
    );
    return null;
  }
};

console.log("\nberurutan:");
await time("SELECT 1", () => db`SELECT 1`);
await time("locations", () => db`SELECT id, code FROM locations LIMIT 5`);
await time("categories", () => db`SELECT id, name FROM categories LIMIT 5`);
await time("items", () => db`SELECT id, sku FROM items LIMIT 5`);

console.log("\nparalel (6 query sekaligus):");
await time("6 query", () =>
  Promise.all([db`SELECT 1`, db`SELECT 2`, db`SELECT 3`, db`SELECT 4`, db`SELECT 5`, db`SELECT 6`]),
);

console.log("\nsetelah paralel:");
await time("locations lagi", () => db`SELECT id, code FROM locations LIMIT 5`);
await time("items lagi", () => db`SELECT id, sku FROM items LIMIT 5`);

await db.end();

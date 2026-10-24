/**
 * Uji pool GLOBAL (`sql`), bukan pool tenant.
 *
 * Semua request lebih dulu membaca sesi lewat pool global. Kalau pool itu macet,
 * SEMUA endpoint ber-sesi menggantung walau query tenant sehat — persis gejala
 * yang terlihat: /users (juga global) sempat berhasil, sisanya tidak.
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();

// Tiru pool global: max 5, TANPA search_path.
const sql = postgres(url, {
  max: 5,
  prepare: false,
  idle_timeout: 20,
  connect_timeout: 15,
  transform: { undefined: null },
  onnotice: () => {},
});

const time = async (label, fn) => {
  const t0 = Date.now();
  try {
    const r = await Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT 8s")), 8000)),
    ]);
    console.log(
      `  ${label.padEnd(28)} ${String(Date.now() - t0).padStart(5)}ms  ${r?.length ?? "?"}`,
    );
    return r;
  } catch (e) {
    console.log(
      `  ${label.padEnd(28)} ${String(Date.now() - t0).padStart(5)}ms  ${e.message.slice(0, 40)}`,
    );
    return null;
  }
};

const _sess = await time(
  "baca sesi (JOIN)",
  () =>
    sql`SELECT s.id, u.id AS user_id, u.role, s.tenant_slug
      FROM sessions s JOIN users u ON u.id = s.user_id LIMIT 5`,
);

console.log("\n5 query paralel di pool global (max 5):");
await time("paralel 5", () =>
  Promise.all([sql`SELECT 1`, sql`SELECT 2`, sql`SELECT 3`, sql`SELECT 4`, sql`SELECT 5`]),
);

console.log("\nsetelah paralel:");
await time(
  "baca sesi lagi",
  () =>
    sql`SELECT s.id, u.id AS user_id, u.role, s.tenant_slug
      FROM sessions s JOIN users u ON u.id = s.user_id LIMIT 5`,
);

await sql.end();

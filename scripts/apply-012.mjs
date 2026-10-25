/** Terapkan migrasi 012 (lokasi datar + kolom name sesi) ke Supabase. */

import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

const body = readFileSync("db/migrations/012_flat_locations.sql", "utf8");
await sql.unsafe(body);
await sql`INSERT INTO schema_migrations (name) VALUES ('012_flat_locations.sql') ON CONFLICT DO NOTHING`;

const slug = (await sql`SELECT slug FROM tenants LIMIT 1`)[0].slug;
const s = `tenant_${slug}`;
const locs = await sql.unsafe(
  `SELECT id, code, name, type, path, parent_id FROM "${s}".locations ORDER BY code`,
);
console.log(`lokasi di ${s}:`, locs.length);
for (const l of locs)
  console.log(`  ${l.code} ${l.name} ${l.type} path="${l.path}" parent=${l.parent_id}`);
const col = await sql.unsafe(
  `SELECT column_name FROM information_schema.columns WHERE table_schema='${s}' AND table_name='stock_counts' AND column_name='name'`,
);
console.log("kolom name di stock_counts:", col.length ? "ADA" : "TIDAK ADA");
const src =
  await sql`SELECT count(*)::int AS n FROM migration_sources WHERE name='012_flat_locations.sql'`;
console.log("012 di migration_sources:", src[0].n === 1 ? "ya" : "tidak");
await sql.end();

/** Terapkan migrasi 009 & 010 ke Supabase (idempoten). */

import { readFileSync } from "node:fs";
import postgres from "postgres";

const env = readFileSync(".env.local", "utf8");
const url = env.match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
await sql`CREATE TABLE IF NOT EXISTS migration_sources (
  name text PRIMARY KEY, body text NOT NULL)`;

const files = ["009_max_stock.sql", "010_password_reset.sql"];
const applied = new Set((await sql`SELECT name FROM schema_migrations`).map((r) => r.name));

for (const name of files) {
  if (applied.has(name)) {
    console.log(`  lewati   ${name}`);
    continue;
  }
  const body = readFileSync(`db/migrations/${name}`, "utf8");
  await sql.unsafe(body);
  await sql`INSERT INTO schema_migrations (name) VALUES (${name}) ON CONFLICT DO NOTHING`;
  // 009 ikut dipakai provisioning tenant baru -> simpan juga ke migration_sources.
  if (name.startsWith("009")) {
    await sql`INSERT INTO migration_sources (name, body) VALUES (${name}, ${body})
              ON CONFLICT (name) DO UPDATE SET body = EXCLUDED.body`;
  }
  console.log(`  terapkan ${name}`);
}

const check = await sql`
  SELECT (SELECT count(*)::int FROM information_schema.columns
           WHERE table_name='items' AND column_name='max_stock') AS max_stock,
         (SELECT count(*)::int FROM pg_tables
           WHERE schemaname='public' AND tablename='password_resets') AS resets,
         (SELECT count(*)::int FROM migration_sources) AS sources
`;
console.log(
  `\n  max_stock=${check[0].max_stock} password_resets=${check[0].resets} sources=${check[0].sources}\n`,
);
await sql.end();

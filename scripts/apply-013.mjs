/** Terapkan migrasi 013 (deskripsi item + harga per transaksi) ke Supabase. */

import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

const body = readFileSync("db/migrations/013_item_price_tx.sql", "utf8");
await sql.unsafe(body);
await sql`INSERT INTO schema_migrations (name) VALUES ('013_item_price_tx.sql') ON CONFLICT DO NOTHING`;

const cols = await sql`
  SELECT table_schema, table_name, column_name
  FROM information_schema.columns
  WHERE (table_name = 'items' AND column_name = 'description')
     OR (table_name = 'transactions' AND column_name = 'unit_price')
  ORDER BY table_schema, table_name
`;
for (const c of cols) console.log(`${c.table_schema}.${c.table_name}.${c.column_name}`);
const src = await sql`SELECT count(*)::int AS n FROM migration_sources WHERE name='013_item_price_tx.sql'`;
console.log("013 di migration_sources:", src[0].n === 1 ? "ya" : "tidak");
await sql.end();

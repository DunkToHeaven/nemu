/** Struktur tabel yang menghubungkan item, lokasi, dan kategori. */

import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

const schema = (await sql`SELECT slug FROM tenants LIMIT 1`)[0].slug;
const s = `tenant_${schema}`;
console.log("schema:", s, "\n");

// Kolom tabel items
const cols = await sql.unsafe(`
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = '${s}' AND table_name = 'items'
  ORDER BY ordinal_position
`);
console.log("kolom items:");
for (const c of cols) {
  console.log(`  ${c.column_name.padEnd(20)} ${c.data_type.padEnd(22)} null=${c.is_nullable}`);
}

// FK dari items
const fks = await sql.unsafe(`
  SELECT kcu.column_name, ccu.table_schema || '.' || ccu.table_name AS ref
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = '${s}' AND tc.table_name = 'items'
`);
console.log("\nFK dari items:");
for (const f of fks) console.log(`  items.${f.column_name} -> ${f.ref}`);

// Tabel locations
const loc = await sql.unsafe(`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_schema = '${s}' AND table_name = 'locations' ORDER BY ordinal_position
`);
console.log("\nkolom locations:", loc.map((c) => c.column_name).join(", "));

// Bagaimana stok per lokasi dihitung
const views = await sql.unsafe(`
  SELECT table_name, table_type FROM information_schema.tables
  WHERE table_schema = '${s}' AND table_name IN ('stock_levels','stock_balances','transactions')
`);
console.log("\ntabel/views stok:");
for (const v of views) console.log(`  ${v.table_name} (${v.table_type})`);

await sql.end();

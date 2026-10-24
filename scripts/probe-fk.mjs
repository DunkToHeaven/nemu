/** Apakah FK ganda ke public.* dan tenant.* benar-benar memblokir insert? */

import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

const slug = (await sql`SELECT slug FROM tenants LIMIT 1`)[0].slug;
const s = `tenant_${slug}`;

// Constraint unik per (tabel, kolom, referensi)
const cons = await sql.unsafe(`
  SELECT con.conname,
         con.conrelid::regclass::text AS tbl,
         con.confrelid::regclass::text AS ref
  FROM pg_constraint con
  WHERE con.contype = 'f'
    AND con.connamespace = '${s}'::regnamespace
    AND con.conrelid::regclass::text LIKE 'items'
  ORDER BY con.conname
`);
console.log(`FK pada ${s}.items (${cons.length}):`);
for (const c of cons) console.log(`  ${c.conname}  -> ${c.ref}`);

// Apakah public.units punya baris? Ini menentukan apakah FK ganda menahan insert.
const pub = await sql`SELECT count(*)::int AS n FROM public.units`;
console.log(`\npublic.units: ${pub[0].n} baris`);
const ten = await sql.unsafe(`SELECT count(*)::int AS n FROM "${s}".units`);
console.log(`${s}.units: ${ten[0].n} baris`);

// Uji: item dengan unit yang HANYA ada di tenant, tidak di public.
console.log("\nuji insert item dengan unit hanya-di-tenant:");
await sql.unsafe(`INSERT INTO "${s}".units (id,name,symbol,decimals) VALUES ('un_test','Test','tst',0)
                  ON CONFLICT DO NOTHING`);
await sql.unsafe(
  `INSERT INTO "${s}".categories (id,name) VALUES ('cat_test','Test') ON CONFLICT DO NOTHING`,
);
try {
  await sql.unsafe(`
    INSERT INTO "${s}".items (id, sku, code, name, category_id, unit_id)
    VALUES ('itm_test','T-1','TCODE1','Uji','cat_test','un_test')
  `);
  console.log("  BERHASIL (FK public.units tidak menahan)");
} catch (e) {
  console.log(`  DITOLAK: ${e.message.slice(0, 120)}`);
  console.log(`  constraint: ${e.constraint_name ?? "-"}`);
}

// Bersihkan
await sql.unsafe(`DELETE FROM "${s}".items WHERE id='itm_test'`);
await sql.unsafe(`DELETE FROM "${s}".units WHERE id='un_test'`);
await sql.unsafe(`DELETE FROM "${s}".categories WHERE id='cat_test'`);
await sql.end();

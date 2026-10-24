/**
 * Apakah schema tenant benar-benar menegakkan FK?
 *
 * Penting: bila FK hilang setelah `DROP SCHEMA ... CASCADE` + replay migrasi,
 * item bisa dibuat dengan kategori/lokasi yang tidak ada, dan laporan akan
 * menghitung barang yang tidak punya rumah.
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

const slug = (await sql`SELECT slug FROM tenants LIMIT 1`)[0].slug;
const s = `tenant_${slug}`;

const cons = await sql`
  SELECT con.conname,
         con.conrelid::regclass::text AS tbl,
         con.confrelid::regclass::text AS ref,
         pg_get_constraintdef(con.oid) AS def
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  WHERE con.contype = 'f' AND ns.nspname = ${s}
  ORDER BY 2, 1
`;
console.log(`FK di schema ${s} (${cons.length}):`);
for (const c of cons) console.log(`  ${c.conname.padEnd(34)} ${c.def}`);

// Uji nyata: kategori yang tidak ada harus ditolak.
await sql.unsafe(
  `INSERT INTO "${s}".units (id,name,symbol,decimals) VALUES ('un_t2','T','t',0) ON CONFLICT DO NOTHING`,
);
console.log("\nuji item dengan kategori tidak ada:");
try {
  await sql.unsafe(`
    INSERT INTO "${s}".items (id, sku, code, name, category_id, unit_id)
    VALUES ('itm_bad','BAD-1','BADCODE','Buruk','cat_TIDAK_ADA','un_t2')
  `);
  console.log("  BERHASIL -> FK kategori TIDAK ditegakkan (bug)");
  await sql.unsafe(`DELETE FROM "${s}".items WHERE id='itm_bad'`);
} catch (e) {
  console.log(`  DITOLAK dengan benar: ${e.constraint_name ?? e.message.slice(0, 80)}`);
}

// Uji: lokasi utama yang tidak ada.
console.log("\nuji item dengan lokasi utama tidak ada:");
try {
  await sql.unsafe(
    `INSERT INTO "${s}".categories (id,name) VALUES ('cat_ok','Ok') ON CONFLICT DO NOTHING`,
  );
  await sql.unsafe(`
    INSERT INTO "${s}".items (id, sku, code, name, category_id, unit_id, primary_location_id)
    VALUES ('itm_bad2','BAD-2','BADCODE2','Buruk2','cat_ok','un_t2','loc_TIDAK_ADA')
  `);
  console.log("  BERHASIL -> FK lokasi TIDAK ditegakkan (bug)");
  await sql.unsafe(`DELETE FROM "${s}".items WHERE id='itm_bad2'`);
} catch (e) {
  console.log(`  DITOLAK dengan benar: ${e.constraint_name ?? e.message.slice(0, 80)}`);
}

await sql.unsafe(`DELETE FROM "${s}".units WHERE id='un_t2'`);
await sql.unsafe(`DELETE FROM "${s}".categories WHERE id='cat_ok'`);
await sql.end();

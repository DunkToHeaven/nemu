/**
 * Jalankan query listLocations PERSIS, langsung ke database.
 *
 * `/items` berhasil tapi `/locations` menggantung. Keduanya memakai pool yang
 * sama, jadi bedanya harus ada di query. Uji tiap bagian sampai ketemu yang
 * menggantung.
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const sql = postgres(url, { max: 2, prepare: false, connect_timeout: 15, onnotice: () => {} });
const slug = (await sql`SELECT slug FROM tenants LIMIT 1`)[0].slug;
const s = `tenant_${slug}`;

const run = async (label, query) => {
  const t0 = Date.now();
  try {
    const r = await Promise.race([
      sql.unsafe(query),
      new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT 8s")), 8000)),
    ]);
    console.log(
      `  ${label.padEnd(34)} ${String(Date.now() - t0).padStart(5)}ms  ${r.length} baris`,
    );
    return r;
  } catch (e) {
    console.log(
      `  ${label.padEnd(34)} ${String(Date.now() - t0).padStart(5)}ms  ${e.message.slice(0, 40)}`,
    );
    return null;
  }
};

console.log("bagian per bagian:\n");
await run("locations saja", `SELECT id, path FROM "${s}".locations`);
await run(
  "+ lateral item count",
  `
  SELECT l.id, COALESCE(i.cnt,0)::int AS c
  FROM "${s}".locations l
  LEFT JOIN LATERAL (SELECT count(*) AS cnt FROM "${s}".items WHERE primary_location_id = l.id AND active) i ON true`,
);
await run(
  "+ lateral stock",
  `
  SELECT l.id, COALESCE(s.qty,0)::int AS q
  FROM "${s}".locations l
  LEFT JOIN LATERAL (SELECT COALESCE(SUM(qty),0) AS qty FROM "${s}".stock_levels WHERE location_id = l.id) s ON true`,
);
await run(
  "query PENUH (seperti handler)",
  `
  SELECT l.id, l.path, COALESCE(i.cnt,0)::int AS item_count, COALESCE(s.qty,0)::int AS total_qty
  FROM "${s}".locations l
  LEFT JOIN LATERAL (SELECT count(*) AS cnt FROM "${s}".items WHERE primary_location_id = l.id AND active) i ON true
  LEFT JOIN LATERAL (SELECT COALESCE(SUM(qty),0) AS qty FROM "${s}".stock_levels WHERE location_id = l.id) s ON true
  WHERE l.active
    AND (NULL::text IS NULL OR l.warehouse_id = NULL)
    AND (NULL::text IS NULL OR l.type::text = NULL)
  ORDER BY l.path`,
);

await sql.end();

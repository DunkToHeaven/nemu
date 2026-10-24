/** Apakah view stock_levels lambat/berputar tanpa henti? */

import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 20, onnotice: () => {} });

const slug = (await sql`SELECT slug FROM tenants LIMIT 1`)[0].slug;
const s = `tenant_${slug}`;
console.log("schema:", s);

const time = async (label, fn) => {
  const t0 = Date.now();
  try {
    const rows = await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT 8s")), 8000)),
    ]);
    console.log(`  ${label.padEnd(28)} ${Date.now() - t0}ms  -> ${rows.length} baris`);
    return rows;
  } catch (error) {
    console.log(`  ${label.padEnd(28)} ${Date.now() - t0}ms  -> ${error.message.slice(0, 60)}`);
    return null;
  }
};

await time("SELECT 1", () => sql.unsafe("SELECT 1"));
await time("count transactions", () => sql.unsafe(`SELECT count(*) FROM "${s}".transactions`));
await time("count stock_levels", () => sql.unsafe(`SELECT count(*) FROM "${s}".stock_levels`));
await time("select stock_levels", () => sql.unsafe(`SELECT * FROM "${s}".stock_levels LIMIT 5`));
await time("count items", () => sql.unsafe(`SELECT count(*) FROM "${s}".items`));

// Query yang menggantung tadi, disederhanakan.
await time("sl + join locations", () =>
  sql.unsafe(`
    SELECT sl.item_id, sl.location_id, sl.qty, l.code
    FROM "${s}".stock_levels sl
    JOIN "${s}".locations l ON l.id = sl.location_id
    LIMIT 5
  `),
);

// Bagian LATERAL verifications — tersangka utama.
await time("sl + lateral verif", () =>
  sql.unsafe(`
    SELECT sl.item_id, sl.location_id, sl.qty,
           v.last_verified
    FROM "${s}".stock_levels sl
    LEFT JOIN LATERAL (
      SELECT max(answered_at) AS last_verified
      FROM "${s}".verifications
      WHERE item_id = sl.item_id AND location_id = sl.location_id
    ) v ON true
    LIMIT 5
  `),
);

await sql.end();

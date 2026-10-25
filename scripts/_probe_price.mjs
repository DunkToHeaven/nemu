import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = postgres(url, { max: 1, prepare: false });
const slug = (await sql`SELECT slug FROM tenants LIMIT 1`)[0].slug;
const s = `tenant_${slug}`;

// Buat dua receive tambahan dengan harga berbeda di tanggal berbeda,
// supaya laporan tren harga punya beberapa titik untuk diuji.
await sql.unsafe(
  `INSERT INTO ${s}.transactions (id, type, item_id, to_location_id, qty, user_id, idempotency_key, unit_price, created_at)
   VALUES ('tx_probe_old','receive','itm_592da798','loc_8fb37365',10,'usr_8fdfee25','probe-old',14000, now() - interval '15 days')`,
);
await sql.unsafe(
  `INSERT INTO ${s}.transactions (id, type, item_id, to_location_id, qty, user_id, idempotency_key, unit_price, created_at)
   VALUES ('tx_probe_new','receive','itm_592da798','loc_8fb37365',4,'usr_8fdfee25','probe-new',16500, now() - interval '5 days')`,
);
console.log("probe receive inserted");
await sql.end();

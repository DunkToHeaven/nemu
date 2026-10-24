/**
 * Diagnosa: apakah query menggantung karena DATANYA, atau karena KONEKSI
 * (pool Supabase membusuk sehingga query menunggu slot selamanya)?
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 20, onnotice: () => {} });

const slug = (await sql`SELECT slug FROM tenants LIMIT 1`)[0].slug;
const s = `tenant_${slug}`;

const timed = async (label, fn) => {
  const t0 = Date.now();
  try {
    const rows = await Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT")), 10_000)),
    ]);
    console.log(
      `  ${label.padEnd(34)} ${String(Date.now() - t0).padStart(5)}ms  ${rows.length} baris`,
    );
  } catch (e) {
    console.log(
      `  ${label.padEnd(34)} ${String(Date.now() - t0).padStart(5)}ms  ${e.message.slice(0, 40)}`,
    );
  }
};

console.log("Koneksi BARU (bukan pool aplikasi):\n");
await timed("SELECT 1", () => sql.unsafe("SELECT 1"));
await timed("DISTINCT ON lastTaken", () =>
  sql.unsafe(`
    SELECT DISTINCT ON (t.item_id) t.item_id, t.qty, t.created_at
    FROM "${s}".transactions t
    JOIN "${s}".items i ON i.id = t.item_id
    JOIN "${s}".units u ON u.id = i.unit_id
    WHERE t.type = 'issue'
    ORDER BY t.item_id, t.created_at DESC
    LIMIT 5
  `),
);
await timed("usage 30 hari", () =>
  sql.unsafe(`
    SELECT to_char(date_trunc('day', t.created_at), 'YYYY-MM-DD') AS date,
           SUM(t.qty)::int AS qty, count(*)::int AS tx
    FROM "${s}".transactions t
    WHERE t.created_at > now() - interval '30 days'
    GROUP BY 1 ORDER BY 1
  `),
);
await timed("lowStock (stock_levels+items)", () =>
  sql.unsafe(`
    SELECT sl.item_id, sl.qty, i.min_stock
    FROM "${s}".stock_levels sl
    JOIN "${s}".items i ON i.id = sl.item_id
    WHERE sl.qty < i.min_stock
    LIMIT 5
  `),
);
await timed("inventory health", () =>
  sql.unsafe(`
    SELECT count(*)::int AS n FROM "${s}".items i
    LEFT JOIN "${s}".stock_totals st ON st.item_id = i.id
    WHERE COALESCE(st.qty,0) < i.min_stock
  `),
);

// Berapa lama transaksi yang menahan lock di database.
const longest = await sql`
  SELECT pid, state, now() - xact_start AS durasi, left(query, 50) AS q
  FROM pg_stat_activity
  WHERE datname = current_database() AND xact_start IS NOT NULL
    AND pid <> pg_backend_pid()
  ORDER BY xact_start LIMIT 5
`;
console.log("\ntransaksi terbuka paling lama:");
for (const r of longest)
  console.log(`  pid=${r.pid} ${r.state} ${r.durasi} :: ${r.q.replace(/\s+/g, " ")}`);

await sql.end();

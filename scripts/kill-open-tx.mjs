/** Hentikan SEMUA query yang menggantung > 1 menit, lalu laporkan sisanya. */

import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

const stuck = await sql`
  SELECT pid, now() - xact_start AS durasi, left(query, 60) AS q
  FROM pg_stat_activity
  WHERE datname = current_database()
    AND pid <> pg_backend_pid()
    AND xact_start IS NOT NULL
    AND now() - xact_start > interval '60 seconds'
`;
console.log(`transaksi terbuka > 1 menit: ${stuck.length}`);
for (const r of stuck) {
  console.log(`  pid=${r.pid} ${r.durasi} :: ${r.q.replace(/\s+/g, " ").slice(0, 55)}`);
  const res = await sql`SELECT pg_terminate_backend(${r.pid}) AS ok`;
  console.log(`    dihentikan: ${res[0].ok}`);
}

const left = await sql`
  SELECT count(*)::int AS n FROM pg_stat_activity
  WHERE datname = current_database() AND state = 'active' AND pid <> pg_backend_pid()
`;
console.log(`\nmasih aktif: ${left[0].n}`);
await sql.end();

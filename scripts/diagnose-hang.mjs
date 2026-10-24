/** Diagnosa: kenapa API menggantung? Periksa koneksi & query yang macet. */

import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 20, onnotice: () => {} });

const total =
  await sql`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database()`;
console.log("total koneksi ke database ini:", total[0].n);

const byState = await sql`
  SELECT coalesce(state,'(null)') AS state, count(*)::int AS n
  FROM pg_stat_activity WHERE datname = current_database()
  GROUP BY 1 ORDER BY n DESC
`;
for (const r of byState) console.log(`  ${r.state.padEnd(18)} ${r.n}`);

const maxConn = await sql`SHOW max_connections`;
console.log("max_connections:", maxConn[0].max_connections);

// Query yang berjalan lama — ini yang membuat request menggantung.
const long = await sql`
  SELECT pid, state, now() - query_start AS durasi, left(query, 90) AS q
  FROM pg_stat_activity
  WHERE datname = current_database() AND state <> 'idle' AND query_start IS NOT NULL
  ORDER BY query_start
  LIMIT 10
`;
console.log(`\nquery tidak idle (${long.length}):`);
for (const r of long)
  console.log(`  pid=${r.pid} ${r.state} ${r.durasi} :: ${r.q.replace(/\s+/g, " ")}`);

// Kunci yang saling menunggu.
const locks = await sql`
  SELECT blocked.pid AS blocked_pid, blocking.pid AS blocking_pid,
         left(blocked.query, 60) AS blocked_q
  FROM pg_stat_activity blocked
  JOIN pg_stat_activity blocking
    ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
  WHERE blocked.datname = current_database()
  LIMIT 5
`;
console.log(`\nlock menunggu (${locks.length}):`);
for (const r of locks)
  console.log(`  ${r.blocked_pid} menunggu ${r.blocking_pid} :: ${r.blocked_q}`);

await sql.end();

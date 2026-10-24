/** Hentikan query yang menggantung (sisa proses lama), tanpa menyentuh data. */

import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 20, onnotice: () => {} });

// Hanya query yang berjalan > 2 menit DAN bukan sesi kita sendiri.
const stuck = await sql`
  SELECT pid, now() - query_start AS durasi, left(query, 60) AS q
  FROM pg_stat_activity
  WHERE datname = current_database()
    AND state = 'active'
    AND pid <> pg_backend_pid()
    AND query_start IS NOT NULL
    AND now() - query_start > interval '2 minutes'
`;
console.log(`query menggantung: ${stuck.length}`);
for (const r of stuck) {
  console.log(`  pid=${r.pid} ${r.durasi} :: ${r.q.replace(/\s+/g, " ").slice(0, 70)}`);
  try {
    await sql`SELECT pg_terminate_backend(${r.pid})`;
    console.log("    dihentikan");
  } catch (error) {
    console.log(`    gagal: ${error.message.slice(0, 90)}`);
  }
}

const after = await sql`
  SELECT count(*)::int AS n FROM pg_stat_activity
  WHERE datname = current_database() AND state = 'active' AND pid <> pg_backend_pid()
`;
console.log(`\nmasih aktif: ${after[0].n}`);
await sql.end();

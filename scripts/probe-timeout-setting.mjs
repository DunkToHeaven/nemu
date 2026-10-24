/**
 * Apakah opsi `connection` benar-benar diterapkan, dan apakah Postgres
 * memutus sesi yang tertinggal sehingga pool pulih sendiri?
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();

const probe = postgres(url, {
  max: 1,
  prepare: false,
  onnotice: () => {},
  connection: { statement_timeout: 15_000, idle_in_transaction_session_timeout: 10_000 },
});
const s = await probe`
  SELECT current_setting('statement_timeout') AS st,
         current_setting('idle_in_transaction_session_timeout') AS iit
`;
console.log("setting terpasang:", JSON.stringify(s[0]));
await probe.end();

// Pantau apakah sesi tertinggal hilang sendiri setelah 10 detik.
const monitor = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
const stuck = async () => {
  const r = await monitor`
    SELECT count(*)::int AS n FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid()
      AND xact_start IS NOT NULL AND state = 'active'
  `;
  return r[0].n;
};

console.log("\nsesi menggantung sekarang:", await stuck());
for (let i = 1; i <= 4; i += 1) {
  await new Promise((r) => setTimeout(r, 5000));
  console.log(`  t+${i * 5}s: ${await stuck()}`);
}
await monitor.end();

/** Apakah opsi `connection` akhirnya berlaku di session mode (5432)? */

import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
console.log("port:", url.match(/:(\d+)\//)[1]);

const db = postgres(url, {
  max: 2,
  prepare: false,
  connect_timeout: 15,
  onnotice: () => {},
  connection: {
    statement_timeout: 15_000,
    idle_in_transaction_session_timeout: 10_000,
  },
});

const s = await db`
  SELECT current_setting('statement_timeout') AS st,
         current_setting('idle_in_transaction_session_timeout') AS iit
`;
console.log("setting:", JSON.stringify(s[0]));
console.log(s[0].iit !== "0" ? "  -> opsi connection BERLAKU" : "  -> opsi connection DIABAIKAN");

// Uji nyata: transaksi tertinggal harus diputus otomatis.
const reserved = await db.reserve();
await reserved`BEGIN`;
await reserved`SELECT 1`;
console.log("\ntransaksi dibuka tanpa ditutup; menunggu 14 detik...");
await new Promise((r) => setTimeout(r, 14_000));

const check = await db`
  SELECT count(*)::int AS n FROM pg_stat_activity
  WHERE datname = current_database() AND state IN ('idle in transaction','active')
    AND xact_start IS NOT NULL AND now() - xact_start > interval '8 seconds'
`;
console.log("transaksi tertinggal >8s:", check[0].n);
console.log(
  check[0].n === 0
    ? "  -> Postgres memutus otomatis (BAGUS)"
    : "  -> masih tertinggal (pool bisa macet)",
);

// Query baru harus tetap cepat.
const t0 = Date.now();
await db`SELECT count(*)::int AS n FROM tenants`;
console.log(`query setelahnya: ${Date.now() - t0}ms`);

await db.end();

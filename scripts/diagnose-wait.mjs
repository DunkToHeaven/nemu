/**
 * Tangkap keadaan query tepat saat aplikasi menggantung:
 * wait_event memberitahu apakah ia menunggu LOCK, IO, atau koneksi.
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const monitor = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

const BASE = "http://127.0.0.1:3100";
const login = await fetch(`${BASE}/api/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "email", email: "admin@nemu.local", password: "nemuadmin123" }),
});
const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

// Jalankan permintaan yang lambat tanpa menunggu.
const slow = fetch(`${BASE}/api/v1/reports?days=30`, {
  headers: { Cookie: cookie },
  signal: AbortSignal.timeout(40_000),
}).then(
  (r) => `selesai ${r.status}`,
  (e) => `gagal: ${e.name}`,
);

// Periksa berulang kali selama 20 detik.
for (let i = 0; i < 10; i += 1) {
  await new Promise((r) => setTimeout(r, 2000));
  const rows = await monitor`
    SELECT pid, state, wait_event_type, wait_event,
           now() - xact_start AS xact, now() - query_start AS qtime,
           left(query, 50) AS q
    FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid()
      AND state IS NOT NULL AND xact_start IS NOT NULL
    ORDER BY xact_start
    LIMIT 3
  `;
  console.log(`\n[t=${(i + 1) * 2}s]`);
  if (rows.length === 0) {
    console.log("  tidak ada transaksi terbuka");
    continue;
  }
  for (const r of rows) {
    console.log(
      `  pid=${r.pid} ${r.state} wait=${r.wait_event_type ?? "-"}/${r.wait_event ?? "-"} ` +
        `xact=${String(r.xact).slice(0, 10)} :: ${r.q.replace(/\s+/g, " ")}`,
    );
  }
}

console.log("\nhasil permintaan:", await slow);

const leftovers = await monitor`
  SELECT count(*)::int AS n FROM pg_stat_activity
  WHERE datname = current_database() AND pid <> pg_backend_pid()
    AND xact_start IS NOT NULL AND now() - xact_start > interval '30 seconds'
`;
console.log("transaksi tertinggal > 30s:", leftovers[0].n);

await monitor.end();

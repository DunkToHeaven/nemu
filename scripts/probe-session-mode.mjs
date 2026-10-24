/**
 * Uji pooler SESSION MODE (port 5432) versus TRANSACTION MODE (6543).
 *
 * Supavisor menyediakan dua mode pada host yang sama:
 *   6543 = transaction mode (koneksi dipakai-ulang antar transaksi)
 *   5432 = session mode    (koneksi khusus per klien)
 *
 * Transaction mode mengunci slot secara permanen saat request dibatalkan.
 * Session mode tidak, karena `idle_in_transaction_session_timeout` berlaku.
 */

import { readFileSync } from "node:fs";
import net from "node:net";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const sessionUrl = url.replace(":6543/", ":5432/");
console.log("pooler 6543 :", url.replace(/:[^:@/]+@/, ":***@"));
console.log("pooler 5432 :", sessionUrl.replace(/:[^:@/]+@/, ":***@"));

const tcp = (host, port) =>
  new Promise((resolve) => {
    const s = net.connect(port, host);
    s.setTimeout(6000);
    s.on("connect", () => {
      s.destroy();
      resolve("TERBUKA");
    });
    s.on("timeout", () => {
      s.destroy();
      resolve("timeout");
    });
    s.on("error", (e) => resolve(e.code));
  });

const host = url.match(/@([^:]+):/)[1];
console.log("\ntcp 5432 pada pooler host:", await tcp(host, 5432));

const test = async (label, u) => {
  const db = postgres(u, { max: 2, prepare: false, connect_timeout: 15, onnotice: () => {} });
  try {
    const t0 = Date.now();
    const s =
      await db`SELECT current_setting('idle_in_transaction_session_timeout') AS iit, current_setting('statement_timeout') AS st`;
    console.log(`\n${label}: OK ${Date.now() - t0}ms  iit=${s[0].iit} st=${s[0].st}`);

    // Buka transaksi yang menggantung, lalu lihat apakah Postgres memutusnya.
    const reserved = await db.reserve();
    await reserved`SET idle_in_transaction_session_timeout = '3s'`;
    await reserved`BEGIN`;
    await reserved`SELECT 1`;
    console.log("  transaksi dibuka, menunggu 8 detik untuk melihat apakah diputus...");

    await new Promise((r) => setTimeout(r, 8000));

    // Koneksi lain harus tetap bisa jalan.
    const t1 = Date.now();
    const ok = await Promise.race([
      db`SELECT count(*)::int AS n FROM pg_stat_activity`.then((r) => `OK ${r[0].n}`),
      new Promise((r) => setTimeout(() => r("TIMEOUT 8s"), 8000)),
    ]);
    console.log(`  query lain saat transaksi tertahan: ${ok} (${Date.now() - t1}ms)`);
    reserved.release();
  } catch (e) {
    console.log(`  ${label} GAGAL: ${e.message.slice(0, 80)}`);
  } finally {
    await db.end().catch(() => {});
  }
};

await test("TRANSACTION 6543", url);
await test("SESSION 5432", sessionUrl);

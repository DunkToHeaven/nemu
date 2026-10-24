/**
 * Bandingkan: pooler (6543, transaction mode) vs koneksi langsung (5432).
 *
 * Kalau koneksi langsung pulih setelah request dibatalkan sementara pooler
 * tidak, penyebabnya ada di Supavisor, dan solusinya adalah memakai port 5432.
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";

const env = readFileSync(".env.local", "utf8");
const pooler = env.match(/^DATABASE_URL=(.*)$/m)[1].trim();
const direct = pooler
  .replace("pooler.supabase.com:6543", "supabase.co:5432")
  .replace(/postgres\.[a-z0-9]+:/, "postgres:");
console.log("pooler:", pooler.replace(/:[^:@/]+@/, ":***@"));
console.log("direct:", direct.replace(/:[^:@/]+@/, ":***@"));

const test = async (label, url) => {
  const db = postgres(url, { max: 3, prepare: false, connect_timeout: 15, onnotice: () => {} });
  try {
    const t0 = Date.now();
    await db`SELECT 1`;
    console.log(`\n${label}: koneksi OK (${Date.now() - t0}ms)`);

    // Buka transaksi lalu tinggalkan (meniru request dibatalkan).
    const reserved = await db.reserve();
    await reserved`BEGIN`;
    await reserved`SELECT 1`;

    // Request lain harus tetap bisa jalan.
    const t1 = Date.now();
    const ok = await Promise.race([
      db`SELECT count(*)::int AS n FROM pg_stat_activity`.then((r) => `OK ${r[0].n}`),
      new Promise((r) => setTimeout(() => r("TIMEOUT 8s"), 8000)),
    ]);
    console.log(`  saat 1 koneksi ditahan: ${ok} (${Date.now() - t1}ms)`);

    await reserved`ROLLBACK`;
    reserved.release();
    console.log("  setelah dilepas: pulih");
  } catch (error) {
    console.log(`  ${label} GAGAL: ${error.message.slice(0, 90)}`);
  } finally {
    await db.end();
  }
};

await test("POOLER 6543", pooler);
await test("DIRECT 5432", direct);

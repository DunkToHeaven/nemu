/**
 * Cari endpoint koneksi LANGSUNG ke Supabase (tanpa pooler Supavisor).
 *
 * Pooler mode transaksi mengunci slot secara permanen begitu ada request yang
 * dibatalkan di tengah jalan. Koneksi langsung tidak punya masalah itu.
 * Host langsung Supabase ada di region yang sama dengan pooler.
 */

import dns from "node:dns/promises";
import { readFileSync } from "node:fs";
import net from "node:net";

const url = readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const m = url.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
const [, user, _pass, host, , _db] = m;
const ref = user.split(".")[1];
console.log("ref project:", ref);
console.log("pooler host :", host);

// Kandidat host langsung Supabase.
const regions = [
  "aws-0-ap-northeast-2",
  "aws-0-ap-southeast-1",
  "aws-0-ap-southeast-2",
  "aws-1-ap-northeast-2",
  "aws-0-us-east-1",
  "aws-0-eu-central-1",
];

const candidates = [host];
for (const r of regions) candidates.push(`${r}.supabase.com`);
candidates.push(`db.${ref}.supabase.co`, `${ref}.supabase.co`);

const check = (h, port = 5432) =>
  new Promise((resolve) => {
    const s = net.connect(port, h);
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

for (const h of [...new Set(candidates)]) {
  let dnsInfo = "";
  try {
    const a = await dns.lookup(h, { all: true });
    dnsInfo = a
      .map((x) => x.address)
      .join(",")
      .slice(0, 40);
  } catch (e) {
    dnsInfo = e.code;
  }
  const tcp = await check(h);
  console.log(`  ${h.padEnd(42)} dns=${dnsInfo.padEnd(42)} tcp=${tcp}`);
}

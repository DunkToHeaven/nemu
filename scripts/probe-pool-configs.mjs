/**
 * Konfigurasi pool mana yang membuat Supavisor transaction-mode menggantung?
 * Diuji satu per satu.
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const base = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
const slug = (await base`SELECT slug FROM tenants LIMIT 1`)[0].slug;
await base.end();

const cases = {
  "A. apa adanya": { max: 4, prepare: false, onnotice: () => {} },
  "B. + search_path": {
    max: 4,
    prepare: false,
    onnotice: () => {},
    connection: { search_path: `tenant_${slug},public` },
  },
  "C. + statement_timeout": {
    max: 4,
    prepare: false,
    onnotice: () => {},
    connection: { statement_timeout: 15_000 },
  },
  "D. keduanya": {
    max: 4,
    prepare: false,
    onnotice: () => {},
    connection: { statement_timeout: 15_000, search_path: `tenant_${slug},public` },
  },
  "E. + transform": {
    max: 4,
    prepare: false,
    onnotice: () => {},
    transform: { undefined: null },
    connection: { statement_timeout: 15_000, search_path: `tenant_${slug},public` },
  },
};

for (const [label, opts] of Object.entries(cases)) {
  const db = postgres(url, opts);
  const t0 = Date.now();
  try {
    const r = await Promise.race([
      db`SELECT count(*)::int AS n FROM locations`,
      new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT 6s")), 6000)),
    ]);
    console.log(`  ${label.padEnd(24)} ${String(Date.now() - t0).padStart(5)}ms  ${r[0].n} lokasi`);
  } catch (e) {
    console.log(
      `  ${label.padEnd(24)} ${String(Date.now() - t0).padStart(5)}ms  ${e.message.slice(0, 40)}`,
    );
  }
  await db.end().catch(() => {});
}

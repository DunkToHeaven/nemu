/** Verifikasi keadaan database setelah pembersihan. */

import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8")
  .match(/^DATABASE_URL=(.*)$/m)[1]
  .trim();
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

const users = await sql`SELECT code, email, role, tenant_slug FROM users ORDER BY code`;
const tenants = await sql`SELECT slug, name FROM tenants ORDER BY slug`;
const schemas = await sql`
  SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant\\_%' ORDER BY nspname
`;
const counts = await sql`
  SELECT (SELECT count(*)::int FROM users) AS users,
         (SELECT count(*)::int FROM tenants) AS tenants,
         (SELECT count(*)::int FROM sessions) AS sessions
`;

console.log("pengguna:", users.length);
for (const u of users) console.log(`  ${u.code}  ${u.email}  ${u.role}  tenant=${u.tenant_slug}`);
console.log("tenant:", tenants.length);
for (const t of tenants) console.log(`  ${t.slug}  ${t.name}`);
console.log("schema:", schemas.map((s) => s.nspname).join(", ") || "(tidak ada)");
console.log("ringkas:", JSON.stringify(counts[0]));

// Isi tabel aplikasi di dalam schema tenant yang baru.
const target = schemas[0]?.nspname;
if (target) {
  const rows = await sql.unsafe(
    `SELECT (SELECT count(*)::int FROM "${target}".items) AS items,
            (SELECT count(*)::int FROM "${target}".locations) AS locations,
            (SELECT count(*)::int FROM "${target}".categories) AS categories,
            (SELECT count(*)::int FROM "${target}".transactions) AS transactions,
            (SELECT count(*)::int FROM "${target}".settings) AS settings`,
  );
  console.log(`isi ${target}:`, JSON.stringify(rows[0]));
}

await sql.end();

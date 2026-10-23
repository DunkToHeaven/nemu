#!/usr/bin/env node
import { randomBytes, scryptSync } from "node:crypto";
/**
 * Kosongkan seluruh data aplikasi, lalu siapkan satu akun admin.
 *
 * Yang DIHAPUS: semua tenant + schema-nya (item, transaksi, lokasi, kategori,
 * satuan, alasan, mesin, kustodi, verifikasi, opname, impor, audit).
 *
 * Yang DIPERTAHANKAN: struktur tabel, migrasi, dan akun admin baru yang dibuat
 * di akhir supaya Anda tetap bisa masuk.
 *
 * Jalankan: node scripts/wipe-data.mjs --email you@example.com --password 'rahasia123'
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/nemu";
const sql = postgres(url, { max: 1, onnotice: () => {} });

function arg(name, fallback = "") {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? (process.argv[i + 1] ?? fallback) : fallback;
}

const email = (arg("email") || "admin@nemu.local").toLowerCase();
const password = arg("password") || "nemuadmin123";
const orgName = arg("org") || "Gudang Saya";
const name = arg("name") || "Admin";

/**
 * Format hash WAJIB sama dengan src/server/crypto.ts:
 *   scrypt$N$r$p$<salt-b64>$<hash-b64>
 * Bila formatnya beda, verifySecret() gagal dan admin tidak bisa login.
 */
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

function hashSecret(secret) {
  const salt = randomBytes(16);
  const derived = scryptSync(secret, salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

const before = await sql`
  SELECT (SELECT count(*)::int FROM tenants) AS tenants,
         (SELECT count(*)::int FROM users) AS users,
         (SELECT count(*)::int FROM items) AS items
`;
console.log(
  `  sebelum: ${before[0].tenants} tenant, ${before[0].users} pengguna, ${before[0].items} item (public)`,
);

// 1. Hapus semua schema tenant.
const schemas = await sql`
  SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%' AND nspname <> 'template_tenant'
`;
for (const row of schemas) {
  await sql.unsafe(`DROP SCHEMA IF EXISTS "${row.nspname}" CASCADE`);
  console.log(`  schema dihapus: ${row.nspname}`);
}

// 2. Tabel aplikasi di schema public (sisa seed lama) dikosongkan LEBIH DULU:
//    tabel itu punya FK ke users, jadi menghapus users duluan akan ditolak.
const tables = await sql`
  SELECT tablename FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN (
      'settings','warehouses','locations','categories','units','items','reasons',
      'equipment','transactions','custody','verifications','stock_counts',
      'stock_count_lines','import_jobs','outbox','sync_runs','google_integration','audit_log'
    )
`;
for (const { tablename } of tables) {
  await sql.unsafe(`TRUNCATE public."${tablename}" CASCADE`);
}
console.log(`  ${tables.length} tabel public dikosongkan`);

// 3. Tabel global.
await sql`DELETE FROM sessions`;
await sql`DELETE FROM rate_limits`;
await sql`DELETE FROM tenants`;
await sql`DELETE FROM users`;

// 4. Buat admin + organisasi pertama supaya bisa langsung masuk.
const userId = `usr_${randomBytes(4).toString("hex")}`;
const slug = randomBytes(6).toString("hex").slice(0, 12);
const schema = `tenant_${slug}`;

await sql`SELECT create_tenant_schema(${schema})`;
await sql`
  INSERT INTO tenants (slug, name, owner_id, status)
  VALUES (${slug}, ${orgName}, ${userId}, 'active')
`;
await sql`
  INSERT INTO users (id, code, name, role, email, password_hash, tenant_slug)
  VALUES (${userId}, 'ADMIN', ${name}, 'admin', ${email}, ${hashSecret(password)}, ${slug})
`;
const db = postgres(url, { max: 1, connection: { search_path: `${schema},public` } });
await db`INSERT INTO settings (id, org_name) VALUES (true, ${orgName})
         ON CONFLICT (id) DO UPDATE SET org_name = EXCLUDED.org_name`;
await db.end();

const after = await sql`
  SELECT (SELECT count(*)::int FROM tenants) AS tenants,
         (SELECT count(*)::int FROM users) AS users
`;
console.log(`  sesudah: ${after[0].tenants} tenant, ${after[0].users} pengguna`);
console.log(`\n  Admin siap: ${email} / ${password}  (organisasi: ${orgName})`);
console.log(`  Schema: ${schema}\n`);

await sql.end();

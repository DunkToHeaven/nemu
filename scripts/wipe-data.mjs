#!/usr/bin/env node
import { randomBytes, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";
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

/**
 * Sumber koneksi: env DATABASE_URL, kalau tidak ada baca `.env.local`.
 *
 * Versi lama hanya memakai env lalu jatuh ke Postgres lokal. Akibatnya skrip
 * "berhasil" membersihkan database lokal sementara aplikasi berjalan di
 * Supabase — laporan "1 tenant, 1 pengguna" itu palsu. Skrip ini WAJIB
 * menyentuh database yang sama dengan yang dipakai aplikasi.
 */
function connection() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = readFileSync(".env.local", "utf8");
  const match = env.match(/^DATABASE_URL=(.*)$/m);
  if (!match) throw new Error("DATABASE_URL tidak ditemukan di env maupun .env.local");
  return match[1].trim().replace(/^["']|["']$/g, "");
}

const url = connection();
// `prepare: false` wajib untuk pooler Supabase (port 6543, transaction mode).
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
console.log(`  target: ${url.replace(/:[^:@/]+@/, ":***@")}`);

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

/**
 * URUTAN PENTING.
 *
 * `DROP SCHEMA ... CASCADE` pada schema tenant ikut menghapus baris `tenants`
 * (karena FK), dan itu membuat langkah `DELETE FROM users` gagal diam-diam —
 * akun lama tertinggal dengan tenant_slug yang schema-nya sudah tidak ada.
 * Gejalanya: "admin siap" dicetak, tetapi login 401.
 *
 * Karena itu: kosongkan `users` dan `sessions` LEBIH DULU, baru schema.
 */
await sql`DELETE FROM sessions`;
// Tabel ini mungkin belum ada di instalasi lama (migrasi 010 baru). Dibungkus
// pengecekan supaya skrip tetap jalan di keduanya.
await sql`
  DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='password_resets')
    THEN DELETE FROM password_resets; END IF;
  END $$;
`;

// 1. Tabel aplikasi di schema public dikosongkan LEBIH DULU: tabel itu punya
//    FK ke users, jadi menghapus users duluan akan ditolak.
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

// 2. Hapus semua schema tenant. Ini WAJIB sebelum users: schema tenant memuat
//    salinan tabel aplikasi (mis. import_jobs) dengan FK ke public.users.
const schemas = await sql`
  SELECT nspname FROM pg_namespace WHERE nspname LIKE 'tenant_%' AND nspname <> 'template_tenant'
`;
for (const row of schemas) {
  await sql.unsafe(`DROP SCHEMA IF EXISTS "${row.nspname}" CASCADE`);
  console.log(`  schema dihapus: ${row.nspname}`);
}

// 3. Pengguna. Tidak ditelan diam-diam: bila masih ada FK yang menahan, skrip
//    berhenti dan menyebut constraint-nya, bukan mencetak "berhasil".
try {
  await sql`DELETE FROM users`;
} catch (error) {
  console.error(`\n  GAGAL menghapus pengguna: ${error.message.slice(0, 200)}`);
  console.error(`  constraint: ${error.constraint_name ?? "-"}`);
  await sql.end();
  process.exit(1);
}
const leftUsers = await sql`SELECT count(*)::int AS n FROM users`;
if (leftUsers[0].n !== 0) {
  console.error(`  GAGAL: ${leftUsers[0].n} pengguna masih tersisa.`);
  await sql.end();
  process.exit(1);
}

// 4. Tabel global.
await sql`DELETE FROM rate_limits`;
await sql`DELETE FROM tenants`;

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
const db = postgres(url, {
  max: 1,
  prepare: false,
  onnotice: () => {},
  connection: { search_path: `${schema},public` },
});
await db`INSERT INTO settings (id, org_name) VALUES (true, ${orgName})
         ON CONFLICT (id) DO UPDATE SET org_name = EXCLUDED.org_name`;
await db.end();

const after = await sql`
  SELECT (SELECT count(*)::int FROM tenants) AS tenants,
         (SELECT count(*)::int FROM users) AS users
`;
if (after[0].users !== 1 || after[0].tenants !== 1) {
  console.error(
    `  PERINGATAN: hasil ${after[0].tenants} tenant / ${after[0].users} pengguna, harusnya 1/1.`,
  );
}
console.log(`  sesudah: ${after[0].tenants} tenant, ${after[0].users} pengguna`);
console.log(`\n  Admin siap: ${email} / ${password}  (organisasi: ${orgName})`);
console.log(`  Schema: ${schema}\n`);

await sql.end();

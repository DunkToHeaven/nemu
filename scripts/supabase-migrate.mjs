/**
 * Terapkan seluruh migrasi Nemu ke database Supabase.
 *
 * Perbedaan penting dibanding Postgres lokal:
 *  - koneksi lewat Supavisor transaction pooler (port 6543) -> `prepare: false`
 *  - tidak ada IPv4 untuk host `db.<ref>.supabase.co` di free plan
 *  - migrasi 006/007 membuat skema "template" yang akhirnya ditinggalkan
 *    (008 memakai replay); keduanya tetap dijalankan karena idempoten, tetapi
 *    006/007 bisa dilewati bila membuat kebisingan.
 *
 * Isi migrasi disimpan ke `migration_sources` lewat parameter terikat, bukan
 * `psql -c "$$...$$"` — file SQL memuat karakter non-ASCII yang merusak
 * kutipan shell.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const REF = "sitbuxaffphzwbwdeuml";
const PW = encodeURIComponent(process.env.SUPABASE_PASSWORD);
const sql = postgres(
  `postgresql://postgres.${REF}:${PW}@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres`,
  { max: 1, prepare: false, onnotice: () => {}, connect_timeout: 20 },
);

const DIR = "db/migrations";
// 006/007 membangun `template_tenant` yang kemudian ditinggalkan oleh 008.
// Melewatinya membuat migrasi lebih cepat dan tidak meninggalkan sampah.
const SKIP = new Set(["006_tenant_schema.sql", "007_clone_complete.sql"]);

const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

const applied = new Set((await sql`SELECT name FROM schema_migrations`).map((r) => r.name));

for (const file of files) {
  if (applied.has(file)) {
    console.log(`  lewati   ${file}`);
    continue;
  }
  if (SKIP.has(file)) {
    console.log(`  dilewati ${file} (digantikan 008)`);
    await sql`INSERT INTO schema_migrations (name) VALUES (${file}) ON CONFLICT DO NOTHING`;
    continue;
  }

  const body = readFileSync(join(DIR, file), "utf8");
  console.log(`  terapkan ${file} (${body.length} chars)`);
  try {
    // Migrasi sudah berisi BEGIN/COMMIT sendiri; jalankan sebagai satu blok.
    await sql.unsafe(body);
    await sql`INSERT INTO schema_migrations (name) VALUES (${file}) ON CONFLICT DO NOTHING`;
  } catch (error) {
    console.error(`  GAGAL ${file}: ${error.message}`);
    process.exit(1);
  }
}

// Muat isi migrasi inti ke migration_sources (dipakai create_tenant_schema).
const CORE = ["001_init.sql", "002_stock.sql", "003_oversell_guard.sql", "004_count_line_note.sql"];
await sql`CREATE TABLE IF NOT EXISTS migration_sources (
  name text PRIMARY KEY,
  body text NOT NULL
)`;
for (const name of CORE) {
  const body = readFileSync(join(DIR, name), "utf8");
  await sql`INSERT INTO migration_sources (name, body) VALUES (${name}, ${body})
            ON CONFLICT (name) DO UPDATE SET body = EXCLUDED.body`;
  console.log(`  sumber   ${name}`);
}

const summary = await sql`
  SELECT (SELECT count(*)::int FROM pg_tables WHERE schemaname='public') AS tables,
         (SELECT count(*)::int FROM migration_sources) AS sources,
         (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.proname='create_tenant_schema') AS fn
`;
console.log(
  `\n  selesai: ${summary[0].tables} tabel, ${summary[0].sources} sumber migrasi, fungsi=${summary[0].fn}\n`,
);

await sql.end();

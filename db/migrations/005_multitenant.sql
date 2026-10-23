-- 005: multi-tenant.
--
-- MODEL
-- -----
-- Setiap organisasi (gudang) mendapat schema Postgres sendiri: `tenant_<slug>`.
-- Tabel aplikasi dibuat di dalam schema itu, sehingga isolasi ditegakkan
-- DATABASE, bukan oleh `WHERE tenant_id = ...` yang mudah lupa ditulis.
--
-- Yang GLOBAL (schema public), karena harus dibaca sebelum tenant diketahui:
--   tenants  - daftar organisasi + status
--   users    - akun login, membawa tenant_slug
--   sessions - sesi aktif, membawa tenant_slug
--   rate_limits
--
-- Yang PER-TENANT (schema tenant_*): settings, warehouses, locations,
-- categories, units, items, reasons, equipment, transactions, custody,
-- verifications, stock_counts(+lines), import_jobs, outbox, sync_runs,
-- google_integration, audit_log.

-- ------------------------------------------------------------- organisasi
CREATE TABLE IF NOT EXISTS tenants (
  slug         text PRIMARY KEY CHECK (slug ~ '^[a-z0-9_]{3,40}$'),
  name         text NOT NULL,
  -- Pemilik: akun admin pertama yang mendaftar.
  owner_id     text,
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------- akun & sesi (global)
-- users/sessions sudah ada; tambahkan kolom tenant.
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_slug text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tenant_slug text;

-- Email kini unik per tenant, bukan global: dua organisasi berbeda boleh
-- memakai alamat yang sama.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_email_key
  ON users (tenant_slug, lower(email)) WHERE email IS NOT NULL;

-- Kode login (WRK01) juga harus unik per tenant saja.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_code_key
  ON users (tenant_slug, upper(code));

CREATE INDEX IF NOT EXISTS users_tenant_idx ON users(tenant_slug) WHERE active;
CREATE INDEX IF NOT EXISTS sessions_tenant_idx ON sessions(tenant_slug);

-- ------------------------------------------------------------ referensi
-- Template schema. Dipakai `createTenantSchema()` di src/server/tenant.ts:
-- fungsi ini menyalin struktur tabel aplikasi dari schema `template_tenant`.
--
-- Kenapa template, bukan file SQL terpisah: struktur tetap satu sumber
-- (migrasi 001–004), dan schema baru otomatis mengikuti bila migrasi berubah.
CREATE SCHEMA IF NOT EXISTS template_tenant;

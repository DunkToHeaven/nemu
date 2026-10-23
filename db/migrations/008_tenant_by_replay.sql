-- 008: pembuatan schema tenant dengan MENJALANKAN ULANG migrasi inti.
--
-- Pendekatan sebelumnya (menyalin objek dari schema template) rapuh: definisi
-- view/fungsi Postgres menyimpan referensi tabel tanpa prefix schema, sehingga
-- hasil salinan bisa menunjuk tabel yang salah — dan integritas stok bergantung
-- pada view/fungsi itu.
--
-- Pendekatan sekarang: migrasi 001–004 dijalankan ulang di dalam schema tenant
-- dengan `search_path` disetel ke schema tersebut. Semua DDL asli berlaku apa
-- adanya: tabel, constraint, view, materialized view, fungsi, dan trigger.
--
-- Isi file migrasi disimpan di tabel `migration_sources` supaya fungsi SQL bisa
-- membacanya tanpa bergantung pada filesystem server.

CREATE TABLE IF NOT EXISTS migration_sources (
  name text PRIMARY KEY,
  body text NOT NULL
);

-- Arahkan semua FK kolom user_id/*_by di schema tenant ke public.users.
CREATE OR REPLACE FUNCTION rewire_user_fks(target_schema text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT c.conname, c.conrelid::regclass::text AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    JOIN unnest(c.conkey) AS k(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    WHERE n.nspname = target_schema
      AND c.contype = 'f'
      AND c.confrelid::regclass::text = format('%s.users', target_schema)
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', fk.tbl, fk.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.users(id) ON DELETE RESTRICT',
      fk.tbl, fk.conname, fk.col
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION create_tenant_schema(target_schema text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  src record;
  fk  record;
BEGIN
  IF target_schema !~ '^tenant_[a-z0-9_]{3,40}$' THEN
    RAISE EXCEPTION 'Nama schema tidak valid: %', target_schema;
  END IF;

  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', target_schema);

  -- search_path ke schema tenant + public: tipe ENUM ada di public dan dipakai
  -- bersama oleh semua tenant, sedangkan tabel dibuat di schema tenant.
  PERFORM set_config('search_path', format('%I,public', target_schema), true);

  FOR src IN
    SELECT name, body FROM migration_sources
    -- Lewati migrasi 001 hanya untuk bagian users/sessions? Tidak bisa dipilah
    -- per-statement, jadi seluruh 001 dijalankan lalu tabel global dibuang.
    ORDER BY name
  LOOP
    -- Buang pembungkus transaksi: PL/pgSQL tidak boleh menjalankan
    -- BEGIN/COMMIT di dalam EXECUTE, dan transaksi sudah dikelola pemanggil.
    EXECUTE regexp_replace(src.body, '(?m)^(BEGIN|COMMIT|START TRANSACTION)\s*;\s*$', '', 'g');
  END LOOP;

  -- ---------------------------------------------------------------
  -- Buang tabel yang seharusnya GLOBAL.
  --
  -- Replay 001 ikut membuat `users` dan `sessions` di schema tenant. Itu salah:
  -- akun harus satu baris global (membawa tenant_slug) supaya login tidak
  -- ambigu dan supaya FK dari transactions bisa menunjuk akun mana pun dalam
  -- organisasi yang sama.
  --
  -- Setelah dibuang, FK di tabel tenant yang tadinya menunjuk `tenant_x.users`
  -- dibuat ulang agar menunjuk `public.users`.
  -- ---------------------------------------------------------------
  -- Buang tabel global yang terlanjur dibuat replay, lalu buat ulang FK
  -- kolom user_id / *_by agar menunjuk public.users.
  --
  -- DROP ... CASCADE menghapus constraint FK di tabel lain, jadi FK harus
  -- dibuat ulang secara eksplisit — bukan disalin dari backup, karena backup
  -- di dalam transaksi yang sama sudah tidak akurat setelah CASCADE.
  EXECUTE format('DROP TABLE IF EXISTS %I.sessions CASCADE', target_schema);
  EXECUTE format('DROP TABLE IF EXISTS %I.users CASCADE', target_schema);

  PERFORM set_config('search_path', 'public', true);

  -- Setiap kolom di schema tenant yang bernama user_id / created_by /
  -- approved_by / actor_id diberi FK ke public.users.
  FOR fk IN
    SELECT c.relname AS tbl, a.attname AS col
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = target_schema
      AND c.relkind = 'r'
      AND a.attname IN ('user_id','created_by','approved_by','actor_id')
      AND NOT a.attisdropped
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.users(id) ON DELETE RESTRICT',
      target_schema, fk.tbl, fk.tbl || '_' || fk.col || '_fkey', fk.col
    );
  END LOOP;
END;
$$;

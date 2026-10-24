-- 011: gudang baru harus langsung bisa dipakai.
--
-- MASALAH YANG DIPERBAIKI
-- `create_tenant_schema()` hanya membuat tabel kosong. Akibatnya organisasi yang
-- baru mendaftar punya NOL lokasi, sehingga:
--   * item tidak bisa ditempatkan (primary_location_id kosong),
--   * transaksi terima/keluar ditolak karena tidak ada lokasi tujuan/asal,
--   * layar Lokasi tampak rusak ("tidak ada data") padahal aplikasinya benar.
--
-- Solusi: setiap tenant baru mendapat satu gudang dan satu lokasi bin default
-- yang bisa langsung dipakai. Ini bukan data dummy — ini kerangka minimum agar
-- alur pertama (terima barang) bisa diselesaikan tanpa setup manual.

CREATE OR REPLACE FUNCTION seed_tenant_baseline(target_schema text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  wh_id  text := 'wh_utama';
  loc_id text := 'loc_utama';
BEGIN
  -- Gudang utama.
  EXECUTE format(
    'INSERT INTO %I.warehouses (id, code, name, active)
     VALUES (%L, %L, %L, true)
     ON CONFLICT DO NOTHING',
    target_schema, wh_id, 'GD1', 'Gudang Utama'
  );

  -- Lokasi default bertipe bin, path mengikuti hierarki warehouse/bin.
  EXECUTE format(
    'INSERT INTO %I.locations (id, warehouse_id, parent_id, code, name, type, path, active)
     VALUES (%L, %L, NULL, %L, %L, ''bin'', %L, true)
     ON CONFLICT DO NOTHING',
    target_schema, loc_id, wh_id, 'A-01', 'Rak A-01', 'GD1/A-01'
  );

  -- Kategori dan satuan minimum supaya item pertama bisa dibuat.
  EXECUTE format(
    'INSERT INTO %I.categories (id, name) VALUES (%L, %L) ON CONFLICT DO NOTHING',
    target_schema, 'cat_umum', 'Umum'
  );
  EXECUTE format(
    'INSERT INTO %I.units (id, name, symbol, decimals)
     VALUES (%L, %L, %L, 0) ON CONFLICT DO NOTHING',
    target_schema, 'un_pcs', 'Pcs', 'pcs'
  );

  -- Alasan standar. Tanpa alasan, transaksi keluar tidak bisa dicatat karena
  -- kolom reason_id wajib untuk jenis issue.
  -- Catatan: tabel reasons hanya punya (id, name, requires_wo, requires_note,
  -- active) — tidak ada kolom code/kind, jadi jangan menambah kolom di sini.
  EXECUTE format(
    'INSERT INTO %I.reasons (id, name, active) VALUES (%L, %L, true)
     ON CONFLICT DO NOTHING',
    target_schema, 'rsn_pakai', 'Dipakai produksi'
  );
  EXECUTE format(
    'INSERT INTO %I.reasons (id, name, active) VALUES (%L, %L, true)
     ON CONFLICT DO NOTHING',
    target_schema, 'rsn_rusak', 'Rusak / hilang'
  );

  -- Pengaturan organisasi.
  EXECUTE format(
    'INSERT INTO %I.settings (id, org_name)
     VALUES (true, COALESCE((SELECT name FROM public.tenants WHERE ''tenant_'' || slug = %L), ''Gudang Saya''))
     ON CONFLICT DO NOTHING',
    target_schema, target_schema
  );
END;
$$;

-- Tenant yang SUDAH ada juga perlu lokasi dasar bila masih kosong.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT nspname FROM pg_namespace
           WHERE nspname LIKE 'tenant\_%' AND nspname <> 'template_tenant'
  LOOP
    BEGIN
      PERFORM seed_tenant_baseline(t.nspname);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Lewati %: %', t.nspname, SQLERRM;
    END;
  END LOOP;
END $$;

-- Fungsi pembuat tenant memanggil seed setelah tabel siap.
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
  PERFORM set_config('search_path', format('%I,public', target_schema), true);

  FOR src IN SELECT name, body FROM migration_sources ORDER BY name
  LOOP
    EXECUTE regexp_replace(src.body, '(?m)^(BEGIN|COMMIT|START TRANSACTION)\s*;\s*$', '', 'g');
  END LOOP;

  EXECUTE format('DROP TABLE IF EXISTS %I.sessions CASCADE', target_schema);
  EXECUTE format('DROP TABLE IF EXISTS %I.users CASCADE', target_schema);

  PERFORM set_config('search_path', 'public', true);

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

  -- Kerangka minimum supaya alur pertama bisa diselesaikan.
  PERFORM seed_tenant_baseline(target_schema);
END;
$$;

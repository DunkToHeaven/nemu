-- 012: lokasi berdiri sendiri + sesi opname yang lebih sederhana.
--
-- KENAPA
-- Hierarki gudang > zona > rak > bin terlalu ribet untuk pengguna umum.
-- Untuk gudang kecil, "lokasi" cukup nama tempat (mis. "Rak A", "Gudang Front").
-- Opname pun dipermudah: pilih satu lokasi, semua barang di situ muncul.
--
-- Perubahan:
--  1. locations.parent_id diset NULL dan path = code — semua lokasi datar.
--  2. stock_counts dapat kolom `name` (label sesi dibuat pengguna, opsional).
--  3. Tipe lokasi yang tersisa dipakai 'bin' untuk semua lokasi biasa;
--     'warehouse' tetap untuk induk gudang bila ada.

-- (1) Lokasi datar di SEMUA schema tenant + public + template.
DO $$
DECLARE
  sch text;
BEGIN
  FOR sch IN
    SELECT nspname FROM pg_namespace
    WHERE (nspname LIKE 'tenant\_%' AND nspname <> 'template_tenant')
       OR nspname IN ('public', 'template_tenant')
  LOOP
    BEGIN
      EXECUTE format(
        'UPDATE %I.locations SET parent_id = NULL, path = code WHERE parent_id IS NOT NULL OR path <> code',
        sch
      );
    EXCEPTION WHEN undefined_table THEN
      NULL;  -- skema belum punya tabel locations
    END;
  END LOOP;
END $$;

-- (2) Kolom name untuk sesi opname.
ALTER TABLE public.stock_counts ADD COLUMN IF NOT EXISTS name text;
DO $$
DECLARE
  sch text;
BEGIN
  FOR sch IN
    SELECT nspname FROM pg_namespace
    WHERE (nspname LIKE 'tenant\_%' AND nspname <> 'template_tenant')
       OR nspname = 'template_tenant'
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I.stock_counts ADD COLUMN IF NOT EXISTS name text', sch);
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;
  END LOOP;
END $$;

-- Simpan migrasi ini supaya tenant BARU ikut memutar ulangnya.
INSERT INTO migration_sources (name, body)
VALUES ('012_flat_locations.sql', $$
-- 012 (tenant): sesi opname punya label.
ALTER TABLE stock_counts ADD COLUMN IF NOT EXISTS name text;
UPDATE locations SET parent_id = NULL, path = code WHERE parent_id IS NOT NULL OR path <> code;
$$)
ON CONFLICT (name) DO UPDATE SET body = EXCLUDED.body;

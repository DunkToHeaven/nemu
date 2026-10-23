-- 006: fungsi pembuat schema tenant.
--
-- Menyalin STRUKTUR (bukan data) dari schema `template_tenant` ke schema baru.
-- Pendekatan ini dipilih supaya definisi tabel tetap satu sumber: template
-- dibangun dari migrasi 001–004, jadi tenant baru selalu mengikuti perubahan
-- skema tanpa perlu menulis DDL dua kali.
--
-- Yang disalin: tabel, kolom, constraint, index, sequence, dan trigger.
-- Yang TIDAK disalin: data. Setiap tenant mulai kosong.

CREATE OR REPLACE FUNCTION clone_template_to(target_schema text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  tbl record;
  idx record;
  trg record;
BEGIN
  IF target_schema !~ '^tenant_[a-z0-9_]{3,40}$' THEN
    RAISE EXCEPTION 'Nama schema tidak valid: %', target_schema;
  END IF;

  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', target_schema);

  -- Tabel + kolom + constraint (tanpa data).
  FOR tbl IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'template_tenant'
    ORDER BY tablename
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I.%I (LIKE template_tenant.%I INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING GENERATED INCLUDING IDENTITY)',
      target_schema, tbl.tablename, tbl.tablename
    );
  END LOOP;

  -- Index (termasuk unique yang dibuat terpisah dari tabel).
  FOR idx IN
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'template_tenant'
  LOOP
    EXECUTE replace(idx.indexdef, 'template_tenant.', format('%I.', target_schema));
  END LOOP;

  -- Trigger: salin definisi fungsi pemicu lalu pasang ulang.
  FOR trg IN
    SELECT t.tgname, c.relname AS tablename, pg_get_triggerdef(t.oid) AS def
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'template_tenant' AND NOT t.tgisinternal
  LOOP
    EXECUTE replace(trg.def, 'template_tenant.', format('%I.', target_schema));
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------
-- Bootstrap: isi `template_tenant` dari struktur tabel public yang ada.
--
-- Dijalankan sekali saat migrasi. Setelah ini, template adalah acuan dan
-- schema public hanya menyimpan tabel global (tenants/users/sessions).
-- ---------------------------------------------------------------------
DO $$
DECLARE
  tbl record;
  idx record;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'settings','warehouses','locations','categories','units','items','reasons',
        'equipment','transactions','custody','verifications','stock_counts',
        'stock_count_lines','import_jobs','outbox','sync_runs','google_integration','audit_log'
      )
    ORDER BY tablename
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS template_tenant.%I (LIKE public.%I INCLUDING ALL)',
      tbl.tablename, tbl.tablename
    );
  END LOOP;

  FOR idx IN
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN (SELECT tablename FROM pg_tables WHERE schemaname = 'template_tenant')
  LOOP
    BEGIN
      EXECUTE replace(idx.indexdef, 'public.', 'template_tenant.');
    EXCEPTION WHEN duplicate_table OR duplicate_object THEN
      NULL;  -- index sudah ikut tersalin lewat INCLUDING ALL
    END;
  END LOOP;
END;
$$;

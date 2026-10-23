-- 007: perbaikan fungsi clone — view, fungsi, dan trigger ikut tersalin.
--
-- Versi pertama (006) hanya menyalin tabel dan index. Akibatnya tenant baru
-- TIDAK punya:
--   - view stock_levels / stock_totals  -> saldo stok tidak terbaca sama sekali
--   - materialized view stock_balances
--   - fungsi issue_stock()              -> pengambilan barang gagal
--   - trigger append-only & anti-negatif-> integritas hilang tanpa terlihat
--
-- Urutan pembuatan penting: fungsi dulu, lalu view yang memakainya, lalu
-- trigger yang memanggil fungsi.

CREATE OR REPLACE FUNCTION clone_template_to(target_schema text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  tbl  record;
  idx  record;
  fn   record;
  vw   record;
  trg  record;
  def  text;
BEGIN
  IF target_schema !~ '^tenant_[a-z0-9_]{3,40}$' THEN
    RAISE EXCEPTION 'Nama schema tidak valid: %', target_schema;
  END IF;

  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I', target_schema);

  -- 1. Tabel + kolom + constraint.
  FOR tbl IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'template_tenant' ORDER BY tablename
  LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I.%I (LIKE template_tenant.%I INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING GENERATED INCLUDING IDENTITY)',
      target_schema, tbl.tablename, tbl.tablename
    );
  END LOOP;

  -- 2. Fungsi milik schema template (issue_stock, stock_at, dst).
  FOR fn IN
    SELECT p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'template_tenant'
  LOOP
    EXECUTE replace(fn.def, 'template_tenant.', format('%I.', target_schema));
  END LOOP;

  -- 3. View (biasa + materialized). Dibuat setelah fungsi karena view
  --    stock_levels memanggil stock_at().
  FOR vw IN
    SELECT viewname, definition FROM pg_views
    WHERE schemaname = 'template_tenant'
  LOOP
    def := replace(vw.definition, 'template_tenant.', format('%I.', target_schema));
    EXECUTE format('CREATE OR REPLACE VIEW %I.%I AS %s', target_schema, vw.viewname, def);
  END LOOP;

  FOR vw IN
    SELECT matviewname, definition FROM pg_matviews
    WHERE schemaname = 'template_tenant'
  LOOP
    def := replace(vw.definition, 'template_tenant.', format('%I.', target_schema));
    EXECUTE format(
      'CREATE MATERIALIZED VIEW IF NOT EXISTS %I.%I AS %s WITH NO DATA',
      target_schema, vw.matviewname, def
    );
  END LOOP;

  -- 4. Index (setelah view ada, karena materialized view bisa punya index).
  FOR idx IN
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'template_tenant'
  LOOP
    BEGIN
      EXECUTE replace(idx.indexdef, 'template_tenant.', format('%I.', target_schema));
    EXCEPTION WHEN duplicate_table OR duplicate_object THEN
      NULL;
    END;
  END LOOP;

  -- 5. Trigger (memanggil fungsi dari langkah 2).
  FOR trg IN
    SELECT t.tgname, c.relname AS tablename, pg_get_triggerdef(t.oid) AS def
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'template_tenant' AND NOT t.tgisinternal
  LOOP
    BEGIN
      EXECUTE replace(trg.def, 'template_tenant.', format('%I.', target_schema));
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------
-- Bootstrap ulang template: lengkapi dengan fungsi, view, dan trigger dari
-- schema public (sumber kebenaran saat ini).
-- ---------------------------------------------------------------------
DO $$
DECLARE
  fn  record;
  vw  record;
  trg record;
BEGIN
  -- Fungsi.
  FOR fn IN
    SELECT p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('stock_at','refresh_stock_balances','issue_stock','enforce_no_negative_stock')
  LOOP
    BEGIN
      EXECUTE replace(fn.def, 'public.', 'template_tenant.');
    EXCEPTION WHEN duplicate_function THEN
      NULL;
    END;
  END LOOP;

  -- View biasa.
  FOR vw IN
    SELECT viewname, definition FROM pg_views
    WHERE schemaname = 'public' AND viewname IN ('stock_levels','stock_totals')
  LOOP
    BEGIN
      EXECUTE format(
        'CREATE OR REPLACE VIEW template_tenant.%I AS %s',
        vw.viewname, replace(vw.definition, 'public.', 'template_tenant.')
      );
    EXCEPTION WHEN duplicate_table THEN
      NULL;
    END;
  END LOOP;

  -- Materialized view.
  FOR vw IN
    SELECT matviewname, definition FROM pg_matviews
    WHERE schemaname = 'public' AND matviewname = 'stock_balances'
  LOOP
    BEGIN
      EXECUTE format(
        'CREATE MATERIALIZED VIEW template_tenant.%I AS %s WITH NO DATA',
        vw.matviewname, replace(vw.definition, 'public.', 'template_tenant.')
      );
    EXCEPTION WHEN duplicate_table THEN
      NULL;
    END;
  END LOOP;

  -- Trigger.
  FOR trg IN
    SELECT t.tgname, c.relname AS tablename, pg_get_triggerdef(t.oid) AS def
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
  LOOP
    BEGIN
      EXECUTE replace(trg.def, 'public.', 'template_tenant.');
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END LOOP;
END;
$$;

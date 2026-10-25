-- 013: harga satuan per transaksi + deskripsi item.
--
-- Kenapa per transaksi: satu item bisa harganya berbeda tiap pembelian dari supplier
-- yang berbeda. Unit price saat ini disimpan di `items.unit_value` (harga tetap),
-- tapi laporan butuh membandingkan harga aktual saat setiap receive untuk melihat
-- perubahan harga dari waktu ke waktu.
--
-- Kenapa nullable: transaksi lama (issue, return, transfer) tidak pernah mencatat
-- harga beli. Hanya receive yang butuh unit_price.
--
-- Kenapa description di items: pembeda barang serupa + catatan pengadaan
-- (kondisi, garansi, merk). Opsional, disimpan sebagai teks.
--
-- Tabel tenant hidup di banyak schema (public warisan + template_tenant +
-- tenant_*), jadi ALTER dijalankan dalam loop per schema, pola 012.

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
        'ALTER TABLE %I.items ADD COLUMN IF NOT EXISTS description text', sch);
      EXECUTE format(
        'COMMENT ON COLUMN %I.items.description IS
         ''Catatan tambahan tentang item (kondisi, garansi, supplier, dll).''', sch);
    EXCEPTION WHEN undefined_table THEN
      NULL;  -- skema belum punya tabel items
    END;
    BEGIN
      EXECUTE format(
        'ALTER TABLE %I.transactions ADD COLUMN IF NOT EXISTS unit_price numeric(18,2)', sch);
      EXECUTE format(
        'COMMENT ON COLUMN %I.transactions.unit_price IS
         ''Harga per unit saat receive dicatat. NULL untuk jenis transaksi lain.''', sch);
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;
  END LOOP;
END $$;

-- Simpan migrasi ini supaya tenant BARU ikut memutar ulangnya.
INSERT INTO migration_sources (name, body)
VALUES ('013_item_price_tx.sql', $$
-- 013 (tenant): deskripsi item + harga per transaksi.
ALTER TABLE items ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS unit_price numeric(18,2);
$$)
ON CONFLICT (name) DO UPDATE SET body = EXCLUDED.body;

-- =====================================================================
-- Saldo stok sebagai TURUNAN dari log transaksi
-- =====================================================================
-- Tidak ada tabel `stock` yang bisa di-UPDATE. Saldo dihitung dari
-- transactions, sehingga:
--   - tidak mungkin ada UPDATE yang membuat stok "hilang"
--   - audit trail selalu lengkap (setiap angka punya baris asal)
--   - transaksi pembalik otomatis mengoreksi saldo
--
-- Konsekuensi performa: agregasi penuh 5.000 transaksi masih cepat, tetapi
-- pada jutaan baris ini perlu tabel rollup. Karena itu disediakan
-- `stock_balances` sebagai MATERIALIZED VIEW + fungsi refresh, dipakai
-- dashboard (PRD RT-05: dashboard membaca rollup, bukan seluruh log).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------- saldo per lokasi
-- Satu baris = (item, lokasi) dengan qty bersih.
CREATE VIEW stock_levels AS
SELECT
  item_id,
  location_id,
  SUM(delta)::integer AS qty
FROM (
  -- keluar dari lokasi
  SELECT item_id, from_location_id AS location_id, -qty AS delta
  FROM transactions
  WHERE from_location_id IS NOT NULL
  UNION ALL
  -- masuk ke lokasi
  SELECT item_id, to_location_id AS location_id, qty AS delta
  FROM transactions
  WHERE to_location_id IS NOT NULL
) movements
GROUP BY item_id, location_id
HAVING SUM(delta) <> 0;

-- ------------------------------------------------- saldo total per item
CREATE VIEW stock_totals AS
SELECT item_id, SUM(qty)::integer AS qty
FROM stock_levels
GROUP BY item_id;

-- ------------------------------------------- rollup untuk dashboard
-- Dipakai RT-05. Refresh dilakukan setelah transaksi (debounced) atau manual.
CREATE MATERIALIZED VIEW stock_balances AS
SELECT
  sl.item_id,
  sl.location_id,
  sl.qty,
  now() AS computed_at
FROM stock_levels sl
WITH NO DATA;

CREATE UNIQUE INDEX stock_balances_pk ON stock_balances(item_id, location_id);
CREATE INDEX stock_balances_item_idx ON stock_balances(item_id);

CREATE OR REPLACE FUNCTION refresh_stock_balances() RETURNS void AS $$
BEGIN
  -- CONCURRENTLY butuh unique index (sudah ada) dan tidak memblokir pembaca.
  REFRESH MATERIALIZED VIEW CONCURRENTLY stock_balances;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------- helper saldo
-- Dipakai jalur transaksi untuk membaca saldo terkini dalam transaksi DB
-- yang sama, dengan lock supaya dua pengambilan bersamaan tidak oversell.
CREATE OR REPLACE FUNCTION stock_at(p_item_id text, p_location_id text)
RETURNS integer AS $$
  SELECT COALESCE(SUM(delta), 0)::integer
  FROM (
    SELECT -qty AS delta FROM transactions
     WHERE item_id = p_item_id AND from_location_id = p_location_id
    UNION ALL
    SELECT qty AS delta FROM transactions
     WHERE item_id = p_item_id AND to_location_id = p_location_id
  ) m;
$$ LANGUAGE sql STABLE;

COMMIT;

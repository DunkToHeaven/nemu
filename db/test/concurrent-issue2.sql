-- Uji konkurensi lewat jalur resmi `issue_stock()`.
-- Dijalankan dua kali paralel dari saldo 7 dengan qty 5:
--   yang pertama sukses (sisa 2), yang kedua harus DITOLAK (insufficient_stock).
\set ON_ERROR_STOP off
SELECT * FROM issue_stock(
  :'txid', 'itm_1', 'loc_1', 5, 'usr_1', :'idem'
);

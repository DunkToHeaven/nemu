-- Uji konkurensi: dua pengambilan bersamaan dari saldo yang hanya cukup untuk satu.
-- Dijalankan di dua sesi psql terpisah agar benar-benar paralel.
--
-- Yang dibuktikan: SELECT ... FOR UPDATE pada baris item mengunci item, sehingga
-- sesi kedua menunggu, lalu membaca saldo TERBARU dan menolak karena kurang.
-- Tanpa lock, keduanya akan lolos dan stok jadi minus (oversell).

\set ON_ERROR_STOP off
\timing off

BEGIN;
-- Kunci baris item: ini yang mencegah dua pembaca melihat saldo yang sama.
SELECT id FROM items WHERE id = 'itm_1' FOR UPDATE;
SELECT stock_at('itm_1', 'loc_1') AS saldo_terlihat;
INSERT INTO transactions(id, type, item_id, from_location_id, qty, user_id, idempotency_key)
VALUES (:'txid', 'issue', 'itm_1', 'loc_1', 5, 'usr_1', :'idem');
COMMIT;

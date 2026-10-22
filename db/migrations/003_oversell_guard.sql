-- =====================================================================
-- Pencegahan oversell di level database
-- =====================================================================
-- Percobaan pertama membuktikan: SELECT ... FOR UPDATE pada baris item saja
-- TIDAK cukup. Kedua sesi tetap lolos dan saldo menjadi -3, karena lock hanya
-- menserialkan pembacaan, bukan menolak penulisan yang membuat saldo negatif.
--
-- Perbaikan berlapis:
--   1. Fungsi `issue_stock()` menjalankan cek + tulis dalam SATU transaksi
--      dengan item terkunci, sehingga pembaca kedua melihat saldo terbaru.
--   2. Trigger `enforce_no_negative_stock` sebagai jaring pengaman terakhir:
--      menolak baris apa pun yang membuat saldo lokasi menjadi negatif,
--      termasuk bila ada yang menulis langsung lewat SQL.
--
-- Lapis 2 penting: aplikasi bisa punya bug, tetapi database tidak boleh
-- pernah menyimpan stok negatif.
-- =====================================================================

BEGIN;

-- ------------------------------------------------- jaring pengaman
CREATE OR REPLACE FUNCTION enforce_no_negative_stock() RETURNS trigger AS $$
DECLARE
  v_item   text;
  v_loc    text;
  v_balance integer;
BEGIN
  -- Hanya gerakan yang mengurangi stok yang perlu diperiksa.
  IF NEW.from_location_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_item := NEW.item_id;
  v_loc  := NEW.from_location_id;

  v_balance := stock_at(v_item, v_loc);

  IF v_balance < 0 THEN
    RAISE EXCEPTION 'stok tidak cukup: item % di lokasi % tersisa % (diminta %)',
      v_item, v_loc, v_balance + NEW.qty, NEW.qty
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transactions_no_negative
  BEFORE INSERT ON transactions
  FOR EACH ROW EXECUTE FUNCTION enforce_no_negative_stock();

-- --------------------------------------------------- operasi atomik
-- Satu-satunya jalan yang sah untuk mengeluarkan stok. Cek dan tulis berada
-- dalam transaksi yang sama dengan item terkunci, jadi dua pemanggil
-- bersamaan akan antre dan yang kedua melihat saldo terbaru.
CREATE OR REPLACE FUNCTION issue_stock(
  p_tx_id        text,
  p_item_id      text,
  p_location_id  text,
  p_qty          integer,
  p_user_id      text,
  p_idempotency  text,
  p_reason_id    text DEFAULT NULL,
  p_scan_method  scan_method DEFAULT NULL,
  p_ref_no       text DEFAULT NULL,
  p_note         text DEFAULT NULL
) RETURNS TABLE (ok boolean, code text, message text, balance integer) AS $$
DECLARE
  v_balance integer;
  v_existing text;
BEGIN
  -- 1) Idempotency: kiriman ulang mengembalikan hasil yang sama, bukan dobel.
  SELECT id INTO v_existing FROM transactions
   WHERE user_id = p_user_id AND idempotency_key = p_idempotency;
  IF FOUND THEN
    RETURN QUERY SELECT true, 'duplicate'::text, 'transaksi sudah tercatat'::text,
      stock_at(p_item_id, p_location_id);
    RETURN;
  END IF;

  -- 2) Kunci item supaya dua pengambil bersamaan tidak membaca saldo yang sama.
  PERFORM 1 FROM items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'item_not_found'::text, 'item tidak ada'::text, 0;
    RETURN;
  END IF;

  -- 3) Baca saldo TERBARU setelah lock didapat.
  v_balance := stock_at(p_item_id, p_location_id);

  IF v_balance < p_qty THEN
    -- 409: sertakan saldo terbaru supaya UI bisa menampilkan angka jujur.
    RETURN QUERY SELECT false, 'insufficient_stock'::text,
      format('stok tidak cukup: tersisa %s, diminta %s', v_balance, p_qty),
      v_balance;
    RETURN;
  END IF;

  INSERT INTO transactions(
    id, type, item_id, from_location_id, qty, user_id,
    reason_id, scan_method, ref_no, note, idempotency_key
  ) VALUES (
    p_tx_id, 'issue', p_item_id, p_location_id, p_qty, p_user_id,
    p_reason_id, p_scan_method, p_ref_no, p_note, p_idempotency
  );

  RETURN QUERY SELECT true, 'ok'::text, 'berhasil'::text, v_balance - p_qty;
END;
$$ LANGUAGE plpgsql;

COMMIT;

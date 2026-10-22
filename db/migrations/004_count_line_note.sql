-- 004: catatan per baris opname.
--
-- Dibutuhkan karena UI opname menampilkan catatan pengecualian per baris
-- (mis. "kemasan rusak"). Tanpa kolom ini handler harus mengarang nilai,
-- dan itu membuat data yang tidak bisa dipercaya saat audit.

ALTER TABLE stock_count_lines
  ADD COLUMN IF NOT EXISTS note text;

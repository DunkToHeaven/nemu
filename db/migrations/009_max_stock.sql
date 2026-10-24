-- 009: batas stok maksimum per item.
--
-- Kenapa perlu: tanpa batas atas, gudang tidak bisa membedakan "stok cukup"
-- dari "stok menumpuk". Laporan inventory health juga tidak bisa menandai
-- kelebihan stok (overstock), hanya kekurangan.
--
-- Nullable: item lama dan item yang tidak punya batas atas tetap sah.

ALTER TABLE items
  ADD COLUMN IF NOT EXISTS max_stock integer
  CHECK (max_stock IS NULL OR max_stock >= 0);

-- Batas atas harus konsisten dengan batas bawah.
ALTER TABLE items
  DROP CONSTRAINT IF EXISTS items_stock_range;
ALTER TABLE items
  ADD CONSTRAINT items_stock_range
  CHECK (max_stock IS NULL OR max_stock >= min_stock);

COMMENT ON COLUMN items.max_stock IS
  'Batas atas stok wajar. NULL = tidak dibatasi. Dipakai laporan overstock.';

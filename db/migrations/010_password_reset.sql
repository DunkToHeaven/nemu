-- 010: reset kata sandi lewat token sekali pakai.
--
-- Kenapa token, bukan email: aplikasi ini belum punya pengirim email (SMTP/
-- Resend/SendGrid belum dikonfigurasi). Menjanjikan "tautan dikirim ke email"
-- tanpa pengirim email akan berbohong ke pengguna.
--
-- Alur yang dipakai sekarang:
--   1. Admin meminta reset -> server membuat token acak, disimpan sebagai HASH
--      (bukan plaintext), berlaku 60 menit, sekali pakai.
--   2. Token dikembalikan SEKALI ke peminta. Di UI ditampilkan sebagai tautan
--      yang bisa disalin; bila nanti SMTP tersedia, tautan yang sama dikirim
--      lewat email tanpa mengubah logika.
--
-- Dengan begitu reset tetap aman (token di-hash, kedaluwarsa, sekali pakai)
-- dan tidak bergantung pada layanan yang belum ada.

CREATE TABLE IF NOT EXISTS password_resets (
  id          text PRIMARY KEY,
  user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  requested_ip text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets(user_id);
CREATE INDEX IF NOT EXISTS password_resets_expiry_idx ON password_resets(expires_at)
  WHERE used_at IS NULL;

-- Satu token aktif per pengguna: permintaan baru membatalkan yang lama,
-- supaya tautan lama tidak tetap hidup setelah pengguna minta ulang.
CREATE OR REPLACE FUNCTION invalidate_old_resets() RETURNS trigger AS $$
BEGIN
  UPDATE password_resets SET used_at = now()
  WHERE user_id = NEW.user_id AND used_at IS NULL;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS password_resets_single ON password_resets;
CREATE TRIGGER password_resets_single
  BEFORE INSERT ON password_resets
  FOR EACH ROW EXECUTE FUNCTION invalidate_old_resets();

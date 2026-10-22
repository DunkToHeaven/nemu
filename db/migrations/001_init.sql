-- =====================================================================
-- Nemu — skema PostgreSQL
-- =====================================================================
-- Prinsip yang ditegakkan di level database, bukan hanya di aplikasi:
--
--  1. Stok TIDAK disimpan sebagai kolom yang bisa diedit. Saldo adalah
--     turunan dari log transaksi (append-only). Ini yang membuat angka stok
--     tidak bisa "hilang" karena satu UPDATE yang salah.
--  2. Transaksi immutable: tidak ada UPDATE/DELETE. Koreksi dilakukan dengan
--     transaksi pembalik (reverses_id).
--  3. Idempotency dijamin UNIQUE constraint, bukan pengecekan aplikasi yang
--     bisa balapan.
--  4. Setiap gerakan stok wajib punya arah yang jelas (CHECK per jenis).
--  5. Kode QR item tidak pernah berubah dan unik.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------- enum
CREATE TYPE user_role     AS ENUM ('worker', 'supervisor', 'admin');
CREATE TYPE location_type AS ENUM ('warehouse', 'zone', 'rack', 'bin');
CREATE TYPE tx_type       AS ENUM ('issue', 'return', 'receive', 'transfer', 'adjust');
CREATE TYPE scan_method   AS ENUM ('qr_camera', 'in_app_scanner', 'manual_code');
CREATE TYPE custody_status AS ENUM ('open', 'closed');
CREATE TYPE custody_outcome AS ENUM ('used', 'returned', 'damaged_lost');
CREATE TYPE verify_result AS ENUM ('match', 'mismatch', 'skipped', 'inconclusive');
CREATE TYPE verify_mode   AS ENUM ('confirm', 'blind');
CREATE TYPE verify_source AS ENUM ('pick_prompt', 'opname', 'manual');
CREATE TYPE verify_status AS ENUM ('pending', 'recorded', 'approved', 'rejected');
CREATE TYPE review_status AS ENUM ('ok', 'needs_review');
CREATE TYPE sync_status   AS ENUM ('pending', 'sent', 'failed');
CREATE TYPE import_status AS ENUM ('preview', 'applied', 'failed');
CREATE TYPE count_status  AS ENUM ('open', 'review', 'approved');
CREATE TYPE audit_action  AS ENUM ('create', 'update', 'delete');

-- ------------------------------------------------------------- organisasi
CREATE TABLE settings (
  id                boolean PRIMARY KEY DEFAULT true CHECK (id),
  org_name          text NOT NULL DEFAULT 'Nemu',
  timezone          text NOT NULL DEFAULT 'Asia/Jakarta',
  shift_ends_at     text NOT NULL DEFAULT '16:00',
  min_stock_default integer NOT NULL DEFAULT 0 CHECK (min_stock_default >= 0),
  locale            text NOT NULL DEFAULT 'id' CHECK (locale IN ('id','en')),
  theme             text NOT NULL DEFAULT 'system',
  -- parameter verifikasi & skor (PRD 4.9)
  verify_quota_per_shift integer NOT NULL DEFAULT 10 CHECK (verify_quota_per_shift >= 0),
  verify_min_score       integer NOT NULL DEFAULT 55 CHECK (verify_min_score BETWEEN 0 AND 100),
  confidence_high        integer NOT NULL DEFAULT 80 CHECK (confidence_high BETWEEN 0 AND 100),
  confidence_medium      integer NOT NULL DEFAULT 50 CHECK (confidence_medium BETWEEN 0 AND 100),
  custody_enabled        boolean NOT NULL DEFAULT true,
  notify_telegram        boolean NOT NULL DEFAULT false,
  notify_email           boolean NOT NULL DEFAULT false,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------- gudang
CREATE TABLE warehouses (
  id         text PRIMARY KEY,
  code       text NOT NULL UNIQUE,
  name       text NOT NULL,
  city       text,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Hierarki lokasi. `path` didenormalisasi supaya pencarian & tampilan tidak
-- perlu rekursi; integritasnya dijaga trigger di bawah.
CREATE TABLE locations (
  id           text PRIMARY KEY,
  warehouse_id text NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  parent_id    text REFERENCES locations(id) ON DELETE RESTRICT,
  code         text NOT NULL,
  name         text NOT NULL,
  type         location_type NOT NULL,
  path         text NOT NULL,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_id, code)
);
CREATE INDEX locations_parent_idx ON locations(parent_id);
CREATE INDEX locations_warehouse_idx ON locations(warehouse_id);
CREATE INDEX locations_path_idx ON locations(path);

CREATE TABLE categories (
  id         text PRIMARY KEY,
  name       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE units (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  symbol     text NOT NULL UNIQUE,
  decimals   smallint NOT NULL DEFAULT 0 CHECK (decimals BETWEEN 0 AND 4),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- item
CREATE TABLE items (
  id                  text PRIMARY KEY,
  sku                 text NOT NULL UNIQUE,
  -- Kode QR Crockford base32; tidak pernah berubah (LB-05).
  code                text NOT NULL UNIQUE,
  name                text NOT NULL,
  category_id         text NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  unit_id             text NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
  min_stock           integer NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  unit_value          numeric(14,2),
  is_bulk             boolean NOT NULL DEFAULT false,
  primary_location_id text REFERENCES locations(id) ON DELETE SET NULL,
  active              boolean NOT NULL DEFAULT true,
  photo_url           text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX items_active_idx ON items(active) WHERE active;
CREATE INDEX items_category_idx ON items(category_id);
CREATE INDEX items_primary_location_idx ON items(primary_location_id);
-- Pencarian nama/SKU tanpa ILIKE '%...%' yang tidak ter-index.
CREATE INDEX items_search_idx ON items
  USING gin (to_tsvector('simple', name || ' ' || sku || ' ' || code));

-- -------------------------------------------------------------- pengguna
CREATE TABLE users (
  id            text PRIMARY KEY,
  code          text NOT NULL UNIQUE,
  name          text NOT NULL,
  role          user_role NOT NULL DEFAULT 'worker',
  email         text UNIQUE,
  -- PIN pekerja: disimpan sebagai hash argon2id, tidak pernah plaintext.
  pin_hash      text,
  password_hash text,
  active        boolean NOT NULL DEFAULT true,
  shift_ends_at text,
  last_login_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Worker wajib punya PIN; admin/supervisor wajib punya password.
  CONSTRAINT users_credential CHECK (
    (role = 'worker' AND pin_hash IS NOT NULL)
    OR (role <> 'worker' AND password_hash IS NOT NULL)
  )
);
CREATE INDEX users_role_idx ON users(role) WHERE active;
CREATE INDEX users_email_idx ON users(lower(email));

-- -------------------------------------------------------------- sesi
CREATE TABLE sessions (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       user_role NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at) WHERE revoked_at IS NULL;

-- ------------------------------------------------------------- alasan
CREATE TABLE reasons (
  id            text PRIMARY KEY,
  name          text NOT NULL UNIQUE,
  requires_wo   boolean NOT NULL DEFAULT false,
  requires_note boolean NOT NULL DEFAULT false,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE equipment (
  id         text PRIMARY KEY,
  code       text NOT NULL UNIQUE,
  name       text NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------- transaksi
-- Append-only. Tidak ada UPDATE/DELETE (dijaga trigger).
CREATE TABLE transactions (
  id               text PRIMARY KEY,
  type             tx_type NOT NULL,
  item_id          text NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  from_location_id text REFERENCES locations(id) ON DELETE RESTRICT,
  to_location_id   text REFERENCES locations(id) ON DELETE RESTRICT,
  qty              integer NOT NULL CHECK (qty > 0),
  user_id          text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason_id        text REFERENCES reasons(id) ON DELETE RESTRICT,
  ref_no           text,
  note             text,
  -- Idempotency dijamin database; dua kiriman bersamaan tidak bisa dobel.
  idempotency_key  text NOT NULL,
  device_id        text,
  scan_method      scan_method,
  custody_id       text,
  equipment_id     text REFERENCES equipment(id) ON DELETE SET NULL,
  outcome          custody_outcome,
  client_created_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  reverses_id      text REFERENCES transactions(id) ON DELETE RESTRICT,
  review_status    review_status NOT NULL DEFAULT 'ok',
  CONSTRAINT transactions_idem UNIQUE (user_id, idempotency_key),
  -- Setiap jenis gerakan wajib punya arah yang masuk akal.
  CONSTRAINT transactions_direction CHECK (
    (type = 'issue'    AND from_location_id IS NOT NULL AND to_location_id IS NULL)
    OR (type = 'receive'  AND to_location_id IS NOT NULL AND from_location_id IS NULL)
    OR (type = 'return'   AND to_location_id IS NOT NULL)
    OR (type = 'transfer' AND from_location_id IS NOT NULL AND to_location_id IS NOT NULL
        AND from_location_id <> to_location_id)
    OR (type = 'adjust'   AND (from_location_id IS NOT NULL OR to_location_id IS NOT NULL))
  ),
  CONSTRAINT transactions_reverse_self CHECK (reverses_id IS NULL OR reverses_id <> id)
);
CREATE INDEX tx_item_created_idx ON transactions(item_id, created_at DESC);
CREATE INDEX tx_user_created_idx ON transactions(user_id, created_at DESC);
CREATE INDEX tx_created_idx ON transactions(created_at DESC);
CREATE INDEX tx_from_loc_idx ON transactions(from_location_id) WHERE from_location_id IS NOT NULL;
CREATE INDEX tx_to_loc_idx ON transactions(to_location_id) WHERE to_location_id IS NOT NULL;
CREATE INDEX tx_review_idx ON transactions(review_status) WHERE review_status = 'needs_review';

-- Transaksi tidak boleh diubah atau dihapus. Koreksi = transaksi pembalik.
CREATE OR REPLACE FUNCTION forbid_tx_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'transaksi bersifat append-only; buat transaksi pembalik'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transactions_immutable
  BEFORE UPDATE OR DELETE ON transactions
  FOR EACH ROW EXECUTE FUNCTION forbid_tx_mutation();

-- ------------------------------------------------------------ kustodi
CREATE TABLE custody (
  id           text PRIMARY KEY,
  item_id      text NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  user_id      text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  from_location_id text REFERENCES locations(id) ON DELETE RESTRICT,
  qty          integer NOT NULL CHECK (qty > 0),
  qty_settled  integer NOT NULL DEFAULT 0 CHECK (qty_settled >= 0),
  status       custody_status NOT NULL DEFAULT 'open',
  outcome      custody_outcome,
  opened_tx_id text NOT NULL REFERENCES transactions(id) ON DELETE RESTRICT,
  closed_at    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT custody_settle_bound CHECK (qty_settled <= qty),
  CONSTRAINT custody_closed_consistency CHECK (
    (status = 'open'   AND closed_at IS NULL)
    OR (status = 'closed' AND closed_at IS NOT NULL AND outcome IS NOT NULL)
  )
);
CREATE INDEX custody_user_open_idx ON custody(user_id) WHERE status = 'open';
CREATE INDEX custody_item_idx ON custody(item_id);

-- ---------------------------------------------------------- verifikasi
CREATE TABLE verifications (
  id            text PRIMARY KEY,
  tx_id         text REFERENCES transactions(id) ON DELETE RESTRICT,
  item_id       text NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  location_id   text NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  user_id       text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  prompt_mode   verify_mode NOT NULL,
  expected_qty  integer,
  counted_qty   integer CHECK (counted_qty IS NULL OR counted_qty >= 0),
  result        verify_result,
  source        verify_source NOT NULL DEFAULT 'pick_prompt',
  status        verify_status NOT NULL DEFAULT 'pending',
  -- Mode buta tidak boleh membocorkan angka perkiraan ke klien.
  CONSTRAINT verify_blind_hides_expected CHECK (
    prompt_mode <> 'blind' OR expected_qty IS NULL
  ),
  created_at    timestamptz NOT NULL DEFAULT now(),
  answered_at   timestamptz
);
CREATE INDEX verifications_status_idx ON verifications(status) WHERE status = 'pending';
CREATE INDEX verifications_item_idx ON verifications(item_id, created_at DESC);
CREATE INDEX verifications_user_idx ON verifications(user_id, created_at DESC);

-- -------------------------------------------------------------- opname
CREATE TABLE stock_counts (
  id           text PRIMARY KEY,
  warehouse_id text NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  status       count_status NOT NULL DEFAULT 'open',
  created_by   text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by  text REFERENCES users(id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now(),
  approved_at  timestamptz
);

CREATE TABLE stock_count_lines (
  id             text PRIMARY KEY,
  count_id       text NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
  item_id        text NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  location_id    text NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  expected_qty   integer NOT NULL,
  counted_qty    integer CHECK (counted_qty IS NULL OR counted_qty >= 0),
  UNIQUE (count_id, item_id, location_id)
);
CREATE INDEX count_lines_count_idx ON stock_count_lines(count_id);

-- --------------------------------------------------------------- impor
CREATE TABLE import_jobs (
  id          text PRIMARY KEY,
  filename    text NOT NULL,
  status      import_status NOT NULL DEFAULT 'preview',
  rows        jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by  text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  applied_at  timestamptz
);

-- --------------------------------------------------------------- audit
CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  entity     text NOT NULL,
  entity_id  text NOT NULL,
  action     audit_action NOT NULL,
  before     jsonb,
  after      jsonb,
  actor_id   text REFERENCES users(id) ON DELETE SET NULL,
  source     text NOT NULL DEFAULT 'dashboard',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_created_idx ON audit_log(created_at DESC);
CREATE INDEX audit_entity_idx ON audit_log(entity, entity_id, created_at DESC);

-- ------------------------------------------------------- outbox & sync
-- Pola transactional outbox: baris ditulis di transaksi DB yang sama dengan
-- transaksi stok, lalu worker mengirimnya ke Sheets. Gangguan Google tidak
-- pernah menahan pengambilan barang (PRD bagian 11).
CREATE TABLE outbox (
  id         bigserial PRIMARY KEY,
  topic      text NOT NULL,
  payload    jsonb NOT NULL,
  status     sync_status NOT NULL DEFAULT 'pending',
  attempts   integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at    timestamptz
);
CREATE INDEX outbox_pending_idx ON outbox(created_at) WHERE status = 'pending';

CREATE TABLE sync_runs (
  id         text PRIMARY KEY,
  action     text NOT NULL,
  status     sync_status NOT NULL DEFAULT 'pending',
  rows_sent  integer NOT NULL DEFAULT 0,
  message    text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE google_integration (
  id                boolean PRIMARY KEY DEFAULT true CHECK (id),
  connected         boolean NOT NULL DEFAULT false,
  account_email     text,
  folder_name       text,
  spreadsheet_id    text,
  spreadsheet_url   text,
  -- Token OAuth: terenkripsi AES-256-GCM, tidak pernah plaintext.
  token_ciphertext  text,
  schema_version    integer NOT NULL DEFAULT 1,
  app_schema_version integer NOT NULL DEFAULT 1,
  check_status      text NOT NULL DEFAULT 'unknown',
  check_message     text,
  protected_ranges  integer NOT NULL DEFAULT 0,
  scopes            text[] NOT NULL DEFAULT '{}',
  last_sync_at      timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------ rate limit
-- Disimpan di Postgres (bukan Redis) sesuai PRD bagian 12.
CREATE TABLE rate_limits (
  bucket       text NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer NOT NULL DEFAULT 1,
  PRIMARY KEY (bucket, window_start)
);
CREATE INDEX rate_limits_expiry_idx ON rate_limits(window_start);

COMMIT;

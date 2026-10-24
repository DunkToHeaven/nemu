/**
 * Koneksi PostgreSQL dengan isolasi per-tenant.
 *
 * MODEL MULTI-TENANT
 * ------------------
 * Setiap organisasi (gudang) mendapat schema Postgres sendiri: `tenant_<slug>`.
 * Tabel aplikasi dibuat di dalamnya, sehingga isolasi ditegakkan oleh DATABASE,
 * bukan oleh `WHERE tenant_id = ...` yang mudah lupa ditulis.
 *
 * ATURAN PEMAKAIAN
 * ----------------
 * - `sql`         -> tabel GLOBAL saja: tenants, users, sessions, rate_limits.
 * - `tenantPool()`-> tabel APLIKASI (items, transactions, dst), dipilih dari
 *                    `session.tenant`. Jangan pakai `sql` untuk tabel aplikasi.
 */
import postgres, { type Sql } from "postgres";

const CONNECTION = process.env.DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/nemu";

declare global {
  // eslint-disable-next-line no-var
  var __nemu_sql: Sql | undefined;
}

/**
 * Opsi koneksi bersama.
 *
 * `prepare: false` WAJIB untuk Supabase Supavisor dalam mode transaction
 * (port 6543): pooler memakai ulang koneksi antar transaksi, sehingga prepared
 * statement bernama bisa bertabrakan antar request dan menghasilkan error
 * "prepared statement already exists". Pada Postgres lokal opsi ini netral.
 *
 * `statement_timeout` adalah jaring pengaman: tanpa ini, query yang macet
 * menggantung TANPA BATAS. Pernah terjadi di produksi — satu query
 * `stock_levels` berjalan 17 menit, dan semua request yang memakai pool tenant
 * ikut menunggu, sehingga UI tampak "load terus" selamanya. Dengan timeout,
 * query gagal cepat dan bisa dicoba ulang, bukan menggantung.
 */
const BASE_OPTIONS = {
  transform: { undefined: null as null },
  onnotice: () => {},
  prepare: false,
  /**
   * Jaring pengaman sisi DATABASE. Keduanya wajib, karena kegagalan yang pernah
   * terjadi bukan query lambat, melainkan koneksi yang DITINGGALKAN:
   *
   * - `statement_timeout`: query yang benar-benar macet diputus setelah 15 detik,
   *   bukan menggantung tanpa batas.
   * - `idle_in_transaction_session_timeout`: ini yang menyelamatkan pool.
   *   Ketika klien memutus koneksi di tengah request (menutup tab, timeout
   *   browser, request dibatalkan), postgres.js tidak mengembalikan koneksi ke
   *   pool. Koneksi itu tertinggal dalam keadaan "idle in transaction" —
   *   `pg_stat_activity` menampilkan `wait=Client/ClientRead` — dan slot pool
   *   TIDAK PERNAH kembali. Dengan `max: 2` per tenant, dua request yang
   *   dibatalkan sudah cukup membuat tenant itu macet permanen: semua halaman
   *   tampak "load terus" padahal query-nya sendiri hanya 150 ms.
   *   Postgres kini memutus sesi menganggur itu, sehingga slot pool terbebas.
   */
  connection: {
    statement_timeout: 15_000,
    idle_in_transaction_session_timeout: 10_000,
  },
} as const;

function create(): Sql {
  return postgres(CONNECTION, {
    ...BASE_OPTIONS,
    // Supabase free plan membatasi jumlah koneksi; jangan buka pool besar.
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 15,
  });
}

export const sql: Sql = globalThis.__nemu_sql ?? create();
/**
 * Simpan di `globalThis` pada SEMUA environment, bukan hanya development.
 *
 * Next.js memuat modul server lebih dari sekali (route handler, RSC, middleware
 * punya bundel masing-masing). Tanpa ini, setiap salinan modul membuat pool
 * sendiri, koneksi ke Supabase menumpuk sampai kuota habis, dan request
 * berikutnya menunggu slot selamanya — gejalanya "load terus" padahal database
 * sehat.
 */
globalThis.__nemu_sql = sql;

/**
 * Nama schema untuk sebuah tenant.
 *
 * Divalidasi ketat: slug dipakai menyusun nama schema, jadi tanpa validasi ini
 * nilai dari database bisa menjadi injeksi identifier.
 */
export function schemaFor(slug: string): string {
  if (!/^[a-z0-9_]{3,40}$/.test(slug)) {
    throw new Error(`Slug tenant tidak valid: ${slug}`);
  }
  return `tenant_${slug}`;
}

/** Cache pool per tenant: membuka koneksi baru tiap request terlalu mahal. */
declare global {
  // eslint-disable-next-line no-var
  var __nemu_pools: Map<string, Sql> | undefined;
}

/**
 * Cache pool per tenant.
 *
 * Disimpan di `globalThis` karena Next.js memuat modul server lebih dari sekali
 * (route handler dan RSC punya bundel sendiri). Dengan cache per-modul, setiap
 * salinan membuat pool sendiri untuk tenant yang sama — koneksi berlipat ganda
 * sampai kuota Supabase habis, lalu request menunggu slot selamanya.
 */
if (!globalThis.__nemu_pools) globalThis.__nemu_pools = new Map();
const pools: Map<string, Sql> = globalThis.__nemu_pools;

/**
 * Koneksi yang sudah diarahkan ke schema tenant lewat `search_path`.
 * Query pada objek ini hanya melihat tabel milik tenant tersebut.
 */
export function tenantPool(slug: string): Sql {
  const existing = pools.get(slug);
  if (existing) return existing;

  const created = postgres(CONNECTION, {
    ...BASE_OPTIONS,
    /**
     * Pool dibuat lebih besar dari jumlah request bersamaan yang wajar.
     *
     * `max: 2` terlalu kecil: dua request yang kliennya memutus koneksi
     * (menutup tab, pindah halaman cepat) menahan dua slot, dan tenant itu
     * langsung macet total — semua halaman tampak "load terus". Dengan 8 slot
     * ditambah `idle_in_transaction_session_timeout`, satu-dua koneksi yang
     * tersangkut tidak lagi memblokir seluruh organisasi.
     *
     * Jumlah slot per tenant.
     *
     * 8 slot dengan 11 query paralel berarti 8 berjalan lalu 3 menunggu. Saat
     * beberapa pengguna membuka halaman bersamaan, penantian itu menumpuk dan
     * halaman tampak "load terus". Nilai ini cukup untuk melayani query paralel
     * satu halaman sekaligus, sementara Supabase free plan (~60 koneksi) masih
     * memberi ruang untuk beberapa tenant aktif.
     */
    max: Number(process.env.TENANT_POOL_MAX ?? 6),
    idle_timeout: 15,
    connect_timeout: 15,
    /**
     * BATAS WAKTU MENUNGGU SLOT POOL.
     *
     * Tanpa ini, saat semua slot terpakai (mis. beberapa request dibatalkan
     * klien lalu koneksinya tersangkut di Supavisor), request berikutnya
     * menunggu slot SELAMANYA tanpa batas dan tanpa pesan — itulah "load terus"
     * yang dilaporkan. Dengan `max_lifetime` + `connect_timeout` pendek,
     * request gagal cepat dan bisa dicoba ulang, bukan menggantung.
     */
    max_lifetime: 60 * 10,
    // Gabungkan dengan BASE_OPTIONS.connection, JANGAN menimpanya.
    connection: { ...BASE_OPTIONS.connection, search_path: `${schemaFor(slug)},public` },
  });
  pools.set(slug, created);
  return created;
}

/** Apakah database bisa dihubungi. Dipakai /api/v1/health. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/** Batas query bersamaan agar tidak melebihi slot pool (lihat `runBatched`). */
const QUERY_CONCURRENCY = Number(process.env.QUERY_CONCURRENCY ?? 4);

/**
 * Jalankan beberapa promise query dengan konkurensi terbatas.
 *
 * `Promise.all` pada 10+ query sekaligus meminta 10 koneksi serentak. Pool
 * hanya punya beberapa slot, sehingga query sisanya menunggu slot — dan bila
 * ada koneksi tersangkut, penantian itu berubah menjadi "load terus".
 * Menjalankan 4 sekaligus tetap jauh lebih cepat daripada berurutan, tanpa
 * menghabiskan pool.
 */
export async function runBatched<T extends readonly unknown[]>(
  items: readonly [...{ [K in keyof T]: Promise<T[K]> }],
): Promise<T> {
  const results = new Array(items.length) as unknown as unknown[];
  let next = 0;
  const workers = Array.from({ length: Math.min(QUERY_CONCURRENCY, items.length) }, async () => {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await items[index];
    }
  });
  await Promise.all(workers);
  return results as unknown as T;
}

/**
 * Jalankan sekumpulan query dalam SATU transaksi, dijamin ditutup.
 *
 * KENAPA TIDAK `db.begin()`
 * -------------------------
 * `postgres.js` mengelola `begin()` di sisi klien. Bila klien memutus koneksi
 * di tengah transaksi — pengguna menutup tab, pindah halaman cepat, atau
 * browser membatalkan request — `COMMIT`/`ROLLBACK` tidak pernah terkirim.
 * Koneksi itu tertinggal di pool dalam keadaan "idle in transaction", dan
 * `pg_stat_activity` menampilkannya sebagai `active` + `wait=Client/ClientRead`
 * selamanya. Karena setiap tenant hanya punya beberapa slot, dua-tiga request
 * yang dibatalkan sudah cukup memacetkan SELURUH organisasi: semua halaman
 * tampak "load terus" padahal query-nya sendiri cuma 150 ms.
 *
 * TERBUKTI: 12 request yang dibatalkan membuat semua endpoint sesudahnya
 * menggantung 20 detik lebih, dan tidak pulih sendiri.
 *
 * SOLUSI
 * ------
 * Ambil koneksi terdedikasi lewat `reserve()`, jalankan `BEGIN`/`COMMIT`
 * eksplisit di dalam `try/finally`, dan SELALU `release()` — termasuk saat
 * error atau dibatalkan. `idle_in_transaction_session_timeout` juga disetel
 * per sesi sebagai jaring pengaman terakhir; opsi `connection` pada konfigurasi
 * TIDAK dipakai Supavisor mode transaction, jadi harus lewat `SET`.
 */
export async function withTransaction<T>(db: Sql, fn: (tx: Sql) => Promise<T>): Promise<T> {
  const reserved = await db.reserve();
  try {
    // Berlaku untuk sesi ini saja; Supavisor mengabaikan parameter koneksi.
    await reserved`SET LOCAL statement_timeout = '15s'`;
    await reserved`SET idle_in_transaction_session_timeout = '10s'`;
    await reserved`BEGIN`;
    try {
      const result = await fn(reserved);
      await reserved`COMMIT`;
      return result;
    } catch (error) {
      // ROLLBACK bisa gagal bila koneksi sudah diputus; kegagalan itu tidak
      // boleh menutupi error aslinya.
      try {
        await reserved`ROLLBACK`;
      } catch {
        /* koneksi sudah tidak bisa dipakai */
      }
      throw error;
    }
  } finally {
    reserved.release();
  }
}

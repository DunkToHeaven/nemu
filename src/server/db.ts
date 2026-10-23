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

function create(): Sql {
  return postgres(CONNECTION, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idle_timeout: 20,
    connect_timeout: 10,
    // Angka besar (qty, unit_value) harus tetap angka, bukan string.
    transform: { undefined: null },
    onnotice: () => {},
  });
}

export const sql: Sql = globalThis.__nemu_sql ?? create();
if (process.env.NODE_ENV !== "production") globalThis.__nemu_sql = sql;

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
const pools = new Map<string, Sql>();

/**
 * Koneksi yang sudah diarahkan ke schema tenant lewat `search_path`.
 * Query pada objek ini hanya melihat tabel milik tenant tersebut.
 */
export function tenantPool(slug: string): Sql {
  const existing = pools.get(slug);
  if (existing) return existing;

  const created = postgres(CONNECTION, {
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 20,
    connect_timeout: 10,
    transform: { undefined: null },
    onnotice: () => {},
    connection: { search_path: `${schemaFor(slug)},public` },
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

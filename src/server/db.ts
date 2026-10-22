/**
 * Koneksi PostgreSQL.
 *
 * Satu instance `postgres` dipakai bersama (connection pool internal). Di
 * Next.js dev dengan HMR, modul bisa dievaluasi ulang berkali-kali; cache di
 * `globalThis` mencegah kebocoran pool yang lama-kelamaan menghabiskan
 * koneksi Postgres.
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

/** Apakah database bisa dihubungi. Dipakai /api/v1/health. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

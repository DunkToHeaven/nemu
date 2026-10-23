/**
 * Operasi tenant: pembuatan schema, pembacaan identitas.
 *
 * Isolasi ditegakkan database (satu schema per organisasi), jadi kode
 * aplikasi tidak perlu — dan tidak boleh — menambahkan `WHERE tenant_id`
 * sendiri di setiap query. Yang perlu dilakukan hanyalah memilih koneksi
 * yang benar lewat `tenantPool(slug)`.
 */
import { randomBytes } from "node:crypto";
import { schemaFor, sql, tenantPool } from "@/server/db";

export interface Tenant {
  slug: string;
  name: string;
  ownerId: string | null;
  status: "active" | "suspended";
  createdAt: string;
}

/** Slug acak yang aman dipakai sebagai nama schema. */
export function newTenantSlug(): string {
  // 10 byte base32-ish: cukup acak, tidak bisa ditebak, lolos regex schema.
  return randomBytes(8)
    .toString("hex")
    .slice(0, 12)
    .replace(/[^a-z0-9]/g, "a");
}

export async function findTenant(slug: string): Promise<Tenant | null> {
  const rows = await sql<
    {
      slug: string;
      name: string;
      owner_id: string | null;
      status: Tenant["status"];
      created_at: Date;
    }[]
  >`
    SELECT slug, name, owner_id, status, created_at FROM tenants WHERE slug = ${slug}
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    slug: row.slug,
    name: row.name,
    ownerId: row.owner_id,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Buat organisasi baru: schema Postgres + baris `tenants` + baris `settings`
 * awal. Data referensi (satuan/alasan) SENGAJA tidak diisi — pemilik gudang
 * mengisi sendiri sesuai kebutuhannya.
 */
export async function createTenant(input: { name: string; ownerId: string }): Promise<Tenant> {
  const slug = newTenantSlug();
  const schema = schemaFor(slug);

  // 1. Struktur: jalankan ulang migrasi inti di dalam schema baru.
  await sql`SELECT create_tenant_schema(${schema})`;

  // 2. Baris tenant (global).
  await sql`
    INSERT INTO tenants (slug, name, owner_id, status)
    VALUES (${slug}, ${input.name}, ${input.ownerId}, 'active')
  `;

  // 3. Pengaturan awal milik tenant ini.
  const db = tenantPool(slug);
  await db`
    INSERT INTO settings (id, org_name) VALUES (true, ${input.name})
    ON CONFLICT (id) DO UPDATE SET org_name = EXCLUDED.org_name
  `;

  const created = await findTenant(slug);
  if (!created) throw new Error("Gagal membuat organisasi.");
  return created;
}

/** Hapus organisasi beserta seluruh datanya. Tidak bisa dibatalkan. */
export async function dropTenant(slug: string): Promise<void> {
  await sql`DELETE FROM tenants WHERE slug = ${slug}`;
  await sql`DROP SCHEMA IF EXISTS ${sql(schemaFor(slug))} CASCADE`;
}

/** Statistik ringkas untuk halaman admin platform. */
export async function tenantStats(slug: string): Promise<{
  items: number;
  users: number;
  transactions: number;
}> {
  const db = tenantPool(slug);
  const [row] = await db<
    { items: number; transactions: number }[]
  >`SELECT (SELECT count(*)::int FROM items) AS items,
           (SELECT count(*)::int FROM transactions) AS transactions`;
  const [u] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM users WHERE tenant_slug = ${slug}
  `;
  return { items: row?.items ?? 0, users: u?.n ?? 0, transactions: row?.transactions ?? 0 };
}

import { sql } from "@/server/db";
import { requireRole } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ekspor seluruh master data sebagai satu berkas Excel, satu lembar per jenis.
 *
 * Hanya admin: berkas ini memuat data pengguna (tanpa PIN/hash) dan seluruh
 * struktur gudang, jadi tidak boleh diunduh peran lain.
 */
export async function GET(): Promise<Response> {
  await requireRole("admin");

  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();

  const items = await sql<
    {
      sku: string;
      name: string;
      code: string;
      category: string | null;
      unit: string | null;
      min_stock: number;
      location: string | null;
      active: boolean;
    }[]
  >`
    SELECT i.sku, i.name, i.code, c.name AS category, u.symbol AS unit, i.min_stock,
           l.path AS location, i.active
    FROM items i
    LEFT JOIN categories c ON c.id = i.category_id
    LEFT JOIN units u ON u.id = i.unit_id
    LEFT JOIN locations l ON l.id = i.primary_location_id
    ORDER BY i.sku
  `;
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(items), "Item");

  const locations = await sql<
    { code: string; name: string; type: string; path: string; warehouse: string; active: boolean }[]
  >`
    SELECT l.code, l.name, l.type::text AS type, l.path, w.name AS warehouse, l.active
    FROM locations l JOIN warehouses w ON w.id = l.warehouse_id
    ORDER BY l.path
  `;
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(locations), "Lokasi");

  const categories = await sql<{ name: string; items: number }[]>`
    SELECT c.name, count(i.id)::int AS items
    FROM categories c LEFT JOIN items i ON i.category_id = c.id
    GROUP BY c.name ORDER BY c.name
  `;
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(categories), "Kategori");

  const units = await sql<{ name: string; symbol: string; decimals: number }[]>`
    SELECT name, symbol, decimals FROM units ORDER BY name
  `;
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(units), "Satuan");

  const reasons = await sql<{ name: string; requires_wo: boolean; active: boolean }[]>`
    SELECT name, requires_wo, active FROM reasons ORDER BY name
  `;
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(reasons), "Alasan");

  const equipment = await sql<{ code: string; name: string; active: boolean }[]>`
    SELECT code, name, active FROM equipment ORDER BY name
  `;
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(equipment), "Mesin");

  // Pengguna: sengaja TANPA pin_hash/password_hash — hash kredensial tidak boleh
  // keluar dari database dalam bentuk apa pun.
  const users = await sql<
    { code: string; name: string; role: string; email: string | null; active: boolean }[]
  >`
    SELECT code, name, role::text AS role, email, active FROM users ORDER BY role, name
  `;
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(users), "Pengguna");

  const buffer = XLSX.write(book, { bookType: "xlsx", type: "buffer" }) as Buffer;
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="master-data-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

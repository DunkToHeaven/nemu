import { requireSession } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Template impor sebagai berkas .xlsx sungguhan.
 *
 * Dibuat di server, bukan di klien, karena dua alasan:
 *  1. pustaka spreadsheet besar (~400 KB) tidak perlu masuk bundel browser;
 *  2. tombol unduh bisa berupa tautan biasa, jadi tetap bekerja walau JS
 *     belum selesai dimuat.
 *
 * Tombol "Unduh template" sebelumnya hanya mengisi textarea dan mengganti nama
 * berkas — tidak ada berkas yang benar-benar terunduh, sehingga terasa rusak.
 */
const COLUMNS: Record<
  string,
  { header: string; example: string; required: boolean; note: string }[]
> = {
  items: [
    {
      header: "sku",
      example: "BEA-9001",
      required: true,
      note: "Unik, tidak boleh sama dengan item lain.",
    },
    { header: "name", example: "Bearing 6205-2RS", required: true, note: "Nama barang." },
    {
      header: "category",
      example: "Spare Part",
      required: false,
      note: "Dibuat otomatis bila belum ada.",
    },
    { header: "unit", example: "pcs", required: false, note: "Default pcs." },
    {
      header: "min_stock",
      example: "10",
      required: false,
      note: "Angka bulat, batas stok minimum.",
    },
    {
      header: "location",
      example: "Gudang 1/Zona B/Rak B-03",
      required: false,
      note: "Path lokasi.",
    },
  ],
  locations: [
    { header: "code", example: "B-03", required: true, note: "Unik dalam satu gudang." },
    { header: "name", example: "Rak B-03", required: true, note: "Nama lokasi." },
    { header: "type", example: "rack", required: true, note: "warehouse | zone | rack | bin" },
    { header: "parent", example: "Zona B", required: false, note: "Nama lokasi induk." },
  ],
  categories: [{ header: "name", example: "Spare Part", required: true, note: "Unik." }],
  users: [
    { header: "code", example: "WRK09", required: true, note: "Kode login." },
    { header: "name", example: "Budi Santoso", required: true, note: "Nama lengkap." },
    { header: "role", example: "worker", required: true, note: "worker | supervisor | admin" },
    {
      header: "email",
      example: "budi@nemu.local",
      required: false,
      note: "Wajib untuk supervisor/admin.",
    },
  ],
  equipment: [
    { header: "code", example: "MC-01", required: true, note: "Unik." },
    { header: "name", example: "Mesin Press 1", required: true, note: "Nama mesin." },
  ],
};

export async function GET(request: Request): Promise<Response> {
  await requireSession();

  const entity = new URL(request.url).searchParams.get("entity") ?? "items";
  const spec: { header: string; example: string; required: boolean; note: string }[] =
    COLUMNS[entity] ?? COLUMNS.items ?? [];

  const XLSX = await import("xlsx");

  // Lembar "Data": header + satu baris contoh, siap diisi.
  const dataSheet = XLSX.utils.aoa_to_sheet([
    spec.map((column) => column.header),
    spec.map((column) => column.example),
  ]);

  // Lembar "Panduan": mencegah impor gagal berulang karena salah format.
  const guideSheet = XLSX.utils.aoa_to_sheet([
    ["Kolom", "Wajib", "Contoh", "Keterangan"],
    ...spec.map((column) => [
      column.header,
      column.required ? "Ya" : "Tidak",
      column.example,
      column.note,
    ]),
  ]);

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, dataSheet, "Data");
  XLSX.utils.book_append_sheet(book, guideSheet, "Panduan");

  const buffer = XLSX.write(book, { bookType: "xlsx", type: "buffer" }) as Buffer;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="template-${entity}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

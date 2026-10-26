/**
 * Pembaca berkas impor: CSV dan XLSX.
 *
 * Sebelumnya berkas dibaca sebagai teks mentah lalu dipecah dengan `split(",")`.
 * Untuk .xlsx itu berarti seluruh isi zip dibaca sebagai karakter biner —
 * pengguna melihat tumpukan karakter aneh di kotak pratinjau, bukan data.
 *
 * Di sini pemisahan CSV memakai state machine (bukan `split`) karena nama barang
 * sering mengandung koma dan tanda kutip, dan XLSX dibaca lewat SheetJS yang
 * dimuat dinamis agar tidak menambah bundel awal.
 */

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, string>[];
  /** Nama lembar yang dipakai (khusus XLSX), untuk pesan ke pengguna. */
  sheet?: string;
}

/** Pecah satu baris CSV dengan menghormati tanda kutip dan kutip ganda. */
export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        // Kutip ganda di dalam sel ditulis sebagai "" (standar CSV).
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

/** Ubah matriks sel menjadi objek per baris, memakai baris pertama sebagai header. */
function toRows(matrix: string[][]): ParsedSheet {
  const nonEmpty = matrix.filter((line) =>
    line.some((cell) => String(cell ?? "").trim().length > 0),
  );
  if (nonEmpty.length < 2) return { headers: [], rows: [] };

  const headerRow = nonEmpty[0] ?? [];
  const headers = headerRow.map((cell) =>
    String(cell ?? "")
      .trim()
      .toLowerCase(),
  );
  const rows = nonEmpty.slice(1).map((line) => {
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      if (!header) return;
      row[header] = String(line[index] ?? "").trim();
    });
    return row;
  });
  return { headers, rows };
}

/** Baca CSV dari teks. */
export function parseCsv(text: string): ParsedSheet {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  return toRows(lines.map(parseCsvLine));
}

/** Baca XLSX/XLS dari ArrayBuffer. Lembar "Data" diprioritaskan. */
export async function parseXlsx(buffer: ArrayBuffer): Promise<ParsedSheet> {
  const XLSX = await import("xlsx");
  const book = XLSX.read(buffer, { type: "array" });

  // Templat Nemu punya lembar "Data" (data) dan "Panduan" (penjelasan kolom).
  // Tanpa prioritas ini, lembar Panduan yang ikut terbaca akan menghasilkan
  // baris sampah.
  const sheetName = book.SheetNames.includes("Data") ? "Data" : book.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };

  const sheet = book.Sheets[sheetName];
  if (!sheet) return { headers: [], rows: [] };

  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  }) as unknown as string[][];

  return { ...toRows(matrix), sheet: sheetName };
}

/** Titik masuk tunggal: pilih pembaca berdasarkan isi berkas, bukan namanya. */
export async function parseImportFile(file: File): Promise<ParsedSheet> {
  const name = file.name.toLowerCase();

  // Deteksi lewat isi lebih andal daripada ekstensi: berkas .xlsx selalu diawali
  // "PK" (zip), sedangkan .xls diawali tanda tangan OLE2.
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const isZip = head[0] === 0x50 && head[1] === 0x4b;
  const isOle = head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0;

  if (isZip || isOle || name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return parseXlsx(await file.arrayBuffer());
  }
  return parseCsv(await file.text());
}

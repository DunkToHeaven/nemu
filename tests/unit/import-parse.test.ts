import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvLine } from "@/lib/import-parse";

/**
 * Regresi: form impor dulu membaca semua berkas sebagai teks mentah lalu
 * memecahnya dengan `split(",")`. Untuk .xlsx itu berarti isi zip dibaca
 * sebagai karakter biner — pengguna melihat tumpukan simbol di pratinjau.
 */
describe("parseCsvLine", () => {
  it("memisahkan kolom sederhana", () => {
    expect(parseCsvLine("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("mempertahankan koma di dalam tanda kutip", () => {
    expect(parseCsvLine('BEA-9001,"Bearing 6205, sealed",pcs')).toEqual([
      "BEA-9001",
      "Bearing 6205, sealed",
      "pcs",
    ]);
  });

  it("mengubah kutip ganda berpasangan menjadi satu kutip", () => {
    expect(parseCsvLine('BOL-1,"Bolt 10 ""Stainless""",pcs')).toEqual([
      "BOL-1",
      'Bolt 10 "Stainless"',
      "pcs",
    ]);
  });

  it("menjaga sel kosong di tengah baris", () => {
    expect(parseCsvLine("a,,c")).toEqual(["a", "", "c"]);
  });
});

describe("parseCsv", () => {
  it("memakai baris pertama sebagai header (huruf kecil)", () => {
    const out = parseCsv("SKU,Nama\nBEA-1,Bearing");
    expect(out.headers).toEqual(["sku", "nama"]);
    expect(out.rows).toEqual([{ sku: "BEA-1", nama: "Bearing" }]);
  });

  it("mengembalikan nol baris bila hanya ada header", () => {
    expect(parseCsv("sku,name\n").rows).toHaveLength(0);
  });

  it("mengabaikan baris kosong", () => {
    expect(parseCsv("sku,name\n\nBEA-1,Bearing\n\n").rows).toHaveLength(1);
  });
});

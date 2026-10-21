import { describe, expect, it } from "vitest";
import { isPublicPath, requiredRoleFor, safeNext } from "@/mocks/session";

describe("parameter next (AU-04, C5)", () => {
  it("menerima path internal", () => {
    expect(safeNext("/app/cari?q=bearing", "/app")).toBe("/app/cari?q=bearing");
    expect(safeNext("/i/BEA-0001", "/app")).toBe("/i/BEA-0001");
  });

  it("menolak URL absolut dan protokol", () => {
    for (const hostile of [
      "https://evil.example/app",
      "//evil.example/app",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "app",
      "",
      null,
      undefined,
    ]) {
      expect(safeNext(hostile, "/app")).toBe("/app");
    }
  });

  it("menolak backslash dan encoded newline", () => {
    expect(safeNext("/\\evil.example", "/app")).toBe("/app");
    expect(safeNext("/app\nSet-Cookie: x=1", "/app")).toBe("/app");
  });

  it("tidak pernah mengembalikan path kosong", () => {
    expect(safeNext("/", "/app")).toBe("/app");
  });
});

describe("penjaga rute (WB-05)", () => {
  it("rute admin butuh admin", () => {
    expect(requiredRoleFor("/admin/settings")).toBe("admin");
    expect(requiredRoleFor("/admin/setup")).toBe("admin");
  });

  it("modul master data butuh admin", () => {
    expect(requiredRoleFor("/app/database/lokasi")).toBe("admin");
    expect(requiredRoleFor("/app/database/pengguna")).toBe("admin");
  });

  it("daftar item cukup supervisor", () => {
    expect(requiredRoleFor("/app/database/items")).toBe("supervisor");
  });

  it("opname, laporan, transaksi butuh supervisor", () => {
    expect(requiredRoleFor("/app/opname")).toBe("supervisor");
    expect(requiredRoleFor("/app/laporan")).toBe("supervisor");
    expect(requiredRoleFor("/app/transaksi")).toBe("supervisor");
  });

  it("alur pekerja cukup worker", () => {
    expect(requiredRoleFor("/app")).toBe("worker");
    expect(requiredRoleFor("/i/BEA-0001")).toBe("worker");
    expect(requiredRoleFor("/scan")).toBe("worker");
  });

  it("halaman publik tidak dijaga", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/app")).toBe(false);
  });
});

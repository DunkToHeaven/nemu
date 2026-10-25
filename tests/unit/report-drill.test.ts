import { describe, expect, it } from "vitest";
import { inventoryHealthMock, reportDrill } from "@/mocks/handlers/report-drill";
import type { ApiRequest } from "@/mocks/http";
import { data, store } from "@/mocks/store";

/** Sesi admin palsu untuk memanggil handler mock langsung. */
function req(query: Record<string, string>): ApiRequest {
  const token = "vitest-drill";
  const admin = data().users.find((u) => u.role === "admin") ?? data().users[0]!;
  store().sessions.set(token, {
    token,
    userId: admin.id,
    role: "admin",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  });
  return {
    method: "GET",
    path: "reports/drill",
    query: new URLSearchParams(query),
    body: null,
    token,
    ip: "127.0.0.1",
  };
}

describe("drill-down laporan (mock)", () => {
  it("inventoryHealth punya bentuk camelCase yang dibaca UI", () => {
    const h = inventoryHealthMock();
    for (const key of ["total", "belowMin", "overMax", "healthy", "noThreshold", "neverCounted", "stockValue", "deadValue", "deadCount"]) {
      expect(typeof (h as Record<string, unknown>)[key]).toBe("number");
    }
    expect(h.ageBuckets).toBeTruthy();
  });

  it("kind=belowMin mengembalikan item camelCase", () => {
    const res = reportDrill(req({ kind: "belowMin" }));
    const body = res.body as { kind: string; items: Record<string, unknown>[]; tx: [] };
    expect(body.kind).toBe("belowMin");
    for (const row of body.items) {
      expect(row).toHaveProperty("itemId");
      expect(row).toHaveProperty("locationPath");
      expect(row.minStock).toBeGreaterThan(0);
      expect(Number(row.qty)).toBeLessThan(Number(row.minStock));
    }
  });

  it("kind=byUser mengembalikan transaksi milik user itu saja", () => {
    const user = data().users[0]!;
    const res = reportDrill(req({ kind: "byUser", id: user.id }));
    const body = res.body as { tx: { userName: string }[]; items: [] };
    expect(body.items).toEqual([]);
    for (const tx of body.tx) expect(tx.userName).toBe(user.name);
    const expected = data().transactions.filter((t) => t.userId === user.id).length;
    expect(body.tx.length).toBeLessThanOrEqual(expected);
  });

  it("kind tidak dikenal melempar", () => {
    expect(() => reportDrill(req({ kind: "ngawur" }))).toThrow();
  });
});

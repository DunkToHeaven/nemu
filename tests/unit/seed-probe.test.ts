import { describe, expect, it } from "vitest";
import { buildSeed } from "@/mocks/seed";

describe("seed", () => {
  it("membuat fixture sesuai anggaran PRD", () => {
    const db = buildSeed();
    console.log(
      "items",
      db.items.length,
      "tx",
      db.transactions.length,
      "users",
      db.users.length,
      "stock",
      db.stock.length,
      "locations",
      db.locations.length,
    );
    expect(db.items.length).toBeGreaterThanOrEqual(300);
    expect(db.transactions.length).toBe(5000);
    expect(db.users.filter((u) => u.role === "worker").length).toBe(12);
    expect(new Set(db.items.map((i) => i.code)).size).toBe(db.items.length);
  });
});

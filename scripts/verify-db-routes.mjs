#!/usr/bin/env node
/**
 * Verifikasi bahwa SEMUA rute dilayani database, bukan mock.
 *
 * Header `X-Nemu-Source` adalah buktinya:
 *   database       -> data dari PostgreSQL
 *   mock-fallback  -> masih mock (harus nol)
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3100";

async function login(code, pin) {
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "pin", code, pin }),
  });
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

const ROUTES = [
  ["GET", "health", "any"],
  ["GET", "version", "any"],
  ["GET", "auth/session", "any"],
  ["GET", "meta", "worker"],
  ["GET", "items/search?q=bearing&limit=2", "worker"],
  ["GET", "items?limit=2", "admin"],
  ["GET", "transactions?limit=2", "worker"],
  ["GET", "locations", "worker"],
  ["GET", "categories", "worker"],
  ["GET", "units", "worker"],
  ["GET", "reasons", "worker"],
  ["GET", "equipment", "worker"],
  ["GET", "users", "admin"],
  ["GET", "dashboard", "worker"],
  ["GET", "reports?days=7", "supervisor"],
  ["GET", "stock?limit=5", "supervisor"],
  ["GET", "events", "worker"],
  ["GET", "custody", "worker"],
  ["GET", "verifications?status=all", "supervisor"],
  ["GET", "stock-counts", "supervisor"],
  ["GET", "settings", "admin"],
  ["GET", "integrations/google", "admin"],
  ["GET", "imports", "admin"],
  ["GET", "audit", "admin"],
  // Endpoint tulis: dipanggil dengan body tidak valid agar tetap teruji
  // jalurnya (400 dari validasi Zod), bukan 404 dari mock.
  ["POST", "items/bulk", "admin", { ids: [], action: "activate" }],
  ["POST", "sync/batch", "worker", { transactions: [] }],
];

async function main() {
  const cookies = {
    worker: await login("WRK01", "1122"),
    supervisor: await login("SPV01", "1357"),
    admin: await login("ADM01", "2468"),
  };

  let bad = 0;
  let mockFallback = 0;
  console.log("\n  rute                                          status  sumber");
  console.log(`  ${"-".repeat(66)}`);

  for (const [method, path, who, body] of ROUTES) {
    const cookie = who === "any" ? "" : cookies[who];
    const res = await fetch(`${BASE}/api/v1/${path}`, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: "manual",
    });
    const source = res.headers.get("x-nemu-source") ?? "-";
    const flag = source === "mock-fallback" ? "  <-- MOCK" : "";
    if (source === "mock-fallback") mockFallback += 1;
    if (res.status >= 500) bad += 1;
    console.log(`  ${path.padEnd(42)} ${String(res.status).padStart(4)}    ${source}${flag}`);
  }

  console.log(`  ${"-".repeat(66)}`);
  console.log(`  rute masih mock: ${mockFallback}`);
  console.log(`  rute error 5xx : ${bad}`);
  console.log(
    mockFallback === 0 && bad === 0
      ? "\n  SEMUA RUTE DILAYANI DATABASE\n"
      : "\n  MASIH ADA RUTE MOCK / ERROR\n",
  );
  process.exit(mockFallback === 0 && bad === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

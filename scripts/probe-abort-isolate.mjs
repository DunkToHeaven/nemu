/**
 * Isolasi: apakah SATU request yang dibatalkan merusak pool?
 * Diuji bertahap supaya ketahuan titik rusaknya.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3100";

const login = await fetch(`${BASE}/api/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "email", email: "admin@nemu.local", password: "nemuadmin123" }),
});
const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

const probe = async (label) => {
  const results = [];
  for (const p of ["/locations", "/categories", "/items?limit=5"]) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${BASE}/api/v1${p}`, {
        headers: { Cookie: cookie },
        signal: AbortSignal.timeout(8000),
      });
      await res.text();
      results.push(`${p}=${res.status}/${Date.now() - t0}ms`);
    } catch (e) {
      results.push(`${p}=TIMEOUT(${e.name})`);
    }
  }
  console.log(`  ${label}: ${results.join("  ")}`);
};

console.log("sebelum:", "");
await probe("baseline");

console.log("\nbatalkan 1 request:");
const c1 = new AbortController();
const r1 = fetch(`${BASE}/api/v1/reports?days=30`, {
  headers: { Cookie: cookie },
  signal: c1.signal,
}).catch(() => null);
await new Promise((r) => setTimeout(r, 120));
c1.abort();
await r1;
await new Promise((r) => setTimeout(r, 1500));
await probe("setelah 1 abort");

console.log("\nbatalkan 3 request beruntun:");
for (let i = 0; i < 3; i += 1) {
  const c = new AbortController();
  const r = fetch(`${BASE}/api/v1/reports?days=30`, {
    headers: { Cookie: cookie },
    signal: c.signal,
  }).catch(() => null);
  await new Promise((r2) => setTimeout(r2, 100));
  c.abort();
  await r;
}
await new Promise((r) => setTimeout(r, 2000));
await probe("setelah 4 abort total");

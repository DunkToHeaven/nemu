/** Uji endpoint ber-sesi dengan timing, lewat Node (bukan bash). */
const BASE = process.env.BASE ?? "http://127.0.0.1:3100";

const login = await fetch(`${BASE}/api/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "email", email: "admin@nemu.local", password: "nemuadmin123" }),
});
const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
console.log("login:", login.status, "cookie:", cookie ? `${cookie.slice(0, 24)}…` : "(kosong)");

const paths = [
  "/dashboard",
  "/items?limit=5",
  "/reports?days=30",
  "/locations",
  "/categories",
  "/units",
  "/users",
  "/stock-counts",
  "/settings",
];

for (const path of paths) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/api/v1${path}`, {
      headers: { Cookie: cookie },
      signal: AbortSignal.timeout(12_000),
    });
    const text = await res.text();
    console.log(`  ${path.padEnd(18)} ${res.status} ${Date.now() - t0}ms  ${text.slice(0, 60)}`);
  } catch (error) {
    console.log(
      `  ${path.padEnd(18)} GAGAL ${Date.now() - t0}ms  ${error.name}: ${error.message.slice(0, 50)}`,
    );
  }
}

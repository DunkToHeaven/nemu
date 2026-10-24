/**
 * Apakah hanya request PERTAMA ke pool tenant yang berhasil?
 * Hipotesis: satu koneksi terpakai, sisanya menunggu selamanya.
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3100";

const login = await fetch(`${BASE}/api/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "email", email: "admin@nemu.local", password: "nemuadmin123" }),
});
const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

const call = async (path, i) => {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}/api/v1${path}`, {
      headers: { Cookie: cookie },
      signal: AbortSignal.timeout(8000),
    });
    await res.text();
    console.log(
      `  #${String(i).padStart(2)} ${path.padEnd(20)} ${res.status} ${Date.now() - t0}ms`,
    );
    return res.ok;
  } catch (e) {
    console.log(
      `  #${String(i).padStart(2)} ${path.padEnd(20)} TIMEOUT ${Date.now() - t0}ms (${e.name})`,
    );
    return false;
  }
};

console.log("'/items' enam kali berurutan:");
for (let i = 1; i <= 6; i += 1) await call("/items?limit=5", i);

console.log("\n'/locations' satu kali:");
await call("/locations", 1);

console.log("\n'/items' lagi dua kali:");
await call("/items?limit=5", 1);
await call("/items?limit=5", 2);

console.log("\n'/settings' tiga kali:");
for (let i = 1; i <= 3; i += 1) await call("/settings", i);

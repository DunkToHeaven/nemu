#!/usr/bin/env node
/** Apakah API items mengembalikan data untuk sesi yang baru login? */
const BASE = process.env.BASE ?? "http://127.0.0.1:3100";

const login = await fetch(`${BASE}/api/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ mode: "email", email: "admin@nemu.local", password: "nemuadmin123" }),
});
const raw = login.headers.get("set-cookie") ?? "";
const cookie = raw.split(";")[0];
console.log("login:", login.status, "| cookie:", `${cookie.slice(0, 20)}…`);

for (const path of ["/items?limit=5", "/items/search?q=OLI", "/dashboard"]) {
  const res = await fetch(`${BASE}/api/v1${path}`, { headers: { Cookie: cookie } });
  const text = await res.text();
  console.log(`\n${path} -> ${res.status}`);
  console.log("  ", text.slice(0, 320));
}

import { readFileSync } from "node:fs";

const BASE = "https://nemu-free.my.id";
const login = JSON.parse(
  readFileSync("C:/Users/user/AppData/Local/hermes/cache/scratch/login2.json", "utf8"),
);

async function tryLogin(body, label) {
  const r = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  console.log(`${label}: ${r.status} ${t.slice(0, 150)}`);
  return {
    ok: r.ok,
    cookie: r.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  };
}

const w = await tryLogin({ mode: "pin", code: "WRK01", pin: "1982" }, "WRK01/1982");
const s = await tryLogin({ mode: "pin", code: "SPV01", pin: "8820" }, "SPV01/8820");
const a = await tryLogin(login, "admin email");

// bukti role beneran berlaku: worker tidak boleh akses laporan supervisor
if (w.ok) {
  const r = await fetch(`${BASE}/api/v1/reports?days=30`, { headers: { cookie: w.cookie } });
  console.log("worker -> /reports:", r.status, "(harus 403)");
}
if (s.ok) {
  const r = await fetch(`${BASE}/api/v1/reports?days=30`, { headers: { cookie: s.cookie } });
  console.log("supervisor -> /reports:", r.status, "(harus 200)");
}
if (a.ok) {
  const r = await fetch(`${BASE}/api/v1/users`, { headers: { cookie: a.cookie } });
  const j = await r.json();
  console.log("admin -> /users:", r.status, "jumlah user:", (j.data ?? j.users ?? []).length);
}

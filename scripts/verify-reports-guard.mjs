const BASE = process.env.BASE ?? "http://localhost:3100";

async function login(body) {
  const r = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return {
    status: r.status,
    cookie: r.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; "),
  };
}

const w = await login({ mode: "pin", code: "WRK01", pin: "1982" });
const s = await login({ mode: "pin", code: "SPV01", pin: "8820" });
console.log("login worker:", w.status, "| supervisor:", s.status);

const rw = await fetch(`${BASE}/api/v1/reports?days=30`, { headers: { cookie: w.cookie } });
const rs = await fetch(`${BASE}/api/v1/reports?days=30`, { headers: { cookie: s.cookie } });
console.log("worker -> /reports:", rw.status, rw.status === 403 ? "PASS (ditolak)" : "FAIL");
console.log("supervisor -> /reports:", rs.status, rs.status === 200 ? "PASS" : "FAIL");

// pastikan dashboard worker tetap jalan (bukan ikut keblok)
const rd = await fetch(`${BASE}/api/v1/dashboard`, { headers: { cookie: w.cookie } });
console.log("worker -> /dashboard:", rd.status, rd.status === 200 ? "PASS" : "FAIL");

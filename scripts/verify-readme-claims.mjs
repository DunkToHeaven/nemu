/** Verifikasi klaim README terhadap API nyata (item & lokasi diambil dari API). */
const BASE = process.env.BASE ?? "http://localhost:3100";
const out = [];
const check = (ok, label) => out.push(`${ok ? "PASS" : "FAIL"}  ${label}`);
const cookieOf = (r) =>
  r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

async function login(body) {
  const r = await fetch(`${BASE}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, cookie: cookieOf(r) };
}

const h = await fetch(`${BASE}/api/v1/health`);
check(h.status === 200, "GET /api/v1/health publik (200)");

const w = await login({ mode: "pin", code: "WRK01", pin: "1982" });
const s = await login({ mode: "pin", code: "SPV01", pin: "8820" });
check(w.status === 200 && s.status === 200, "login PIN worker & supervisor (200)");

const rw = await fetch(`${BASE}/api/v1/reports?days=7`, { headers: { cookie: w.cookie } });
check(rw.status === 403, "worker ditolak GET /reports (403)");
const rs = await fetch(`${BASE}/api/v1/reports?days=7`, { headers: { cookie: s.cookie } });
check(rs.status === 200, "supervisor boleh GET /reports (200)");

const ph = await fetch(`${BASE}/api/v1/reports/price-history?days=90`, {
  headers: { cookie: s.cookie },
});
const phj = await ph.json();
check(
  ph.status === 200 && Array.isArray(phj.items ?? phj.data?.items),
  "GET /reports/price-history 200 + items[]",
);

const items = await (
  await fetch(`${BASE}/api/v1/items?limit=3`, { headers: { cookie: s.cookie } })
).json();
const item = (items.data ?? [])[0];
const locs = await (
  await fetch(`${BASE}/api/v1/locations?limit=2`, { headers: { cookie: s.cookie } })
).json();
const loc = (locs.data ?? [])[0];
check(Boolean(item?.code && loc?.id), `item & lokasi tersedia (${item?.code}, ${loc?.id})`);

const key = `readme-verify-${Date.now()}`;
const post = () =>
  fetch(`${BASE}/api/v1/transactions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: s.cookie },
    body: JSON.stringify({
      type: "receive",
      itemCode: item.code,
      locationId: loc.id,
      qty: 1,
      idempotencyKey: key,
    }),
  });
const [p1, p2] = await Promise.all([post(), post()]);
const j1 = await p1.json();
const j2 = await p2.json();
const id1 = j1.transaction?.id ?? j1.data?.transaction?.id ?? j1.data?.id;
const id2 = j2.transaction?.id ?? j2.data?.transaction?.id ?? j2.data?.id;
check(
  p1.status < 400 && p2.status < 400,
  `POST /transactions diterima (${p1.status}, ${p2.status})`,
);
check(Boolean(id1) && id1 === id2, `idempotencyKey sama -> satu transaksi (${id1} / ${id2})`);

const bad = await fetch(`${BASE}/api/v1/items?limit=abc`);
const badj = await bad.json().catch(() => ({}));
check(Boolean(badj.error?.code), "error memakai { error: { code, message } }");

console.log(out.join("\n"));
process.exit(out.some((l) => l.startsWith("FAIL")) ? 1 : 0);

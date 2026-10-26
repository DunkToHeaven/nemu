/** Verifikasi kontrak respons /api/v1/imports (mode DB) tanpa browser. */
const BASE = process.env.BASE ?? "http://localhost:3100";

const login = await fetch(`${BASE}/api/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ mode: "email", email: "admin@nemu.local", password: "nemuadmin123" }),
});
const cookie = login.headers
  .getSetCookie()
  .map((c) => c.split(";")[0])
  .join("; ");
console.log("login:", login.status);

const rows = [
  {
    sku: `XLSX-${Date.now().toString(36).toUpperCase()}`,
    name: "Bearing Uji XLSX",
    unit: "pcs",
    min_stock: "10",
  },
  { sku: "", name: "Baris Tanpa SKU", unit: "pcs" },
];
const res = await fetch(`${BASE}/api/v1/imports`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie },
  body: JSON.stringify({ entity: "items", filename: "template.xlsx", rows }),
});
const job = await res.json();
console.log("preview:", res.status);

const j = job.job ?? {};
const required = [
  "id",
  "entity",
  "filename",
  "status",
  "createdAt",
  "appliedAt",
  "totalRows",
  "newRows",
  "updatedRows",
  "errorRows",
  "rows",
];
const missing = required.filter((k) => !(k in j));
console.log("field hilang:", missing.length ? missing.join(", ") : "tidak ada");
console.log("rows:", Array.isArray(j.rows) ? j.rows.length : "BUKAN ARRAY");
console.log("newRows:", j.newRows, "| errorRows:", j.errorRows, "| totalRows:", j.totalRows);
console.log("contoh baris:", JSON.stringify(j.rows?.[0]));
console.log("baris error:", JSON.stringify(j.rows?.[1]));

// apply juga harus mengembalikan job utuh
if (j.id) {
  const ap = await fetch(`${BASE}/api/v1/imports/${j.id}/apply`, {
    method: "POST",
    headers: { cookie },
  });
  const aj = await ap.json();
  console.log(
    "apply:",
    ap.status,
    "| created:",
    aj.created,
    "| rows array:",
    Array.isArray(aj.job?.rows),
    "| filename:",
    aj.job?.filename,
  );
}

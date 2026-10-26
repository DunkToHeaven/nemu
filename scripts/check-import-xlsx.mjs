/** E2E: unggah XLSX ke form impor dan pastikan pratinjau berisi data, bukan biner. */
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3100";
let pass = 0;
let fail = 0;
const ok = (cond, label) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  cond ? pass++ : fail++;
};

// 1. Login lewat API dulu — endpoint template butuh sesi, dan cookie-nya juga
//    dipakai untuk browser. Login lewat API jauh lebih stabil daripada
//    mengemudikan form login (form bergantung pada hidrasi dev-mode).
const login = await fetch(`${BASE}/api/v1/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ mode: "email", email: "admin@nemu.local", password: "nemuadmin123" }),
});
ok(login.ok, `login API admin (${login.status})`);
const rawCookie = login.headers.getSetCookie().find((c) => c.startsWith("nemu_session=")) ?? "";
const sessionValue = rawCookie.split(";")[0].split("=")[1] ?? "";
ok(sessionValue.length > 10, "cookie sesi didapat");

// 2. Ambil template XLSX (bukti tombol unduh menghasilkan berkas nyata)
const tpl = await fetch(`${BASE}/api/v1/imports/template?entity=items`, {
  headers: { cookie: `nemu_session=${sessionValue}` },
});
ok(tpl.ok, `unduh template XLSX (${tpl.status})`);
const ct = tpl.headers.get("content-type") ?? "";
ok(ct.includes("spreadsheetml"), `content-type template xlsx (${ct})`);
const tmpPath = "scripts/_tmp_template.xlsx";
writeFileSync(tmpPath, Buffer.from(await tpl.arrayBuffer()));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
await ctx.addCookies([
  {
    name: "nemu_session",
    value: sessionValue,
    domain: "localhost",
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  },
]);
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 140)));

await page.goto(`${BASE}/app/database/impor`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(4000);

// 3. Unggah XLSX
await page.getByTestId("import-file").setInputFiles(tmpPath);
await page.waitForTimeout(2500);

const bodyText = await page.locator("body").innerText();
// Cek karakter kontrol (penanda isi biner terbaca sebagai teks) tanpa regex
// berisi literal karakter kontrol, yang ditolak linter.
const hasControlChar = [...bodyText].some((ch) => {
  const code = ch.codePointAt(0) ?? 0;
  return code < 9 || (code > 13 && code < 32);
});
const garbage =
  hasControlChar ||
  bodyText.includes("PK" + String.fromCharCode(3)) ||
  bodyText.includes("Root Entry") ||
  bodyText.includes("Calibri");
ok(!garbage, "tidak ada karakter biner di halaman (PK/Root Entry/Calibri)");
ok(/baris terbaca/.test(bodyText), "status 'baris terbaca' muncul setelah unggah XLSX");

const ta = await page.locator("#csv").inputValue();
ok(
  ta.startsWith("sku"),
  `textarea berisi header CSV yang benar (${ta.split("\n")[0].slice(0, 45)})`,
);
ok(!ta.includes("\u0000"), "textarea bebas karakter null");

// 4. Pratinjau
const previewBtn = page.getByRole("button", { name: /pratinjau/i }).first();
ok(await previewBtn.isEnabled(), "tombol Pratinjau aktif setelah unggah XLSX");
await previewBtn.click();
await page.waitForTimeout(6000);

const after = await page.locator("body").innerText();
ok(!/gagal dimuat/i.test(after), "halaman tidak crash setelah pratinjau");
ok(/Pratinjau perubahan/i.test(after), "kartu 'Pratinjau perubahan' tampil");
ok(/\d+ baru/.test(after), "ringkasan jumlah baris baru tampil");
const rowsRendered = await page
  .locator("li")
  .filter({ hasText: /BEA-9001|BOL-1002|OIL-2001/ })
  .count();
ok(rowsRendered > 0, `baris data dari XLSX dirender (${rowsRendered} baris)`);

await page.screenshot({ path: "shots/import-xlsx.png", fullPage: false });
await browser.close();
console.log(`\n${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);

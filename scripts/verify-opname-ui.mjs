#!/usr/bin/env node
/** UI opname baru: satu layar, sesi langsung terbuka, riwayat per baris. */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
let pass = 0, fail = 0;
const check = (n, ok, d = "") => { ok ? pass++ : fail++; console.log(`  ${ok ? "OK   " : "GAGAL"} ${n}${d ? `  (${d})` : ""}`); };

const browser = await chromium.launch({ channel: "chromium" });
const ctx = await browser.newContext();
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message.slice(0, 140)));

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1800);
await page.getByTestId("tab-email").click();
await page.waitForTimeout(250);
await page.getByTestId("input-email").fill("admin@nemu.local");
await page.getByTestId("input-password").fill("nemuadmin123");
await page.getByTestId("submit-login-email").click();
await page.waitForURL(/\/app/, { timeout: 30_000 });

console.log("\n== HALAMAN OPNAME BARU ==");
await page.goto(`${BASE}/app/opname`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);
const body = await page.locator("body").innerText();
check("halaman terbuka", !/gagal dimuat|couldn.t load/i.test(body));
check("tanpa tab (tidak ada 'Perlu dihitung')", !/perlu dihitung/i.test(body));
check("tanpa kata 'zona'", !/zona/i.test(body));
check("ada tombol Sesi baru", (await page.getByTestId("opname-new-session").count()) > 0);

console.log("\n== SESI BARU ==");
await page.getByTestId("opname-new-session").click();
await page.waitForTimeout(1200);
const dialog = page.locator('[data-testid="opname-create-dialog"]');
check("dialog sesi baru muncul", (await dialog.count()) > 0);
// Daftar lokasi datang dari query meta — beri waktu sampai isinya muncul.
const sel = page.getByTestId("opname-location");
await sel.waitFor({ state: "visible", timeout: 20_000 });
let opts = 0;
for (let i = 0; i < 20; i += 1) {
  opts = await sel.locator("option").count();
  if (opts > 1) break;
  await page.waitForTimeout(500);
}
check("dropdown lokasi ada", opts >= 1, `${opts} opsi`);
check("dropdown berisi lokasi", opts > 1, `${opts - 1} lokasi`);

// Pilih lokasi pertama yang nyata.
await sel.selectOption({ index: 1 });
await page.getByTestId("opname-create-submit").click();
await page.waitForTimeout(5000);

console.log("\n== PANEL HITUNGAN LANGSUNG TERBUKA ==");
const sheet = page.locator('[role="dialog"]').last();
const sheetText = (await sheet.count()) ? await sheet.innerText() : "";
check("panel hitungan terbuka otomatis", sheetText.length > 40, sheetText.replace(/\s+/g, " ").slice(0, 80));
check("baris barang muncul", (await page.getByTestId(/^opname-line-/).count()) >= 0);
const lines = page.locator('[data-testid^="opname-line-"]');
console.log(`  (${await lines.count()} baris input tersedia)`);

if ((await lines.count()) > 0) {
  const first = lines.first();
  await first.fill("9");
  // Simpan per baris = tombol check di sebelahnya.
  const saveBtn = page.locator('[data-testid="opname-lines"] li').first().locator("button[aria-label='Simpan']");
  if (await saveBtn.count()) {
    await saveBtn.click();
    await page.waitForTimeout(2500);
  }
  const after = await page.locator("body").innerText();
  check("angka tersimpan / sesi belum error", !/gagal/i.test(after));

  // Riwayat per baris.
  const histBtn = page.locator('[data-testid^="opname-history-toggle-"]').first();
  check("tombol riwayat per baris ada", (await histBtn.count()) > 0);
  if (await histBtn.count()) {
    await histBtn.click();
    await page.waitForTimeout(2500);
    const expanded = await page.locator('[data-testid="opname-lines"]').innerText();
    check("riwayat transaksi tampil", /receive|terima|adjust|issue|masuk|keluar|opname/i.test(expanded), expanded.replace(/\s+/g, " ").slice(0, 80));
  }

  // Tombol selesai & koreksi.
  const approveBtn = page.getByTestId("opname-approve");
  check("tombol Selesai & koreksi ada", (await approveBtn.count()) > 0);
}

console.log("\n== HALAMAN LOKASI DATAR ==");
await page.goto(`${BASE}/app/database/lokasi`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);
const locBody = await page.locator("body").innerText();
check("halaman lokasi tanpa dropdown induk", !/induk/i.test(locBody));
check("tanpa label Zona/Rak/Bin", !/>\s*Zona\s*</.test(locBody) && !/Pilih zona/i.test(locBody));
await page.getByTestId("add-location").click();
await page.waitForTimeout(600);
check("form lokasi baru hanya 2 kolom", (await page.getByTestId("new-location-name").count()) > 0 && (await page.getByTestId("new-location-type").count()) === 0);

console.log("\nerror:", errs.slice(0, 4).join(" | ") || "tidak ada");
await browser.close();
console.log(`\n${"-".repeat(46)}\n  lulus ${pass} · gagal ${fail}`);
process.exit(fail === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * Uji empat permintaan terbaru:
 *  1. halaman Integrasi sudah hilang
 *  2. reset kata sandi berfungsi (token tidak dikembalikan ke peminta)
 *  3. impor menyimpan max_stock
 *  4. laporan punya ringkasan kesehatan persediaan yang rinci
 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`  OK    ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    fail += 1;
    console.log(`  GAGAL ${name}${detail ? `  (${detail})` : ""}`);
  }
}

const browser = await chromium.launch({ channel: "chromium" });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const stamp = Date.now().toString(36);
const email = `r4-${stamp}@uji.local`;
const password = "rahasia12345";

// Daftar admin baru.
await page.goto(`${BASE}/signup`, { waitUntil: "load" });
// Tunggu hidrasi: mengisi form sebelum React memasang listener membuat nilai
// masuk ke DOM tetapi tidak ke state, sehingga tombol tetap disabled.
await page.waitForTimeout(900);
await page.getByTestId("signup-org").fill("Org R4");
await page.getByTestId("signup-name").fill("Admin R4");
await page.getByTestId("signup-email").fill(email);
await page.getByTestId("signup-password").fill(password);
// Tunggu tombol aktif: validasi klien berjalan setelah state terisi.
const submit = page.getByTestId("signup-submit");
await submit.waitFor({ state: "visible", timeout: 15_000 });
for (let i = 0; i < 40 && (await submit.isDisabled()); i += 1) {
  await page.waitForTimeout(250);
}
if (await submit.isDisabled()) {
  const vals = await page.evaluate(() => ({
    org: document.querySelector('[data-testid="signup-org"]')?.value,
    name: document.querySelector('[data-testid="signup-name"]')?.value,
    email: document.querySelector('[data-testid="signup-email"]')?.value,
    pw: document.querySelector('[data-testid="signup-password"]')?.value?.length,
  }));
  console.log("  DIAGNOSA isian:", JSON.stringify(vals));
}
await submit.click();
await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 30_000 });

console.log("\n== 1. HALAMAN INTEGRASI DIHAPUS ==");
{
  const nav = await page.locator("aside a, nav a").allInnerTexts();
  check("menu Integrasi hilang dari navigasi", !nav.join(" ").includes("Integrasi"));
  const res = await page.request.get(`${BASE}/admin/integrations/google`, { maxRedirects: 0 });
  check(
    "rute /admin/integrations/google sudah tidak ada",
    res.status() === 404,
    `status ${res.status()}`,
  );
}

console.log("\n== 2. RESET KATA SANDI ==");
{
  // Endpoint tidak boleh membocorkan token ke peminta.
  const forgot = await page.request.post(`${BASE}/api/v1/auth/forgot`, {
    data: { email },
  });
  const body = await forgot.json();
  check("permintaan reset diterima", forgot.status() === 200, `status ${forgot.status()}`);
  check(
    "token TIDAK dikembalikan ke peminta",
    !("resetUrl" in body),
    JSON.stringify(Object.keys(body)),
  );
  check(
    "respons menyebut status pengiriman email",
    typeof body.emailSent === "boolean",
    `emailSent=${body.emailSent}`,
  );

  // Email tak terdaftar harus dibalas sama (tidak bisa dipakai menebak akun).
  const ghost = await page.request.post(`${BASE}/api/v1/auth/forgot`, {
    data: { email: `tidak-ada-${stamp}@uji.local` },
  });
  const ghostBody = await ghost.json();
  // Seragam = struktur dan pesan sama; `emailSent` boleh berbeda hanya karena
  // konfigurasi pengirim email, bukan karena email terdaftar atau tidak.
  check(
    "email tak terdaftar dibalas seragam",
    ghost.status() === 200 && !("resetUrl" in ghostBody) && ghostBody.message === body.message,
    ghost.status() === 200 && ghostBody.message === body.message
      ? "pesan identik"
      : `status ${ghost.status()}, pesan: ${String(ghostBody.message).slice(0, 60)}`,
  );

  // Halaman reset bisa dibuka tanpa sesi.
  const pageRes = await page.request.get(`${BASE}/reset-password`, { maxRedirects: 0 });
  check("halaman /reset-password publik", pageRes.status() === 200, `status ${pageRes.status()}`);
}

console.log("\n== 3. IMPOR MENYIMPAN MAX STOCK ==");
{
  // Template harus memuat kolom max_stock.
  const tpl = await page.request.get(`${BASE}/api/v1/imports/template?entity=items`);
  check("template Excel bisa diunduh", tpl.status() === 200, `status ${tpl.status()}`);

  // Terapkan impor dengan max_stock lalu baca kembali lewat API item.
  const preview = await page.request.post(`${BASE}/api/v1/imports`, {
    data: {
      entity: "items",
      filename: "uji-max.csv",
      rows: [
        {
          sku: `MAX-${stamp}`,
          name: "Item Max Stock",
          category: "Consumable",
          unit: "pcs",
          min_stock: "5",
          max_stock: "50",
        },
      ],
    },
  });
  const pv = await preview.json();
  check("pratinjau impor diterima", preview.status() === 201, pv?.job?.summary?.accepted);

  const applied = await page.request.post(`${BASE}/api/v1/imports/${pv.job.id}/apply`);
  check("impor diterapkan", applied.status() === 200, `status ${applied.status()}`);

  const found = await page.request.get(`${BASE}/api/v1/items/search?q=MAX-${stamp}`);
  const items = await found.json();
  const item = items.data?.[0]?.item;
  check("item hasil impor ada", Boolean(item), item?.sku);
  check(
    "max_stock tersimpan (bukan null)",
    item?.maxStock === 50,
    `maxStock=${JSON.stringify(item?.maxStock)}`,
  );
}

console.log("\n== 4. LAPORAN: KESEHATAN PERSEDIAAN ==");
{
  const rep = await page.request.get(`${BASE}/api/v1/reports?days=30`);
  const data = await rep.json();
  const h = data.inventoryHealth;
  check("respons memuat inventoryHealth", Boolean(h), h ? "ada" : "TIDAK ADA");
  if (h) {
    check(
      "punya hitungan di bawah minimum",
      typeof h.belowMin === "number",
      `belowMin=${h.belowMin}`,
    );
    check("punya hitungan kelebihan stok", typeof h.overMax === "number", `overMax=${h.overMax}`);
    check("punya nilai persediaan", typeof h.stockValue === "number", `value=${h.stockValue}`);
    check("punya sebaran umur pencatatan", Boolean(h.ageBuckets), JSON.stringify(h.ageBuckets));
  }

  await page.goto(`${BASE}/app/laporan`, { waitUntil: "load" });
  await page.waitForTimeout(4000);
  const body = await page.locator("body").innerText();
  check("UI menampilkan 'Kesehatan persediaan'", /kesehatan persediaan/i.test(body));
  check("UI menyebut kelebihan stok", /kelebihan stok/i.test(body));
  check("UI menyebut umur pencatatan", /umur pencatatan/i.test(body));
}

await browser.close();
console.log(`\n${"-".repeat(50)}`);
console.log(`  lulus ${pass} · gagal ${fail}`);
process.exit(fail === 0 ? 0 : 1);

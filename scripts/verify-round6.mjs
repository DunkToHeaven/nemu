#!/usr/bin/env node
/** Uji lima permintaan terbaru lewat URL publik. */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "https://operated-harmony-retrieved-worship.trycloudflare.com";
let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    pass += 1;
    console.log(`  OK    ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    fail += 1;
    console.log(`  GAGAL ${name}${detail ? `  (${detail})` : ""}`);
  }
};

const browser = await chromium.launch({ channel: "chromium" });
const ctx = await browser.newContext();
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message.slice(0, 140)));

console.log("\n== 1. TOMBOL KEMBALI DI HALAMAN MASUK ==");
await page.goto(`${BASE}/login?next=%2Flogin`, { waitUntil: "load" });
await page.waitForTimeout(2200);
const back = page.getByTestId("login-back");
check("tombol kembali tampil", (await back.count()) > 0);
check("tombol kembali bisa diklik", await back.isEnabled());
await back.click();
await page.waitForTimeout(2000);
check(
  "kembali tidak nyangkut di /login",
  !page.url().includes("/login") || page.url().endsWith("/"),
  page.url().replace(BASE, ""),
);

console.log("\n== 2. LOGIN DENGAN ?next=/login TIDAK MEMUTAR BALIK ==");
await page.goto(`${BASE}/login?next=%2Flogin`, { waitUntil: "load" });
await page.waitForTimeout(2200);
await page.getByTestId("tab-email").click();
await page.waitForTimeout(300);
await page.getByTestId("input-email").fill("admin@nemu.local");
await page.getByTestId("input-password").fill("nemuadmin123");
await page.getByTestId("submit-login-email").click();
await page.waitForTimeout(7000);
const landed = page.url().replace(BASE, "");
check("mendarat di dalam aplikasi, bukan balik ke login", landed.startsWith("/app"), landed);
check("tidak ada pesan salah kata sandi", !/salah/i.test(await page.locator("body").innerText()));

console.log("\n== 3. KLIK ITEM TIDAK LAGI ERROR ==");
await page.goto(`${BASE}/app/database/items`, { waitUntil: "networkidle" });
const rowBtn = page
  .locator('[data-testid="db-scroll"] button', { hasText: /[A-Z]{2,}-?[0-9A-Z]/ })
  .first();
for (let i = 0; i < 20 && (await rowBtn.count()) === 0; i += 1) await page.waitForTimeout(500);
check("daftar item tampil", (await rowBtn.count()) > 0);
const before = errs.length;
await rowBtn.click();
await page.waitForTimeout(4000);
const sheet = page.locator('[role="dialog"]');
check("detail item terbuka", (await sheet.count()) > 0);
const sheetText = (await sheet.count()) ? await sheet.innerText() : "";
check(
  "tidak ada layar 'couldn't load'",
  !/couldn.t load/i.test(await page.locator("body").innerText()),
);
check(
  "tidak ada error render baru",
  errs.length === before,
  errs.slice(before, before + 2).join(" | "),
);

console.log("\n== 4. MIN/MAX JELAS SEBAGAI BATAS PENGAMAN ==");
check("label 'Batas minimum stok'", /batas minimum stok/i.test(sheetText), "");
check("label 'Batas maksimum stok'", /batas maksimum stok/i.test(sheetText), "");
check("ada penjelasan batas pengaman", /batas pengaman/i.test(sheetText));
check("ada penjelasan stok hanya lewat transaksi", /transaksi atau opname/i.test(sheetText));
const maxInput = page.locator("#item-max");
check("kolom batas maksimum bisa diisi", (await maxInput.count()) > 0);
if (await maxInput.count()) {
  check("kolom batas maksimum aktif", await maxInput.isEnabled());
}

console.log("\n== 5. EFEK LOADING ==");
check("bilah progres navigasi ada di DOM", (await page.getByTestId("nav-progress").count()) > 0);
// Klik menu lalu lihat bilah berubah status.
await page.keyboard.press("Escape");
await page.waitForTimeout(800);
const link = page.locator('aside a[href="/app/laporan"]').first();
if (await link.count()) {
  // Pantau status bilah SELAMA navigasi. Di lokal navigasi selesai <320 ms,
  // sehingga membaca sekali di akhir bisa keburu "idle" dan tampak gagal.
  const seen = new Set();
  const watcher = (async () => {
    for (let i = 0; i < 40; i += 1) {
      const st = await page
        .getByTestId("nav-progress")
        .getAttribute("data-state")
        .catch(() => null);
      if (st) seen.add(st);
      if (seen.has("loading")) break;
      await page.waitForTimeout(50);
    }
  })();

  await link.click();
  await watcher;
  check(
    "bilah aktif saat pindah halaman",
    seen.has("loading") || seen.has("done"),
    [...seen].join("/") || "tidak terlihat",
  );
  await page.waitForTimeout(3500);
  check("halaman laporan terbuka", page.url().includes("/laporan"), page.url().replace(BASE, ""));
}

await browser.close();
console.log(`\n${"-".repeat(52)}`);
console.log(`  lulus ${pass} · gagal ${fail}`);
process.exit(fail === 0 ? 0 : 1);

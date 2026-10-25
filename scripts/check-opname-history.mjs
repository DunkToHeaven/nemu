#!/usr/bin/env node
/** Visual check: riwayat transaksi item pada baris opname. */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const browser = await chromium.launch({ channel: "chromium" });
const ctx = await browser.newContext({ locale: "id" });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(e.message.slice(0, 200)));

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.getByTestId("tab-email").waitFor({ state: "visible", timeout: 60_000 });
// Klik tab Email dengan retry — di dev server hidrasi bisa telat sehingga
// klik pertama jatuh sebelum React memasang handler.
for (let attempt = 0; attempt < 6; attempt++) {
  await page.getByTestId("tab-email").click();
  await page.waitForTimeout(1200);
  if ((await page.getByTestId("input-email").count()) > 0) break;
}
await page.getByTestId("input-email").fill("admin@nemu.local");
await page.getByTestId("input-password").fill("nemuadmin123");
await page.getByTestId("submit-login-email").click();
await page.waitForURL(/\/app/, { timeout: 30_000 });

await page.goto(`${BASE}/app/opname`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
await page.getByTestId("opname-new-session").click();
const sel = page.getByTestId("opname-location");
await sel.waitFor({ state: "visible", timeout: 20_000 });
const opts = await sel.locator("option:not([value=''])").allInnerTexts();
// Pilih lokasi yang punya barang (baris pertama selalu berhasil di script lama).
await sel.selectOption({ index: 1 });
await page.getByTestId("opname-create-submit").click();
await page.waitForTimeout(3000);
if ((await page.locator('[data-testid="opname-lines"]').count()) === 0) {
  console.log("lokasi kosong, coba lokasi berikutnya...");
  await page.getByTestId("opname-new-session").click();
  await sel.waitFor({ state: "visible", timeout: 20_000 });
  for (let i = 2; i <= opts.length; i++) {
    await sel.selectOption({ index: i });
    await page.getByTestId("opname-create-submit").click();
    await page.waitForTimeout(2500);
    if ((await page.locator('[data-testid^="opname-history-toggle-"]').count()) > 0) break;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    await page.getByTestId("opname-new-session").click();
    await sel.waitFor({ state: "visible", timeout: 20_000 });
  }
}

const histBtn = page.locator('[data-testid^="opname-history-toggle-"]').first();
await histBtn.click();
await page.waitForTimeout(4000);

const panel = page.locator('[data-testid="opname-history-expand"]');
const rows = page.locator('[data-testid^="opname-history-row-"]');
console.log("rows:", await rows.count(), "| expand-btn:", await panel.count());
const texts = await rows.allInnerTexts();
texts.forEach((t, i) => console.log(`  #${i}: ${t.replace(/\s+/g, " ").trim()}`));
const toggleText = await histBtn.innerText();
console.log("toggle label:", toggleText.replace(/\s+/g, " ").trim());
const shot = await page.screenshot({ path: "opname-history.png", fullPage: false });
console.log("screenshot: opname-history.png");
console.log("errors:", errs.join(" | ") || "none");
await browser.close();

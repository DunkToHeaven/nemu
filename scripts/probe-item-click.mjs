#!/usr/bin/env node
/** Kenapa klik item di halaman database langsung error? */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "https://operated-harmony-retrieved-worship.trycloudflare.com";
const browser = await chromium.launch({ channel: "chromium" });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const errs = [];
page.on("pageerror", (e) => errs.push(`pageerror: ${e.message.slice(0, 220)}`));
page.on("console", (m) => {
  if (m.type() === "error") errs.push(`console: ${m.text().slice(0, 220)}`);
});
page.on("response", async (r) => {
  if (r.url().includes("/api/v1/") && r.status() >= 400) {
    let body = "";
    try {
      body = (await r.text()).slice(0, 200);
    } catch {
      /* abaikan */
    }
    console.log(`  ${r.status()} ${r.url().replace(BASE, "")} -> ${body}`);
  }
});

// Login dulu.
await page.goto(`${BASE}/login`, { waitUntil: "load" });
await page.waitForTimeout(2000);
await page.getByTestId("tab-email").click();
await page.waitForTimeout(300);
await page.getByTestId("input-email").fill("admin@nemu.local");
await page.getByTestId("input-password").fill("nemuadmin123");
await page.getByTestId("submit-login-email").click();
await page.waitForURL(/\/app/, { timeout: 30_000 });
console.log("login ->", page.url());

// Buka halaman database lewat navigasi UI (bukan goto langsung): cookie sesi
// dipasang untuk domain tunnel, dan goto penuh kadang mendahului penulisan cookie.
await page.goto(`${BASE}/app`, { waitUntil: "load" });
await page.waitForTimeout(2500);
await page.goto(`${BASE}/app/database/items`, { waitUntil: "networkidle" });
await page.waitForTimeout(5000);
// Tabel ini VIRTUAL: barisnya div di dalam [data-testid=db-scroll], bukan
// <tbody><tr>. Menghitung "tbody tr" selalu 0 walau data ada.
const rowSel = '[data-testid="db-scroll"] button';
for (let i = 0; i < 24; i += 1) {
  if ((await page.locator(rowSel).count()) > 0) break;
  await page.waitForTimeout(500);
}
let body = await page.locator("body").innerText();
console.log("halaman database:", body.replace(/\s+/g, " ").slice(0, 160));

// Klik baris item pertama.
// Pilih tombol baris yang memuat SKU (bukan tombol toolbar).
const itemBtn = page
  .locator('[data-testid="db-scroll"] button', { hasText: /[A-Z]{2,}-?[0-9A-Z]/ })
  .first();
const count = await page.locator('[data-testid="db-scroll"] button').count();
console.log("tombol di area tabel:", count);
if (await itemBtn.count()) {
  console.log("baris dipilih:", (await itemBtn.innerText()).replace(/\s+/g, " ").slice(0, 100));
  await itemBtn.click();
  await page.waitForTimeout(5000);
  console.log("url setelah klik:", page.url());
  const dialog = page.locator('[role="dialog"]');
  if (await dialog.count()) {
    console.log("dialog terbuka:", (await dialog.innerText()).replace(/\s+/g, " ").slice(0, 260));
  } else {
    body = await page.locator("body").innerText();
    console.log("tanpa dialog; isi:", body.replace(/\s+/g, " ").slice(0, 260));
  }
}

console.log("error:", errs.slice(0, 5).join("\n  ") || "tidak ada");
await browser.close();

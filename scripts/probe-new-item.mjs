#!/usr/bin/env node
/** Probe form buat item: apakah tombol Simpan benar-benar mengirim permintaan? */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const browser = await chromium.launch({ channel: "chromium" });
const context = await browser.newContext();
const page = await context.newPage();

const reqs = [];
page.on("response", async (res) => {
  if (res.url().includes("/api/v1/items") && res.request().method() === "POST") {
    let body = "";
    try {
      body = JSON.stringify(await res.json()).slice(0, 200);
    } catch {
      /* tanpa body */
    }
    reqs.push(`${res.status()} ${body}`);
  }
});
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errs.push(`console: ${m.text().slice(0, 200)}`);
});

await page.goto(`${BASE}/login`, { waitUntil: "load" });
await page.getByTestId("input-code").fill("ADM01");
await page.getByTestId("input-pin").fill("2468");
await page.getByTestId("submit-login").click();
await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 30_000 });

await page.goto(`${BASE}/app/database/items?new=1`, { waitUntil: "load" });
await page.waitForTimeout(1500);

const sku = `PRB-${Date.now().toString(36).toUpperCase().slice(-6)}`;
await page.getByTestId("new-item-sku").fill(sku);
await page.getByTestId("new-item-name").fill("Item Probe");
await page.getByTestId("new-item-min").fill("3");

// Kategori/satuan: apakah terisi?
const cat = await page.getByTestId("new-item-category").inputValue();
const unit = await page.getByTestId("new-item-unit").inputValue();
console.log("kategori terpilih:", JSON.stringify(cat));
console.log("satuan terpilih  :", JSON.stringify(unit));

const btn = page.getByTestId("new-item-save");
console.log("tombol disabled  :", await btn.isDisabled());
await btn.click();
await page.waitForTimeout(3000);

console.log("permintaan POST  :", reqs.length ? reqs.join(" | ") : "TIDAK ADA");
const alertText = await page
  .locator('[role="alert"]')
  .first()
  .textContent()
  .catch(() => null);
console.log("pesan error UI   :", JSON.stringify(alertText));
console.log(
  "sheet masih buka :",
  await page
    .getByTestId("new-item-sku")
    .isVisible()
    .catch(() => false),
);
console.log("pageerror        :", errs.slice(0, 3).join(" | ") || "tidak ada");

await browser.close();

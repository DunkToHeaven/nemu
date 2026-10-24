#!/usr/bin/env node
/** Apakah badge "Menyambung" berubah jadi "Tersambung", atau macet? */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const browser = await chromium.launch({ channel: "chromium" });
const page = await (await browser.newContext()).newPage();

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
await page.getByTestId("tab-email").click();
await page.waitForTimeout(300);
await page.getByTestId("input-email").fill("admin@nemu.local");
await page.getByTestId("input-password").fill("nemuadmin123");
await page.getByTestId("submit-login-email").click();
await page.waitForURL(/\/app/, { timeout: 30_000 });

for (const path of ["/app/database/items", "/app/opname"]) {
  console.log(`\n${path}`);
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  for (const wait of [0, 500, 1500, 3000, 6000]) {
    if (wait) await page.waitForTimeout(wait);
    const txt = await page.locator("body").innerText();
    const connecting = /menyambung/i.test(txt);
    const connected = /tersambung/i.test(txt);
    console.log(`  +${wait}ms: menyambung=${connecting} tersambung=${connected}`);
    if (connected) break;
  }
}

await browser.close();

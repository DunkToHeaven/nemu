#!/usr/bin/env node
/** Probe satu rute: status, pageerror, console error, judul. */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const ROUTE = process.env.ROUTE ?? "/app/opname";
const CODE = process.env.CODE ?? "SPV01";
const PIN = process.env.PIN ?? "1357";

const browser = await chromium.launch({ channel: "chromium" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 300)}`);
});

await page.goto(`${BASE}/login`, { waitUntil: "load" });
await page.getByTestId("input-code").fill(CODE);
await page.getByTestId("input-pin").fill(PIN);
await page.getByTestId("submit-login").click();
await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 30_000 });

await page.goto(`${BASE}${ROUTE}`, { waitUntil: "load" });
await page.waitForTimeout(2500);

const title = await page.title();
const lang = await page.getAttribute("html", "lang");
const bodyLen = (await page.locator("body").innerText()).length;
const h1 = await page
  .locator("h1")
  .first()
  .textContent()
  .catch(() => null);

console.log(`rute      : ${ROUTE}`);
console.log(`judul     : ${JSON.stringify(title)}`);
console.log(`lang      : ${JSON.stringify(lang)}`);
console.log(`panjang teks body: ${bodyLen}`);
console.log(`h1        : ${JSON.stringify(h1)}`);
console.log(`error (${errors.length}):`);
for (const e of errors.slice(0, 6)) console.log(`  - ${e}`);

await browser.close();

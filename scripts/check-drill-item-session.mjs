/**
 * Regresi bug: Laporan -> drill card -> klik item harus MENDARAT di halaman
 * item dengan data, TANPA dialog "Sesi berakhir".
 */
import { chromium } from "@playwright/test";
const BASE = process.env.BASE ?? "http://localhost:3100";
let pass = 0, fail = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"} · ${name}`); ok ? pass++ : fail++; };

const browser = await chromium.launch({ channel: "chromium" });
const ctx = await browser.newContext({ locale: "id" });
const page = await ctx.newPage();
page.on("response", (r) => {
  const u = r.url();
  if (u.includes("/api/") && r.status() >= 400) console.log("  API>", r.status(), u.replace(BASE, "").slice(0, 80));
});

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
for (let i = 0; i < 8; i++) {
  await page.getByTestId("tab-email").click().catch(() => {});
  await page.waitForTimeout(900);
  if ((await page.getByTestId("input-email").count()) > 0) break;
}
await page.getByTestId("input-email").fill("admin@nemu.local");
await page.getByTestId("input-password").fill("nemuadmin123");
await page.getByTestId("submit-login-email").click();
await page.waitForURL(/\/app/, { timeout: 30_000 });

// jalur 1: drill sheet dari card laporan
await page.goto(`${BASE}/app/laporan`, { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid^="drill-card-"]', { timeout: 30_000 });
await page.locator('[data-testid^="drill-card-"]').first().click();
await page.waitForSelector('[role="dialog"] a[href^="/app/item/"]', { timeout: 20_000 });
const href = await page.locator('[role="dialog"] a[href^="/app/item/"]').first().getAttribute("href");
await page.locator('[role="dialog"] a[href^="/app/item/"]').first().click();
await page.waitForURL("**/app/item/**", { timeout: 20_000 });
// konten data tampil (bukan skeleton terus)
await page.waitForFunction(() => {
  const main = document.querySelector("main");
  return main && /STOK RAK|Lokasi item|Kembali/i.test(main.innerText) && main.querySelectorAll(".animate-pulse").length < 3;
}, { timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(2000);
const body = await page.locator("body").innerText();
check(`item open via drill (${href})`, page.url().includes("/app/item/"));
check("tidak ada dialog 'Sesi berakhir'", !/sesi berakhir/i.test(body));
check("ada data item (STOK RAK / lokasi)", /STOK RAK/i.test(body));
await page.screenshot({ path: "shots/fix-drill-item.png" });

// jalur 2: back -> laporan -> klik baris needsCount (bukan sheet)
await page.goBack({ waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid^="drill-needs-"], [data-testid^="drill-dead-"]', { timeout: 20_000 }).catch(() => {});
const rowLink = page.locator('[data-testid^="drill-needs-"], [data-testid^="drill-dead-"]').first();
if (await rowLink.count()) {
  await rowLink.click();
  await page.waitForURL("**/app/item/**", { timeout: 20_000 });
  await page.waitForTimeout(6000);
  const b2 = await page.locator("body").innerText();
  check("item via baris needsCount: tanpa dialog", !/sesi berakhir/i.test(b2));
  check("item via baris needsCount: ada data", /STOK RAK/i.test(b2));
}

console.log(`\nlulus ${pass} · gagal ${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);

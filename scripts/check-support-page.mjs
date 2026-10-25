/**
 * Visual check: logo baru, homepage (link Dukung Kreator), halaman /support
 * lengkap dengan Saweria + kontak, redirect /docs.
 */
import { chromium } from "@playwright/test";
const BASE = process.env.BASE ?? "http://localhost:3100";
let pass = 0, fail = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"} · ${name}`); ok ? pass++ : fail++; };

const browser = await chromium.launch({ channel: "chromium" });
const ctx = await browser.newContext({ locale: "id", viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// 1. Homepage: logo baru + tautan support
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
const logo = page.locator('svg[aria-label="Logo Nemu"]').first();
check("logo baru (aria-label 'Logo Nemu') tampil", (await logo.count()) > 0);
const fill = await logo.evaluate((el) => {
  const r = el.querySelector("rect");
  const p = el.querySelector("path");
  return { rect: r?.getAttribute("fill"), path: p?.getAttribute("fill") };
});
console.log("  logo fill:", JSON.stringify(fill));
check("logo warna #AD3400 + N putih", fill.rect === "#AD3400" && fill.path === "#FFFFFF");
const body = await page.locator("body").innerText();
check("nav 'Dukung Kreator' ada", /Dukung Kreator/.test(body));
check("'Dokumentasi' hilang", !/Dokumentasi/.test(body));
check("credit kreator ada", /Muhamad Fillah Alifan/.test(body));
await page.screenshot({ path: "shots/support-home.png" });

// 2. Klik nav support
await page.locator('a[href="/support"]').first().click();
await page.waitForURL("**/support", { timeout: 20_000 });
await page.waitForTimeout(2000);
const sb = await page.locator("body").innerText();
check("halaman /support terbuka", page.url().includes("/support"));
check("judul 'Dukung Kreator Nemu'", /Dukung/.test(sb) && /Kreator Nemu/i.test(sb));
check("tombol Saweria -> saweria.co/itgoyo", await page.locator('a[href="https://saweria.co/itgoyo"]').first().isVisible());
check("email kreator tampil", /fillahalifan0@gmail\.com/.test(sb));
check("WhatsApp tampil", /0831-2074-2763/.test(sb) && /wa\.me\/6283120742763/.test(await page.content()));
check("GitHub Dunktoheaven tampil", /Dunktoheaven/.test(sb) && /github\.com\/Dunktoheaven/.test(await page.content()));
check("Instagram @fill.in.data tampil", /@fill\.in\.data/.test(sb));
check("3 cara dukungan tampil", /Kontribusi kode/.test(sb) && /Ceritakan ke tim gudang lain/.test(sb));
await page.screenshot({ path: "shots/support-page.png", fullPage: true });

// 3. Redirect /docs
await page.goto(`${BASE}/docs`, { waitUntil: "domcontentloaded" });
check("/docs redirect ke /support", page.url().includes("/support"));

// 4. EN locale
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await page.getByTestId("locale-toggle").click();
await page.waitForTimeout(800);
await page.getByRole("menuitem", { name: /English/i }).click().catch(async () => {
  await page.locator('[role="menu"] button, [role="menu"] [role="menuitem"]').last().click();
});
await page.waitForTimeout(2500);
const eb = await page.locator("body").innerText();
check("EN: nav 'Support the Creator'", /Support the Creator/.test(eb));
await page.goto(`${BASE}/support`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);
const esb = await page.locator("body").innerText();
check("EN: halaman support ikut English", /Support/.test(esb) && /Saweria/.test(esb) && !/Dukung/.test(esb));

console.log(`\nlulus ${pass} · gagal ${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);

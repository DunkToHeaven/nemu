// Visual check Tema 6: fokus card tren tidak lagi "kotak hitam", sidebar "Perkecil",
// tab database "Sync", istilah supply chain. Jalankan: node scripts/check-theme6.mjs
import { chromium } from "@playwright/test";

const BASE = process.env.BASE || "http://localhost:3100";
let pass = 0, fail = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"} · ${name}`); ok ? pass++ : fail++; };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
// hidrasi dev lambat -> retry klik tab email
for (let i = 0; i < 6; i++) {
  try { await page.locator('[data-testid="tab-email"]').click({ timeout: 3000 }); } catch {}
  try {
    await page.locator('input[name="email"], #email, input[type="email"]').first().fill("admin@nemu.local", { timeout: 3000 });
    break;
  } catch { await page.waitForTimeout(1500); }
}
await page.locator('input[type="password"]').first().fill("nemuadmin123");
await page.locator('button[type="submit"]').first().click();
await page.waitForURL(/\/app/, { timeout: 30_000 });

// 1. Dashboard: klik card tren, pastikan tidak ada outline hitam di SVG
const chart = page.getByTestId("trend-chart").first();
await chart.waitFor({ state: "visible", timeout: 20_000 });
const svg = chart.locator("svg").first();
await chart.click({ position: { x: 300, y: 90 } });
await page.waitForTimeout(400);
const outline = await svg.evaluate((el) => {
  const cs = getComputedStyle(el);
  return { style: cs.outlineStyle, width: cs.outlineWidth, color: cs.outlineColor, focused: el === document.activeElement };
});
console.log("  svg outline:", JSON.stringify(outline));
const blackBox = outline.style !== "none" && parseFloat(outline.width) >= 3;
check("klik card tren: tidak ada outline hitam", !blackBox);
await page.screenshot({ path: "shots/theme6-trend-focus.png" });

// 2. Sidebar bawah: label "Perkecil"
const body = await page.locator("body").innerText();
check("sidebar menampilkan 'Perkecil'", /Perkecil/.test(body));
check("sidebar tidak lagi 'Lainnya' di rail bawah", !(await page.locator('aside button:has-text("Lainnya")').count()));

// 3. Database: tab "Sync"
await page.goto(`${BASE}/app/database/impor`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
const dbText = await page.locator("body").innerText();
check("halaman database: tab 'Sync'", /Sync/.test(dbText));

// 4. Istilah supply chain di dashboard
await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);
const dashText = await page.locator("body").innerText();
check("dashboard: 'Kustodi' muncul", /Kustodi/i.test(dashText));
check("dashboard: 'safety stock' muncul", /safety stock/i.test(dashText));
check("dashboard: tidak ada 'Sedang saya bawa'", !/Sedang saya bawa/i.test(dashText));

console.log(`\nlulus ${pass} · gagal ${fail}`);
await browser.close();
process.exit(fail ? 1 : 0);

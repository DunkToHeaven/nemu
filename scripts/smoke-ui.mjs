#!/usr/bin/env node
/**
 * Uji UI dengan database aktif.
 *
 * Membuktikan frontend benar-benar memakai data dari Postgres: login lewat
 * form, dashboard memuat, pencarian mengembalikan item nyata, dan halaman item
 * menampilkan stok hasil agregasi log.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
let failures = 0;

function check(name, cond, detail = "") {
  if (cond) console.log(`  OK    ${name}`);
  else {
    failures += 1;
    console.log(`  GAGAL ${name} ${detail}`);
  }
}

const browser = await chromium.launch({ channel: "chromium" });
const ctx = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 160)));

try {
  console.log("\n== login lewat UI ==");
  await page.goto("/login");
  await page.getByTestId("input-code").fill("WRK01");
  await page.getByTestId("input-pin").fill("1122");
  await page.getByTestId("submit-login").click();
  await page.waitForURL(/\/app/, { timeout: 25_000 });
  check("login mengarah ke /app", page.url().includes("/app"));

  await page.waitForTimeout(2500);
  const mainText = await page.locator("#main").innerText();
  check("dashboard punya isi", mainText.length > 50, `panjang ${mainText.length}`);
  check("tidak ada pesan sesi habis", !mainText.includes("Sesi berakhir"));

  console.log("\n== pencarian memakai data database ==");
  await page.goto("/app/cari?q=bearing");
  await page.waitForTimeout(3000);
  const searchText = await page.locator("#main").innerText();
  check("hasil pencarian berisi 'Bearing'", /bearing/i.test(searchText), searchText.slice(0, 120));

  console.log("\n== halaman item ==");
  // Ambil kode item nyata dari API lalu buka halamannya.
  const api = await ctx.request.get(`${BASE}/api/v1/items/search?q=bearing&limit=1`);
  const payload = await api.json();
  const code = payload.data?.[0]?.item?.code;
  check("API mengembalikan kode item", Boolean(code), JSON.stringify(payload).slice(0, 120));

  if (code) {
    await page.goto(`/i/${code}`);
    await page.waitForTimeout(2500);
    const itemText = await page.locator("body").innerText();
    check("halaman item menampilkan nama", /bearing/i.test(itemText), itemText.slice(0, 120));
    check("halaman item menampilkan stok", /\d+\s*(pcs|set|box|kg|L|m)/i.test(itemText));
  }

  console.log("\n== admin: modul database ==");
  const admin = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 900 } });
  const ap = await admin.newPage();
  await ap.goto("/login");
  await ap.getByTestId("input-code").fill("ADM01");
  await ap.getByTestId("input-pin").fill("2468");
  await ap.getByTestId("submit-login").click();
  await ap.waitForURL(/\/app/, { timeout: 25_000 });
  await ap.waitForTimeout(1500);

  for (const route of [
    "/app/database/items",
    "/app/database/lokasi",
    "/admin/setup",
    "/admin/integrations/google",
  ]) {
    const res = await ap.goto(route);
    await ap.waitForTimeout(1800);
    const ok = res?.status() === 200;
    check(`${route} 200`, ok, `status ${res?.status()}`);
  }

  console.log("\n== error runtime ==");
  check("tidak ada pageerror", pageErrors.length === 0, JSON.stringify(pageErrors.slice(0, 3)));

  await admin.close();
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\n  SEMUA UJI UI LULUS\n" : `\n  ${failures} UJI UI GAGAL\n`);
process.exit(failures === 0 ? 0 : 1);

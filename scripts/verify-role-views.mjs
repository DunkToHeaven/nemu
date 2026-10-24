#!/usr/bin/env node
/**
 * Bukti akhir: admin baru melihat tampilan ADMIN, worker melihat tampilan WORKER.
 *
 * Menguji keduanya sekaligus supaya tidak ada yang "lulus" hanya karena
 * kebetulan semua orang melihat menu yang sama.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  if (ok) {
    pass += 1;
    console.log(`  OK    ${name}${detail ? `  (${detail})` : ""}`);
  } else {
    fail += 1;
    console.log(`  GAGAL ${name}${detail ? `  (${detail})` : ""}`);
  }
}

/** Menu yang HANYA terlihat untuk supervisor/admin. */
const ADMIN_ONLY = ["Laporan", "Opname", "Transaksi", "Pengaturan", "Setup awal", "Audit"];

const browser = await chromium.launch({ channel: "chromium" });

async function navText(page) {
  const nav = await page.locator("nav a, [data-testid='nav'] a, aside a").allInnerTexts();
  return nav.join(" ").replace(/\s+/g, " ");
}

console.log("\n== ADMIN BARU (hasil sign up) ==");
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const stamp = Date.now().toString(36);
  await page.goto(`${BASE}/signup`, { waitUntil: "load" });
  await page.getByTestId("signup-org").fill("Org Peran");
  await page.getByTestId("signup-name").fill("Admin Peran");
  await page.getByTestId("signup-email").fill(`peran-${stamp}@uji.local`);
  await page.getByTestId("signup-password").fill("rahasia12345");
  await page.getByTestId("signup-submit").click();
  await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 30_000 });

  // Tunggu sampai peran termuat (menu admin muncul), bukan sekadar waktu tetap.
  await page
    .locator("aside a, nav a")
    .filter({ hasText: /Laporan/ })
    .first()
    .waitFor({ state: "attached", timeout: 20_000 })
    .catch(() => null);

  const text = await navText(page);
  const found = ADMIN_ONLY.filter((m) => text.includes(m));
  check("admin baru melihat menu admin", found.length >= 3, found.join(", "));
  check("menu Setup awal terlihat", text.includes("Setup awal"));
  check("menu Audit terlihat", text.includes("Audit"));

  // Bisa membuka rute admin langsung tanpa dialihkan.
  const res = await page.request.get(`${BASE}/admin/settings`, { maxRedirects: 0 });
  check("rute /admin/settings bisa dibuka admin", res.status() === 200, `status ${res.status()}`);
  await ctx.close();
}

console.log("\n== WORKER (dibuat admin) ==");
{
  // Admin membuat worker lewat API, lalu worker login lewat UI.
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const stamp = Date.now().toString(36);

  const signup = await page.request.post(`${BASE}/api/v1/auth/signup`, {
    data: {
      orgName: "Org Worker",
      name: "Admin Worker",
      email: `wk-${stamp}@uji.local`,
      password: "rahasia12345",
    },
  });
  check("signup admin untuk uji worker", signup.status() === 201, `status ${signup.status()}`);

  const created = await page.request.post(`${BASE}/api/v1/users`, {
    data: { name: "Pekerja Uji", code: `PW${stamp.slice(-4).toUpperCase()}`, role: "worker" },
  });
  const body = await created.json();
  check("admin membuat worker", created.status() === 201, body?.user?.code);

  const wctx = await browser.newContext();
  const wp = await wctx.newPage();
  await wp.goto(`${BASE}/login`, { waitUntil: "load" });
  await wp.getByTestId("input-code").fill(body.user.code);
  await wp.getByTestId("input-pin").fill(body.initialPin);
  await wp.getByTestId("submit-login").click();
  await wp.waitForURL(/\/app(\/|$|\?)/, { timeout: 30_000 });
  await wp.waitForTimeout(3000);

  const wtext = await navText(wp);
  const wfound = ADMIN_ONLY.filter((m) => wtext.includes(m));
  check("worker TIDAK melihat menu admin", wfound.length === 0, wfound.join(", ") || "tidak ada");

  // Worker yang mengetik URL admin harus dialihkan.
  const res = await wp.request.get(`${BASE}/admin/settings`, { maxRedirects: 0 });
  check("worker dialihkan dari /admin/settings", res.status() === 307, `status ${res.status()}`);

  await wctx.close();
  await ctx.close();
}

await browser.close();
console.log(`\n${"-".repeat(50)}`);
console.log(`  lulus ${pass} · gagal ${fail}`);
process.exit(fail === 0 ? 0 : 1);

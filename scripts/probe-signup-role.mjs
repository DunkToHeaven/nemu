#!/usr/bin/env node
/**
 * Buktikan penyebab halaman tampil seperti worker setelah sign up.
 *
 * Dugaan: SessionProvider memakai `role: data?.role ?? "worker"`. Saat data sesi
 * belum termuat (query masih pending), UI merender menu worker lebih dulu, lalu
 * tidak pernah memperbarui ke admin karena cache dianggap masih segar.
 */
import { chromium } from "@playwright/test";

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const browser = await chromium.launch({ channel: "chromium" });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const sessionCalls = [];
page.on("response", async (res) => {
  if (res.url().includes("/api/v1/auth/session")) {
    sessionCalls.push(res.status());
  }
});

await page.goto(`${BASE}/signup`, { waitUntil: "load" });
const email = `probe-${Date.now().toString(36)}@uji.local`;
await page.getByTestId("signup-org").fill("Probe Org");
await page.getByTestId("signup-name").fill("Probe Admin");
await page.getByTestId("signup-email").fill(email);
await page.getByTestId("signup-password").fill("rahasia12345");
await page.getByTestId("signup-submit").click();
await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 30_000 });

// Amati menu apa yang muncul segera setelah mendarat, lalu beberapa detik kemudian.
const menuEarly = await page.locator("nav a, [data-testid='nav'] a").allInnerTexts();
await page.waitForTimeout(4000);
const menuLate = await page.locator("nav a, [data-testid='nav'] a").allInnerTexts();

// Menu yang hanya untuk admin/supervisor
const ADMIN_MENU = ["Laporan", "Opname", "Transaksi", "Pengguna", "Pengaturan", "Setup"];
const hasAdminEarly = ADMIN_MENU.some((m) => menuEarly.join(" ").includes(m));
const hasAdminLate = ADMIN_MENU.some((m) => menuLate.join(" ").includes(m));

console.log(`\n== setelah sign up (${email}) ==`);
console.log("panggilan /auth/session:", sessionCalls.join(", ") || "TIDAK ADA");
console.log("menu awal   :", JSON.stringify(menuEarly.filter(Boolean).slice(0, 10)));
console.log("menu akhir  :", JSON.stringify(menuLate.filter(Boolean).slice(0, 10)));
console.log("menu admin terlihat awal :", hasAdminEarly);
console.log("menu admin terlihat akhir:", hasAdminLate);

// Coba buka halaman admin langsung.
await page.goto(`${BASE}/app/database/pengguna`, { waitUntil: "load" });
await page.waitForTimeout(2500);
console.log("buka /app/database/pengguna ->", new URL(page.url()).pathname);
const usersBody = await page.locator("body").innerText();
console.log("ada tombol tambah pengguna :", (await page.getByTestId("add-user").count()) > 0);
console.log("ditolak?                   :", /denied|ditolak/i.test(usersBody));

await browser.close();

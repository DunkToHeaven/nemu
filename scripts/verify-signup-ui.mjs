#!/usr/bin/env node
/**
 * Uji halaman /signup lewat browser: pendaftaran harus bisa dilakukan
 * pengunjung biasa, tanpa akun apa pun.
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

const browser = await chromium.launch({ channel: "chromium" });

console.log("\n== 1. HOMEPAGE PUNYA JALAN KE DAFTAR ==");
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await page.waitForTimeout(800);
  const signupLinks = await page.locator('a[href="/signup"]').count();
  check("ada tautan ke /signup", signupLinks > 0, `${signupLinks} tautan`);
  const body = await page.locator("body").innerText();
  check("hero menyebut masalah nyata (bukan jargon)", /hilang|missing/i.test(body));
  await ctx.close();
}

console.log("\n== 2. DAFTAR DARI HALAMAN SIGNUP ==");
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const stamp = Date.now().toString(36);
  await page.goto(`${BASE}/signup`, { waitUntil: "load" });
  await page.waitForTimeout(600);

  await page.getByTestId("signup-org").fill("CV Uji Browser");
  await page.getByTestId("signup-name").fill("Sari Admin");
  await page.getByTestId("signup-email").fill(`sari-${stamp}@uji.local`);
  await page.getByTestId("signup-password").fill("rahasia12345");

  const submit = page.getByTestId("signup-submit");
  check("tombol daftar aktif setelah form valid", !(await submit.isDisabled()));
  await submit.click();

  let landed = false;
  try {
    await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 30_000 });
    landed = true;
  } catch {
    landed = false;
  }
  check("pendaftaran langsung masuk dashboard", landed, new URL(page.url()).pathname);

  const cookies = await ctx.cookies();
  check(
    "sesi tersimpan",
    cookies.some((c) => c.name === "nemu_session"),
  );

  // Dashboard gudang baru harus kosong.
  await page.waitForTimeout(2000);
  const dash = await page.locator("body").innerText();
  check("dashboard bisa dibuka setelah daftar", /dashboard|beranda/i.test(dash));

  // Admin baru bisa membuka menu Pengguna untuk membuat akun pekerja.
  await page.goto(`${BASE}/app/database/pengguna`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const usersPage = await page.locator("body").innerText();
  check("admin baru bisa membuka menu Pengguna", !/denied|ditolak/i.test(usersPage));
  const addUser = await page.getByTestId("add-user").count();
  check("tombol tambah pengguna tersedia", addUser > 0);

  await ctx.close();
}

console.log("\n== 3. EMAIL SAMA DITOLAK DI UI ==");
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const email = `dupe-${Date.now().toString(36)}@uji.local`;
  await page.goto(`${BASE}/signup`, { waitUntil: "load" });
  await page.getByTestId("signup-org").fill("Org Pertama");
  await page.getByTestId("signup-name").fill("Admin Satu");
  await page.getByTestId("signup-email").fill(email);
  await page.getByTestId("signup-password").fill("rahasia12345");
  await page.getByTestId("signup-submit").click();
  await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 30_000 }).catch(() => null);
  await ctx.close();

  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await page2.goto(`${BASE}/signup`, { waitUntil: "load" });
  await page2.getByTestId("signup-org").fill("Org Kedua");
  await page2.getByTestId("signup-name").fill("Admin Dua");
  await page2.getByTestId("signup-email").fill(email);
  await page2.getByTestId("signup-password").fill("rahasia12345");
  await page2.getByTestId("signup-submit").click();
  await page2.waitForTimeout(3000);
  const alert = await page2
    .locator('[role="alert"]')
    .first()
    .textContent()
    .catch(() => null);
  check("email duplikat diberi pesan jelas", Boolean(alert), (alert ?? "").slice(0, 60));
  await ctx2.close();
}

await browser.close();
console.log(`\n${"-".repeat(50)}`);
console.log(`  lulus ${pass} · gagal ${fail}`);
process.exit(fail === 0 ? 0 : 1);

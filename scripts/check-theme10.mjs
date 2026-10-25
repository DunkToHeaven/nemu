/** Cek Tema 10: copy landing baru, logo round, tanpa demo account/credit/proof. */
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3100";
let pass = 0;
let fail = 0;
const ok = (cond, label) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  cond ? pass++ : fail++;
};

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();

// --- Homepage ---
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForTimeout(500);

const body = await page.locator("body").innerText();
ok(body.includes("Pakai Nemu") && body.includes("Pasti Ketemu"), "hero 'Pakai Nemu, Pasti Ketemu.'");
ok(
  body.includes("Open Source · Gratis Selamanya · Tanpa Iklan"),
  "badge 'Open Source · Gratis Selamanya · Tanpa Iklan'",
);
ok(body.includes("Mulai Gratis Sekarang"), "CTA 'Mulai Gratis Sekarang'");
ok(body.includes("Lihat Cara Kerjanya"), "CTA sekunder 'Lihat Cara Kerjanya'");
ok(body.includes("Didesain untuk operasional gudang yang bergerak cepat"), "heading keunggulan baru");
ok(body.includes("Tempel QR di Rak") && body.includes("Pasang kode unik di setiap titik penyimpanan."), "step 01 + sub");
ok(body.includes("Scan & Input") && body.includes("Cukup pakai browser HP pekerja lapangan."), "step 02 + sub");
ok(body.includes("Stok & Nama Tercatat") && body.includes("Mutasi stok langsung terupdate otomatis."), "step 03 + sub");
ok(body.includes("Tidak ada angka yang bisa diubah diam-diam"), "pillar 1 Immutable Ledger");
ok(body.includes("Sinyal hilang? Kerja tetap jalan"), "pillar 2 Offline");
ok(body.includes("Supervisor tahu dalam hitungan detik"), "pillar 3 Real-Time");
ok(body.includes("Excel dan Sheets tetap bisa dipakai"), "pillar 4 Spreadsheet");
ok(!body.includes("Dibuat independent oleh"), "kredit kreator hilang");
ok(!body.includes("Bearing 6205"), "kartu proof Bearing hilang");
ok(!body.includes("Akun demo") && !(await page.getByTestId("demo-accounts").count()), "blok akun demo hilang");
ok(!(await page.locator('[role="img"][aria-label*="🦊"]').count()), "tidak ada emoji di halaman");

// logo rounded
const rx = await page.evaluate(() => {
  const svg = document.querySelector('svg[aria-label="Logo Nemu"] rect');
  return svg ? svg.getAttribute("rx") : null;
});
ok(rx === "300", `logo rx=300 (dapat ${rx})`);

// --- Support page: tombol kembali ---
await page.goto(`${BASE}/support`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
const back = page.locator('header a[href="/"][aria-label="Kembali"]');
ok((await back.count()) === 1, "tombol Kembali di header /support");
await back.click();
await page.waitForURL(`${BASE}/`, { timeout: 8000 });
ok(page.url() === `${BASE}/`, "tombol Kembali mengarah ke homepage");

await browser.close();
console.log(`\n${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);

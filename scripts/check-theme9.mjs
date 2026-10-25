/** Cek Tema 9: deskripsi+harga di form item, harga hanya saat receive, card tren harga. */
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3100";
let pass = 0;
let fail = 0;
const ok = (cond, label) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  cond ? pass++ : fail++;
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message.slice(0, 140)));

// login
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByTestId("tab-email").click();
await page.getByTestId("input-email").fill("admin@nemu.local");
await page.getByTestId("input-password").fill("nemuadmin123");
await page.getByTestId("submit-login-email").click();
await page.waitForURL(/\/app/, { timeout: 15000 });

// metadata (lokasi pertama)
const firstLoc = await page.evaluate(async () => {
  const j = await (await fetch("/api/v1/locations?limit=10")).json();
  return j.data[0]?.id ?? null;
});
ok(Boolean(firstLoc), `lokasi didapat (${firstLoc})`);

// --- 1. form item baru: Deskripsi + Harga ---
const sku = `TST${Date.now().toString(36).toUpperCase().slice(-5)}`;
await page.goto(`${BASE}/app/database/items?new=1`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
await page.getByTestId("new-item-sku").fill(sku);
const NAME = `Bearing Uji ${sku}`;
await page.getByTestId("new-item-name").fill(NAME);
await page.getByTestId("new-item-price").fill("52000");
await page.getByTestId("new-item-description").fill("Garansi resmi, supplier PT ABC");
await page.getByTestId("new-item-save").click();
await page.waitForTimeout(2200);

const created = await page.evaluate(async (s) => {
  const j = await (await fetch("/api/v1/items?limit=200&all=1")).json();
  return j.data.find((it) => it.sku === s) ?? null;
}, sku);
ok(Boolean(created), "item baru dibuat lewat form");
ok(created?.unitValue === 52000, `harga tersimpan (${created?.unitValue})`);
ok(created?.description === "Garansi resmi, supplier PT ABC", "deskripsi tersimpan");

// --- 2. sheet edit: harga & deskripsi terisi + bisa diubah ---
await page.goto(`${BASE}/app/database/items`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
await page.getByTestId("db-search").fill(NAME);
await page.waitForTimeout(1500);
await page.getByText(NAME).first().click();
await page.waitForTimeout(900);
const priceVal = await page.getByTestId("edit-item-price").inputValue();
const descVal = await page.getByTestId("edit-item-description").inputValue();
ok(priceVal === "52000", `sheet edit menampilkan harga (${priceVal})`);
ok(descVal.startsWith("Garansi resmi"), "sheet edit menampilkan deskripsi");
await page.getByTestId("edit-item-price").fill("53500");
await page.getByRole("button", { name: /simpan/i }).first().click();
await page.waitForTimeout(2000);
const afterEdit = await page.evaluate(async (s) => {
  const j = await (await fetch("/api/v1/items?limit=200&all=1")).json();
  return j.data.find((it) => it.sku === s)?.unitValue ?? null;
}, sku);
ok(afterEdit === 53500, `harga update tersimpan (${afterEdit})`);

// beri stok awal via API receive (item baru belum punya lokasi/stok)
await page.evaluate(
  async (arg) => {
    await fetch("/api/v1/transactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        itemCode: arg.code,
        type: "receive",
        qty: 1,
        unitPrice: 53500,
        idempotencyKey: `t9-seed-${Date.now()}`,
        scanMethod: "in_app_scanner",
        toLocationId: arg.loc,
      }),
    });
  },
  { code: created.code, loc: firstLoc },
);
await page.waitForTimeout(800);

// --- 3. scan: harga hanya ada di receive ---
await page.goto(`${BASE}/i/${created.code}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
ok(!(await page.getByTestId("unit-price-input").count()), "mode Ambil (default): tanpa input harga");

await page.getByRole("tab", { name: /^Masuk$/i }).click();
await page.waitForTimeout(600);
ok((await page.getByTestId("unit-price-input").count()) === 1, "mode Masuk (receive): input harga muncul");

await page.getByTestId("qty-input").fill("4");
await page.getByTestId("unit-price-input").fill("55000");
await page.getByTestId("submit-take").click();
await page.waitForTimeout(3000);
const savedTx = await page.evaluate(async (id) => {
  const j = await (await fetch(`/api/v1/transactions?itemId=${id}&limit=5`)).json();
  return j.data.map((t) => ({ type: t.type, qty: t.qty, price: t.unitPrice ?? null }));
}, created.id);
ok(
  savedTx.some((t) => t.type === "receive" && t.price === 55000),
  `receive dengan harga 55000 tercatat (${JSON.stringify(savedTx.slice(0, 2))})`,
);

// mode Kembali: input harga harus hilang
await page.goto(`${BASE}/i/${created.code}`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.getByRole("tab", { name: /^Kembali$/i }).click();
await page.waitForTimeout(700);
ok(!(await page.getByTestId("unit-price-input").count()), "mode Kembali (return): tanpa input harga");

// receive kedua di harga lain (sengaja via API, tanggal berbeda tidak bisa dipaksa; delta tetap teruji di unit API)
await page.evaluate(
  async (arg) => {
    await fetch("/api/v1/transactions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        itemCode: arg.code,
        type: "receive",
        qty: 2,
        unitPrice: 60000,
        idempotencyKey: `t9-second-${Date.now()}`,
        scanMethod: "in_app_scanner",
        toLocationId: arg.loc,
      }),
    });
  },
  { code: created.code, loc: firstLoc },
);

// --- 4. laporan: card tren harga + drill ---
await page.goto(`${BASE}/app/laporan`, { waitUntil: "networkidle" });
// tunggu query laporan + price-history (pooler bisa 2-3 detik)
await page.getByTestId(`price-row-${created.id}`).waitFor({ state: "attached", timeout: 20000 }).catch(() => {});
const bodyText = await page.locator("body").innerText();
ok(bodyText.toLowerCase().includes("tren harga"), "card 'Tren harga perolehan' tampil");
ok(bodyText.includes(NAME), "item receive berharga muncul di card");

await page.getByTestId(`price-row-${created.id}`).click();
await page.waitForTimeout(900);
ok((await page.getByTestId("price-chart").count()) === 1, "klik baris membuka grafik harga per tanggal");
await page.screenshot({ path: "shots/theme9-price-card.png", fullPage: false });

await browser.close();
console.log(`\n${pass} lulus, ${fail} gagal`);
process.exit(fail ? 1 : 0);

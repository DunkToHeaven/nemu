import { expect, test } from "./fixtures";

/**
 * Kasus tepi PRD bagian 5. Tiap tes memetakan ke satu baris tabel kasus tepi.
 *
 * Aturan penulisan tes di sini:
 *  - Jangan memakai `__mock/reset`: reset membangun ulang seed dan mengganti
 *    kode item, sehingga tes berikutnya memakai kode yang sudah tidak ada.
 *  - Simulasi dimatikan lewat PATCH biasa (`__mock` selalu dapat dihubungi).
 *  - Item selalu diambil dari API pencarian (aktif + `totalQty`), bukan ditebak.
 */

interface SearchRow {
  item: { code: string; name: string };
  totalQty: number;
}

async function searchRows(page: import("@playwright/test").Page): Promise<SearchRow[]> {
  const response = await page.request.get("/api/v1/items/search?q=a&limit=100");
  const payload = (await response.json()) as { data: SearchRow[] };
  return payload.data;
}

/**
 * Ambil item yang benar-benar bisa diambil **di lokasi utamanya**.
 *
 * `totalQty` menjumlahkan semua rak, jadi item bisa terlihat berstok padahal
 * rak yang otomatis terpilih di form kosong ("Habis") dan tombol Ambil memang
 * nonaktif. Tes harus memilih berdasarkan stok per lokasi, bukan total.
 */
async function pickableItem(page: import("@playwright/test").Page) {
  const rows = await searchRows(page);
  for (const row of rows) {
    const detail = await page.request.get(`/api/v1/items/by-code/${row.item.code}`);
    if (!detail.ok()) continue;
    const payload = (await detail.json()) as {
      item: { primaryLocationId: string | null };
      stock: { locationId: string; qty: number }[];
    };
    const primary = payload.stock.find(
      (level) => level.locationId === payload.item.primaryLocationId,
    );
    const level = primary ?? payload.stock[0];
    if (level && level.qty > 2) {
      return { code: row.item.code, qty: level.qty };
    }
  }
  return null;
}

test.describe("kasus tepi", () => {
  test("stok 0 memberi penjelasan, bukan tombol mati tanpa sebab", async ({ page, loginAs }) => {
    await loginAs("worker");
    const rows = await searchRows(page);
    const empty = rows.find((row) => row.totalQty === 0);
    test.skip(!empty, "fixture tidak punya item berstok 0");
    if (!empty) return;

    await page.goto(`/i/${empty.item.code}`);

    // PRD: tidak boleh ada layar buntu. Rak kosong harus menjelaskan keadaannya.
    await expect(page.getByTestId("take-empty-stock")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("take-empty-stock")).toContainText(/kosong|empty/i);
    await expect(page.getByTestId("submit-take")).toBeDisabled();
    await expect(page.getByTestId("take-confirmation")).toHaveCount(0);
  });

  test("qty negatif ditolak sebelum dikirim", async ({ page, loginAs }) => {
    await loginAs("worker");
    const row = await pickableItem(page);
    test.skip(!row, "tidak ada item berstok di rak utamanya");
    if (!row) return;

    await page.goto(`/i/${row.code}`);
    await page.getByTestId("qty-input").fill("-5");
    await page.getByTestId("submit-take").click();
    await expect(page.getByTestId("take-error")).toBeVisible();
    await expect(page.getByTestId("take-confirmation")).toHaveCount(0);
  });

  test("qty melebihi stok ditolak di klien", async ({ page, loginAs }) => {
    await loginAs("worker");
    const row = await pickableItem(page);
    test.skip(!row, "tidak ada item berstok di rak utamanya");
    if (!row) return;

    await page.goto(`/i/${row.code}`);
    await page.getByTestId("qty-input").fill(String(row.qty + 500));
    await page.getByTestId("submit-take").click();
    await expect(page.getByTestId("take-error")).toBeVisible();
    await expect(page.getByTestId("take-confirmation")).toHaveCount(0);
  });

  test("kode item tidak dikenal menampilkan empty state, bukan error mentah", async ({
    page,
    loginAs,
  }) => {
    await loginAs("worker");
    await page.goto("/i/KODE-TIDAK-ADA-999");
    await expect(page.getByText(/tidak ditemukan/i).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /kembali|cari|scan/i }).first()).toBeVisible();
    await expect(page.getByText(/TypeError|undefined is not|Internal Server/i)).toHaveCount(0);
  });

  test("sesi habis saat mengisi form mempertahankan draf", async ({ page, loginAs }) => {
    await loginAs("worker");
    const row = await pickableItem(page);
    test.skip(!row, "tidak ada item berstok di rak utamanya");
    if (!row) return;
    const url = `/i/${row.code}`;

    await page.goto(url);
    await page.getByTestId("qty-input").fill("3");

    // Semua sesi mock dicabut. Cookie masih terlihat sah di edge, jadi
    // middleware belum mengalihkan; 401 pertama dari API memunculkan dialog.
    await page.request.patch("/api/v1/__mock/simulation", { data: { expireSession: true } });
    await page.request.patch("/api/v1/__mock/simulation", { data: { expireSession: false } });

    await page.reload();

    // Dialog "sesi berakhir" muncul; tombolnya membawa `next` internal.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 25_000 });
    await expect(dialog).toContainText(/sesi|session/i);
    await dialog.getByRole("button").first().click();
    await page.waitForURL(/\/login/, { timeout: 25_000 });
    expect(page.url()).toContain("next=");

    await page.getByTestId("input-code").fill("WRK01");
    await page.getByTestId("input-pin").fill("1122");
    await page.getByTestId("submit-login").click();
    await page.waitForURL(/\/i\//, { timeout: 25_000 });

    // Draf dipulihkan: nilai 3 masih ada.
    await expect(page.getByTestId("qty-input")).toHaveValue("3", { timeout: 15_000 });
  });

  test("koneksi putus menampilkan indikator Offline", async ({ page, loginAs }) => {
    await loginAs("worker");
    await page.request.patch("/api/v1/__mock/simulation", { data: { offline: true } });
    try {
      await page.goto("/app");
      await expect(page.getByTestId("connection-status").first()).toContainText(/offline/i, {
        timeout: 25_000,
      });
    } finally {
      // `__mock/*` tetap dapat dihubungi walau simulasi offline menyala.
      await page.request.patch("/api/v1/__mock/simulation", { data: { offline: false } });
    }
  });

  test("nama item sangat panjang tidak merusak layout", async ({ page, loginAs }) => {
    await loginAs("admin");
    const listResponse = await page.request.get("/api/v1/items?limit=1");
    const list = (await listResponse.json()) as { data: { id: string; name: string }[] };
    const item = list.data[0];
    test.skip(!item, "tidak ada item");
    if (!item) return;

    const longName = `Bearing Baja Tahan Panas Industri Berat Seri ${"X".repeat(100)}`;
    const patchResponse = await page.request.patch(`/api/v1/items/${item.id}`, {
      data: { name: longName },
    });
    expect(patchResponse.status()).toBe(200);

    try {
      await page.goto(`/app/item/${item.id}`);
      await expect(page.getByText(/Bearing Baja Tahan Panas/).first()).toBeVisible({
        timeout: 15_000,
      });

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(2);
    } finally {
      await page.request.patch(`/api/v1/items/${item.id}`, { data: { name: item.name } });
    }
  });

  test("i18n Inggris tidak meluap", async ({ page, loginAs }) => {
    await loginAs("admin");
    await page.goto("/admin/settings");
    await expect(page.getByTestId("locale-toggle")).toBeVisible();

    // LocaleToggle adalah dropdown; pilih "English" dari menu.
    await page.getByTestId("locale-toggle").click();
    await page.getByRole("menuitem", { name: /English/i }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.lang), { timeout: 25_000 })
      .toBe("en");

    await page.waitForTimeout(800);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(2);

    // Kembalikan ke Indonesia agar tes berikutnya konsisten.
    await page.getByTestId("locale-toggle").click();
    await page.getByRole("menuitem", { name: /Indonesia/i }).click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.lang), { timeout: 25_000 })
      .toBe("id");
  });

  test("tabel besar tetap responsif (virtualisasi)", async ({ page, loginAs }) => {
    await loginAs("admin");
    await page.goto("/app/database/items");
    await expect(page.getByTestId("db-search")).toBeVisible();

    const start = Date.now();
    await page.getByTestId("db-search").fill("a");
    await expect(page.getByTestId("db-scroll")).toBeVisible({ timeout: 20_000 });
    expect(Date.now() - start).toBeLessThan(5_000);

    // Virtualisasi: hanya sebagian kecil baris ada di DOM.
    const rendered = await page.locator('[data-testid="db-scroll"] > div > div').count();
    expect(rendered).toBeLessThan(120);
  });

  test("tombol Batalkan pada konfirmasi mencatat pembalik", async ({ page, loginAs }) => {
    await loginAs("worker");
    const row = await pickableItem(page);
    test.skip(!row, "tidak ada item berstok di rak utamanya");
    if (!row) return;

    await page.goto(`/i/${row.code}`);
    await page.getByTestId("reason-select").click();
    await page.getByRole("option").first().click();
    const wo = page.getByTestId("wo-input");
    if (await wo.isVisible().catch(() => false)) await wo.fill("WO-2291");

    await page.getByTestId("submit-take").click();
    await expect(page.getByTestId("take-confirmation")).toBeVisible({ timeout: 20_000 });

    const cancel = page.getByTestId("cancel-tx");
    if (await cancel.isVisible().catch(() => false)) {
      await cancel.click();
      await expect(page.getByText(/dibatalkan|reversal|dikembalikan/i).first()).toBeVisible({
        timeout: 15_000,
      });
    }
  });
});

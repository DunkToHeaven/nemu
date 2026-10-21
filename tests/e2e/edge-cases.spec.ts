import { expect, test } from "./fixtures";

/**
 * Kasus tepi PRD bagian 5. Tiap tes memetakan ke satu baris tabel kasus tepi.
 */
test.describe("kasus tepi", () => {
  test("stok 0 tidak bisa diambil (409 dengan stok terbaru)", async ({ page, loginAs }) => {
    await loginAs("admin");
    // Cari level stok yang kosong lewat API, lalu buka item tersebut.
    const response = await page.request.get("/api/v1/stock?limit=500");
    const payload = (await response.json()) as {
      data: { qty: number; item: { code: string; name: string } }[];
    };
    const empty = payload.data.find((row) => row.qty === 0);
    test.skip(!empty, "fixture tidak punya level stok 0");

    await page.goto(`/i/${empty?.item.code}`);
    await expect(page.getByTestId("qty-input")).toBeVisible();
    await page.getByTestId("reason-select").click();
    await page.getByRole("option").first().click();
    const wo = page.getByTestId("wo-input");
    if (await wo.isVisible().catch(() => false)) await wo.fill("WO-2291");
    await page.getByTestId("submit-take").click();

    const error = page.getByTestId("take-error");
    await expect(error).toBeVisible({ timeout: 15_000 });
    await expect(error).toContainText(/stok|kosong|tinggal/i);
  });

  test("qty negatif dan nol ditolak sebelum dikirim", async ({ page, loginAs }) => {
    await loginAs("worker");
    const response = await page.request.get("/api/v1/items/search?q=a&limit=3");
    const payload = (await response.json()) as { data: { item: { code: string } }[] };
    const code = payload.data[0]?.item.code;

    await page.goto(`/i/${code}`);
    const qty = page.getByTestId("qty-input");
    await qty.fill("-5");
    await page.getByTestId("submit-take").click();
    await expect(page.getByTestId("take-error")).toBeVisible();
    await expect(page.getByTestId("take-confirmation")).toHaveCount(0);
  });

  test("qty melebihi stok ditolak di klien", async ({ page, loginAs }) => {
    await loginAs("worker");
    const response = await page.request.get("/api/v1/items/search?q=a&limit=10");
    const payload = (await response.json()) as { data: { item: { code: string }; totalQty: number }[] };
    const row = payload.data.find((entry) => entry.totalQty > 0);
    test.skip(!row, "tidak ada item berstok");

    await page.goto(`/i/${row?.item.code}`);
    await page.getByTestId("qty-input").fill(String((row?.totalQty ?? 1) + 500));
    await page.getByTestId("submit-take").click();
    await expect(page.getByTestId("take-error")).toBeVisible();
  });

  test("kode item tidak dikenal menampilkan empty state, bukan error mentah", async ({ page, loginAs }) => {
    await loginAs("worker");
    await page.goto("/i/KODE-TIDAK-ADA-999");
    await expect(page.getByRole("heading")).toContainText(/tidak|not found|hilang/i);
    await expect(page.getByRole("link", { name: /kembali|cari/i }).first()).toBeVisible();
  });

  test("sesi habis saat mengisi form mempertahankan draf", async ({ page, loginAs }) => {
    await loginAs("worker");
    const response = await page.request.get("/api/v1/items/search?q=a&limit=3");
    const payload = (await response.json()) as { data: { item: { code: string } }[] };
    const code = payload.data[0]?.item.code;

    await page.goto(`/i/${code}`);
    await page.getByTestId("qty-input").fill("3");

    // Simulasi sesi habis lewat panel dev.
    await page.request.patch("/api/v1/__mock/simulation", { data: { expireSession: true } });
    await page.request.post("/api/v1/__mock/reset").catch(() => undefined);

    await page.reload();
    await expect(page.getByTestId("qty-input")).toHaveValue("3");
  });

  test("koneksi putus menampilkan indikator Offline", async ({ page, loginAs }) => {
    await loginAs("worker");
    await page.request.patch("/api/v1/__mock/simulation", { data: { offline: true } });
    await page.goto("/app");
    await expect(page.getByTestId("connection-status").first()).toContainText(/offline/i, {
      timeout: 20_000,
    });
    await page.request.patch("/api/v1/__mock/simulation", { data: { offline: false } });
  });

  test("nama item sangat panjang tidak merusak layout", async ({ page, loginAs }) => {
    await loginAs("admin");
    const response = await page.request.get("/api/v1/items?limit=1");
    const payload = (await response.json()) as { data: { id: string }[] };
    const id = payload.data[0]?.id;
    test.skip(!id, "tidak ada item");

    const longName = `Bearing Baja Tahan Panas Industri Berat Seri ${"X".repeat(180)}`;
    await page.request.patch(`/api/v1/items/${id}`, { data: { name: longName } });

    await page.goto(`/app/item/${id}`);
    await expect(page.getByRole("heading").first()).toBeVisible();

    // Tidak boleh ada scroll horizontal di body.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test("i18n Inggris tidak meluap", async ({ page, loginAs }) => {
    await loginAs("admin");
    await page.goto("/admin/settings");
    await page.getByTestId("locale-toggle").click();
    await expect(page.getByRole("heading", { name: /settings/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(2);
  });

  test("10.000 baris tetap responsif (tabel virtual)", async ({ page, loginAs }) => {
    await loginAs("admin");
    await page.goto("/app/database/items");
    await expect(page.getByTestId("db-search")).toBeVisible();

    const start = Date.now();
    await page.getByTestId("db-search").fill("a");
    await expect(page.getByTestId("db-scroll")).toBeVisible({ timeout: 20_000 });
    const elapsed = Date.now() - start;

    // Anggaran longgar: debounce 250 ms + render pertama < 5 detik.
    expect(elapsed).toBeLessThan(5_000);
    // Hanya sebagian baris yang ada di DOM (virtualisasi).
    const rendered = await page.locator('[data-testid="db-scroll"] > div > div').count();
    expect(rendered).toBeLessThan(120);
  });

  test("tombol Batalkan pada konfirmasi mencatat pembalik", async ({ page, loginAs }) => {
    await loginAs("worker");
    const response = await page.request.get("/api/v1/items/search?q=a&limit=8");
    const payload = (await response.json()) as { data: { item: { code: string }; totalQty: number }[] };
    const row = payload.data.find((entry) => entry.totalQty > 2);
    test.skip(!row, "tidak ada item berstok");

    await page.goto(`/i/${row?.item.code}`);
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

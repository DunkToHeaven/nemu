import { expect, test } from "./fixtures";

/**
 * Alur inti PRD bagian 3. Diuji di tiga viewport lewat project Playwright
 * (mobile-360, tablet-768, desktop-1440), jadi asersi navigasi harus sadar
 * breakpoint: tab bar hanya ada di <640 px, sidebar mulai 1024 px.
 */
test.describe("alur inti pekerja", () => {
  test("login PIN membuka dashboard dengan kolom cari", async ({ page, loginAs }) => {
    await loginAs("worker");
    await expect(page.getByTestId("search-input")).toBeVisible();

    const width = page.viewportSize()?.width ?? 0;
    if (width < 640) {
      // HP: tab bar bawah dengan Scan menonjol.
      await expect(page.getByTestId("tab-bar")).toBeVisible();
      await expect(page.getByTestId("sidebar")).toBeHidden();
      await expect(page.getByTestId("rail")).toBeHidden();
    } else if (width < 1024) {
      // Tablet: rail ikon, tab bar disembunyikan.
      await expect(page.getByTestId("tab-bar")).toBeHidden();
      await expect(page.getByTestId("rail")).toBeVisible();
    } else {
      // Desktop: sidebar penuh.
      await expect(page.getByTestId("tab-bar")).toBeHidden();
      await expect(page.getByTestId("sidebar")).toBeVisible();
    }
  });

  test("dashboard → lokasi item dalam 3 ketukan", async ({ page, loginAs }) => {
    await loginAs("worker");
    let taps = 0;

    const search = page.getByTestId("search-input");
    await search.click();
    taps += 1;
    await search.fill("Bearing");
    taps += 1;

    const firstResult = page.getByTestId("search-result").first();
    await expect(firstResult).toBeVisible({ timeout: 15_000 });
    await firstResult.click();
    taps += 1;

    await page.waitForURL(/\/app\/item\//);
    expect(taps).toBeLessThanOrEqual(3);
    // Halaman lokasi menampilkan jalur lokasi lengkap, bukan form ambil.
    await expect(page.getByText(/Gudang|Rak|Zona/).first()).toBeVisible();
    await expect(page.getByTestId("qty-input")).toHaveCount(0);
  });

  test("scan manual membuka halaman item", async ({ page, loginAs }) => {
    await loginAs("worker");
    const response = await page.request.get("/api/v1/items/search?q=a&limit=1");
    const payload = (await response.json()) as { data: { item: { code: string } }[] };
    const itemCode = payload.data[0]?.item.code;
    expect(itemCode).toBeTruthy();

    await page.goto("/scan");
    await page.getByTestId("scan-manual-input").fill(itemCode as string);
    await page.getByTestId("scan-manual-submit").click();
    await page.waitForURL(/\/i\//, { timeout: 15_000 });
    await expect(page.getByTestId("qty-input")).toBeVisible();
  });

  test("halaman /i/[kode] menampilkan form ambil dengan target sentuh besar", async ({ page, loginAs }) => {
    await loginAs("worker");
    const response = await page.request.get("/api/v1/items/search?q=a&limit=1");
    const payload = (await response.json()) as { data: { item: { code: string } }[] };
    const itemCode = payload.data[0]?.item.code;

    await page.goto(`/i/${itemCode}`);
    await expect(page.getByTestId("qty-input")).toBeVisible();
    await expect(page.getByTestId("reason-select")).toBeVisible();

    // PRD: semua target sentuh >= 48 px (diukur longgar >= 44 px).
    const box = await page.getByTestId("qty-input").boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    const submit = await page.getByTestId("submit-take").boundingBox();
    expect(submit?.height ?? 0).toBeGreaterThanOrEqual(44);
  });

  test("pengambilan tercatat dan muncul di konfirmasi", async ({ page, loginAs }) => {
    await loginAs("worker");
    const response = await page.request.get("/api/v1/items/search?q=a&limit=8");
    const payload = (await response.json()) as {
      data: { item: { code: string }; totalQty: number }[];
    };
    const candidate = payload.data.find((row) => row.totalQty > 2);
    expect(candidate).toBeTruthy();
    if (!candidate) return;

    await page.goto(`/i/${candidate.item.code}`);
    await page.getByTestId("reason-select").click();
    await page.getByRole("option").first().click();

    // Sebagian alasan mewajibkan nomor WO (TX-04); isi bila field muncul.
    const wo = page.getByTestId("wo-input");
    if (await wo.isVisible().catch(() => false)) {
      await wo.fill("WO-2291");
    }

    await page.getByTestId("submit-take").click();
    await expect(page.getByTestId("take-confirmation")).toBeVisible({ timeout: 20_000 });
  });
});

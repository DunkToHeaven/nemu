import { expect, test } from "./fixtures";

/**
 * Kriteria selesai #6: tidak ada role yang melihat menu atau data yang bukan
 * haknya. Tiga lapis diperiksa: menu (navForRole), rute (middleware), dan API.
 *
 * Catatan: di desktop sidebar juga merender tautan yang sama, jadi asersi menu
 * dibatasi ke <main id="main"> agar tidak bentrok dengan navigasi global.
 */
test.describe("isolasi role", () => {
  test("worker tidak melihat menu supervisor/admin", async ({ page, loginAs }) => {
    await loginAs("worker");
    await page.goto("/app/menu");
    const main = page.locator("#main");

    await expect(main.getByRole("link", { name: /^Beranda$/ })).toBeVisible();
    await expect(main.getByRole("link", { name: /^Riwayat$/ })).toBeVisible();
    await expect(main.getByRole("link", { name: /^Scan$/ })).toBeVisible();

    for (const forbidden of [/Transaksi/i, /Opname/i, /^Laporan$/, /Pengaturan/i, /^Audit$/, /Integrasi/i]) {
      await expect(main.getByRole("link", { name: forbidden })).toHaveCount(0);
    }
  });

  test("worker ditolak saat membuka rute supervisor lewat URL langsung", async ({ page, loginAs }) => {
    await loginAs("worker");
    for (const path of ["/app/opname", "/app/laporan", "/app/transaksi", "/app/database/lokasi", "/admin/settings"]) {
      const response = await page.request.get(path, { maxRedirects: 0 });
      expect(response.status(), `${path} harus ditolak untuk worker`).toBe(307);
    }
  });

  test("worker ditolak oleh API supervisor", async ({ page, loginAs }) => {
    await loginAs("worker");
    const queue = await page.request.get("/api/v1/verifications?status=pending");
    expect(queue.status()).toBe(403);
    const audit = await page.request.get("/api/v1/audit");
    expect(audit.status()).toBe(403);
  });

  test("supervisor melihat laporan & opname, bukan pengaturan", async ({ page, loginAs }) => {
    await loginAs("supervisor");
    await page.goto("/app/menu");
    const main = page.locator("#main");

    await expect(main.getByRole("link", { name: /^Opname$/ })).toBeVisible();
    await expect(main.getByRole("link", { name: /^Laporan$/ })).toBeVisible();
    await expect(main.getByRole("link", { name: /Pengaturan/i })).toHaveCount(0);
    await expect(main.getByRole("link", { name: /^Audit$/ })).toHaveCount(0);

    const settings = await page.request.get("/admin/settings", { maxRedirects: 0 });
    expect(settings.status()).toBe(307);
  });

  test("admin melihat menu pengaturan, audit, integrasi", async ({ page, loginAs }) => {
    await loginAs("admin");
    await page.goto("/app/menu");
    const main = page.locator("#main");

    await expect(main.getByRole("link", { name: /Pengaturan/i })).toBeVisible();
    await expect(main.getByRole("link", { name: /^Audit$/ })).toBeVisible();
    await expect(main.getByRole("link", { name: /Integrasi/i })).toBeVisible();
  });

  test("rute terlindung tanpa sesi dialihkan ke login dengan next internal", async ({ page }) => {
    await page.context().clearCookies();
    const response = await page.request.get("/app/opname", { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    const location = response.headers()["location"] ?? "";
    expect(location).toContain("/login");
    expect(location).toContain("next=%2Fapp%2Fopname");
  });

  test("next berbahaya diabaikan", async ({ page }) => {
    for (const hostile of ["https://evil.example", "//evil.example", "/\\evil.example"]) {
      await page.goto(`/login?next=${encodeURIComponent(hostile)}`);
      await page.getByTestId("input-code").fill("WRK01");
      await page.getByTestId("input-pin").fill("1122");
      await page.getByTestId("submit-login").click();
      await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 20_000 });
      expect(page.url()).not.toContain("evil.example");
      await page.context().clearCookies();
    }
  });
});

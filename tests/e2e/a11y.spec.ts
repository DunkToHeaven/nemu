import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";

/**
 * C4: axe-core tanpa pelanggaran serius/kritis pada rute utama, di dua tema.
 */
const ROUTES = [
  { path: "/login", role: null },
  { path: "/app", role: "worker" },
  { path: "/app/cari", role: "worker" },
  { path: "/app/riwayat", role: "worker" },
  { path: "/app/dibawa", role: "worker" },
  { path: "/app/antrean", role: "worker" },
  { path: "/app/opname", role: "supervisor" },
  { path: "/app/laporan", role: "supervisor" },
  { path: "/app/transaksi", role: "supervisor" },
  { path: "/app/database/items", role: "admin" },
  { path: "/admin/settings", role: "admin" },
  { path: "/admin/audit", role: "admin" },
  { path: "/admin/setup", role: "admin" },
] as const;

for (const route of ROUTES) {
  test(`axe: ${route.path}`, async ({ page, loginAs }) => {
    if (route.role) await loginAs(route.role);
    await page.goto(route.path);
    await page.waitForLoadState("networkidle").catch(() => undefined);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = results.violations.filter(
      (violation) => violation.impact === "serious" || violation.impact === "critical",
    );
    expect(
      serious.map(
        (violation) =>
          `${violation.id} (${violation.impact}) x${violation.nodes.length}: ${violation.help}`,
      ),
      `pelanggaran aksesibilitas serius di ${route.path}`,
    ).toEqual([]);
  });
}

test("axe: /app dalam mode gelap", async ({ page, loginAs }) => {
  await loginAs("worker");
  await page.goto("/app");
  await page.getByTestId("theme-toggle").click();
  await page.waitForTimeout(600);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  expect(serious.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
});

test("keyboard: Tab mencapai navigasi utama dan Ctrl+K membuka palette", async ({
  page,
  loginAs,
}) => {
  await loginAs("worker");
  await page.goto("/app");

  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("palette-input")).toBeVisible();
  await page.keyboard.press("Escape");

  // Tab pertama harus mendarat di skip-link.
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.textContent ?? "");
  expect(focused.toLowerCase()).toContain("lompat");
});

test("reduced motion tidak mematikan fungsionalitas", async ({ page, loginAs }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await loginAs("worker");
  await expect(page.getByTestId("search-input")).toBeVisible();
});

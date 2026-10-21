import { expect, type Page, test as base } from "@playwright/test";

export const ACCOUNTS = {
  worker: { code: "WRK01", pin: "1122" },
  supervisor: { code: "SPV01", pin: "1357" },
  admin: { code: "ADM01", pin: "2468" },
} as const;

export type Role = keyof typeof ACCOUNTS;

/** Login lewat UI supaya jalur PIN sungguhan ikut diuji. */
export async function login(page: Page, role: Role) {
  await page.goto("/login");
  const account = ACCOUNTS[role];
  await page.getByTestId("input-code").fill(account.code);
  await page.getByTestId("input-pin").fill(account.pin);
  await page.getByTestId("submit-login").click();
  await page.waitForURL(/\/app(\/|$|\?)/, { timeout: 20_000 });
}

export const test = base.extend<{ loginAs: (role: Role) => Promise<void> }>({
  loginAs: async ({ page }, use) => {
    await use(async (role: Role) => {
      await login(page, role);
    });
  },
});

export { expect };

/** Tidak boleh ada error React/konsol yang bocor ke pengguna. */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      const text = message.text();
      if (text.includes("favicon") || text.includes("Download the React DevTools")) return;
      errors.push(text);
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

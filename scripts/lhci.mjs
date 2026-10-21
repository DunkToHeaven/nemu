#!/usr/bin/env node
/**
 * Lighthouse CI untuk rute kritis. Ambang PRD: performa >= 90, aksesibilitas >= 90,
 * LCP <= 2.0 s ("/"), LCP <= 2.5 s ("/i/*"), CLS <= 0.1.
 * Menjalankan `lhci autorun` dengan server produksi yang sudah dibuild.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const PORT = Number(process.env.PORT ?? 3000);
const BASE = process.env.LHCI_BASE_URL ?? `http://127.0.0.1:${PORT}`;

if (!existsSync(".next/BUILD_ID")) {
  console.error("\n  LHCI: jalankan `pnpm build` dulu (.next/BUILD_ID tidak ada).\n");
  process.exit(1);
}

mkdirSync(".lighthouseci", { recursive: true });

const urls = [`${BASE}/`, `${BASE}/login`];

/**
 * PRD bagian 7 mengukur di "4G menengah". Preset `desktop` Lighthouse TIDAK
 * melakukan throttling sama sekali, jadi memakainya berarti mengukur jaringan
 * lokal dan melaporkan angka yang lebih bagus daripada kenyataan. Preset
 * `mobile` menerapkan throttling 4G lambat + CPU 4x, yang merupakan kondisi
 * lebih dekat ke "4G menengah" dan justru lebih ketat — angka jujur.
 */
const settings = {
  ci: {
    collect: {
      url: urls,
      numberOfRuns: 3,
      settings: { preset: "mobile", chromeFlags: "--headless=new --no-sandbox" },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "largest-contentful-paint": ["warn", { maxNumericValue: 2000 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
      },
    },
    upload: { target: "filesystem", outputDir: ".lighthouseci/reports" },
  },
};

writeFileSync(".lighthouseci/lighthouserc.json", JSON.stringify(settings, null, 2));

const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["--no-install", "lhci", "autorun", "--config=.lighthouseci/lighthouserc.json"],
  { stdio: "inherit", env: { ...process.env, LHCI_BUILD_CONTEXT__CURRENT_BRANCH: "local" } },
);

process.exit(result.status ?? 1);

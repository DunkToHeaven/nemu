/** Render logo Nemu (src/app/icon.svg) jadi PNG berbagai ukuran + favicon.ico. */

import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const svg = readFileSync("src/app/icon.svg", "utf8");
const sizes = { "src/app/icon.png": 512, "src/app/apple-icon.png": 180 };

const browser = await chromium.launch({ headless: true });

async function render(size) {
  const page = await (
    await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  ).newPage();
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg.replace(
      'viewBox="0 0 1920 1920"',
      `viewBox="0 0 1920 1920" width="${size}" height="${size}"`,
    )}</body></html>`,
  );
  const buf = await page.screenshot({ omitBackground: true });
  await page.close();
  return buf;
}

const png32 = await render(32);
for (const [path, size] of Object.entries(sizes)) {
  const buf = await render(size);
  writeFileSync(path, buf);
  console.log(`wrote ${path} ${size}px ${buf.length}B`);
}

// favicon.ico: header ICO + satu entri PNG 32x32 (didukung Windows Vista+ dan semua browser modern)
const ico = Buffer.alloc(6 + 16);
ico.writeUInt16LE(0, 0); // reserved
ico.writeUInt16LE(1, 2); // type = icon
ico.writeUInt16LE(1, 4); // jumlah gambar
ico.writeUInt8(32, 6); // width
ico.writeUInt8(32, 7); // height
ico.writeUInt8(0, 8); // palette
ico.writeUInt8(0, 9); // reserved
ico.writeUInt16LE(1, 10); // color planes
ico.writeUInt16LE(32, 12); // bpp
ico.writeUInt32LE(png32.length, 14); // ukuran data
ico.writeUInt32LE(22, 18); // offset data
writeFileSync("src/app/favicon.ico", Buffer.concat([ico, png32]));
console.log(`wrote src/app/favicon.ico ${22 + png32.length}B`);

await browser.close();

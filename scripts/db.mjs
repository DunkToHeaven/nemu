#!/usr/bin/env node
/**
 * Jalankan migrasi SQL lalu (opsional) seed.
 *
 *   pnpm db:migrate          -> terapkan semua migrasi yang belum jalan
 *   pnpm db:seed             -> isi data contoh
 *   pnpm db:reset            -> drop + migrate + seed
 *
 * Migrasi dicatat di tabel `schema_migrations` supaya idempoten: menjalankan
 * ulang tidak akan mengeksekusi file yang sama dua kali.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const CONNECTION = process.env.DATABASE_URL ?? "postgres://postgres@127.0.0.1:5432/nemu";
const DIR = "db/migrations";

const sql = postgres(CONNECTION, { max: 1, onnotice: () => {} });

async function ensureTable() {
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

async function migrate() {
  await ensureTable();
  const applied = new Set((await sql`SELECT name FROM schema_migrations`).map((r) => r.name));
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  lewati  ${file}`);
      continue;
    }
    const body = readFileSync(join(DIR, file), "utf8");
    process.stdout.write(`  terapkan ${file} ... `);
    try {
      await sql.unsafe(body);
      await sql`INSERT INTO schema_migrations (name) VALUES (${file})`;
      console.log("ok");
      count += 1;
    } catch (error) {
      console.log("GAGAL");
      throw new Error(`${file}: ${error instanceof Error ? error.message : error}`);
    }
  }
  console.log(count === 0 ? "  tidak ada migrasi baru." : `  ${count} migrasi diterapkan.`);
}

async function main() {
  const cmd = process.argv[2] ?? "migrate";

  if (cmd === "reset") {
    console.log("DROP SCHEMA public CASCADE ...");
    await sql.unsafe("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await migrate();
  } else if (cmd === "migrate") {
    await migrate();
  } else if (cmd === "seed") {
    // Seed dijalankan lewat tsx karena memakai alias `@/` dari tsconfig.
    const { spawnSync } = await import("node:child_process");
    const run = spawnSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["--no-install", "tsx", "scripts/seed-run.ts"],
      { stdio: "inherit", env: process.env },
    );
    if (run.status !== 0) throw new Error("seed gagal");
  } else {
    console.error(`perintah tidak dikenal: ${cmd}`);
    process.exitCode = 1;
  }

  await sql.end();
}

main().catch(async (error) => {
  console.error("\n  GAGAL:", error instanceof Error ? error.message : error, "\n");
  await sql.end();
  process.exit(1);
});

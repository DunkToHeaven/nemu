/**
 * Penjalan seed. Dipisah dari scripts/db.mjs supaya bisa memakai alias `@/`
 * dari tsconfig lewat tsx.
 */
/**
 * Penjalan seed. Dipisah dari scripts/db.mjs supaya bisa memakai alias `@/`
 * dari tsconfig lewat tsx.
 *
 * Dibungkus `main()` async, bukan top-level await: esbuild (dipakai tsx)
 * menolak modul dengan top-level await saat dimuat lewat CJS
 * (ERR_REQUIRE_ASYNC_MODULE).
 */
import { sql } from "@/server/db";
import { seed } from "@/server/seed";

async function main() {
  const result = await seed();
  console.log(
    `  seed selesai: ${result.items} item, ${result.transactions} transaksi, ${result.users} pengguna`,
  );
  await sql.end();
}

main().catch(async (error) => {
  console.error("  seed GAGAL:", error instanceof Error ? error.message : error);
  await sql.end();
  process.exit(1);
});

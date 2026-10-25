import { readFileSync } from "node:fs";
import postgres from "postgres";

const url = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const sql = postgres(url, { max: 1, prepare: false });
const slug = (await sql`SELECT slug FROM tenants LIMIT 1`)[0].slug;
const s = `tenant_${slug}`;

await sql.unsafe(`ALTER TABLE ${s}.transactions DISABLE TRIGGER forbid_tx_mutation`);
await sql.unsafe(
  `DELETE FROM ${s}.transactions WHERE id LIKE 'tx_probe%' OR idempotency_key LIKE 'harga-test%' OR idempotency_key LIKE 'fix-issue-check%' OR idempotency_key LIKE 'probe-%' OR idempotency_key LIKE 'reg-issue-check%' OR idempotency_key LIKE 'reg-ret-check%'`,
);
await sql.unsafe(`ALTER TABLE ${s}.transactions ENABLE TRIGGER forbid_tx_mutation`);
await sql.unsafe(`DELETE FROM ${s}.stock_levels WHERE item_id='itm_592da798'`);
await sql.unsafe(`DELETE FROM ${s}.audit_log WHERE entity_id='itm_592da798'`);
await sql.unsafe(`DELETE FROM ${s}.items WHERE id='itm_592da798'`);
console.log("probe dibersihkan");
await sql.end();

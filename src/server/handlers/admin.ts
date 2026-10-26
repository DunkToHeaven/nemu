/**
 * Admin: pengaturan, integrasi Google, impor, audit trail, dan sync offline.
 */
import { z } from "zod";
import type { AuthUser } from "@/server/auth";
import { tenantPool } from "@/server/db";
import { audit } from "@/server/handlers/master";
import { errors, ok, parseBody } from "@/server/http";
import { issueStock, moveStock } from "@/server/services/stock";

/* ----------------------------------------------------------- pengaturan */

export async function getSettings(tenant: string): Promise<Response> {
  const db = tenantPool(tenant);
  const rows = await db<
    {
      org_name: string;
      timezone: string;
      locale: string;
      shift_ends_at: string;
      min_stock_default: number;
      verify_quota_per_shift: number;
      verify_min_score: number;
      confidence_high: number;
      confidence_medium: number;
      custody_enabled: boolean;
      notify_telegram: boolean;
      notify_email: boolean;
    }[]
  >`
    SELECT org_name, timezone, locale, shift_ends_at, min_stock_default,
           verify_quota_per_shift, verify_min_score, confidence_high, confidence_medium,
           custody_enabled, notify_telegram, notify_email
    FROM settings WHERE id
  `;
  const s = rows[0];
  if (!s) throw errors.notFound("Pengaturan");

  return ok({
    settings: {
      orgName: s.org_name,
      timezone: s.timezone,
      locale: s.locale,
      shiftEndsAt: [s.shift_ends_at],
      verifyPromptEnabled: s.verify_quota_per_shift > 0,
      verifyMaxPerShift: s.verify_quota_per_shift,
      verifyCountThreshold: s.verify_min_score,
      verifyPMin: s.confidence_medium,
      verifyPMax: s.confidence_high,
      confidenceDecayDays: 30,
      custodyEnabled: s.custody_enabled,
      custodyOverdueHours: 24,
      defaultMinStock: s.min_stock_default,
      blindEveryN: 5,
      notifications: { telegram: s.notify_telegram, email: s.notify_email },
      branding: { accent: "#C2410C", logoText: "Nemu" },
    },
  });
}

const settingsPatch = z.object({
  orgName: z.string().trim().min(1).max(120).optional(),
  timezone: z.string().max(64).optional(),
  locale: z.enum(["id", "en"]).optional(),
  shiftEndsAt: z.array(z.string()).optional(),
  verifyPromptEnabled: z.boolean().optional(),
  verifyMaxPerShift: z.number().int().min(0).max(100).optional(),
  verifyCountThreshold: z.number().int().min(0).max(100).optional(),
  confidenceDecayDays: z.number().int().min(1).max(365).optional(),
  custodyEnabled: z.boolean().optional(),
  custodyOverdueHours: z.number().int().min(1).max(720).optional(),
  defaultMinStock: z.number().int().min(0).max(100_000).optional(),
  notifications: z
    .object({ telegram: z.boolean().optional(), email: z.boolean().optional() })
    .optional(),
});

export async function updateSettings(
  request: Request,
  user: AuthUser,
  tenant: string,
): Promise<Response> {
  const db = tenantPool(tenant);
  const body = await parseBody(request, settingsPatch);

  const cur = await db<{ org_name: string; timezone: string; locale: string }[]>`
    SELECT org_name, timezone, locale FROM settings WHERE id
  `;
  const c = cur[0];
  if (!c) throw errors.notFound("Pengaturan");

  await db`
    UPDATE settings SET
      org_name = ${body.orgName ?? c.org_name},
      timezone = ${body.timezone ?? c.timezone},
      locale = ${body.locale ?? c.locale},
      shift_ends_at = ${body.shiftEndsAt?.[0] ?? "16:00"},
      verify_quota_per_shift = ${body.verifyMaxPerShift ?? 10},
      verify_min_score = ${body.verifyCountThreshold ?? 55},
      custody_enabled = ${body.custodyEnabled ?? true},
      min_stock_default = ${body.defaultMinStock ?? 0},
      notify_telegram = ${body.notifications?.telegram ?? false},
      notify_email = ${body.notifications?.email ?? false},
      updated_at = now()
    WHERE id
  `;

  await audit(db, user.id, "settings", "org", "update", c, body);
  return getSettings(tenant);
}

/* ------------------------------------------------------ integrasi Google */

export async function getGoogle(tenant: string): Promise<Response> {
  const db = tenantPool(tenant);
  const rows = await db<
    {
      connected: boolean;
      account_email: string | null;
      folder_name: string | null;
      spreadsheet_id: string | null;
      spreadsheet_url: string | null;
      schema_version: number;
      app_schema_version: number;
      check_status: string;
      check_message: string | null;
      protected_ranges: number;
      scopes: string[];
      last_sync_at: Date | null;
    }[]
  >`
    SELECT connected, account_email, folder_name, spreadsheet_id, spreadsheet_url,
           schema_version, app_schema_version, check_status, check_message,
           protected_ranges, scopes, last_sync_at
    FROM google_integration WHERE id
  `;
  const g = rows[0];
  const runs = await db<
    {
      id: string;
      action: string;
      status: string;
      rows_sent: number;
      started_at: Date;
      finished_at: Date | null;
      message: string | null;
    }[]
  >`SELECT id, action, status::text AS status, rows_sent, started_at, finished_at, message
      FROM sync_runs ORDER BY started_at DESC LIMIT 20`;

  return ok({
    integration: {
      connected: g?.connected ?? false,
      accountEmail: g?.account_email ?? null,
      folderName: g?.folder_name ?? null,
      spreadsheetId: g?.spreadsheet_id ?? null,
      spreadsheetUrl: g?.spreadsheet_url ?? null,
      schemaVersion: String(g?.schema_version ?? 1),
      appSchemaVersion: String(g?.app_schema_version ?? 1),
      lastSyncAt: g?.last_sync_at ? g.last_sync_at.toISOString() : null,
      scopes: g?.scopes ?? [],
      protectedRanges: g?.protected_ranges ?? 0,
      checkStatus: (g?.check_status ?? "unknown") as "ok" | "warning" | "error" | "unknown",
      checkMessage: g?.check_message ?? null,
      runs: runs.map((r) => ({
        id: r.id,
        direction: r.action,
        status: r.status,
        rows: r.rows_sent,
        startedAt: r.started_at.toISOString(),
        finishedAt: r.finished_at ? r.finished_at.toISOString() : null,
        message: r.message,
      })),
    },
  });
}

/**
 * Operasi integrasi Google.
 *
 * PENTING: ini masih SIMULASI. Tidak ada panggilan ke Google API dan tidak ada
 * OAuth sungguhan — kredensial Google belum dikonfigurasi. Statusnya ditandai
 * jelas di pesan supaya tidak dikira sudah tersambung nyata.
 */
export async function googleAction(
  action: string,
  user: AuthUser,
  tenant: string,
): Promise<Response> {
  const db = tenantPool(tenant);
  const runId = `run_${crypto.randomUUID().slice(0, 8)}`;

  if (action === "connect") {
    await db`
      UPDATE google_integration SET
        connected = true, account_email = 'gudang@nemu.local',
        folder_name = 'Nemu - ' || (SELECT org_name FROM settings WHERE id),
        spreadsheet_id = 'simulated', spreadsheet_url = NULL,
        check_status = 'warning',
        check_message = 'SIMULASI: OAuth Google belum dikonfigurasi (GOOGLE_CLIENT_ID kosong). Tidak ada spreadsheet yang benar-benar dibuat.',
        protected_ranges = 0, scopes = ARRAY['drive.file'], updated_at = now()
      WHERE id
    `;
    await db`INSERT INTO sync_runs (id, action, status, rows_sent, message, finished_at)
      VALUES (${runId}, 'connect', 'sent', 0, 'simulasi', now())`;
    await audit(db, user.id, "integration", "google", "update", null, { connected: true });
  } else if (action === "check") {
    await db`UPDATE google_integration SET check_status = 'warning',
      check_message = 'SIMULASI: skema tidak diperiksa karena tidak ada spreadsheet nyata.',
      updated_at = now() WHERE id`;
    await db`INSERT INTO sync_runs (id, action, status, rows_sent, message, finished_at)
      VALUES (${runId}, 'check', 'sent', 0, 'simulasi', now())`;
  } else if (action === "repair") {
    await db`UPDATE google_integration SET protected_ranges = 0, check_status = 'warning',
      check_message = 'SIMULASI: tidak ada yang diperbaiki.', updated_at = now() WHERE id`;
    await db`INSERT INTO sync_runs (id, action, status, rows_sent, message, finished_at)
      VALUES (${runId}, 'repair', 'sent', 0, 'simulasi', now())`;
  } else if (action === "sync") {
    // Outbox belum dikirim ke mana pun; hitung yang tertunda supaya angkanya jujur.
    const pending = await db<{ count: number }[]>`
      SELECT count(*)::int AS count FROM outbox WHERE status = 'pending'
    `;
    await db`INSERT INTO sync_runs (id, action, status, rows_sent, message, finished_at)
      VALUES (${runId}, 'sync', 'failed', 0,
              ${`SIMULASI: ${pending[0]?.count ?? 0} baris tertunda, tidak dikirim (worker belum ada)`},
              now())`;
  } else if (action === "disconnect") {
    await db`UPDATE google_integration SET connected = false, token_ciphertext = NULL,
      check_status = 'unknown', check_message = NULL, updated_at = now() WHERE id`;
    await audit(db, user.id, "integration", "google", "update", null, { connected: false });
  } else {
    throw errors.badRequest(`Aksi tidak dikenal: ${action}`);
  }

  return getGoogle(tenant);
}

/* --------------------------------------------------------------- impor */

export async function listImports(tenant: string): Promise<Response> {
  const db = tenantPool(tenant);
  const rows = await db<
    { id: string; filename: string; status: string; summary: unknown; created_at: Date }[]
  >`SELECT id, filename, status::text AS status, summary, created_at
      FROM import_jobs ORDER BY created_at DESC LIMIT 50`;
  return ok({
    data: rows.map((r) => ({
      id: r.id,
      filename: r.filename,
      status: r.status,
      summary: r.summary,
      createdAt: r.created_at.toISOString(),
    })),
  });
}

/**
 * Pratinjau impor (dry-run). Belum menulis apa pun — hanya memvalidasi baris
 * dan mengembalikan daftar ditolak beserta alasannya (PRD MD-03).
 */
export async function previewImport(
  request: Request,
  user: AuthUser,
  tenant: string,
): Promise<Response> {
  const db = tenantPool(tenant);
  const body = await parseBody(
    request,
    z.object({
      entity: z.enum(["items", "locations", "categories"]),
      filename: z.string().max(200),
      rows: z.array(z.record(z.string(), z.string())).min(1).max(5000),
    }),
  );

  const existingSkus = new Set(
    (await db<{ sku: string }[]>`SELECT sku FROM items`).map((r) => r.sku),
  );
  const existingCats = new Set(
    (await db<{ name: string }[]>`SELECT name FROM categories`).map((r) => r.name.toLowerCase()),
  );

  const rejected: { row: number; reason: string }[] = [];
  const accepted: Record<string, string>[] = [];

  body.rows.forEach((row, index) => {
    const lineNo = index + 2; // baris 1 = header
    if (body.entity === "items") {
      const sku = (row.sku ?? "").trim();
      const name = (row.name ?? "").trim();
      if (!sku) return rejected.push({ row: lineNo, reason: "SKU kosong" });
      if (!name) return rejected.push({ row: lineNo, reason: "Nama kosong" });
      if (existingSkus.has(sku))
        return rejected.push({ row: lineNo, reason: `SKU duplikat: ${sku}` });
      existingSkus.add(sku);
    }
    if (body.entity === "categories") {
      const name = (row.name ?? "").trim();
      if (!name) return rejected.push({ row: lineNo, reason: "Nama kosong" });
      if (existingCats.has(name.toLowerCase())) {
        return rejected.push({ row: lineNo, reason: `Kategori sudah ada: ${name}` });
      }
      existingCats.add(name.toLowerCase());
    }
    accepted.push(row);
  });

  const id = `imp_${crypto.randomUUID().slice(0, 8)}`;
  await db`INSERT INTO import_jobs (id, filename, status, rows, summary, created_by)
    VALUES (${id}, ${body.filename}, 'preview', ${db.json(body.rows as never)},
            ${db.json({ entity: body.entity, accepted: accepted.length, rejected } as never)},
            ${user.id})`;

  /**
   * Bentuk respons HARUS sama dengan mock (`ImportJobRow`): UI membaca
   * `job.rows`, `job.newRows`, `job.errorRows`. Versi sebelumnya hanya
   * mengirim `summary`, sehingga halaman pratinjau langsung crash
   * ("Cannot read properties of undefined (reading 'slice')") tepat setelah
   * berkas berhasil diunggah.
   */
  const rejectedByRow = new Map(rejected.map((r) => [r.row, r.reason]));
  const rows = body.rows.map((row, index) => {
    const lineNo = index + 2;
    const reason = rejectedByRow.get(lineNo) ?? null;
    return {
      row: lineNo,
      status: reason ? ("error" as const) : ("new" as const),
      sku: (row.sku ?? "").trim(),
      name: (row.name ?? "").trim(),
      message: reason,
      data: row,
    };
  });

  return ok(
    {
      job: {
        id,
        entity: body.entity,
        filename: body.filename,
        status: "preview",
        createdAt: new Date().toISOString(),
        appliedAt: null,
        totalRows: rows.length,
        newRows: rows.filter((r) => r.status === "new").length,
        updatedRows: 0,
        errorRows: rows.filter((r) => r.status === "error").length,
        rows,
      },
    },
    { status: 201 },
  );
}

export async function applyImport(
  _request: Request,
  id: string,
  user: AuthUser,
  tenant: string,
): Promise<Response> {
  const db = tenantPool(tenant);
  const rows = await db<
    { rows: Record<string, string>[]; summary: unknown; status: string; filename: string }[]
  >`SELECT rows, summary, status::text AS status, filename FROM import_jobs WHERE id = ${id}`;
  const job = rows[0];
  if (!job) throw errors.notFound("Impor");
  if (job.status !== "preview") throw errors.conflict("IMPORT_DONE", "Impor sudah diterapkan.");

  const summary = job.summary as { entity: string; rejected: { row: number }[] };
  const rejectedRows = new Set((summary.rejected ?? []).map((r) => r.row));

  let created = 0;
  let updated = 0;

  /**
   * Gudang baru mulai tanpa satuan maupun kategori apa pun (data referensi
   * sengaja tidak di-seed). Tanpa ini, impor pertama selalu gagal dengan
   * "violates foreign key constraint items_unit_id_fkey" — dan pesan itu tidak
   * memberi tahu pengguna bahwa yang kurang adalah data referensi.
   */
  if (summary.entity === "items") {
    await db`INSERT INTO units (id, name, symbol, decimals)
             VALUES ('un_pcs', 'Pcs', 'pcs', 0) ON CONFLICT DO NOTHING`;
    await db`INSERT INTO categories (id, name)
             VALUES ('cat_umum', 'Umum') ON CONFLICT DO NOTHING`;
  }

  for (const [index, row] of job.rows.entries()) {
    if (rejectedRows.has(index + 2)) continue;

    if (summary.entity === "categories") {
      const name = (row.name ?? "").trim();
      if (!name) continue;
      const newId = `cat_${crypto.randomUUID().slice(0, 8)}`;
      await db`INSERT INTO categories (id, name) VALUES (${newId}, ${name})
        ON CONFLICT (name) DO NOTHING`;
      created += 1;
    } else if (summary.entity === "items") {
      const sku = (row.sku ?? "").trim();
      const name = (row.name ?? "").trim();
      if (!sku || !name) continue;

      const catName = (row.category ?? "Consumable").trim();
      const catId = `cat_${catName.toLowerCase().replace(/\s+/g, "-")}`;
      await db`INSERT INTO categories (id, name) VALUES (${catId}, ${catName})
        ON CONFLICT (name) DO NOTHING`;

      const unitSymbol = (row.unit ?? "pcs").trim();
      const unitRow = await db<{ id: string }[]>`
        SELECT id FROM units WHERE symbol = ${unitSymbol} LIMIT 1
      `;
      const unitId = unitRow[0]?.id ?? "un_pcs";

      const existing = await db<{ id: string }[]>`
        SELECT id FROM items WHERE sku = ${sku}
      `;
      if (existing[0]) {
        await db`UPDATE items SET name = ${name}, category_id = ${catId},
          min_stock = ${Number(row.min_stock ?? row.minStock ?? 0) || 0},
          max_stock = ${
            row.max_stock === undefined || row.max_stock === ""
              ? null
              : Number(row.max_stock) || null
          },
          updated_at = now()
          WHERE id = ${existing[0].id}`;
        updated += 1;
      } else {
        const code = Array.from(crypto.getRandomValues(new Uint8Array(9)))
          .map((b) => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[b % 32])
          .join("");
        await db`INSERT INTO items (id, sku, code, name, category_id, unit_id, min_stock, max_stock)
          VALUES (${`itm_${crypto.randomUUID().slice(0, 8)}`}, ${sku}, ${code}, ${name},
                  ${catId}, ${unitId},
                  ${Number(row.min_stock ?? row.minStock ?? 0) || 0},
                  ${
                    row.max_stock === undefined || row.max_stock === ""
                      ? null
                      : Number(row.max_stock) || null
                  })`;
        created += 1;
      }
    }
  }

  await db`UPDATE import_jobs SET status = 'applied', applied_at = now() WHERE id = ${id}`;
  await audit(db, user.id, "import", id, "update", null, { created, updated });

  /**
   * `job` di sini juga harus berbentuk `ImportJobRow` utuh: setelah Terapkan,
   * UI memakai `job.rows` dan `job.filename` untuk merender ulang kartu
   * pratinjau. Mengirim `{id, status}` saja membuat halaman crash sesudah
   * impor berhasil — kegagalan yang tampak seperti impor gagal padahal data
   * sudah masuk.
   */
  const appliedRows = (job.rows as Record<string, string>[] | null) ?? [];
  const rejectedRowsSet = rejectedRows;
  const rowsForUi = appliedRows.map((row, index) => {
    const lineNo = index + 2;
    const rejected = rejectedRowsSet.has(lineNo);
    return {
      row: lineNo,
      status: rejected ? ("error" as const) : ("update" as const),
      sku: (row.sku ?? "").trim(),
      name: (row.name ?? "").trim(),
      message: rejected ? "Ditolak saat pratinjau" : null,
      data: row,
    };
  });

  return ok({
    job: {
      id,
      entity: summary.entity ?? "items",
      filename: job.filename ?? "import",
      status: "applied" as const,
      createdAt: new Date().toISOString(),
      appliedAt: new Date().toISOString(),
      totalRows: rowsForUi.length,
      newRows: created,
      updatedRows: updated,
      errorRows: rowsForUi.filter((r) => r.status === "error").length,
      rows: rowsForUi,
    },
    created,
    updated,
  });
}

/* ------------------------------------------------------ sync offline */

export async function syncBatch(
  request: Request,
  user: AuthUser,
  tenant: string,
): Promise<Response> {
  const body = await parseBody(
    request,
    z.object({
      transactions: z
        .array(
          z.object({
            type: z.enum(["issue", "receive", "return", "transfer", "adjust"]),
            itemId: z.string(),
            locationId: z.string().optional(),
            fromLocationId: z.string().nullable().optional(),
            toLocationId: z.string().nullable().optional(),
            qty: z.number().int().positive(),
            idempotencyKey: z.string().min(8),
            reasonId: z.string().nullable().optional(),
            note: z.string().nullable().optional(),
          }),
        )
        .min(1)
        .max(200),
    }),
  );

  // Antrean offline: hasil per item, satu gagal tidak membatalkan sisanya.
  const results: {
    idempotencyKey: string;
    status: "ok" | "duplicate" | "needs_review" | "rejected";
    message: string;
    transactionId: string | null;
  }[] = [];

  for (const tx of body.transactions) {
    try {
      if (tx.type === "issue") {
        const r = await issueStock(user, tenant, {
          itemId: tx.itemId,
          locationId: tx.locationId ?? tx.fromLocationId ?? "",
          qty: tx.qty,
          idempotencyKey: tx.idempotencyKey,
          reasonId: tx.reasonId,
          note: tx.note,
        });
        results.push(
          r.ok
            ? {
                idempotencyKey: tx.idempotencyKey,
                status: r.code === "duplicate" ? "duplicate" : "ok",
                message: r.code === "duplicate" ? "sudah tercatat" : "tersimpan",
                transactionId: r.txId,
              }
            : {
                idempotencyKey: tx.idempotencyKey,
                status: "rejected",
                message: r.message,
                transactionId: null,
              },
        );
      } else {
        const r = await moveStock(user, tenant, {
          type: tx.type,
          itemId: tx.itemId,
          fromLocationId: tx.fromLocationId ?? null,
          toLocationId: tx.toLocationId ?? null,
          qty: tx.qty,
          idempotencyKey: tx.idempotencyKey,
          reasonId: tx.reasonId,
          note: tx.note,
        });
        results.push(
          r.ok
            ? {
                idempotencyKey: tx.idempotencyKey,
                status: r.duplicate ? "duplicate" : "ok",
                message: r.duplicate ? "sudah tercatat" : "tersimpan",
                transactionId: r.txId,
              }
            : {
                idempotencyKey: tx.idempotencyKey,
                status: "rejected",
                message: r.message,
                transactionId: null,
              },
        );
      }
    } catch (error) {
      results.push({
        idempotencyKey: tx.idempotencyKey,
        status: "rejected",
        message: error instanceof Error ? error.message : "gagal",
        transactionId: null,
      });
    }
  }

  return ok({
    results,
    ok: results.filter((r) => r.status === "ok").length,
    duplicate: results.filter((r) => r.status === "duplicate").length,
    needsReview: results.filter((r) => r.status === "needs_review").length,
    rejected: results.filter((r) => r.status === "rejected").length,
  });
}

/* --------------------------------------------------------------- event */

export async function getEvents(tenant: string): Promise<Response> {
  const db = tenantPool(tenant);
  const rows = await db<
    {
      id: string;
      type: string;
      item_id: string;
      item_name: string;
      qty: number;
      created_at: Date;
    }[]
  >`
    SELECT t.id, t.type::text AS type, t.item_id, i.name AS item_name, t.qty, t.created_at
    FROM transactions t JOIN items i ON i.id = t.item_id
    ORDER BY t.created_at DESC LIMIT 20
  `;
  return ok({
    data: rows.map((r) => ({
      id: r.id,
      kind: "transaction",
      type: r.type,
      itemId: r.item_id,
      itemName: r.item_name,
      qty: r.qty,
      at: r.created_at.toISOString(),
    })),
  });
}

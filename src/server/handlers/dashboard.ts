/**
 * Dashboard, laporan, dan saldo stok.
 *
 * Semua angka dihitung di database. Dashboard membaca rollup `stock_balances`
 * bila sudah di-refresh, tetapi karena stok di sini adalah view agregasi yang
 * cepat untuk ~5.000 baris, query langsung masih di bawah 50 ms. Pada jutaan
 * baris, ganti ke `stock_balances` (materialized view) — polanya sudah ada.
 */

import type { AuthUser } from "@/server/auth";
import { tenantPool } from "@/server/db";
import { ok } from "@/server/http";

const DAY = 86_400_000;

function confidenceLevel(score: number): "high" | "medium" | "low" | "never" {
  if (score >= 80) return "high";
  if (score >= 50) return "medium";
  if (score > 0) return "low";
  return "never";
}

export async function getDashboard(user: AuthUser, tenant: string): Promise<Response> {
  const db = tenantPool(tenant);

  const totals = await db<
    {
      total_items: number;
      total_qty: number;
      below_min: number;
      tx_today: number;
      needs_review: number;
      open_counts: number;
      high_pct: number;
      overdue_custody: number;
      my_custody: number;
      my_tx_7d: number;
      my_queue: number;
    }[]
  >`
    SELECT
      (SELECT count(*)::int FROM items WHERE active) AS total_items,
      (SELECT COALESCE(SUM(qty), 0)::int FROM stock_levels) AS total_qty,
      (SELECT count(*)::int FROM items i
         WHERE i.active AND i.min_stock > 0
           AND COALESCE((SELECT SUM(qty) FROM stock_levels WHERE item_id = i.id), 0) < i.min_stock
      ) AS below_min,
      (SELECT count(*)::int FROM transactions WHERE created_at >= date_trunc('day', now())) AS tx_today,
      (SELECT count(*)::int FROM transactions WHERE review_status = 'needs_review') AS needs_review,
      (SELECT count(*)::int FROM stock_counts WHERE status <> 'approved') AS open_counts,
      (SELECT COALESCE(ROUND(100.0 * count(*) FILTER (WHERE v.cnt > 0) / NULLIF(count(*), 0)), 0)::int
         FROM items i
         LEFT JOIN LATERAL (
           SELECT count(*) AS cnt FROM verifications
           WHERE item_id = i.id AND status IN ('recorded','approved')
             AND answered_at > now() - interval '30 days'
         ) v ON true
         WHERE i.active
      ) AS high_pct,
      (SELECT count(*)::int FROM custody
         WHERE status = 'open' AND created_at < now() - interval '24 hours') AS overdue_custody,
      (SELECT COALESCE(SUM(qty - qty_settled), 0)::int FROM custody
         WHERE status = 'open' AND user_id = ${user.id}) AS my_custody,
      (SELECT count(*)::int FROM transactions
         WHERE user_id = ${user.id} AND created_at > now() - interval '7 days') AS my_tx_7d,
      (SELECT count(*)::int FROM verifications
         WHERE status = 'pending' AND user_id = ${user.id}) AS my_queue
  `;

  // 10 transaksi terakhir. Untuk pekerja dibatasi miliknya sendiri.
  const scoped = user.role === "worker";
  const recent = await db<
    {
      id: string;
      type: string;
      item_id: string;
      item_name: string;
      qty: number;
      created_at: Date;
      user_id: string;
      user_name: string;
    }[]
  >`
    SELECT t.id, t.type::text AS type, t.item_id, i.name AS item_name, t.qty,
           t.created_at, t.user_id, u.name AS user_name
    FROM transactions t
    JOIN items i ON i.id = t.item_id
    JOIN users u ON u.id = t.user_id
    WHERE (${!scoped} OR t.user_id = ${user.id})
    ORDER BY t.created_at DESC LIMIT 10
  `;

  const lowStock = await db<
    {
      item_id: string;
      item_name: string;
      sku: string;
      qty: number;
      min_stock: number;
      location_path: string;
      unit: string;
      verified: Date | null;
      verify_count: number;
    }[]
  >`
    SELECT i.id AS item_id, i.name AS item_name, i.sku,
           COALESCE(s.qty, 0)::int AS qty, i.min_stock,
           COALESCE(l.path, '—') AS location_path, u.symbol AS unit,
           v.last_verified AS verified, COALESCE(v.cnt, 0)::int AS verify_count
    FROM items i
    JOIN units u ON u.id = i.unit_id
    LEFT JOIN locations l ON l.id = i.primary_location_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(qty), 0) AS qty FROM stock_levels WHERE item_id = i.id
    ) s ON true
    LEFT JOIN LATERAL (
      SELECT max(answered_at) AS last_verified, count(*) AS cnt FROM verifications
      WHERE item_id = i.id AND status IN ('recorded','approved')
    ) v ON true
    WHERE i.active AND i.min_stock > 0 AND COALESCE(s.qty, 0) < i.min_stock
    ORDER BY (COALESCE(s.qty, 0)::numeric / NULLIF(i.min_stock, 0)) ASC
    LIMIT 6
  `;

  const lastTaken = await db<
    { item_id: string; item_name: string; item_code: string; qty: number; at: Date; unit: string }[]
  >`
    SELECT DISTINCT ON (t.item_id)
           t.item_id, i.name AS item_name, i.code AS item_code, t.qty, t.created_at AS at,
           u.symbol AS unit
    FROM transactions t
    JOIN items i ON i.id = t.item_id
    JOIN units u ON u.id = i.unit_id
    WHERE t.type = 'issue' AND (${!scoped} OR t.user_id = ${user.id})
    ORDER BY t.item_id, t.created_at DESC
    LIMIT 5
  `;

  const usage = await db<{ date: string; qty: number; tx: number }[]>`
    SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
           COALESCE(SUM(t.qty), 0)::int AS qty,
           count(t.id)::int AS tx
    FROM generate_series(date_trunc('day', now()) - interval '6 days',
                         date_trunc('day', now()), interval '1 day') AS d(day)
    LEFT JOIN transactions t
      ON date_trunc('day', t.created_at) = d.day
     AND t.type = 'issue'
     AND (${!scoped} OR t.user_id = ${user.id})
    GROUP BY d.day ORDER BY d.day
  `;

  const topItems = await db<{ id: string; label: string; qty: number; tx: number }[]>`
    SELECT i.id, i.name AS label, SUM(t.qty)::int AS qty, count(*)::int AS tx
    FROM transactions t JOIN items i ON i.id = t.item_id
    WHERE t.type = 'issue' AND t.created_at > now() - interval '30 days'
      AND (${!scoped} OR t.user_id = ${user.id})
    GROUP BY i.id, i.name ORDER BY qty DESC LIMIT 5
  `;

  const needsCount = await db<
    {
      item_id: string;
      item_name: string;
      location_path: string;
      score: number;
      qty: number;
      unit: string;
    }[]
  >`
    SELECT i.id AS item_id, i.name AS item_name, COALESCE(l.path, '—') AS location_path,
           0 AS score, COALESCE(s.qty, 0)::int AS qty, u.symbol AS unit
    FROM items i
    JOIN units u ON u.id = i.unit_id
    LEFT JOIN locations l ON l.id = i.primary_location_id
    LEFT JOIN LATERAL (SELECT SUM(qty) AS qty FROM stock_levels WHERE item_id = i.id) s ON true
    WHERE i.active
      AND NOT EXISTS (
        SELECT 1 FROM verifications v
        WHERE v.item_id = i.id AND v.answered_at > now() - interval '90 days'
      )
    ORDER BY COALESCE(s.qty, 0) DESC LIMIT 5
  `;

  /**
   * Query dijalankan BERURUTAN — lihat catatan di `getReports`.
   */
  const t = totals[0];

  const custodyRows = await db<
    { id: string; item_id: string; item_name: string; qty: number; opened_at: Date; unit: string }[]
  >`
    SELECT c.id, c.item_id, i.name AS item_name, (c.qty - c.qty_settled)::int AS qty,
           c.created_at AS opened_at, u.symbol AS unit
    FROM custody c
    JOIN items i ON i.id = c.item_id
    JOIN units u ON u.id = i.unit_id
    WHERE c.status = 'open' AND c.user_id = ${user.id}
    ORDER BY c.created_at DESC LIMIT 5
  `;

  const teamCustody = await db<{ count: number }[]>`
    SELECT count(*)::int AS count FROM custody WHERE status = 'open'
  `;

  const activeUsers = await db<{ count: number }[]>`
    SELECT count(DISTINCT user_id)::int AS count FROM sessions
    WHERE expires_at > now() AND revoked_at IS NULL
  `;

  const isAdmin = user.role === "admin";

  return ok({
    kpis: {
      totalItems: t?.total_items ?? 0,
      totalQty: t?.total_qty ?? 0,
      belowMin: t?.below_min ?? 0,
      transactionsToday: t?.tx_today ?? 0,
      needsReview: t?.needs_review ?? 0,
      openCounts: t?.open_counts ?? 0,
      highConfidencePct: t?.high_pct ?? 0,
      overdueCustody: t?.overdue_custody ?? 0,
      myCustodyCount: t?.my_custody ?? 0,
      myTx7d: t?.my_tx_7d ?? 0,
      myPendingQueue: t?.my_queue ?? 0,
    },
    recent: recent.map((r) => ({
      id: r.id,
      type: r.type,
      itemId: r.item_id,
      itemName: r.item_name,
      qty: r.qty,
      createdAt: r.created_at.toISOString(),
      userId: r.user_id,
      userName: r.user_name,
    })),
    lowStock: lowStock.map((r) => {
      const score = r.verified ? 70 : 0;
      return {
        itemId: r.item_id,
        itemName: r.item_name,
        sku: r.sku,
        qty: r.qty,
        minStock: r.min_stock,
        locationPath: r.location_path,
        confidence: {
          score,
          level: confidenceLevel(score),
          lastVerifiedAt: r.verified ? r.verified.toISOString() : null,
        },
        unit: r.unit,
      };
    }),
    lastTaken: lastTaken.map((r) => ({
      itemId: r.item_id,
      itemName: r.item_name,
      itemCode: r.item_code,
      qty: r.qty,
      at: r.at.toISOString(),
      unit: r.unit,
    })),
    needsCount,
    usage,
    topItems,
    custody: custodyRows.map((r) => ({
      id: r.id,
      itemId: r.item_id,
      itemName: r.item_name,
      qty: r.qty,
      openedAt: r.opened_at.toISOString(),
      unit: r.unit,
    })),
    teamCustodyCount: teamCustody[0]?.count ?? 0,
    // Status sistem hanya untuk admin (PRD: worker tidak melihat data sistem).
    system: isAdmin
      ? {
          version: "0.2.0",
          activeUsers: activeUsers[0]?.count ?? 0,
          lastBackupAt: null,
          sheetsSync: "disconnected",
          pendingOutbox: 0,
          uptimeHours: Math.round(process.uptime() / 3600),
          setupChecklist: [
            { id: "admin", label: "Admin pertama dibuat", done: true },
            { id: "items", label: "Item diimpor", done: (t?.total_items ?? 0) > 0 },
            { id: "locations", label: "Lokasi dibuat", done: true },
            { id: "labels", label: "Label QR dicetak", done: false },
            { id: "google", label: "Google Drive terhubung", done: false },
          ],
        }
      : null,
  });
}

export async function getStock(request: Request, tenant: string): Promise<Response> {
  const db = tenantPool(tenant);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const warehouseId = url.searchParams.get("warehouseId");
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 100) || 100));

  const rows = await db<
    {
      item_id: string;
      item_name: string;
      sku: string;
      qty: number;
      location_id: string;
      location_path: string;
      warehouse_id: string;
      unit: string;
      min_stock: number;
      last_verified: Date | null;
      verify_count: number;
    }[]
  >`
    SELECT sl.item_id, i.name AS item_name, i.sku, sl.qty, sl.location_id,
           l.path AS location_path, l.warehouse_id, u.symbol AS unit, i.min_stock,
           v.last_verified, COALESCE(v.cnt, 0)::int AS verify_count
    FROM stock_levels sl
    JOIN items i ON i.id = sl.item_id
    JOIN locations l ON l.id = sl.location_id
    JOIN units u ON u.id = i.unit_id
    LEFT JOIN LATERAL (
      SELECT max(answered_at) AS last_verified, count(*) AS cnt FROM verifications
      WHERE item_id = sl.item_id AND location_id = sl.location_id
        AND status IN ('recorded','approved')
    ) v ON true
    WHERE (${q} = '' OR i.name ILIKE ${`%${q}%`} OR i.sku ILIKE ${`%${q}%`})
      AND (${warehouseId ?? null}::text IS NULL OR l.warehouse_id = ${warehouseId ?? null})
    ORDER BY l.path, i.name
    LIMIT 2000
  `;

  return ok({
    data: rows
      .map((r) => {
        const score = r.last_verified ? 70 : 0;
        return {
          itemId: r.item_id,
          itemName: r.item_name,
          sku: r.sku,
          qty: r.qty,
          minStock: r.min_stock,
          locationId: r.location_id,
          locationPath: r.location_path,
          warehouseId: r.warehouse_id,
          unit: r.unit,
          confidence: {
            score,
            level: confidenceLevel(score),
            lastVerifiedAt: r.last_verified ? r.last_verified.toISOString() : null,
          },
        };
      })
      .slice(0, limit),
    nextCursor: null,
    total: rows.length,
  });
}

export async function getReports(request: Request, tenant: string): Promise<Response> {
  const db = tenantPool(tenant);
  const url = new URL(request.url);
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") ?? 30) || 30));
  const since = new Date(Date.now() - days * DAY);

  const trend = await db<{ date: string; qty: number; tx: number }[]>`
    SELECT to_char(d.day, 'YYYY-MM-DD') AS date,
           COALESCE(SUM(t.qty), 0)::int AS qty, count(t.id)::int AS tx
    FROM generate_series(date_trunc('day', now()) - (${days - 1} || ' days')::interval,
                         date_trunc('day', now()), interval '1 day') AS d(day)
    LEFT JOIN transactions t ON date_trunc('day', t.created_at) = d.day
    GROUP BY d.day ORDER BY d.day
  `;

  const topItems = await db<{ id: string; label: string; qty: number; tx: number }[]>`
    SELECT i.id, i.name AS label, SUM(t.qty)::int AS qty, count(*)::int AS tx
    FROM transactions t JOIN items i ON i.id = t.item_id
    WHERE t.type = 'issue' AND t.created_at >= ${since}
    GROUP BY i.id, i.name ORDER BY qty DESC LIMIT 10
  `;

  const byUser = await db<{ id: string; label: string; qty: number; tx: number }[]>`
    SELECT u.id, u.name AS label, SUM(t.qty)::int AS qty, count(*)::int AS tx
    FROM transactions t JOIN users u ON u.id = t.user_id
    WHERE t.created_at >= ${since}
    GROUP BY u.id, u.name ORDER BY tx DESC LIMIT 10
  `;

  const byReason = await db<{ id: string; label: string; qty: number; tx: number }[]>`
    SELECT COALESCE(r.id, 'none') AS id, COALESCE(r.name, 'Tanpa alasan') AS label,
           SUM(t.qty)::int AS qty, count(*)::int AS tx
    FROM transactions t LEFT JOIN reasons r ON r.id = t.reason_id
    WHERE t.created_at >= ${since}
    GROUP BY r.id, r.name ORDER BY tx DESC LIMIT 10
  `;

  const conf = await db<{ bucket: string; count: number }[]>`
    SELECT CASE WHEN v.cnt > 0 AND v.last_verified > now() - interval '30 days' THEN 'high'
                WHEN v.cnt > 0 AND v.last_verified > now() - interval '90 days' THEN 'medium'
                WHEN v.cnt > 0 THEN 'low' ELSE 'never' END AS bucket,
           count(*)::int AS count
    FROM items i
    LEFT JOIN LATERAL (
      SELECT count(*) AS cnt, max(answered_at) AS last_verified FROM verifications
      WHERE item_id = i.id AND status IN ('recorded','approved')
    ) v ON true
    WHERE i.active
    GROUP BY 1
  `;
  const deadStock = await db<
    { item_id: string; name: string; last_moved_at: Date | null; qty: number; days_idle: number }[]
  >`
    SELECT i.id AS item_id, i.name, m.last_moved_at,
           COALESCE(s.qty, 0)::int AS qty,
           COALESCE(EXTRACT(DAY FROM now() - m.last_moved_at)::int, 9999) AS days_idle
    FROM items i
    LEFT JOIN LATERAL (
      SELECT max(created_at) AS last_moved_at FROM transactions WHERE item_id = i.id
    ) m ON true
    LEFT JOIN LATERAL (SELECT SUM(qty) AS qty FROM stock_levels WHERE item_id = i.id) s ON true
    WHERE i.active AND COALESCE(s.qty, 0) > 0
      AND (m.last_moved_at IS NULL OR m.last_moved_at < now() - interval '60 days')
    ORDER BY days_idle DESC LIMIT 10
  `;

  const custodyStats = await db<
    { open_entries: number; avg_hold_hours: number; overdue: number }[]
  >`
    SELECT count(*) FILTER (WHERE status = 'open')::int AS open_entries,
           COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (now() - created_at)) / 3600)
             FILTER (WHERE status = 'open')), 0)::int AS avg_hold_hours,
           count(*) FILTER (WHERE status = 'open'
             AND created_at < now() - interval '24 hours')::int AS overdue
    FROM custody
  `;

  const custodyByEquipment = await db<{ id: string; label: string; qty: number; tx: number }[]>`
    SELECT COALESCE(e.id, 'none') AS id, COALESCE(e.name, 'Tanpa mesin') AS label,
           SUM(t.qty)::int AS qty, count(*)::int AS tx
    FROM transactions t LEFT JOIN equipment e ON e.id = t.equipment_id
    WHERE t.created_at >= ${since} AND t.equipment_id IS NOT NULL
    GROUP BY e.id, e.name ORDER BY tx DESC LIMIT 10
  `;

  /**
   * Ringkasan kesehatan persediaan.
   *
   * Sebelumnya laporan hanya menampilkan distribusi confidence (tinggi/sedang/
   * rendah) — itu menilai KETELITIAN catatan, bukan kondisi stok. Yang dicari
   * pemilik gudang adalah: berapa item di bawah minimum, berapa kelebihan,
   * berapa nilai yang menganggur, dan berapa yang belum pernah dihitung.
   */
  const health = await db<
    {
      total: number;
      below_min: number;
      over_max: number;
      healthy: number;
      no_min: number;
      never_counted: number;
      stock_value: string;
      dead_value: string;
      dead_count: number;
      zero_stock: number;
    }[]
  >`
    WITH per_item AS (
      SELECT i.id, i.name, i.min_stock, i.max_stock, i.unit_value,
             COALESCE((SELECT SUM(qty) FROM stock_levels WHERE item_id = i.id), 0)::int AS qty,
             (SELECT max(answered_at) FROM verifications v
               WHERE v.item_id = i.id AND v.status IN ('recorded','approved')) AS last_counted,
             (SELECT max(created_at) FROM transactions t WHERE t.item_id = i.id) AS last_moved
      FROM items i WHERE i.active
    )
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE min_stock > 0 AND qty < min_stock)::int AS below_min,
           count(*) FILTER (WHERE max_stock IS NOT NULL AND qty > max_stock)::int AS over_max,
           count(*) FILTER (
             WHERE (min_stock = 0 OR qty >= min_stock)
               AND (max_stock IS NULL OR qty <= max_stock)
           )::int AS healthy,
           count(*) FILTER (WHERE min_stock = 0 AND max_stock IS NULL)::int AS no_min,
           count(*) FILTER (WHERE last_counted IS NULL)::int AS never_counted,
           COALESCE(SUM(qty * COALESCE(unit_value, 0)), 0)::text AS stock_value,
           COALESCE(SUM(CASE WHEN qty > 0
             AND (last_moved IS NULL OR last_moved < now() - interval '60 days')
             THEN qty * COALESCE(unit_value, 0) ELSE 0 END), 0)::text AS dead_value,
           count(*) FILTER (WHERE qty > 0
             AND (last_moved IS NULL OR last_moved < now() - interval '60 days'))::int AS dead_count,
           count(*) FILTER (WHERE qty = 0)::int AS zero_stock
    FROM per_item
  `;
  // Sebaran umur pencatatan: menunjukkan seberapa usang data, bukan hanya
  // "berapa yang belum pernah dihitung".
  const ageBuckets = await db<{ bucket: string; count: number }[]>`
    SELECT CASE
             WHEN v.last_counted IS NULL THEN 'never'
             WHEN v.last_counted > now() - interval '30 days' THEN 'd30'
             WHEN v.last_counted > now() - interval '90 days' THEN 'd90'
             WHEN v.last_counted > now() - interval '180 days' THEN 'd180'
             ELSE 'older'
           END AS bucket,
           count(*)::int AS count
    FROM items i
    LEFT JOIN LATERAL (
      SELECT max(answered_at) AS last_counted FROM verifications
      WHERE item_id = i.id AND status IN ('recorded','approved')
    ) v ON true
    WHERE i.active
    GROUP BY 1
  `;

  /**
   * Query dijalankan BERURUTAN, bukan paralel.
   *
   * Paralel pernah dicoba dan justru merusak: Supavisor (pooler Supabase)
   * menjenuhkan seluruh slot pool saat belasan query diminta serentak, lalu satu
   * query yang tersangkut membuat SEMUA permintaan menggantung (terbukti: satu
   * `DISTINCT ON` macet 3 menit 53 detik). Berurutan ~95 ms per query — sekitar
   * satu detik total — dan tidak pernah macet.
   */

  const h = health[0];
  const ageMap = new Map(ageBuckets.map((b) => [b.bucket, b.count]));
  const confMap = new Map(conf.map((c) => [c.bucket, c.count]));
  const confTotal = conf.reduce((sum, c) => sum + c.count, 0);
  const cs = custodyStats[0];

  return ok({
    rangeDays: days,
    inventoryHealth: {
      total: h?.total ?? 0,
      belowMin: h?.below_min ?? 0,
      overMax: h?.over_max ?? 0,
      healthy: h?.healthy ?? 0,
      noThreshold: h?.no_min ?? 0,
      neverCounted: h?.never_counted ?? 0,
      zeroStock: h?.zero_stock ?? 0,
      stockValue: Number(h?.stock_value ?? 0),
      deadValue: Number(h?.dead_value ?? 0),
      deadCount: h?.dead_count ?? 0,
      ageBuckets: {
        d30: ageMap.get("d30") ?? 0,
        d90: ageMap.get("d90") ?? 0,
        d180: ageMap.get("d180") ?? 0,
        older: ageMap.get("older") ?? 0,
        never: ageMap.get("never") ?? 0,
      },
    },
    trend,
    topItems,
    byUser,
    byReason,
    confidence: {
      high: confMap.get("high") ?? 0,
      medium: confMap.get("medium") ?? 0,
      low: confMap.get("low") ?? 0,
      never: confMap.get("never") ?? 0,
      total: confTotal,
      needsCount: await db<
        { item_id: string; item_name: string; location_path: string; score: number; qty: number }[]
      >`
        SELECT i.id AS item_id, i.name AS item_name, COALESCE(l.path, '—') AS location_path,
               0 AS score, COALESCE(s.qty, 0)::int AS qty
        FROM items i
        LEFT JOIN locations l ON l.id = i.primary_location_id
        LEFT JOIN LATERAL (SELECT SUM(qty) AS qty FROM stock_levels WHERE item_id = i.id) s ON true
        WHERE i.active AND NOT EXISTS (
          SELECT 1 FROM verifications v WHERE v.item_id = i.id
            AND v.answered_at > now() - interval '90 days')
        ORDER BY COALESCE(s.qty, 0) DESC LIMIT 10
      `,
    },
    deadStock: deadStock.map((r) => ({
      itemId: r.item_id,
      name: r.name,
      lastMovedAt: r.last_moved_at ? r.last_moved_at.toISOString() : null,
      qty: r.qty,
      daysIdle: r.days_idle,
    })),
    custody: {
      openEntries: cs?.open_entries ?? 0,
      avgHoldHours: cs?.avg_hold_hours ?? 0,
      returnRate: 0,
      overdue: cs?.overdue ?? 0,
      byEquipment: custodyByEquipment,
    },
  });
}

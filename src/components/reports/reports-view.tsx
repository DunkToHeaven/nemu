"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import { EmptyState, ErrorState, KpiSkeleton } from "@/components/app/states";
import { WidgetBoundary } from "@/components/app/widget";
import { Icon } from "@/components/icons";
import { PriceHistoryWidget } from "@/components/reports/price-history-widget";
import { type DrillTarget, ReportDrillSheet } from "@/components/reports/reports-drill";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { formatNumber, formatQty, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const TrendChart = dynamic(
  () => import("@/components/app/trend-chart").then((mod) => mod.TrendChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[200px] w-full rounded-xl" />,
  },
);

export function ReportsView() {
  const t = useTranslations("reports");
  const locale = useLocale();
  const [days, setDays] = React.useState(30);
  const [drill, setDrill] = React.useState<DrillTarget | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: keys.reports(days),
    queryFn: () => api.reports(days),
  });

  // Tren harga butuh jendela lebih lebar dari periode laporan supaya perubahan
  // antar tanggal terlihat; minimal 90 hari.
  const priceDays = Math.max(days, 90);
  const priceHistory = useQuery({
    queryKey: keys.priceHistory(priceDays),
    queryFn: () => api.priceHistory({ days: priceDays }),
  });

  if (isLoading) return <KpiSkeleton />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  const health = data.inventoryHealth;
  const confidenceTotal = Math.max(1, data.confidence.total);
  const pct = (value: number) => Math.round((value / confidenceTotal) * 100);

  const exportReport = () => {
    const lines = [
      "bagian,label,qty,transaksi",
      ...data.topItems.map((row) => `item,"${row.label}",${row.qty},${row.tx}`),
      ...data.byUser.map((row) => `pekerja,"${row.label}",${row.qty},${row.tx}`),
      ...data.byReason.map((row) => `alasan,"${row.label}",${row.qty},${row.tx}`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nemu-laporan-${days}d.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold">{t("title")}</h1>
          <p className="text-[13px] text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-full bg-muted p-1">
            {[7, 30, 90, 365].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDays(option)}
                className={cn(
                  "min-h-8 rounded-full px-2.5 text-2xs font-bold transition-colors",
                  days === option ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                {option === 365 ? "1y" : `${option}d`}
              </button>
            ))}
          </div>
          <Button size="sm" variant="secondary" onClick={exportReport}>
            <Icon name="download" className="size-4" />
            {t("export")}
          </Button>
        </div>
      </div>

      {/*
        Kesehatan persediaan: menilai KONDISI STOK, bukan hanya ketelitian
        catatan. Sebelumnya halaman ini hanya menampilkan distribusi confidence,
        sehingga pemilik gudang tidak bisa melihat berapa item yang benar-benar
        menipis atau menumpuk.
      */}
      <WidgetBoundary title={t("inventoryHealth")}>
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(
              [
                ["belowMin", health.belowMin, "danger", "alert"],
                ["overMax", health.overMax, "warning", "boxes"],
                ["healthy", health.healthy, "success", "checkCircle"],
                ["neverCounted", health.neverCounted, "neutral", "clipboard"],
              ] as const
            ).map(([key, value, tone, icon]) => (
              <button
                key={key}
                type="button"
                data-testid={`drill-card-${key}`}
                onClick={() =>
                  setDrill({
                    kind: key,
                    label: t(
                      `health${key.charAt(0).toUpperCase()}${key.slice(1)}` as "healthBelowMin",
                    ),
                  })
                }
                className="flex items-center gap-2.5 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-border-strong hover:bg-muted/40"
              >
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-lg",
                    tone === "danger" && "bg-danger-soft text-danger-foreground",
                    tone === "warning" && "bg-warning-soft text-warning-foreground",
                    tone === "success" && "bg-success-soft text-success-foreground",
                    tone === "neutral" && "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon name={icon} className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="tnum text-lg font-extrabold leading-none">{value}</p>
                  <p className="truncate text-2xs text-muted-foreground">
                    {t(`health${key.charAt(0).toUpperCase()}${key.slice(1)}` as "healthBelowMin")}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {/* Bar komposisi: proporsi stok sehat vs bermasalah. */}
          {health.total > 0 ? (
            <div className="space-y-1.5">
              <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                {(
                  [
                    ["healthy", health.healthy, "bg-success"],
                    ["belowMin", health.belowMin, "bg-danger"],
                    ["overMax", health.overMax, "bg-warning"],
                    ["noThreshold", health.noThreshold, "bg-muted-foreground/40"],
                  ] as const
                ).map(([kind, value, cls]) =>
                  value > 0 ? (
                    <button
                      key={kind}
                      type="button"
                      aria-label={`${t(`health${kind.charAt(0).toUpperCase()}${kind.slice(1)}` as "healthHealthy")} (${value})`}
                      className={cn(cls, "cursor-pointer transition-opacity hover:opacity-80")}
                      style={{ width: `${(value / Math.max(1, health.total)) * 100}%` }}
                      title={`${value}`}
                      onClick={() =>
                        setDrill({
                          kind,
                          label: t(
                            `health${kind.charAt(0).toUpperCase()}${kind.slice(1)}` as "healthHealthy",
                          ),
                        })
                      }
                    />
                  ) : null,
                )}
              </div>
              <div className="flex flex-wrap gap-x-2 gap-y-1 text-2xs text-muted-foreground">
                {(
                  [
                    ["healthy", health.healthy, "bg-success"],
                    ["belowMin", health.belowMin, "bg-danger"],
                    ["overMax", health.overMax, "bg-warning"],
                    ["noThreshold", health.noThreshold, "bg-muted-foreground/40"],
                  ] as const
                ).map(([kind, value, cls]) => (
                  <button
                    key={kind}
                    type="button"
                    data-testid={`drill-legend-${kind}`}
                    className="flex cursor-pointer items-center gap-1 rounded-full px-1.5 py-0.5 transition-colors hover:bg-muted"
                    onClick={() =>
                      setDrill({
                        kind,
                        label: t(
                          `health${kind.charAt(0).toUpperCase()}${kind.slice(1)}` as "healthHealthy",
                        ),
                      })
                    }
                  >
                    <span className={cn("size-2 rounded-full", cls)} />
                    {t(`health${kind.charAt(0).toUpperCase()}${kind.slice(1)}` as "healthHealthy")}{" "}
                    {value}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-border p-3">
              <p className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("healthStockValue")}
              </p>
              <p className="tnum mt-0.5 text-sm font-extrabold">
                {formatQty(health.stockValue, locale)}
              </p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("healthDeadValue")}
              </p>
              <p className="tnum mt-0.5 text-sm font-extrabold">
                {formatQty(health.deadValue, locale)}
                <span className="ml-1 text-2xs font-semibold text-muted-foreground">
                  ({health.deadCount})
                </span>
              </p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("healthAge")}
              </p>
              <ul className="mt-1 space-y-0.5 text-2xs">
                {(
                  [
                    ["d30", health.ageBuckets.d30],
                    ["d90", health.ageBuckets.d90],
                    ["d180", health.ageBuckets.d180],
                    ["older", health.ageBuckets.older],
                    ["never", health.ageBuckets.never],
                  ] as const
                ).map(([key, value]) => (
                  <li key={key} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t(`age${key}` as "aged30")}</span>
                    <span className="tnum font-bold">{value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </WidgetBoundary>

      <div className="grid gap-4 lg:grid-cols-3">
        <WidgetBoundary title={t("trend")} className="lg:col-span-2">
          <TrendChart data={data.trend} height={220} />
        </WidgetBoundary>

        <WidgetBoundary title={t("confidence")}>
          <ul className="space-y-2">
            {(
              [
                ["high", data.confidence.high, "success"],
                ["medium", data.confidence.medium, "warning"],
                ["low", data.confidence.low, "danger"],
                ["never", data.confidence.never, "neutral"],
              ] as const
            ).map(([key, value, tone]) => (
              <li key={key} className="space-y-1">
                <button
                  type="button"
                  data-testid={`drill-confidence-${key}`}
                  className="flex w-full items-center justify-between rounded-lg px-1 text-[13px] transition-colors hover:bg-muted/60"
                  onClick={() =>
                    setDrill({
                      kind: "conf",
                      id: key,
                      label: t(
                        `confidence${key.charAt(0).toUpperCase()}${key.slice(1)}` as "confidenceHigh",
                      ),
                    })
                  }
                >
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Badge tone={tone}>
                      {t(
                        `confidence${key.charAt(0).toUpperCase()}${key.slice(1)}` as "confidenceHigh",
                      )}
                    </Badge>
                  </span>
                  <span className="tnum font-bold">{pct(value)}%</span>
                </button>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      key === "high"
                        ? "bg-success"
                        : key === "medium"
                          ? "bg-warning"
                          : key === "low"
                            ? "bg-danger"
                            : "bg-border-strong",
                    )}
                    style={{ width: `${pct(value)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-border pt-2 text-2xs text-muted-foreground">
            {t("confidencePct", { pct: pct(data.confidence.high), total: data.confidence.total })}
          </p>
        </WidgetBoundary>

        <WidgetBoundary title={t("topItems")}>
          <RankedList
            rows={data.topItems}
            empty={t("empty")}
            drillKind="topItem"
            onSelect={setDrill}
          />
        </WidgetBoundary>

        <WidgetBoundary title={t("byUser")}>
          <RankedList
            rows={data.byUser}
            empty={t("empty")}
            drillKind="byUser"
            onSelect={setDrill}
          />
        </WidgetBoundary>

        <WidgetBoundary title={t("byReason")}>
          <RankedList
            rows={data.byReason}
            empty={t("empty")}
            drillKind="byReason"
            onSelect={setDrill}
          />
        </WidgetBoundary>

        <WidgetBoundary title={t("custody")}>
          <div className="grid grid-cols-2 gap-2">
            <Stat label={t("custodyOpen")} value={formatNumber(data.custody.openEntries, locale)} />
            <Stat label={t("custodyOverdue")} value={formatNumber(data.custody.overdue, locale)} />
            <Stat
              label={t("custodyAvgHold")}
              value={t("hours", { count: data.custody.avgHoldHours })}
            />
            <Stat label={t("custodyReturnRate")} value={`${data.custody.returnRate}%`} />
          </div>
          <div className="mt-3">
            <p className="mb-1.5 text-2xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("custodyByEquipment")}
            </p>
            <RankedList
              rows={data.custody.byEquipment.slice(0, 5)}
              empty={t("empty")}
              compact
              drillKind="byEquipment"
              onSelect={setDrill}
            />
          </div>
        </WidgetBoundary>

        <WidgetBoundary title={t("needsCount")} className="lg:col-span-2">
          {data.confidence.needsCount.length === 0 ? (
            <EmptyState icon="badgeCheck" title={t("empty")} body={t("emptyBody")} />
          ) : (
            <ul className="divide-y divide-border">
              {data.confidence.needsCount.slice(0, 8).map((row, index) => (
                <li key={`${row.itemId ?? "row"}-${row.locationPath ?? ""}-${index}`}>
                  <Link
                    href={`/app/item/${row.itemId}`}
                    data-testid={`drill-needs-${row.itemId}`}
                    className="flex items-center gap-3 rounded-lg py-2 transition-colors hover:bg-muted/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold">{row.itemName}</p>
                      <p className="truncate text-2xs text-muted-foreground">{row.locationPath}</p>
                    </div>
                    <Badge tone="danger">{row.score}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </WidgetBoundary>

        <WidgetBoundary title={t("deadStock")}>
          <p className="mb-2 text-2xs text-muted-foreground">{t("deadStockBody")}</p>
          {data.deadStock.length === 0 ? (
            <EmptyState icon="checkCircle" title={t("deadStockEmpty")} />
          ) : (
            <ul className="divide-y divide-border">
              {data.deadStock.slice(0, 6).map((row) => (
                <li key={row.itemId}>
                  <Link
                    href={`/app/item/${row.itemId}`}
                    data-testid={`drill-dead-${row.itemId}`}
                    className="flex items-center gap-2 rounded-lg py-2 transition-colors hover:bg-muted/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold">{row.name}</p>
                      <p className="text-2xs text-muted-foreground">
                        {row.lastMovedAt ? relativeTime(row.lastMovedAt, locale) : "—"}
                      </p>
                    </div>
                    <span className="tnum text-2xs font-bold text-muted-foreground">{row.qty}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </WidgetBoundary>

        <WidgetBoundary title={t("priceHistory")} className="lg:col-span-2">
          <PriceHistoryWidget data={priceHistory.data} loading={priceHistory.isLoading} />
        </WidgetBoundary>
      </div>

      <ReportDrillSheet target={drill} days={days} onClose={() => setDrill(null)} />
    </div>
  );
}

function RankedList({
  rows,
  empty,
  compact = false,
  drillKind,
  onSelect,
}: {
  rows: { id: string; label: string; qty: number; tx: number }[];
  empty: string;
  compact?: boolean;
  /** kind drill-down; baris jadi tombol yang membuka daftar transaksi. */
  drillKind?: "topItem" | "byUser" | "byReason" | "byEquipment";
  onSelect?: (target: { kind: string; id: string; label: string }) => void;
}) {
  if (rows.length === 0)
    return <p className="py-3 text-center text-2xs text-muted-foreground">{empty}</p>;
  return (
    <ol className="space-y-1.5">
      {rows.map((row, index) => (
        <li key={row.id}>
          <button
            type="button"
            data-testid={drillKind ? `drill-row-${drillKind}-${row.id}` : undefined}
            disabled={!drillKind || !onSelect}
            onClick={() => onSelect?.({ kind: drillKind ?? "", id: row.id, label: row.label })}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-[13px]",
              drillKind && onSelect && "transition-colors hover:bg-muted/60",
            )}
          >
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-2xs font-bold">
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold">{row.label}</span>
            <span className="tnum shrink-0 text-2xs font-bold text-muted-foreground">
              {row.qty}
              {compact ? "" : ` · ${row.tx}×`}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-2.5">
      <p className="text-2xs text-muted-foreground">{label}</p>
      <p className="tnum mt-0.5 text-sm font-extrabold">{value}</p>
    </div>
  );
}

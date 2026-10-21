"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import { EmptyState, ErrorState, KpiSkeleton } from "@/components/app/states";
import { WidgetBoundary } from "@/components/app/widget";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { formatNumber, relativeTime } from "@/lib/format";
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

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: keys.reports(days),
    queryFn: () => api.reports(days),
  });

  if (isLoading) return <KpiSkeleton />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

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
                <div className="flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Badge tone={tone}>
                      {t(
                        `confidence${key.charAt(0).toUpperCase()}${key.slice(1)}` as "confidenceHigh",
                      )}
                    </Badge>
                  </span>
                  <span className="tnum font-bold">{pct(value)}%</span>
                </div>
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
          <RankedList rows={data.topItems} empty={t("empty")} />
        </WidgetBoundary>

        <WidgetBoundary title={t("byUser")}>
          <RankedList rows={data.byUser} empty={t("empty")} />
        </WidgetBoundary>

        <WidgetBoundary title={t("byReason")}>
          <RankedList rows={data.byReason} empty={t("empty")} />
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
            <RankedList rows={data.custody.byEquipment.slice(0, 5)} empty={t("empty")} compact />
          </div>
        </WidgetBoundary>

        <WidgetBoundary title={t("needsCount")} className="lg:col-span-2">
          {data.confidence.needsCount.length === 0 ? (
            <EmptyState icon="badgeCheck" title={t("empty")} body={t("emptyBody")} />
          ) : (
            <ul className="divide-y divide-border">
              {data.confidence.needsCount.slice(0, 8).map((row) => (
                <li
                  key={`${row.itemId}-${row.locationPath}`}
                  className="flex items-center gap-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold">{row.itemName}</p>
                    <p className="truncate text-2xs text-muted-foreground">{row.locationPath}</p>
                  </div>
                  <Badge tone="danger">{row.score}</Badge>
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
                <li key={row.itemId} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold">{row.name}</p>
                    <p className="text-2xs text-muted-foreground">
                      {row.lastMovedAt ? relativeTime(row.lastMovedAt, locale) : "—"}
                    </p>
                  </div>
                  <span className="tnum text-2xs font-bold text-muted-foreground">{row.qty}</span>
                </li>
              ))}
            </ul>
          )}
        </WidgetBoundary>
      </div>
    </div>
  );
}

function RankedList({
  rows,
  empty,
  compact = false,
}: {
  rows: { id: string; label: string; qty: number; tx: number }[];
  empty: string;
  compact?: boolean;
}) {
  if (rows.length === 0)
    return <p className="py-3 text-center text-2xs text-muted-foreground">{empty}</p>;
  return (
    <ol className="space-y-1.5">
      {rows.map((row, index) => (
        <li key={row.id} className="flex items-center gap-2 text-[13px]">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-2xs font-bold">
            {index + 1}
          </span>
          <span className="min-w-0 flex-1 truncate font-semibold">{row.label}</span>
          <span className="tnum shrink-0 text-2xs font-bold text-muted-foreground">
            {row.qty}
            {compact ? "" : ` · ${row.tx}×`}
          </span>
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

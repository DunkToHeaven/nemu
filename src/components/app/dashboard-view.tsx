"use client";

import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { LiveActivity } from "@/components/app/live-activity";
import { SearchPreview } from "@/components/app/search-preview";
import { EmptyState, ErrorState, KpiSkeleton, ListSkeleton } from "@/components/app/states";
import { KpiCard, WidgetBoundary } from "@/components/app/widget";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { CustodyRow } from "@/components/custody/custody-row";
import { Icon } from "@/components/icons";
import { useSession } from "@/components/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type DashboardResponse } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { formatNumber, formatQty, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const TrendChart = dynamic(
  () => import("@/components/app/trend-chart").then((mod) => mod.TrendChart),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[180px] w-full rounded-xl" />,
  },
);

export function DashboardView() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const params = useSearchParams();
  const { user, role } = useSession();
  const denied = params.get("denied") === "1";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: keys.dashboard,
    queryFn: () => api.dashboard(),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-14 w-full rounded-full" />
        <KpiSkeleton />
        <ListSkeleton rows={4} />
      </div>
    );
  }

  if (isError || !data) {
    return <ErrorState onRetry={() => void refetch()} />;
  }

  return (
    <div className="space-y-4">
      {denied ? (
        <p
          role="status"
          className="rounded-xl bg-warning-soft px-3 py-2 text-[13px] font-semibold text-warning-foreground"
        >
          {t("denied")}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] text-muted-foreground">
            {t("greeting", { name: user?.name?.split(" ")[0] ?? "" })}
          </p>
          <h1 className="text-xl font-extrabold tracking-[-0.02em] sm:text-2xl">{t("title")}</h1>
        </div>
        {role === "worker" ? (
          <Button asChild size="sm" className="sm:hidden">
            <Link href="/scan">
              <Icon name="scan" className="size-4" />
              {t("scanCta")}
            </Link>
          </Button>
        ) : null}
      </div>

      <SearchPreview />

      {role === "worker" ? (
        <WorkerSections data={data} locale={locale} />
      ) : (
        <SupervisorSections data={data} locale={locale} isAdmin={role === "admin"} />
      )}
    </div>
  );
}

function WorkerSections({ data, locale }: { data: DashboardResponse; locale: string }) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("custody");

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <WidgetBoundary
        title={t("myCustodyCount", { count: data.custody.length })}
        action={
          <Link href="/app/dibawa" className="text-2xs font-bold text-primary">
            {t("viewAll")}
          </Link>
        }
        className="lg:col-span-2"
      >
        {data.custody.length === 0 ? (
          <EmptyState icon="packageCheck" title={tc("empty")} body={tc("emptyBody")} />
        ) : (
          <ul className="divide-y divide-border">
            {data.custody.slice(0, 4).map((entry) => (
              <CustodyRow key={entry.id} entry={entry} locale={locale} compact />
            ))}
          </ul>
        )}
      </WidgetBoundary>

      <WidgetBoundary title={t("lastTaken")}>
        {data.lastTaken.length === 0 ? (
          <EmptyState icon="history" title={t("lastTakenEmpty")} />
        ) : (
          <ul className="divide-y divide-border">
            {data.lastTaken.map((entry) => (
              <li key={entry.itemId} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{entry.itemName}</p>
                  <p className="tnum text-2xs text-muted-foreground">
                    {formatQty(entry.qty, locale)} {entry.unit} · {relativeTime(entry.at, locale)}
                  </p>
                </div>
                <Button asChild size="sm" variant="secondary" className="h-9 shrink-0">
                  <Link href={`/app/item/${entry.itemId}`}>{t("viewAll")}</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </WidgetBoundary>

      <WidgetBoundary title={t("history7d")}>
        {data.recent.length === 0 ? (
          <EmptyState icon="history" title={t("lastTakenEmpty")} />
        ) : (
          <ul className="space-y-1.5">
            {data.recent.slice(0, 7).map((tx) => (
              <li key={tx.id} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold">{tx.itemName}</span>
                  <span className="ml-1.5 text-2xs text-muted-foreground">
                    {relativeTime(tx.createdAt, locale)}
                  </span>
                </span>
                <Badge tone="neutral">
                  {tx.type === "issue" ? "−" : "+"}
                  {tx.qty}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </WidgetBoundary>

      <WidgetBoundary title={t("lowStock")} className="lg:col-span-2">
        {data.lowStock.length === 0 ? (
          <EmptyState icon="checkCircle" title={t("lowStockEmpty")} />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.lowStock.map((row) => (
              <li
                key={`${row.itemId}-${row.locationPath}`}
                className="rounded-xl border border-border p-3"
              >
                <p className="truncate text-sm font-bold">{row.itemName}</p>
                <p className="truncate text-2xs text-muted-foreground">{row.locationPath}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="tnum text-sm font-extrabold text-danger-foreground">
                    {formatQty(row.qty, locale)} {row.unit}
                  </span>
                  <ConfidenceBadge confidence={row.confidence} compact />
                </div>
              </li>
            ))}
          </ul>
        )}
      </WidgetBoundary>
    </div>
  );
}

function SupervisorSections({
  data,
  locale,
  isAdmin,
}: {
  data: DashboardResponse;
  locale: string;
  isAdmin: boolean;
}) {
  const t = useTranslations("dashboard");
  const k = data.kpis;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label={t("kpiBelowMin")}
          value={formatNumber(k.belowMin, locale)}
          tone={k.belowMin > 0 ? "danger" : "success"}
          href="/app/laporan"
        />
        <KpiCard
          label={t("kpiToday")}
          value={formatNumber(k.transactionsToday, locale)}
          href="/app/transaksi"
        />
        <KpiCard
          label={t("kpiReview")}
          value={formatNumber(k.needsReview, locale)}
          tone={k.needsReview > 0 ? "warning" : "neutral"}
          href="/app/opname"
        />
        <KpiCard
          label={t("kpiCounts")}
          value={formatNumber(k.openCounts, locale)}
          href="/app/opname"
        />
        <KpiCard
          label={t("kpiHighConfidence")}
          value={`${k.highConfidencePct}%`}
          tone="primary"
          href="/app/laporan"
        />
        <KpiCard
          label={t("kpiOverdue")}
          value={formatNumber(k.overdueCustody, locale)}
          tone={k.overdueCustody > 0 ? "warning" : "neutral"}
          href="/app/dibawa?scope=tim"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <WidgetBoundary title={t("liveActivity")}>
          <LiveActivity />
        </WidgetBoundary>

        <WidgetBoundary title={t("usageTrend")} className="lg:col-span-2">
          <TrendChart data={data.usage} />
        </WidgetBoundary>

        <WidgetBoundary title={t("lowStock")}>
          {data.lowStock.length === 0 ? (
            <EmptyState icon="checkCircle" title={t("lowStockEmpty")} />
          ) : (
            <ul className="divide-y divide-border">
              {data.lowStock.slice(0, 5).map((row) => (
                <li key={`${row.itemId}-${row.locationPath}`} className="py-2.5">
                  <p className="truncate text-sm font-bold">{row.itemName}</p>
                  <p className="truncate text-2xs text-muted-foreground">{row.locationPath}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="tnum text-[13px] font-extrabold text-danger-foreground">
                      {formatQty(row.qty, locale)} {row.unit}
                    </span>
                    <ConfidenceBadge confidence={row.confidence} compact />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </WidgetBoundary>

        <WidgetBoundary
          title={t("needsCount")}
          action={
            <Button asChild size="sm" variant="soft" className="h-8">
              <Link href="/app/opname?tab=needs">{t("needsCountCta")}</Link>
            </Button>
          }
        >
          {data.needsCount.length === 0 ? (
            <EmptyState icon="badgeCheck" title={t("needsCountEmpty")} />
          ) : (
            <ul className="divide-y divide-border">
              {data.needsCount.slice(0, 6).map((row) => (
                <li
                  key={`${row.itemId}-${row.locationPath}`}
                  className="flex items-center gap-2 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-bold">{row.itemName}</p>
                    <p className="truncate text-2xs text-muted-foreground">{row.locationPath}</p>
                  </div>
                  <Badge tone={row.level === "never" ? "neutral" : "danger"}>{row.score}</Badge>
                </li>
              ))}
            </ul>
          )}
        </WidgetBoundary>

        <WidgetBoundary title={t("topItems")}>
          {data.topItems.length === 0 ? (
            <EmptyState icon="chart" title={t("liveEmpty")} />
          ) : (
            <ol className="space-y-2">
              {data.topItems.map((row, index) => (
                <li key={row.id} className="flex items-center gap-2 text-[13px]">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-2xs font-bold">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{row.label}</span>
                  <span className="tnum shrink-0 font-bold text-muted-foreground">
                    {formatNumber(row.qty, locale)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </WidgetBoundary>

        {isAdmin && data.system ? (
          <WidgetBoundary title={t("systemStatus")} className="lg:col-span-2">
            <div className="grid grid-cols-2 gap-2.5 text-[13px] sm:grid-cols-3">
              <Stat label={t("systemVersion")} value={data.system.version} />
              <Stat
                label={t("systemActiveUsers")}
                value={formatNumber(data.system.activeUsers, locale)}
              />
              <Stat
                label={t("systemBackup")}
                value={
                  data.system.lastBackupAt ? relativeTime(data.system.lastBackupAt, locale) : "—"
                }
              />
              <Stat label={t("systemSheets")} value={data.system.sheetsSync} />
              <Stat
                label={t("systemOutbox")}
                value={formatNumber(data.system.pendingOutbox, locale)}
              />
            </div>
            <div className="mt-4">
              <p className="mb-2 text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("setupChecklist")}
              </p>
              <ul className="space-y-1.5">
                {data.system.setupChecklist.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 text-[13px]">
                    <Icon
                      name={item.done ? "checkCircle" : "circleDashed"}
                      className={cn(
                        "size-4 shrink-0",
                        item.done ? "text-success" : "text-muted-foreground",
                      )}
                    />
                    <span className={cn(item.done && "text-muted-foreground line-through")}>
                      {item.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </WidgetBoundary>
        ) : null}
      </div>
    </div>
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

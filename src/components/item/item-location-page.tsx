"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import { EmptyState } from "@/components/app/states";
import { ConfidenceBadge, ConfidenceWhy } from "@/components/confidence-badge";
import { Icon } from "@/components/icons";
import { StockBadge } from "@/components/stock-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { flags } from "@/lib/flags";
import { formatQty, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ItemLocationPage({ id }: { id: string }) {
  const t = useTranslations("item");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [manual, setManual] = React.useState("");
  const [manualError, setManualError] = React.useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: keys.item(id),
    queryFn: () => api.items.byId(id),
    retry: false,
  });

  const openManual = async (event: React.FormEvent) => {
    event.preventDefault();
    const code = manual.trim().toUpperCase();
    if (code.length < 3) {
      setManualError(t("notFoundBody"));
      return;
    }
    setManualError(null);
    router.push(`/i/${encodeURIComponent(code)}`);
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="mx-auto max-w-lg">
        <EmptyState
          icon="search"
          title={notFound ? t("notFound") : tc("loading")}
          body={t("notFoundBody")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {notFound ? null : (
                <Button variant="secondary" size="sm" onClick={() => void refetch()}>
                  {tc("retry")}
                </Button>
              )}
              <Button asChild variant="ghost" size="sm">
                <Link href="/app/cari">{tc("back")}</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const unit = data.unit?.symbol ?? "";
  const primary =
    data.stock.find((row) => row.locationId === data.item.primaryLocationId) ?? data.stock[0];

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/app/cari">
            <Icon name="arrowLeft" className="size-4" />
            {tc("back")}
          </Link>
        </Button>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-start gap-3">
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <Icon name="box" className="size-8" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold leading-tight tracking-[-0.01em] [overflow-wrap:anywhere] break-words">
              {data.item.name}
            </h1>
            <p className="mt-1 font-mono text-2xs text-muted-foreground">
              {t("itemCode")}: {data.item.code} · {data.item.sku}
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">
              {data.category?.name} · {t("minStock", { qty: data.item.minStock, unit })}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3">
          <div>
            <p className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("stockLabel")}
            </p>
            <p className="tnum mt-0.5 text-2xl font-extrabold">
              {formatQty(data.totalQty, locale)}{" "}
              <span className="text-sm font-bold text-muted-foreground">{unit}</span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StockBadge qty={data.totalQty} minStock={data.item.minStock} />
            <ConfidenceBadge
              confidence={primary?.confidence ?? { score: 0, level: "never", lastVerifiedAt: null }}
              showScore
            />
          </div>
        </div>

        {primary?.confidence.breakdown ? (
          <div className="mt-2 flex items-center gap-2">
            <ConfidenceWhy confidence={primary.confidence} />
            {primary.confidence.lastVerifiedAt ? (
              <span className="text-2xs text-muted-foreground">
                {t("lastUpdated", {
                  when: relativeTime(primary.confidence.lastVerifiedAt, locale),
                })}
              </span>
            ) : null}
          </div>
        ) : null}

        {data.takenByOthers > 0 && flags.cu ? (
          <p className="mt-2 rounded-lg bg-muted px-2.5 py-1.5 text-2xs font-semibold text-muted-foreground">
            {t("takenByOthers")}: {formatQty(data.takenByOthers, locale)} {unit}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
          {t("locationSection")}
        </h2>
        <ul className="mt-2 space-y-2">
          {data.stock.map((row) => (
            <li
              key={row.locationId}
              className={cn(
                "flex items-start justify-between gap-3 rounded-xl border p-3",
                row.locationId === primary?.locationId
                  ? "border-primary/40 bg-primary-soft/40"
                  : "border-border",
              )}
            >
              <div className="min-w-0">
                <p className="text-[13px] font-bold leading-snug">{row.location.path}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <ConfidenceBadge confidence={row.confidence} compact />
                  {row.locationId === primary?.locationId ? (
                    <span className="text-2xs font-bold text-primary">Utama</span>
                  ) : null}
                </div>
              </div>
              <span className="tnum shrink-0 text-sm font-extrabold">
                {formatQty(row.qty, locale)}{" "}
                <span className="text-2xs font-semibold text-muted-foreground">{unit}</span>
              </span>
            </li>
          ))}
          {data.stock.length === 0 ? (
            <li className="text-[13px] text-muted-foreground">{t("notFoundBody")}</li>
          ) : null}
        </ul>
      </section>

      <div className="sticky bottom-20 space-y-2 rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-card)] sm:bottom-4">
        <Button asChild size="xl" block>
          <Link href="/scan">
            <Icon name="scan" className="size-5" />
            {t("scanToTake")}
          </Link>
        </Button>
        <p className="text-center text-2xs text-muted-foreground">{t("infoOnly")}</p>

        <form onSubmit={openManual} className="flex gap-2">
          <Input
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            placeholder={t("manualCode")}
            aria-label={t("manualCodeLabel")}
            className="h-11 font-mono uppercase"
            data-testid="manual-code-input"
          />
          <Button
            type="submit"
            variant="secondary"
            className="h-11 shrink-0"
            data-testid="manual-code-submit"
          >
            {t("manualCodeSubmit")}
          </Button>
        </form>
        {manualError ? (
          <p className="text-2xs font-semibold text-danger-foreground">{manualError}</p>
        ) : null}
      </div>
    </div>
  );
}

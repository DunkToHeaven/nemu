"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import { EmptyState, ErrorState } from "@/components/app/states";
import { ConfidenceBadge, ConfidenceWhy } from "@/components/confidence-badge";
import { Icon } from "@/components/icons";
import { StockBadge } from "@/components/stock-badge";
import { TakeConfirmation } from "@/components/take/take-confirmation";
import { TakeForm, type TakeMode } from "@/components/take/take-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, api, type TransactionResponse } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { getLastSearched } from "@/lib/draft";
import { flags } from "@/lib/flags";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ScanPage({ code }: { code: string }) {
  const t = useTranslations("take");
  const ti = useTranslations("item");
  const tc = useTranslations("confirm");
  const locale = useLocale();

  const [mode, setMode] = React.useState<TakeMode>("issue");
  const [locationId, setLocationId] = React.useState<string>("");
  const [result, setResult] = React.useState<TransactionResponse | null>(null);
  const [mismatchDismissed, setMismatchDismissed] = React.useState(false);
  const [lastSearched, setLastSearchedState] = React.useState<{
    itemId: string;
    itemName: string;
  } | null>(null);

  React.useEffect(() => {
    setLastSearchedState(getLastSearched());
  }, []);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: keys.itemByCode(code),
    queryFn: () => api.items.byCode(code),
    retry: false,
  });

  React.useEffect(() => {
    if (!data) return;
    const primary = data.item.primaryLocationId;
    const preferred = data.stock.find((row) => row.locationId === primary) ?? data.stock[0];
    if (preferred) setLocationId(preferred.locationId);
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-56 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError) {
    const apiError = error instanceof ApiError ? error : null;
    // Tiga keadaan berbeda, tiga pesan berbeda. Menyamakan 401/500 dengan
    // "item nonaktif" menyesatkan pekerja: mereka akan melapor item yang salah.
    const notFound = apiError?.status === 404;
    const inactive = apiError?.status === 410;
    const title = notFound ? ti("notFound") : inactive ? ti("inactive") : ti("errorTitle");
    const body = notFound ? ti("notFoundBody") : inactive ? ti("inactiveBody") : ti("errorBody");
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/app">
            <Icon name="arrowLeft" className="size-4" />
            {ti("title")}
          </Link>
        </Button>
        <EmptyState
          icon={notFound ? "search" : "alert"}
          title={title}
          body={body}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {notFound || inactive ? null : (
                <Button onClick={() => void refetch()} variant="secondary" size="sm">
                  <Icon name="refresh" className="size-4" />
                  {ti("manualCodeSubmit")}
                </Button>
              )}
              <Button asChild size="sm">
                <Link href="/scan">{t("scanMethodInApp")}</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  if (!data) return <ErrorState onRetry={() => void refetch()} />;

  const unit = data.unit?.symbol ?? "";
  const level = data.stock.find((row) => row.locationId === locationId) ?? data.stock[0];
  const available = level?.qty ?? 0;
  const isMismatch =
    lastSearched !== null && lastSearched.itemId !== data.item.id && !mismatchDismissed;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/app">
            <Icon name="arrowLeft" className="size-4" />
            {ti("title")}
          </Link>
        </Button>
        <Badge tone="success">
          <Icon name="scan" className="size-3.5" />
          {t("scanMethodQr")}
        </Badge>
      </div>

      {isMismatch ? (
        <div
          className="rounded-2xl border-2 border-warning/50 bg-warning-soft/70 p-3.5"
          data-testid="item-mismatch"
        >
          <p className="flex items-center gap-2 text-sm font-extrabold text-warning-foreground">
            <Icon name="alert" className="size-4" />
            {t("itemMismatchTitle")}
          </p>
          <p className="mt-1 text-[13px] text-foreground">
            {t("itemMismatchBody", {
              expected: lastSearched?.itemName ?? "",
              actual: data.item.name,
            })}
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="h-10"
              onClick={() => setMismatchDismissed(true)}
            >
              {t("itemMismatchContinue")}
            </Button>
            <Button asChild size="sm" variant="ghost" className="h-10">
              <Link href="/app/cari">{t("itemMismatchBack")}</Link>
            </Button>
          </div>
        </div>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
        <div className="flex items-start gap-3">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-muted text-muted-foreground">
            <Icon name="box" className="size-7" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-extrabold leading-tight tracking-[-0.01em] [overflow-wrap:anywhere] break-words">
              {data.item.name}
            </h1>
            <p className="mt-0.5 font-mono text-2xs text-muted-foreground">
              {ti("codeLabel")}: {data.item.code}
            </p>
            <p className="mt-1 text-[13px] text-muted-foreground">{level?.location.path ?? "—"}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="tnum text-xl font-extrabold">{formatQty(available, locale)}</span>
          <span className="text-[13px] text-muted-foreground">{unit}</span>
          <StockBadge qty={available} minStock={data.item.minStock} />
          <ConfidenceBadge
            confidence={
              level?.confidence ??
              data.stock[0]?.confidence ?? { score: 0, level: "never", lastVerifiedAt: null }
            }
          />
          {level?.confidence.breakdown ? <ConfidenceWhy confidence={level.confidence} /> : null}
        </div>

        {data.takenByOthers > 0 && flags.cu ? (
          <p className="mt-2 text-2xs text-muted-foreground">
            {ti("takenByOthers")}:{" "}
            <span className="tnum font-bold">
              {formatQty(data.takenByOthers, locale)} {unit}
            </span>
          </p>
        ) : null}
      </section>

      {result ? (
        <TakeConfirmation
          result={result}
          unit={unit}
          itemName={data.item.name}
          onTakeAgain={() => setResult(null)}
          onDone={() => {
            window.location.href = "/app";
          }}
        />
      ) : (
        <>
          <div
            className="grid grid-cols-3 gap-1.5 rounded-full bg-muted p-1.5"
            role="tablist"
            aria-label={t("title")}
          >
            {(["issue", "return", "receive"] as TakeMode[]).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                onClick={() => setMode(value)}
                className={cn(
                  "min-h-10 rounded-full text-[13px] font-bold transition-colors",
                  mode === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                {value === "issue"
                  ? t("modeIssue")
                  : value === "return"
                    ? t("modeReturn")
                    : t("modeReceive")}
              </button>
            ))}
          </div>

          <section className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <TakeForm
              detail={data}
              mode={mode}
              locationId={locationId}
              onLocationChange={setLocationId}
              onSuccess={(next) => {
                setResult(next);
                if (next.verificationPrompt) {
                  // Pertanyaan muncul ≤ 100 ms setelah konfirmasi (CV-01).
                  setResult(next);
                }
                void refetch();
              }}
            />
          </section>

          <p className="text-center text-2xs text-muted-foreground">{tc("noCustody")}</p>
        </>
      )}
    </div>
  );
}

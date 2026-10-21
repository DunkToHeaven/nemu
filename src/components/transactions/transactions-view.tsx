"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/states";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api, type Transaction } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { formatDate, formatQty, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const TYPES = ["issue", "return", "receive", "consume", "adjust", "reversal", "transfer"] as const;

const TONE: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  issue: "warning",
  return: "success",
  receive: "info",
  consume: "neutral",
  adjust: "info",
  reversal: "danger",
  transfer: "neutral",
};

export function TransactionsView() {
  const t = useTranslations("transactions");
  const locale = useLocale();
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [type, setType] = React.useState<string>("all");
  const [days, setDays] = React.useState(30);
  const [selected, setSelected] = React.useState<Transaction | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const from = React.useMemo(() => new Date(Date.now() - days * 86_400_000).toISOString(), [days]);

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: keys.tx({ scope: "all", q: debounced, type, days }),
      initialPageParam: null as string | null,
      queryFn: ({ pageParam }) =>
        api.tx.list({
          limit: 50,
          cursor: pageParam,
          q: debounced || undefined,
          type: type === "all" ? undefined : type,
          from,
        }),
      getNextPageParam: (last) => last.nextCursor,
    });

  const rows = React.useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);
  const parentRef = React.useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 12,
  });

  const items = virtualizer.getVirtualItems();

  React.useEffect(() => {
    const last = items[items.length - 1];
    if (!last) return;
    if (last.index >= rows.length - 4 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [items, rows.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const exportCsv = () => {
    const header = ["id", "created_at", "type", "item", "sku", "qty", "user", "ref", "method"];
    const lines = rows.map((row) =>
      [
        row.id,
        row.createdAt,
        row.type,
        row.itemName ?? "",
        row.itemCode ?? "",
        row.qty,
        row.userName ?? "",
        row.refNo ?? "",
        row.scanMethod ?? "",
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nemu-transaksi-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold">{t("title")}</h1>
          <p className="text-[13px] text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button size="sm" variant="secondary" onClick={exportCsv} disabled={rows.length === 0}>
          <Icon name="download" className="size-4" />
          {t("exportCsv")}
        </Button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-11 pl-10"
            data-testid="tx-search"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-thin">
          {(["all", ...TYPES] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setType(option)}
              className={cn(
                "min-h-11 shrink-0 rounded-full border px-3 text-[13px] font-bold transition-colors",
                type === option
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {option === "all" ? t("filterType") : option}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {[7, 30, 90].map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setDays(option)}
              className={cn(
                "min-h-11 shrink-0 rounded-full border px-3 text-[13px] font-bold transition-colors",
                days === option
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {option}d
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon="list" title={t("empty")} body={t("emptyBody")} />
      ) : (
        <>
          <p className="px-1 text-2xs text-muted-foreground">
            {t("total", { count: rows.length })} · {t("virtualHint")}
          </p>

          {/* Desktop: virtualized table. HP: daftar kartu. */}
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-card sm:block">
            <div className="grid grid-cols-[110px_1fr_90px_90px_120px_90px] gap-2 border-b border-border bg-muted/60 px-3 py-2 text-2xs font-bold uppercase tracking-wide text-muted-foreground">
              <span>{t("time")}</span>
              <span>{t("item")}</span>
              <span>{t("type")}</span>
              <span className="text-right">{t("qty")}</span>
              <span>{t("user")}</span>
              <span>{t("ref")}</span>
            </div>
            <div
              ref={parentRef}
              className="max-h-[calc(100dvh-320px)] overflow-auto scrollbar-thin"
              data-testid="tx-scroll"
            >
              <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                {items.map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  if (!row) return null;
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setSelected(row)}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      className="grid h-16 grid-cols-[110px_1fr_90px_90px_120px_90px] items-center gap-2 border-b border-border px-3 text-left text-[13px] hover:bg-muted/50"
                    >
                      <span className="tnum text-2xs text-muted-foreground">
                        {formatTime(row.createdAt, locale)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{row.itemName}</span>
                        <span className="block truncate font-mono text-2xs text-muted-foreground">
                          {row.itemCode}
                        </span>
                      </span>
                      <span>
                        <Badge tone={TONE[row.type] ?? "neutral"}>{row.type}</Badge>
                      </span>
                      <span className="tnum text-right font-bold">
                        {formatQty(row.qty, locale)}
                      </span>
                      <span className="truncate text-2xs text-muted-foreground">
                        {row.userName}
                      </span>
                      <span className="truncate font-mono text-2xs text-muted-foreground">
                        {row.refNo ?? "—"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card sm:hidden">
            {rows.slice(0, 60).map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setSelected(row)}
                  className="flex w-full items-start gap-3 p-3.5 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{row.itemName}</p>
                    <p className="truncate text-2xs text-muted-foreground">
                      {row.userName} · {formatDate(row.createdAt, locale, true)}
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <Badge tone={TONE[row.type] ?? "neutral"}>{row.type}</Badge>
                      {row.refNo ? (
                        <span className="font-mono text-2xs text-muted-foreground">
                          {row.refNo}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <span className="tnum shrink-0 text-sm font-extrabold">
                    {formatQty(row.qty, locale)}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {hasNextPage ? (
            <Button
              variant="secondary"
              block
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? <Icon name="spinner" className="size-4 animate-spin" /> : null}
              {isFetchingNextPage ? t("loadingMore") : t("loadMore")}
            </Button>
          ) : null}
        </>
      )}

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t("detail")}</SheetTitle>
            <SheetDescription>{selected?.itemName}</SheetDescription>
          </SheetHeader>
          {selected ? (
            <dl className="space-y-2 text-[13px]">
              {[
                [t("time"), formatDate(selected.createdAt, locale, true)],
                [t("item"), `${selected.itemName} · ${selected.itemCode}`],
                [t("type"), selected.type],
                [t("qty"), formatQty(selected.qty, locale)],
                [t("user"), selected.userName ?? "—"],
                [t("ref"), selected.refNo ?? "—"],
                [t("method"), selected.scanMethod ?? "—"],
                ["ID", selected.id],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="flex justify-between gap-3 border-b border-border pb-1.5"
                >
                  <dt className="shrink-0 text-muted-foreground">{label}</dt>
                  <dd className="truncate text-right font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/app/states";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { api, type Transaction } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { formatQty, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const TYPE_TONE: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  issue: "warning",
  return: "success",
  receive: "info",
  consume: "neutral",
  adjust: "info",
  reversal: "danger",
  transfer: "neutral",
};

export function HistoryView() {
  const t = useTranslations("history");
  const locale = useLocale();
  const [type, setType] = React.useState<string>("all");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: keys.tx({ scope: "mine", type }),
    queryFn: () => api.tx.list({ limit: 200, ...(type === "all" ? {} : { type }) }),
  });

  const rows = data?.data ?? [];
  const grouped = React.useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const tx of rows) {
      const key = tx.createdAt.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(tx);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [rows]);

  if (isLoading) return <ListSkeleton rows={6} />;
  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex-1 text-lg font-extrabold">{t("title")}</h1>
        <Badge tone="neutral">{t("countLabel", { count: data?.total ?? 0 })}</Badge>
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-thin">
        {[
          { value: "all", label: t("filterAll") },
          { value: "issue", label: t("typeIssue") },
          { value: "return", label: t("typeReturn") },
          { value: "consume", label: t("typeConsume") },
          { value: "reversal", label: t("typeReversal") },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setType(option.value)}
            className={cn(
              "min-h-9 shrink-0 rounded-full border px-3 text-[13px] font-bold transition-colors",
              type === option.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="history" title={t("empty")} body={t("emptyBody")} />
      ) : (
        <div className="space-y-4">
          {grouped.map(([day, entries]) => (
            <section key={day}>
              <h2 className="mb-1.5 px-1 text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                {day === today ? t("groupToday") : day === yesterday ? t("groupYesterday") : day}
              </h2>
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                {entries.map((tx) => (
                  <li key={tx.id} className="flex items-start gap-3 p-3.5">
                    <span
                      className={cn(
                        "mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl",
                        tx.type === "issue"
                          ? "bg-warning-soft text-warning-foreground"
                          : "bg-success-soft text-success-foreground",
                      )}
                    >
                      <Icon
                        name={
                          tx.type === "issue"
                            ? "package"
                            : tx.type === "reversal"
                              ? "refresh"
                              : "packageCheck"
                        }
                        className="size-4"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-bold">{tx.itemName}</p>
                        <span className="tnum shrink-0 text-sm font-extrabold">
                          {tx.type === "issue" ? "−" : "+"}
                          {formatQty(tx.qty, locale)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone={TYPE_TONE[tx.type] ?? "neutral"}>
                          {t(
                            `type${tx.type.charAt(0).toUpperCase()}${tx.type.slice(1)}` as "typeIssue",
                          )}
                        </Badge>
                        <span className="text-2xs text-muted-foreground">
                          {formatTime(tx.createdAt, locale)}
                        </span>
                        {tx.refNo ? (
                          <span className="font-mono text-2xs text-muted-foreground">
                            {tx.refNo}
                          </span>
                        ) : null}
                        {tx.reversesId ? <Badge tone="danger">{t("reversed")}</Badge> : null}
                        {tx.reviewStatus === "needs_review" ? (
                          <Badge tone="warning">{t("needsReview")}</Badge>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="px-1 text-center text-2xs text-muted-foreground">{t("idempotentNote")}</p>
        </div>
      )}
    </div>
  );
}

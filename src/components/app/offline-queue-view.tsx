"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";
import { EmptyState, ListSkeleton } from "@/components/app/states";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError, api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { flags } from "@/lib/flags";
import { relativeTime } from "@/lib/format";
import {
  clearQueue,
  listQueue,
  type QueuedTx,
  removeEntry,
  updateEntry,
} from "@/lib/offline-queue";
import { cn } from "@/lib/utils";

const STATUS_TONE = {
  pending: "warning",
  syncing: "info",
  needs_review: "danger",
  failed: "danger",
} as const;

export function OfflineQueueView() {
  const t = useTranslations("offline");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [online, setOnline] = React.useState(true);

  React.useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  const queue = useQuery({
    queryKey: ["offline-queue"],
    queryFn: () => listQueue(),
    refetchInterval: 5_000,
  });

  const sync = useMutation({
    mutationFn: async (rows: QueuedTx[]) => {
      for (const row of rows) await updateEntry(row.id, { status: "syncing" });
      const response = await api.sync.batch(rows.map((row) => row.payload));
      for (const result of response.results) {
        if (result.status === "ok" || result.status === "duplicate") {
          await removeEntry(result.idempotencyKey);
        } else {
          await updateEntry(result.idempotencyKey, {
            status: result.status === "needs_review" ? "needs_review" : "failed",
            attempts: (rows.find((row) => row.id === result.idempotencyKey)?.attempts ?? 0) + 1,
            lastError: result.message,
          });
        }
      }
      return response;
    },
    onSuccess: (response) => {
      void queryClient.invalidateQueries({ queryKey: ["offline-queue"] });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
      if (response.needsReview > 0) {
        toast.warning(t("syncNeedsReview", { count: response.needsReview }));
      } else {
        toast.success(t("syncDone", { count: response.ok + response.duplicate }));
      }
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: ["offline-queue"] });
      toast.error(error instanceof ApiError ? error.message : t("syncFailed"));
    },
  });

  const rows = queue.data ?? [];
  const pending = rows.filter((row) => row.status !== "needs_review" && row.status !== "failed");

  if (!flags.offline) {
    return <EmptyState icon="wifiOff" title={t("flagOff")} body={t("flagOffBody")} />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold">{t("title")}</h1>
          <p className="text-[13px] text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Badge tone={online ? "success" : "danger"}>
          <Icon name={online ? "wifi" : "wifiOff"} className="size-3.5" />
          {online ? t("online") : t("offlineNow")}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label={t("statPending")} value={pending.length} />
        <Stat
          label={t("statReview")}
          value={rows.filter((row) => row.status === "needs_review").length}
        />
        <Stat
          label={t("statFailed")}
          value={rows.filter((row) => row.status === "failed").length}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => sync.mutate(pending)}
          disabled={pending.length === 0 || !online || sync.isPending}
        >
          {sync.isPending ? (
            <Icon name="spinner" className="size-4 animate-spin" />
          ) : (
            <Icon name="refresh" className="size-4" />
          )}
          {sync.isPending ? t("syncing") : t("syncNow", { count: pending.length })}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            await clearQueue();
            void queryClient.invalidateQueries({ queryKey: ["offline-queue"] });
            toast.success(t("cleared"));
          }}
          disabled={rows.length === 0}
        >
          {t("clear")}
        </Button>
      </div>

      {queue.isLoading ? (
        <ListSkeleton rows={4} />
      ) : rows.length === 0 ? (
        <EmptyState icon="checkCircle" title={t("empty")} body={t("emptyBody")} />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-col gap-1.5 px-4 py-3">
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_TONE[row.status]}>
                  {t(`status_${row.status}` as "status_pending")}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{row.label}</span>
                <span className="text-2xs text-muted-foreground">
                  {relativeTime(new Date(row.createdAt).toISOString(), locale)}
                </span>
              </div>
              <p className="text-2xs text-muted-foreground">
                {row.payload.type} · {row.payload.qty} · {row.payload.itemCode}
                {row.attempts > 0 ? ` · ${t("attempts", { count: row.attempts })}` : ""}
              </p>
              {row.lastError ? (
                <p
                  className={cn(
                    "rounded-lg px-2 py-1 text-2xs font-semibold",
                    row.status === "needs_review"
                      ? "bg-warning-soft text-warning-foreground"
                      : "bg-danger-soft text-danger-foreground",
                  )}
                >
                  {row.lastError}
                </p>
              ) : null}
              {row.status === "needs_review" || row.status === "failed" ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-8"
                    onClick={() => sync.mutate([row])}
                  >
                    {t("retry")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8"
                    onClick={async () => {
                      await removeEntry(row.id);
                      void queryClient.invalidateQueries({ queryKey: ["offline-queue"] });
                    }}
                  >
                    {t("discard")}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p className="rounded-xl bg-muted px-3 py-2 text-2xs text-muted-foreground">{t("note")}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-2xs text-muted-foreground">{label}</p>
      <p className="tnum text-lg font-extrabold">{value}</p>
    </div>
  );
}

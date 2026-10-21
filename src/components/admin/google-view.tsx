"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { ErrorState, ListSkeleton } from "@/components/app/states";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError, api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function GoogleView() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: keys.google,
    queryFn: () => api.admin.google(),
  });

  const action = useMutation({
    mutationFn: (name: string) => api.admin.googleAction(name),
    onSuccess: (_result, name) => {
      void queryClient.invalidateQueries({ queryKey: keys.google });
      if (name === "check") toast.success(t("googleCheckOk"));
      else if (name === "repair") toast.success(t("googleRepair"));
      else if (name === "sync") toast.success(t("googleSync"));
      else if (name === "disconnect") toast.success(t("googleDisconnect"));
      else toast.success(t("googleConnect"));
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Aksi gagal."),
  });

  if (isLoading) return <ListSkeleton rows={5} />;
  if (isError || !data) return <ErrorState onRetry={() => void refetch()} />;

  const integration = data.integration;

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div>
        <h1 className="text-lg font-extrabold">{t("googleTitle")}</h1>
        <p className="text-[13px] text-muted-foreground">{t("googleSubtitle")}</p>
      </div>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={integration.connected ? "success" : "neutral"}>
            <Icon name={integration.connected ? "cloud" : "wifiOff"} className="size-3.5" />
            {integration.connected ? t("googleConnected") : t("googleDisconnected")}
          </Badge>
          <Badge
            tone={
              integration.checkStatus === "ok"
                ? "success"
                : integration.checkStatus === "error"
                  ? "danger"
                  : "neutral"
            }
          >
            {integration.checkStatus}
          </Badge>
          <span className="text-2xs text-muted-foreground">
            {t("googleSchema")}: {integration.schemaVersion} / {integration.appSchemaVersion}
          </span>
        </div>

        <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
          <Row label={t("googleAccount")} value={integration.accountEmail ?? "—"} />
          <Row label={t("googleFolder")} value={integration.folderName ?? "—"} />
          <Row
            label={t("googleLastSync")}
            value={integration.lastSyncAt ? relativeTime(integration.lastSyncAt, locale) : "—"}
          />
          <Row label={t("googleProtected")} value={String(integration.protectedRanges)} />
          <Row label={t("googleScopes")} value={integration.scopes.join(", ") || "—"} />
        </dl>

        {integration.checkMessage ? (
          <p
            className={cn(
              "rounded-xl px-3 py-2 text-[13px]",
              integration.checkStatus === "error"
                ? "bg-danger-soft text-danger-foreground"
                : "bg-info-soft text-info-foreground",
            )}
          >
            {integration.checkMessage}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {integration.connected ? (
            <>
              <Button size="sm" onClick={() => action.mutate("sync")} disabled={action.isPending}>
                <Icon name="refresh" className="size-4" />
                {t("googleSync")}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => action.mutate("check")}>
                <Icon name="shieldCheck" className="size-4" />
                {t("googleCheck")}
              </Button>
              <Button size="sm" variant="secondary" onClick={() => action.mutate("repair")}>
                <Icon name="settings" className="size-4" />
                {t("googleRepair")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => action.mutate("disconnect")}>
                {t("googleDisconnect")}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => action.mutate("connect")} disabled={action.isPending}>
              <Icon name="cloud" className="size-4" />
              {action.isPending ? t("googleConnecting") : t("googleConnect")}
            </Button>
          )}
        </div>

        <p className="rounded-xl bg-muted px-3 py-2 text-2xs text-muted-foreground">
          {t("googleSetupHint")}
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-2xs font-bold uppercase tracking-wide text-muted-foreground">
          {t("googleRuns")}
        </h2>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {integration.runs.map((run) => (
            <li key={run.id} className="flex items-center gap-2 px-4 py-2.5 text-[13px]">
              <Badge
                tone={
                  run.status === "ok" ? "success" : run.status === "failed" ? "danger" : "warning"
                }
              >
                {run.status === "ok"
                  ? t("googleRunOk")
                  : run.status === "failed"
                    ? t("googleRunFailed")
                    : t("googleRunPending")}
              </Badge>
              <span className="flex-1 font-semibold">{run.direction}</span>
              <span className="tnum text-2xs text-muted-foreground">{run.rows}</span>
              <span className="text-2xs text-muted-foreground">
                {relativeTime(run.startedAt, locale)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border pb-1.5">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-semibold">{value}</dd>
    </div>
  );
}

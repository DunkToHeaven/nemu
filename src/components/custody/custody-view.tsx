"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/app/states";
import { CustodyRow } from "@/components/custody/custody-row";
import { Icon } from "@/components/icons";
import { useSession } from "@/components/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiError, api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import type { CustodyEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CustodyView() {
  const t = useTranslations("custody");
  const locale = useLocale();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const { role } = useSession();
  const canTeam = role !== "worker";
  const [scope, setScope] = React.useState<"mine" | "team">(
    params.get("scope") === "tim" && canTeam ? "team" : "mine",
  );

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: keys.custody(scope === "team" ? "team" : undefined),
    queryFn: () => api.custody.list(scope === "team" ? "team" : undefined),
  });

  const batch = useMutation({
    mutationFn: async (rows: CustodyEntry[]) => {
      const response = await api.custody.settleBatch(
        rows.map((row) => ({ id: row.id, outcome: "used" as const, qty: row.qtyOpen })),
      );
      const failed = response.results.filter((result) => !result.ok);
      if (failed.length > 0) {
        throw new ApiError(409, "PARTIAL", failed[0]?.message ?? "Sebagian entri gagal ditutup.");
      }
      return response.results.length;
    },
    onSuccess: (count) => {
      toast.success(t("closeAllDone", { count }));
      void queryClient.invalidateQueries({ queryKey: keys.custody() });
      void queryClient.invalidateQueries({ queryKey: keys.custody("team") });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
      void refetch();
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : "Gagal menutup entri.");
    },
  });

  if (isLoading) return <ListSkeleton rows={5} />;
  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  const rows = data?.data ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="flex-1 text-lg font-extrabold">
          {scope === "team" ? t("teamTitle") : t("title")}
        </h1>
        <Badge tone={rows.length > 0 ? "warning" : "success"}>{rows.length}</Badge>
      </div>

      {canTeam ? (
        <div className="inline-flex rounded-full bg-muted p-1.5" role="tablist">
          {(["mine", "team"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={scope === value}
              onClick={() => setScope(value)}
              className={cn(
                "min-h-9 rounded-full px-4 text-[13px] font-bold transition-colors",
                scope === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {value === "mine" ? t("scopeMine") : t("scopeTeam")}
            </button>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon="packageCheck"
          title={scope === "team" ? t("emptyTeam") : t("empty")}
          body={scope === "team" ? undefined : t("emptyBody")}
        />
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card px-4">
            {rows.map((entry) => (
              <CustodyRow
                key={entry.id}
                entry={entry}
                locale={locale}
                showOwner={scope === "team"}
                onChanged={() => void refetch()}
              />
            ))}
          </ul>

          {scope === "mine" && rows.length > 1 ? (
            <Button
              variant="secondary"
              block
              size="lg"
              onClick={() => batch.mutate(rows)}
              disabled={batch.isPending}
              data-testid="close-all"
            >
              <Icon name="packageCheck" className="size-5" />
              {t("closeAll")}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/states";
import { Icon } from "@/components/icons";
import { useSession } from "@/components/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, api, type LocationRow } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { formatQty } from "@/lib/format";

const TYPE_TONE = { warehouse: "primary", zone: "info", rack: "neutral", bin: "neutral" } as const;

export function LocationsTable() {
  const t = useTranslations("database");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { role } = useSession();
  const isAdmin = role === "admin";
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: keys.locations({ q: debounced }),
    queryFn: () => api.master.locations({ q: debounced || undefined }),
  });

  const toggle = useMutation({
    mutationFn: (row: LocationRow) => api.admin.updateLocation(row.id, { active: !row.active }),
    onSuccess: (result) => {
      toast.success(result.message ?? t("saved"));
      void queryClient.invalidateQueries({ queryKey: ["locations"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Gagal menyimpan."),
  });

  if (isLoading) return <TableSkeleton rows={10} />;
  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  const rows = data?.data ?? [];

  return (
    <div className="space-y-3">
      <div className="relative">
        <Icon
          name="search"
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className="h-11 pl-10"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="boxes" title={t("empty")} body={t("emptyBody")} />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold">{row.path}</p>
                <p className="text-2xs text-muted-foreground">
                  {row.code} ·{" "}
                  {t("pageInfo", { shown: row.itemCount ?? 0, total: row.totalQty ?? 0 })}
                </p>
              </div>
              <Badge tone={TYPE_TONE[row.type]}>
                {row.type === "warehouse"
                  ? t("typeWarehouse")
                  : row.type === "zone"
                    ? t("typeZone")
                    : row.type === "rack"
                      ? t("typeRack")
                      : t("typeBin")}
              </Badge>
              {row.active ? null : <Badge tone="neutral">nonaktif</Badge>}
              {isAdmin ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9"
                  onClick={() => toggle.mutate(row)}
                  disabled={toggle.isPending}
                >
                  {row.active ? t("bulkDeactivate") : t("bulkActivate")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <p className="text-2xs text-muted-foreground">{t("cannotDeleteHasStock")}</p>
      <p className="sr-only">{formatQty(rows.length, locale)}</p>
    </div>
  );
}

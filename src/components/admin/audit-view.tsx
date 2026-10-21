"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/states";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const ENTITIES = ["all", "item", "location", "reason", "user", "settings", "import", "integration"];

export function AuditView() {
  const t = useTranslations("admin");
  const locale = useLocale();
  const [entity, setEntity] = React.useState("all");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: keys.audit(entity === "all" ? undefined : entity),
    queryFn: () => api.admin.audit(entity === "all" ? undefined : entity),
  });

  if (isLoading) return <TableSkeleton rows={8} />;
  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  const rows = data?.data ?? [];

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-lg font-extrabold">{t("auditTitle")}</h1>
        <p className="text-[13px] text-muted-foreground">{t("auditSubtitle")}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ENTITIES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setEntity(option)}
            className={cn(
              "min-h-9 rounded-full border px-3 text-2xs font-bold transition-colors",
              entity === option
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            {option === "all" ? t("auditAll") : option}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="shield" title={t("auditEmpty")} />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5 text-[13px]">
              <Badge
                tone={
                  row.action === "create"
                    ? "success"
                    : row.action === "deactivate" || row.action === "delete"
                      ? "danger"
                      : "info"
                }
              >
                {row.action}
              </Badge>
              <span className="font-semibold">{row.entity}</span>
              <span className="font-mono text-2xs text-muted-foreground">{row.entityId}</span>
              <span className="flex-1 truncate text-2xs text-muted-foreground">
                {row.actorName}
              </span>
              <span className="text-2xs text-muted-foreground">{row.source}</span>
              <span className="text-2xs text-muted-foreground">
                {formatDate(row.createdAt, locale, true)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useTranslations } from "next-intl";
import type * as React from "react";
import { Icon, type IconName } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon = "box",
  title,
  body,
  action,
  className,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-10 text-center",
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
        <Icon name={icon} className="size-6" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-bold text-foreground">{title}</p>
        {body ? (
          <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-muted-foreground">
            {body}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title,
  body,
  onRetry,
  className,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const t = useTranslations("errors");
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-danger/40 bg-danger-soft/60 px-6 py-8 text-center",
        className,
      )}
    >
      <span className="grid size-11 place-items-center rounded-2xl bg-danger-soft text-danger-foreground">
        <Icon name="triangle" className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-bold text-foreground">{title ?? t("title")}</p>
        <p className="mx-auto max-w-sm text-[13px] text-muted-foreground">{body ?? t("body")}</p>
      </div>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <Icon name="refresh" className="size-4" />
          {t("retry")}
        </Button>
      ) : null}
    </div>
  );
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <Skeleton className="h-4 w-1/3" />
      <SkeletonText lines={rows} />
    </div>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-border rounded-2xl border border-border bg-card">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 p-4">
          <Skeleton className="size-10 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-6 w-12 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex gap-4 border-b border-border px-4 py-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex gap-4 border-b border-border px-4 py-3.5 last:border-0">
          {Array.from({ length: 5 }).map((__, cell) => (
            <Skeleton key={cell} className="h-3.5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-7 w-1/2" />
        </div>
      ))}
    </div>
  );
}

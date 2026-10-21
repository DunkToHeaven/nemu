"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { Icon } from "@/components/icons";
import { StockBadge } from "@/components/stock-badge";
import type { SearchItem } from "@/lib/api/client";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ResultRow({
  row,
  compact = false,
  onSelect,
}: {
  row: SearchItem;
  compact?: boolean;
  onSelect?: () => void;
}) {
  const t = useTranslations("stock");
  const locale = useLocale();
  const unit = row.unit?.symbol ?? "";

  return (
    <Link
      href={`/app/item/${row.item.id}`}
      data-testid="search-result"
      onClick={onSelect}
      className={cn(
        "group flex items-start gap-3 border-b border-border px-4 py-3.5 transition-colors last:border-0 hover:bg-muted/50",
        compact && "py-3",
      )}
    >
      <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
        <Icon name="box" className="size-5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="truncate text-[15px] font-bold text-foreground">{row.item.name}</span>
          <span className="font-mono text-2xs text-muted-foreground">{row.item.sku}</span>
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
          <span className="tnum font-bold text-foreground">
            {formatQty(row.totalQty, locale)} {unit}
          </span>
          <span aria-hidden="true">·</span>
          <span className="truncate">{row.primaryLocation?.path ?? "—"}</span>
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <ConfidenceBadge confidence={row.confidence} compact />
          <StockBadge qty={row.totalQty} minStock={row.item.minStock} />
        </span>
      </span>

      <Icon name="chevronRight" className="mt-2 size-4 shrink-0 text-muted-foreground" />
      <span className="sr-only">{t("available")}</span>
    </Link>
  );
}

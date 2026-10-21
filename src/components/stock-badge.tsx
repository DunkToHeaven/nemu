"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { stockStatus } from "@/lib/domain/stock";
import { cn } from "@/lib/utils";

const TONE = {
  safe: "success",
  low: "warning",
  critical: "danger",
  empty: "danger",
  over: "info",
} as const;

const ICON = {
  safe: "checkCircle",
  low: "alert",
  critical: "alert",
  empty: "x",
  over: "info",
} as const;

export function StockBadge({
  qty,
  minStock,
  className,
}: {
  qty: number;
  minStock: number;
  className?: string;
}) {
  const t = useTranslations("stock");
  const status = stockStatus({ qty, minStock });
  return (
    <Badge tone={TONE[status]} className={cn(className)} data-testid={`stock-${status}`}>
      <Icon name={ICON[status]} className="size-3.5" />
      {t(status)}
    </Badge>
  );
}

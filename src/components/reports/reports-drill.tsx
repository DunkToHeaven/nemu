"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { formatQty, relativeTime } from "@/lib/format";

/**
 * Drill-down laporan: satu card angka adalah hasil agregasi; klik card/baris
 * membuka daftar item (atau transaksi) yang membentuk angka itu.
 */
export interface DrillTarget {
  kind: string;
  /** id bucket/karyawan/alasan/mesin — untuk kind yang membutuhkannya. */
  id?: string;
  /** Juduk card yang diklik, dipakai sebagai judul sheet. */
  label: string;
}

const TX_TONE: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  issue: "warning",
  return: "success",
  receive: "info",
  consume: "neutral",
  adjust: "info",
  reversal: "danger",
  transfer: "neutral",
};

export function ReportDrillSheet({
  target,
  days,
  onClose,
}: {
  target: DrillTarget | null;
  days: number;
  onClose: () => void;
}) {
  const t = useTranslations("reports");
  const th = useTranslations("history");
  const locale = useLocale();

  const drill = useQuery({
    queryKey: keys.reportDrill(target ? { kind: target.kind, id: target.id ?? "", days } : null),
    queryFn: () => api.reportDrill({ kind: target!.kind, id: target!.id ?? "", days }),
    enabled: Boolean(target),
  });

  return (
    <Sheet open={Boolean(target)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-w-[560px]">
        <SheetHeader>
          <SheetTitle>{target?.label ?? ""}</SheetTitle>
          <SheetDescription>
            {days}d · {t("drillSubtitle")}
          </SheetDescription>
        </SheetHeader>

        {drill.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
            <Skeleton className="h-12 rounded-xl" />
          </div>
        ) : drill.isError ? (
          <p className="rounded-xl border border-dashed border-border p-3 text-2xs text-muted-foreground">
            {t("drillEmpty")}
          </p>
        ) : drill.data ? (
          drill.data.items.length > 0 ? (
            <ItemDrill rows={drill.data.items} locale={locale} />
          ) : drill.data.tx.length > 0 ? (
            <TxDrill
              rows={drill.data.tx}
              locale={locale}
              typeLabel={(key) =>
                th(`type${key.charAt(0).toUpperCase()}${key.slice(1)}` as "typeIssue")
              }
            />
          ) : (
            <p className="rounded-xl border border-dashed border-border p-3 text-2xs text-muted-foreground">
              {t("drillEmpty")}
            </p>
          )
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function ItemDrill({
  rows,
  locale,
}: {
  rows: {
    itemId: string;
    name: string;
    code: string;
    qty: number;
    minStock: number;
    maxStock: number | null;
    locationPath: string;
    unit: string;
    lastCountedAt: string | null;
    lastMovedAt: string | null;
  }[];
  locale: string;
}) {
  const t = useTranslations("reports");
  return (
    <ul className="divide-y divide-border" data-testid="drill-items">
      {rows.map((row, index) => (
        <li key={`${row.itemId}-${index}`}>
          <Link
            href={`/app/item/${row.itemId}`}
            data-testid={`drill-item-${row.itemId}`}
            className="flex items-center gap-3 py-2.5 transition-colors hover:bg-muted/40"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold">{row.name}</p>
              <p className="truncate font-mono text-2xs text-muted-foreground">
                {row.code} · {row.locationPath}
              </p>
              {row.lastCountedAt === null ? (
                <p className="mt-0.5 text-2xs font-semibold text-warning-foreground">
                  {t("neverCounted")}
                </p>
              ) : null}
            </div>
            <div className="text-right">
              <p className="tnum text-sm font-extrabold">
                {formatQty(row.qty, locale)} {row.unit}
              </p>
              <p className="tnum text-2xs text-muted-foreground">
                min {row.minStock}
                {row.maxStock !== null ? ` · maks ${row.maxStock}` : ""}
              </p>
            </div>
            <Icon name="chevronRight" className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function TxDrill({
  rows,
  locale,
  typeLabel,
}: {
  rows: {
    txId: string;
    itemId: string;
    itemName: string;
    itemCode: string;
    userName: string;
    type: string;
    qty: number;
    createdAt: string;
    note: string | null;
    refNo: string | null;
  }[];
  locale: string;
  typeLabel: (key: string) => string;
}) {
  return (
    <ul className="divide-y divide-border" data-testid="drill-tx">
      {rows.map((row, index) => (
        <li key={`${row.txId}-${index}`}>
          <Link
            href={`/app/item/${row.itemId}`}
            data-testid={`drill-tx-${row.txId}`}
            className="flex items-center gap-3 py-2.5 transition-colors hover:bg-muted/40"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold">{row.itemName}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge tone={TX_TONE[row.type] ?? "neutral"}>{typeLabel(row.type)}</Badge>
                <span className="text-2xs text-muted-foreground">{row.userName}</span>
                {row.refNo ? (
                  <span className="font-mono text-2xs text-muted-foreground">{row.refNo}</span>
                ) : null}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="tnum text-sm font-extrabold">{formatQty(row.qty, locale)}</p>
              <p className="text-2xs text-muted-foreground">
                {relativeTime(row.createdAt, locale)}
              </p>
            </div>
            <Icon name="chevronRight" className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

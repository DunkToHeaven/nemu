"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Icon } from "@/components/icons";
import { Skeleton } from "@/components/ui/skeleton";
import type { PriceHistoryEntry, PriceHistoryResponse } from "@/lib/api/client";
import { formatPrice } from "@/lib/format";

/**
 * Card "Tren harga" di halaman Laporan.
 *
 * Membandingkan harga perolehan item dari waktu ke waktu: satu titik per
 * tanggal ada transaksi `receive` yang mencatat harga. Klik satu baris untuk
 * membuka grafik detail item itu — perubahan harga antar tanggal terlihat
 * sebagai delta + persen.
 */
export function PriceHistoryWidget({
  data,
  loading,
}: {
  data: PriceHistoryResponse | undefined;
  loading: boolean;
}) {
  const t = useTranslations("reports");
  const locale = useLocale();
  const [openId, setOpenId] = React.useState<string | null>(null);

  if (loading) return <Skeleton className="h-[180px] w-full rounded-xl" />;
  const items = data?.items ?? [];
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <Icon name="chart" className="size-6 text-muted-foreground" />
        <p className="text-[13px] text-muted-foreground">{t("priceHistoryEmpty")}</p>
        <p className="max-w-[420px] text-2xs text-muted-foreground">{t("priceHistoryEmptyBody")}</p>
      </div>
    );
  }

  const open = openId ? items.find((entry) => entry.itemId === openId) : null;

  return (
    <div className="space-y-3">
      {open ? (
        <PriceDetail entry={open} locale={locale} onClose={() => setOpenId(null)} />
      ) : (
        <ul className="divide-y divide-border">
          {items.slice(0, 8).map((entry) => (
            <li key={entry.itemId}>
              <button
                type="button"
                data-testid={`price-row-${entry.itemId}`}
                onClick={() => setOpenId(entry.itemId)}
                className="flex w-full items-center gap-3 rounded-lg py-2 text-left transition-colors hover:bg-muted/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold">{entry.name}</p>
                  <p className="text-2xs text-muted-foreground tnum">
                    {formatPrice(entry.lastPrice, locale)}
                    {entry.unit ? ` / ${entry.unit}` : ""} ·{" "}
                    {t("priceHistoryPoints", { count: entry.points.length })}
                  </p>
                </div>
                <ChangeBadge changePct={entry.changePct} />
                <Icon name="chevronRight" className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChangeBadge({ changePct }: { changePct: number }) {
  const flat = Math.abs(changePct) < 0.05;
  const tone = flat
    ? "bg-muted text-muted-foreground"
    : changePct > 0
      ? "bg-danger-soft text-danger-foreground"
      : "bg-success-soft text-success-foreground";
  const arrow = flat ? "" : changePct > 0 ? "▲" : "▼";
  return (
    <span className={`tnum shrink-0 rounded-full px-2 py-0.5 text-2xs font-bold ${tone}`}>
      {arrow} {Math.abs(changePct)}%
    </span>
  );
}

/** Grafik + tabel perubahan harga satu item, per tanggal receive. */
function PriceDetail({
  entry,
  locale,
  onClose,
}: {
  entry: PriceHistoryEntry;
  locale: string;
  onClose: () => void;
}) {
  const t = useTranslations("reports");
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold">{entry.name}</p>
          <p className="text-2xs text-muted-foreground">
            {t("priceHistoryFromTo", {
              from: formatPrice(entry.firstPrice, locale),
              to: formatPrice(entry.lastPrice, locale),
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/app/item/${entry.itemId}`}
            className="text-2xs font-bold text-primary underline-offset-2 hover:underline"
          >
            {t("priceHistoryOpenItem")}
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("priceHistoryClose")}
            className="grid size-7 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
          >
            <Icon name="x" className="size-3.5" />
          </button>
        </div>
      </div>

      <div className="h-[180px] w-full" data-testid="price-chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={entry.points} margin={{ top: 6, right: 4, left: -22, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              tickFormatter={(value: string) => value.slice(5)}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={18}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              width={56}
              domain={["dataMin", "dataMax"]}
              tickFormatter={(value: number) => formatPrice(value, locale)}
            />
            <Tooltip
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                fontSize: 12,
              }}
              formatter={(value: unknown) =>
                [formatPrice(Number(value ?? 0), locale), t("priceHistoryPrice")] as [
                  string,
                  string,
                ]
              }
            />
            <Line
              type="monotone"
              dataKey="price"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={{ r: 2.5, fill: "var(--primary)" }}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="max-h-44 overflow-y-auto scrollbar-thin rounded-xl border border-border">
        <table className="w-full text-2xs">
          <thead className="sticky top-0 bg-card text-muted-foreground">
            <tr>
              <th className="px-3 py-1.5 text-left font-bold">{t("priceHistoryDate")}</th>
              <th className="px-3 py-1.5 text-right font-bold">{t("priceHistoryPrice")}</th>
              <th className="px-3 py-1.5 text-right font-bold">{t("priceHistoryDelta")}</th>
              <th className="px-3 py-1.5 text-right font-bold">{t("priceHistoryQty")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {entry.points
              .slice()
              .reverse()
              .map((point) => (
                <tr key={point.date} data-testid={`price-point-${point.date}`}>
                  <td className="px-3 py-1.5 font-mono">{point.date}</td>
                  <td className="tnum px-3 py-1.5 text-right font-bold">
                    {formatPrice(point.price, locale)}
                  </td>
                  <td
                    className={`tnum px-3 py-1.5 text-right font-semibold ${
                      point.delta == null || point.delta === 0
                        ? "text-muted-foreground"
                        : point.delta > 0
                          ? "text-danger-foreground"
                          : "text-success-foreground"
                    }`}
                  >
                    {point.delta == null
                      ? "—"
                      : `${point.delta > 0 ? "+" : ""}${formatPrice(point.delta, locale)}${
                          point.deltaPct != null
                            ? ` (${point.deltaPct > 0 ? "+" : ""}${point.deltaPct}%)`
                            : ""
                        }`}
                  </td>
                  <td className="tnum px-3 py-1.5 text-right">{point.qty}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

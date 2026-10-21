"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatNumber } from "@/lib/format";

export function TrendChart({
  data,
  height = 180,
}: {
  data: { date: string; qty: number; tx: number }[];
  height?: number;
}) {
  const t = useTranslations("reports");
  const locale = useLocale();

  if (data.length === 0) {
    return <p className="py-8 text-center text-[13px] text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div style={{ height }} className="w-full" data-testid="trend-chart">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 4, left: -22, bottom: 0 }}>
          <defs>
            <linearGradient id="nemuTrend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.32} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            tickFormatter={(value: string) => value.slice(8)}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
            minTickGap={18}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={44}
            tickFormatter={(value: number) => formatNumber(value, locale)}
          />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              fontSize: 12,
              color: "var(--foreground)",
            }}
            labelStyle={{ color: "var(--muted-foreground)" }}
            formatter={(value: unknown) =>
              [formatNumber(Number(value ?? 0), locale), t("qty")] as [string, string]
            }
          />
          <Area
            type="monotone"
            dataKey="qty"
            stroke="var(--primary)"
            strokeWidth={2}
            fill="url(#nemuTrend)"
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import { EmptyState } from "@/components/app/states";
import { Icon, type IconName } from "@/components/icons";
import { api } from "@/lib/api/client";
import { relativeTime } from "@/lib/format";
import type { LiveEvent } from "@/lib/types";

const ICON_BY_TYPE: Record<string, IconName> = {
  "tx.created": "package",
  "stock.changed": "boxes",
  "alert.created": "alert",
  "sync.status": "cloud",
  "verification.created": "shieldCheck",
  "custody.changed": "packageCheck",
};

export function LiveActivity() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [events, setEvents] = React.useState<LiveEvent[]>([]);

  const { data } = useQuery({
    queryKey: ["events"],
    queryFn: () => api.events(),
    refetchInterval: 15_000,
  });

  React.useEffect(() => {
    if (data?.data) setEvents(data.data);
  }, [data]);

  React.useEffect(() => {
    const source = new EventSource("/api/v1/stream");
    const handler = (event: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(event.data) as LiveEvent;
        setEvents((prev) => [parsed, ...prev].slice(0, 40));
      } catch {
        /* event rusak diabaikan */
      }
    };
    for (const type of Object.keys(ICON_BY_TYPE)) {
      source.addEventListener(type, handler as EventListener);
    }
    return () => source.close();
  }, []);

  if (events.length === 0) {
    return <EmptyState icon="wifi" title={t("liveEmpty")} />;
  }

  return (
    <ul
      className="max-h-[300px] space-y-2 overflow-y-auto pr-1 scrollbar-thin"
      data-testid="live-activity"
    >
      {events.slice(0, 14).map((event) => {
        const payload = event.payload as {
          itemName?: string;
          qty?: number;
          userName?: string;
          status?: string;
          result?: string;
        };
        const label =
          event.type === "tx.created"
            ? `${payload.userName ?? "—"} · ${payload.itemName ?? ""} ×${payload.qty ?? ""}`
            : event.type === "stock.changed"
              ? `${payload.itemName ?? "Stok"} → ${payload.qty ?? ""}`
              : event.type === "verification.created"
                ? `Verifikasi: ${payload.result ?? "tercatat"}`
                : event.type === "custody.changed"
                  ? `Dibawa: ${payload.status ?? ""}`
                  : `${event.type} · ${payload.status ?? ""}`;
        return (
          <li key={event.id} className="flex items-start gap-2">
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
              <Icon name={ICON_BY_TYPE[event.type] ?? "info"} className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold">{label}</p>
              <p className="text-2xs text-muted-foreground">{relativeTime(event.at, locale)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import { EmptyState, ErrorState } from "@/components/app/states";
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

/** Label jenis transaksi untuk baris yang datang dari database. */
const TX_LABEL: Record<string, string> = {
  issue: "diambil",
  receive: "diterima",
  return: "dikembalikan",
  transfer: "dipindah",
  adjust: "disesuaikan",
  reverse: "dibatalkan",
};

/**
 * Bentuk baris dari `GET /api/v1/events`.
 *
 * Server database mengirim baris transaksi apa adanya:
 *   { id, kind, type: "return", itemId, itemName, qty, at }
 * sedangkan komponen ini dulu mengharapkan bentuk event SSE:
 *   { type: "tx.created", at, payload: {...} }
 *
 * Karena bentuknya tidak cocok, `event.payload` selalu undefined dan widget
 * menampilkan "gagal dimuat". Normalisasi di bawah menerima kedua bentuk.
 */
interface RawEvent {
  id: string;
  kind?: string;
  type?: string;
  itemId?: string;
  itemName?: string;
  qty?: number;
  at?: string;
  createdAt?: string;
  userName?: string;
  payload?: Record<string, unknown>;
}

function normalise(row: RawEvent): LiveEvent {
  // Bentuk SSE: sudah sesuai kontrak.
  if (row.payload) {
    return {
      id: row.id,
      type: (row.type ?? "tx.created") as LiveEvent["type"],
      at: row.at ?? new Date().toISOString(),
      payload: row.payload,
    };
  }

  // Bentuk baris database: bungkus menjadi payload yang dikenal UI.
  const txType = row.type ?? "issue";
  return {
    id: row.id,
    type: txType === "verification" ? "verification.created" : "tx.created",
    at: row.at ?? row.createdAt ?? new Date().toISOString(),
    payload: {
      itemId: row.itemId ?? "",
      itemName: row.itemName ?? "",
      qty: row.qty ?? 0,
      userName: row.userName ?? "",
      txType,
    },
  };
}

export function LiveActivity() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const [events, setEvents] = React.useState<LiveEvent[]>([]);

  const { data, isError, refetch } = useQuery({
    queryKey: ["events"],
    queryFn: () => api.events(),
    refetchInterval: 15_000,
    retry: 1,
  });

  React.useEffect(() => {
    if (!data?.data) return;
    setEvents((data.data as unknown as RawEvent[]).map(normalise));
  }, [data]);

  React.useEffect(() => {
    const source = new EventSource("/api/v1/stream");
    const handler = (event: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(event.data) as RawEvent;
        setEvents((prev) => [normalise(parsed), ...prev].slice(0, 40));
      } catch {
        /* event rusak diabaikan */
      }
    };
    for (const type of Object.keys(ICON_BY_TYPE)) {
      source.addEventListener(type, handler as EventListener);
    }
    return () => source.close();
  }, []);

  if (isError && events.length === 0) {
    return <ErrorState onRetry={() => void refetch()} />;
  }

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
          txType?: string;
        };
        const action = TX_LABEL[payload.txType ?? ""] ?? "dicatat";
        const label =
          event.type === "tx.created"
            ? `${payload.userName ? `${payload.userName} · ` : ""}${payload.itemName ?? "—"}${
                payload.qty ? ` ×${payload.qty}` : ""
              } ${action}`
            : event.type === "stock.changed"
              ? `${payload.itemName ?? "Stok"} → ${payload.qty ?? ""}`
              : event.type === "verification.created"
                ? `Verifikasi: ${payload.result ?? "tercatat"}`
                : event.type === "custody.changed"
                  ? `Kustodi: ${payload.status ?? ""}`
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

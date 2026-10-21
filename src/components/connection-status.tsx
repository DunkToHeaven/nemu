"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import * as React from "react";
import { Icon } from "@/components/icons";
import type { LiveEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

type State = "live" | "connecting" | "offline";

const EVENT_INVALIDATION: Record<LiveEvent["type"], string[]> = {
  "stock.changed": ["dashboard", "item", "search", "stock", "reports", "transactions"],
  "tx.created": ["dashboard", "transactions", "item", "search", "reports", "history"],
  "alert.created": ["dashboard", "reports"],
  "sync.status": ["dashboard", "google"],
  "verification.created": ["dashboard", "verifications", "reports", "item"],
  "custody.changed": ["custody", "dashboard", "reports"],
};

export function ConnectionStatus({ className }: { className?: string }) {
  const t = useTranslations("connection");
  const queryClient = useQueryClient();
  const [state, setState] = React.useState<State>("connecting");
  const [lastEventAt, setLastEventAt] = React.useState<number | null>(null);

  React.useEffect(() => {
    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      setState((prev) => (prev === "offline" ? "connecting" : prev));
      source = new EventSource("/api/v1/stream");

      source.addEventListener("ready", () => setState("live"));

      const handler = (event: MessageEvent<string>) => {
        try {
          const payload = JSON.parse(event.data) as LiveEvent;
          setLastEventAt(Date.now());
          const keys = EVENT_INVALIDATION[payload.type] ?? [];
          for (const key of keys) {
            void queryClient.invalidateQueries({ queryKey: [key] });
          }
        } catch {
          /* event rusak diabaikan */
        }
      };

      for (const type of Object.keys(EVENT_INVALIDATION)) {
        source.addEventListener(type, handler as EventListener);
      }

      source.onerror = () => {
        source?.close();
        source = null;
        setState("offline");
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
          setState("connecting");
          connect();
        }, 4000);
      };
    };

    connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, [queryClient]);

  // Cadangan polling 15 detik (RT-01).
  React.useEffect(() => {
    const timer = setInterval(() => {
      if (state === "live" && Date.now() - (lastEventAt ?? 0) > 15_000) {
        void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      }
    }, 15_000);
    return () => clearInterval(timer);
  }, [queryClient, state, lastEventAt]);

  const label = t(state);
  const hint = t(`${state}Hint` as "liveHint" | "connectingHint" | "offlineHint");

  return (
    <span
      role="status"
      aria-live="polite"
      title={hint}
      data-testid="connection-status"
      data-state={state}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-2xs font-bold",
        state === "live" && "border-transparent bg-success-soft text-success-foreground",
        state === "connecting" && "border-transparent bg-warning-soft text-warning-foreground",
        state === "offline" && "border-transparent bg-danger-soft text-danger-foreground",
        className,
      )}
    >
      {state === "live" ? (
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-success" />
        </span>
      ) : state === "connecting" ? (
        <Icon name="spinner" className="size-3 animate-spin" />
      ) : (
        <Icon name="wifiOff" className="size-3" />
      )}
      <span className="sr-only sm:not-sr-only">{label}</span>
      <span className="sm:hidden">{label}</span>
    </span>
  );
}

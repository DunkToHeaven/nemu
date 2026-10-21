"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import * as React from "react";
import { Icon } from "@/components/icons";
import { useSession } from "@/components/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { api, type SimulationState } from "@/lib/api/client";
import { flags } from "@/lib/flags";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS = ["worker", "supervisor", "admin"] as const;

export function DevPanel() {
  if (process.env.NODE_ENV === "production") return null;
  return <DevPanelInner />;
}

function DevPanelInner() {
  const t = useTranslations("dev");
  const queryClient = useQueryClient();
  const router = useRouter();
  const { role, refresh } = useSession();
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const { data } = useQuery({
    queryKey: ["dev", "simulation"],
    queryFn: () => api.dev.simulation(),
    enabled: open,
    staleTime: 0,
  });

  const simulation = data?.simulation;

  const patch = async (value: Partial<SimulationState>) => {
    setPending(true);
    try {
      await api.dev.setSimulation(value);
      await queryClient.invalidateQueries({ queryKey: ["dev", "simulation"] });
      queryClient.invalidateQueries();
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("open")}
        data-testid="dev-panel-trigger"
        className="fixed bottom-20 right-3 z-40 grid size-11 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-[var(--shadow-card)] sm:bottom-4"
      >
        <Icon name="sliders" className="size-5" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full max-w-[380px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {t("title")}
              <Badge tone="warning">dev</Badge>
            </SheetTitle>
            <SheetDescription>
              Simulasi lapisan mock. Hanya tersedia di mode development.
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4">
            <section className="space-y-2">
              <h3 className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                Role
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {ROLE_OPTIONS.map((option) => (
                  <Button
                    key={option}
                    size="sm"
                    variant={role === option ? "primary" : "secondary"}
                    onClick={async () => {
                      await api.auth.switchRole(option);
                      await refresh();
                      queryClient.clear();
                      router.refresh();
                    }}
                  >
                    {t(`role`)}: {option}
                  </Button>
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <label
                className="block text-2xs font-bold uppercase tracking-wide text-muted-foreground"
                htmlFor="latency"
              >
                {t("latency")}
              </label>
              <Input
                id="latency"
                type="number"
                min={0}
                max={3000}
                step={50}
                value={simulation?.latencyMs ?? 120}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value))
                    void patch({ latencyMs: Math.max(0, Math.min(3000, value)) });
                }}
                className="h-10"
              />
            </section>

            <section className="space-y-1">
              {(
                [
                  ["force409", "force409"],
                  ["raceOnVerify", "race"],
                  ["offline", "offline"],
                  ["expireSession", "expire"],
                  ["forcePrompt", "forcePrompt"],
                  ["forceBlind", "forceBlind"],
                  ["forceError", "forceError"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-1"
                >
                  <span className="text-sm font-medium">{t(label)}</span>
                  <Switch
                    checked={Boolean(simulation?.[key])}
                    disabled={pending}
                    onCheckedChange={(checked) => void patch({ [key]: checked })}
                    data-testid={`dev-${key}`}
                  />
                </label>
              ))}
            </section>

            <section className="space-y-2 rounded-xl border border-border bg-muted/40 p-3">
              <h3 className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("flags")}
              </h3>
              <ul className="flex flex-wrap gap-1.5">
                {Object.entries(flags).map(([name, enabled]) => (
                  <li key={name}>
                    <Badge tone={enabled ? "success" : "neutral"}>
                      {name.toUpperCase()} · {enabled ? "on" : "off"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                block
                onClick={async () => {
                  await api.dev.reset();
                  queryClient.clear();
                  router.refresh();
                }}
              >
                <Icon name="refresh" className="size-4" />
                {t("reset")}
              </Button>
              <Button
                block
                onClick={() => {
                  setOpen(false);
                  queryClient.invalidateQueries();
                }}
              >
                {t("apply")}
              </Button>
            </div>

            <p className={cn("text-2xs text-muted-foreground")}>
              Perubahan simulasi berlaku untuk semua tab di server mock yang sama.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

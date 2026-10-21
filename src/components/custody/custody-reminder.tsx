"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";
import { ReturnDialog } from "@/components/custody/return-dialog";
import { SettleDialog } from "@/components/custody/settle-dialog";
import { Icon } from "@/components/icons";
import { useSession } from "@/components/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { flags } from "@/lib/flags";
import { formatQty } from "@/lib/format";
import type { CustodyEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "nemu:custody-reminder-dismissed";

function shiftEnded(shiftEndsAt: string | null): boolean {
  if (!shiftEndsAt) return false;
  const [hours, minutes] = shiftEndsAt.split(":").map(Number);
  if (hours === undefined || minutes === undefined) return false;
  const now = new Date();
  const end = new Date(now);
  end.setHours(hours, minutes, 0, 0);
  return now >= end;
}

/** Pengingat akhir shift satu ketukan (CU-04). */
export function CustodyReminder() {
  const t = useTranslations("custody");
  const locale = useLocale();
  const { user, role } = useSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [settleEntry, setSettleEntry] = React.useState<CustodyEntry | null>(null);
  const [returnEntry, setReturnEntry] = React.useState<CustodyEntry | null>(null);

  const enabled = flags.cu && role === "worker";

  const { data } = useQuery({
    queryKey: keys.custody(),
    queryFn: () => api.custody.list(),
    enabled,
    staleTime: 60_000,
  });

  const entries = data?.data ?? [];

  /**
   * Pengingat akhir shift (CU-05) TIDAK membuka sheet otomatis.
   *
   * Sheet adalah modal: Radix menandai seluruh halaman di luarnya `aria-hidden`
   * dan mengunci fokus, sehingga dashboard, sidebar, dan tab bar menjadi tidak
   * bisa dipakai maupun dibaca pembaca layar. Itu merusak alur utama — pekerja
   * membuka dashboard lalu langsung terkurung dialog.
   *
   * Gantinya: tombol mengambang (sudah ada) diberi penekanan saat shift selesai,
   * plus pengumuman `aria-live="polite"` supaya pembaca layar tetap tahu.
   */
  const [shiftOver, setShiftOver] = React.useState(false);
  React.useEffect(() => {
    if (!enabled || entries.length === 0) return;
    setShiftOver(shiftEnded(user?.shiftEndsAt ?? null));
  }, [enabled, entries.length, user?.shiftEndsAt]);

  if (!enabled || entries.length === 0) return null;

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: keys.custody() });
    void queryClient.invalidateQueries({ queryKey: keys.dashboard });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-24 right-3 z-30 flex items-center gap-2 rounded-full px-3.5 py-2.5 text-2xs font-bold shadow-[var(--shadow-card)] sm:bottom-20",
          // Kontras AA: isian terang + teks gelap. Isian --warning solid tidak
          // pernah lolos 4.5:1 untuk teks 11px di kedua tema.
          shiftOver
            ? "bg-warning-soft text-warning-foreground ring-2 ring-warning"
            : "bg-card text-warning-foreground ring-1 ring-border",
        )}
        data-testid="custody-reminder-trigger"
      >
        <Icon name="package" className="size-4" />
        {t("reminderTitle", { count: entries.length })}
      </button>

      <p aria-live="polite" className="sr-only">
        {shiftOver ? t("shiftOverAnnounce", { count: entries.length }) : ""}
      </p>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="sm:max-w-lg sm:rounded-3xl sm:pb-6">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Icon name="package" className="size-5 text-warning-foreground" />
              {t("reminderTitle", { count: entries.length })}
            </SheetTitle>
            <SheetDescription>{t("reminderBody")}</SheetDescription>
          </SheetHeader>

          <ul className="divide-y divide-border">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-2 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{entry.itemName}</p>
                    <p className="tnum text-2xs text-muted-foreground">
                      {t("qtyOpen", {
                        qty: formatQty(entry.qtyOpen, locale),
                        unit: entry.itemUnit ?? "",
                      })}
                      {entry.refNo ? ` · ${t("wo", { ref: entry.refNo })}` : ""}
                    </p>
                  </div>
                  {entry.overdue ? <Badge tone="danger">{t("overdue")}</Badge> : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    variant="success"
                    className="h-10 flex-1"
                    onClick={() => setSettleEntry(entry)}
                  >
                    <Icon name="check" className="size-4" />
                    {t("used")}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-10 flex-1"
                    onClick={() => setReturnEntry(entry)}
                  >
                    <Icon name="packageOpen" className="size-4" />
                    {t("returned")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-10"
                    onClick={() => {
                      sessionStorage.setItem(DISMISS_KEY, "1");
                      setOpen(false);
                      toast(t("reminderLater"));
                    }}
                  >
                    {t("reminderLater")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>

      {settleEntry ? (
        <SettleDialog
          entry={settleEntry}
          open={Boolean(settleEntry)}
          onOpenChange={(next) => !next && setSettleEntry(null)}
          outcome="used"
          onSettled={refresh}
        />
      ) : null}

      {returnEntry ? (
        <ReturnDialog
          entry={returnEntry}
          open={Boolean(returnEntry)}
          onOpenChange={(next) => !next && setReturnEntry(null)}
          onSettled={refresh}
        />
      ) : null}
    </>
  );
}

"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { VerificationPromptCard } from "@/components/take/verification-prompt";
import { Button } from "@/components/ui/button";
import { ApiError, api, type TransactionResponse } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { flags } from "@/lib/flags";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";

export function TakeConfirmation({
  result,
  unit,
  itemName,
  onTakeAgain,
  onDone,
}: {
  result: TransactionResponse;
  unit: string;
  itemName: string;
  onTakeAgain: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("confirm");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [remaining, setRemaining] = React.useState(60);
  const [cancelled, setCancelled] = React.useState(false);
  const [promptVisible, setPromptVisible] = React.useState(Boolean(result.verificationPrompt));
  const [promptResolved, setPromptResolved] = React.useState(false);

  const tx = result.transaction;
  const stockQty = result.stock?.qty ?? 0;
  const custodyQty = result.custody?.qtyOpen ?? 0;

  React.useEffect(() => {
    if (cancelled) return;
    const timer = setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          clearInterval(timer);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cancelled]);

  const cancelMutation = useMutation({
    mutationFn: () => api.tx.reverse(tx.id),
    onSuccess: () => {
      setCancelled(true);
      setPromptVisible(false);
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
      void queryClient.invalidateQueries({ queryKey: keys.custody() });
      toast.success(t("cancelled"));
    },
    onError: (error) => {
      toast.error(error instanceof ApiError ? error.message : t("cancelFailed"));
    },
  });

  return (
    <div className="space-y-3" data-testid="take-confirmation">
      <div className="rounded-2xl border border-success/30 bg-success-soft/60 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-success text-white">
            <Icon name="check" className="size-6" strokeWidth={3} />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-extrabold leading-snug text-foreground">
              {t("takenLine", { qty: formatQty(tx.qty, locale), unit, name: itemName })}
            </p>
            <p className="tnum mt-0.5 text-[13px] font-semibold text-muted-foreground">
              {t("remainingLine", { remaining: formatQty(stockQty, locale) })}
              {result.custody
                ? ` · ${t("custodyLine", { qty: formatQty(custodyQty, locale), unit })}`
                : ""}
            </p>
            {!result.custody ? (
              <p className="mt-1 text-2xs text-muted-foreground">{t("noCustody")}</p>
            ) : null}
          </div>
        </div>
      </div>

      {promptVisible && result.verificationPrompt ? (
        <VerificationPromptCard
          prompt={result.verificationPrompt}
          onResolved={() => {
            setPromptResolved(true);
            void queryClient.invalidateQueries({ queryKey: keys.item(tx.itemId) });
          }}
        />
      ) : null}

      {!cancelled ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button size="lg" variant="secondary" className="h-12 flex-1" onClick={onTakeAgain}>
            <Icon name="plus" className="size-4" />
            {t("takeAgain")}
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className={cn(
              "h-12 flex-1",
              remaining > 0 ? "text-danger-foreground" : "text-muted-foreground",
            )}
            onClick={() => cancelMutation.mutate()}
            disabled={remaining === 0 || cancelMutation.isPending}
            data-testid="cancel-tx"
          >
            <Icon name="refresh" className="size-4" />
            {remaining > 0
              ? `${t("cancelTx")} · ${t("cancelWindow", { seconds: remaining })}`
              : t("cancelTx")}
          </Button>
        </div>
      ) : null}

      {cancelled ? (
        <div className="rounded-xl bg-muted px-3 py-2 text-[13px] font-semibold text-muted-foreground">
          {t("cancelled")}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button size="sm" variant="ghost" onClick={onDone}>
          {t("done")}
        </Button>
        <Button asChild size="sm" variant="ghost">
          <a href="/app/riwayat">{t("viewHistory")}</a>
        </Button>
        {flags.cu ? (
          <Button asChild size="sm" variant="ghost">
            <a href="/app/dibawa">{t("custodyLine", { qty: "", unit: "" }).trim() || "Dibawa"}</a>
          </Button>
        ) : null}
        {promptResolved ? <span className="sr-only">{t("promptSent")}</span> : null}
      </div>
    </div>
  );
}

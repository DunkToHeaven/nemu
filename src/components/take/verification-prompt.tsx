"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import * as React from "react";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import type { VerificationPrompt } from "@/lib/types";
import { uuidv7 } from "@/lib/utils";

type Stage = "ask" | "different" | "sent" | "skipped" | "inconclusive" | "error";

/** Konfirmasi sisa stok satu ketukan (CV-02). Sesuai = 1 ketukan, Beda ≤ 3. */
export function VerificationPromptCard({
  prompt,
  onResolved,
}: {
  prompt: VerificationPrompt;
  onResolved: (result: "match" | "mismatch" | "skipped" | "inconclusive") => void;
}) {
  const t = useTranslations("confirm");
  const queryClient = useQueryClient();
  const [stage, setStage] = React.useState<Stage>("ask");
  const [counted, setCounted] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);

  const submit = useMutation({
    mutationFn: (input: { result: "match" | "mismatch" | "skipped"; countedQty?: number | null }) =>
      api.verify.submit({
        promptId: prompt.promptId,
        result: input.result,
        countedQty: input.countedQty ?? null,
        stockVersion: prompt.stockVersion,
        idempotencyKey: uuidv7(),
      }),
    onSuccess: (response, variables) => {
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
      if (response.status === "inconclusive") {
        setStage("inconclusive");
        setMessage(t("promptInconclusive"));
        onResolved("inconclusive");
        return;
      }
      if (variables.result === "skipped") {
        setStage("skipped");
        setMessage(t("promptSkipped"));
        onResolved("skipped");
        return;
      }
      setStage("sent");
      setMessage(t("promptSent"));
      onResolved(variables.result);
    },
    onError: (error) => {
      setStage("error");
      setMessage(error instanceof ApiError ? error.message : t("promptError"));
    },
  });

  if (stage === "sent" || stage === "skipped" || stage === "inconclusive") {
    return (
      <div
        role="status"
        data-testid="verification-result"
        className="rounded-2xl border border-border bg-muted/50 p-3.5"
      >
        <p className="flex items-start gap-2 text-[13px] font-semibold text-foreground">
          <Icon
            name={stage === "sent" ? "checkCircle" : "info"}
            className={
              stage === "sent" ? "size-4 shrink-0 text-success" : "size-4 shrink-0 text-info"
            }
          />
          {message}
        </p>
      </div>
    );
  }

  const variance = prompt.expectedQty !== null ? Number(counted) - prompt.expectedQty : null;

  return (
    <div
      className="rounded-2xl border-2 border-primary/40 bg-primary-soft/50 p-4"
      data-testid="verification-prompt"
      data-mode={prompt.mode}
    >
      <p className="text-sm font-extrabold text-foreground">
        {prompt.mode === "blind" ? t("promptBlindTitle") : t("promptTitle")}
      </p>
      <p className="mt-0.5 text-2xs text-muted-foreground">{prompt.locationPath}</p>

      {stage === "ask" ? (
        <>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            {prompt.mode === "confirm" && prompt.expectedQty !== null ? (
              <Button
                size="lg"
                className="h-14 flex-1"
                onClick={() => submit.mutate({ result: "match" })}
                disabled={submit.isPending}
                data-testid="verify-match"
              >
                <Icon name="check" className="size-5" />
                {t("promptMatch", { qty: prompt.expectedQty })}
              </Button>
            ) : null}
            <Button
              size="lg"
              variant="secondary"
              className="h-14 flex-1"
              onClick={() => setStage("different")}
              data-testid="verify-different"
            >
              {prompt.mode === "blind" ? t("promptSend") : t("promptDifferent")}
            </Button>
          </div>
          <button
            type="button"
            onClick={() => submit.mutate({ result: "skipped" })}
            className="mt-2 min-h-11 w-full text-[13px] font-bold text-muted-foreground underline-offset-2 hover:underline"
            data-testid="verify-skip"
          >
            {t("promptSkip")}
          </button>
        </>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-[13px] font-semibold">{t("promptDifferentTitle")}</p>
          <Input
            type="text"
            inputMode="numeric"
            autoFocus
            value={counted}
            onChange={(event) => {
              const raw = event.target.value;
              if (raw === "" || /^\d*$/.test(raw)) setCounted(raw);
            }}
            placeholder={t("promptCountedPlaceholder")}
            className="h-14 text-center text-xl font-extrabold"
            data-testid="verify-counted"
          />
          {variance !== null && counted !== "" ? (
            <p className="tnum text-center text-[13px] font-semibold text-muted-foreground">
              {t("promptSystem", {
                system: prompt.expectedQty ?? 0,
                variance: variance > 0 ? `+${variance}` : variance,
              })}
            </p>
          ) : (
            <p className="text-center text-2xs text-muted-foreground">
              {t("promptDifferentBody", {
                system: prompt.expectedQty ?? 0,
                unit: prompt.unitSymbol,
              })}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" className="h-12 flex-1" onClick={() => setStage("ask")}>
              {t("promptSkip")}
            </Button>
            <Button
              className="h-12 flex-[2]"
              disabled={counted === "" || submit.isPending}
              onClick={() => submit.mutate({ result: "mismatch", countedQty: Number(counted) })}
              data-testid="verify-submit-counted"
            >
              {submit.isPending ? <Icon name="spinner" className="size-4 animate-spin" /> : null}
              {t("promptSend")}
            </Button>
          </div>
        </div>
      )}

      {stage === "error" && message ? (
        <p
          role="alert"
          className="mt-2 rounded-lg bg-danger-soft px-2.5 py-1.5 text-2xs font-semibold text-danger-foreground"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

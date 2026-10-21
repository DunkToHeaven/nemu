"use client";

import { useLocale, useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { relativeTime } from "@/lib/format";
import type { Confidence } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ConfidenceLike {
  score: number;
  level: Confidence["level"];
  lastVerifiedAt: string | null;
  breakdown?: NonNullable<Confidence["breakdown"]>;
}

const TONE = {
  high: "success",
  medium: "warning",
  low: "danger",
  never: "neutral",
} as const;

export function ConfidenceBadge({
  confidence,
  showScore = false,
  className,
  compact = false,
}: {
  confidence: ConfidenceLike;
  showScore?: boolean;
  className?: string;
  compact?: boolean;
}) {
  const t = useTranslations("confidence");
  const locale = useLocale();
  const level = confidence.level;
  const when = confidence.lastVerifiedAt ? relativeTime(confidence.lastVerifiedAt, locale) : null;

  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      <Badge tone={TONE[level]} data-testid={`confidence-${level}`}>
        {level === "high" ? (
          <Icon name="badgeCheck" className="size-3.5" />
        ) : level === "medium" ? (
          <Icon name="circleDashed" className="size-3.5" />
        ) : level === "low" ? (
          <Icon name="alert" className="size-3.5" />
        ) : (
          <Icon name="info" className="size-3.5" />
        )}
        {t(level)}
        {showScore ? <span className="tnum opacity-70">· {confidence.score}</span> : null}
      </Badge>
      {when && !compact ? (
        <span className="text-2xs text-muted-foreground">
          {level === "never" ? "" : t(level === "low" ? "countedAgo" : "verifiedAgo", { when })}
        </span>
      ) : null}
      {level === "low" || level === "never" ? (
        <span className="text-2xs font-semibold text-danger-foreground">{t("needsCount")}</span>
      ) : null}
    </span>
  );
}

export function ConfidenceWhy({ confidence }: { confidence: ConfidenceLike }) {
  const t = useTranslations("confidence");
  const locale = useLocale();
  const b = confidence.breakdown;

  if (!b) return null;

  const rows = [
    { key: "breakdownBase", value: b.base, negative: false },
    { key: "breakdownAge", value: -b.agePenalty, negative: true },
    { key: "breakdownMovement", value: -b.movementPenalty, negative: true },
    { key: "breakdownVariance", value: -b.variancePenalty, negative: true },
    { key: "breakdownReview", value: -b.reviewPenalty, negative: true },
  ] as const;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="text-2xs font-bold text-primary underline-offset-2 hover:underline"
          data-testid="confidence-why"
        >
          {t("why")}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("whyTitle")}</DialogTitle>
          <DialogDescription>{t("whyBody")}</DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-border bg-muted/40 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold">{t("score", { score: confidence.score })}</span>
            <Badge tone={TONE[confidence.level]}>{t(confidence.level)}</Badge>
          </div>
          <ul className="mt-3 space-y-1.5">
            {rows.map((row) => (
              <li key={row.key} className="flex items-center justify-between text-[13px]">
                <span className="text-muted-foreground">{t(row.key)}</span>
                <span
                  className={cn(
                    "tnum font-bold",
                    row.value < 0 ? "text-danger-foreground" : "text-foreground",
                  )}
                >
                  {row.value > 0 ? "+" : ""}
                  {row.value}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 border-t border-border pt-2 text-2xs text-muted-foreground">
            {b.daysSinceVerified === null
              ? t("neverCountedNote")
              : `${t("breakdownDays", { count: Math.round(b.daysSinceVerified) })} · ${t("breakdownTx", { count: b.txSinceVerified })}`}
          </p>
          <p className="mt-1 text-2xs text-muted-foreground">
            {confidence.lastVerifiedAt
              ? t("verifiedAgo", { when: relativeTime(confidence.lastVerifiedAt, locale) })
              : t("never")}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

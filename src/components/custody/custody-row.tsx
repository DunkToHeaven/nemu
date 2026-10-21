"use client";

import { useTranslations } from "next-intl";
import * as React from "react";
import { ReturnDialog } from "@/components/custody/return-dialog";
import { SettleDialog } from "@/components/custody/settle-dialog";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatQty, relativeTime } from "@/lib/format";
import type { CustodyEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

export function CustodyRow({
  entry,
  locale,
  compact = false,
  showOwner = false,
  onChanged,
}: {
  entry: CustodyEntry;
  locale: string;
  compact?: boolean;
  showOwner?: boolean;
  onChanged?: () => void;
}) {
  const t = useTranslations("custody");
  const [settleOpen, setSettleOpen] = React.useState(false);
  const [returnOpen, setReturnOpen] = React.useState(false);
  const [outcome, setOutcome] = React.useState<"used" | "damaged_lost">("used");

  return (
    <li className={cn("flex flex-col gap-2 py-3", compact && "py-2.5")} data-testid="custody-row">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{entry.itemName ?? entry.itemId}</p>
          <p className="tnum text-2xs text-muted-foreground">
            {t("qtyOpen", { qty: formatQty(entry.qtyOpen, locale), unit: entry.itemUnit ?? "" })}
            {" · "}
            {t("since", { when: relativeTime(entry.openedAt, locale) })}
            {entry.refNo ? ` · ${t("wo", { ref: entry.refNo })}` : ""}
            {showOwner && entry.userName ? ` · ${entry.userName}` : ""}
          </p>
        </div>
        {entry.overdue ? (
          <Badge tone="danger" title={t("overdueHint", { hours: 24 })}>
            <Icon name="alert" className="size-3.5" />
            {t("overdue")}
          </Badge>
        ) : null}
      </div>

      {!compact ? (
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="success"
            className="h-9"
            onClick={() => {
              setOutcome("used");
              setSettleOpen(true);
            }}
          >
            <Icon name="check" className="size-4" />
            {t("used")}
          </Button>
          <Button size="sm" variant="secondary" className="h-9" onClick={() => setReturnOpen(true)}>
            <Icon name="packageOpen" className="size-4" />
            {t("returned")}
          </Button>
        </div>
      ) : null}

      <SettleDialog
        entry={entry}
        open={settleOpen}
        onOpenChange={setSettleOpen}
        outcome={outcome}
        onSettled={onChanged}
      />
      <ReturnDialog
        entry={entry}
        open={returnOpen}
        onOpenChange={setReturnOpen}
        onSettled={onChanged}
      />
    </li>
  );
}

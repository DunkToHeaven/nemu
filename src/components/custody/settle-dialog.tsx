"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { formatQty } from "@/lib/format";
import type { CustodyEntry, Equipment } from "@/lib/types";
import { uuidv7 } from "@/lib/utils";

export function SettleDialog({
  entry,
  open,
  onOpenChange,
  outcome,
  onSettled,
}: {
  entry: CustodyEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  outcome: "used" | "damaged_lost";
  onSettled?: () => void;
}) {
  const t = useTranslations("custody");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [qty, setQty] = React.useState(String(entry.qtyOpen));
  const [equipmentId, setEquipmentId] = React.useState<string>(entry.equipmentId ?? "none");
  const [equipmentText, setEquipmentText] = React.useState("");
  const [refNo, setRefNo] = React.useState(entry.refNo ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [equipment, setEquipment] = React.useState<Equipment[]>([]);

  React.useEffect(() => {
    if (!open) return;
    setQty(String(entry.qtyOpen));
    setError(null);
    void api.master.equipment().then((result) => setEquipment(result.data));
  }, [open, entry.qtyOpen]);

  const mutation = useMutation({
    mutationFn: () =>
      api.custody.settle(entry.id, {
        outcome,
        qty: Number(qty),
        equipmentId: equipmentId === "none" ? null : equipmentId,
        equipmentText: equipmentText.trim() || null,
        refNo: refNo.trim() || null,
        idempotencyKey: uuidv7(),
      }),
    onSuccess: () => {
      toast.success(
        t("settleDone", { qty: formatQty(Number(qty), locale), unit: entry.itemUnit ?? "" }),
      );
      void queryClient.invalidateQueries({ queryKey: keys.custody() });
      void queryClient.invalidateQueries({ queryKey: keys.custody("team") });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
      onOpenChange(false);
      onSettled?.();
    },
    onError: (cause) => {
      setError(
        cause instanceof ApiError
          ? cause.message
          : t("errorQty", { remaining: entry.qtyOpen, unit: entry.itemUnit ?? "" }),
      );
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{outcome === "used" ? t("settleTitle") : t("damaged")}</DialogTitle>
          <DialogDescription>
            {outcome === "used" ? t("settleBody") : t("settleDamagedHint")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="settle-qty">{t("settleQty")}</Label>
            <Input
              id="settle-qty"
              type="number"
              inputMode="decimal"
              min={1}
              max={entry.qtyOpen}
              value={qty}
              onChange={(event) => setQty(event.target.value)}
            />
            <p className="text-2xs text-muted-foreground">
              {t("settleQtyHint", {
                qty: formatQty(entry.qtyOpen, locale),
                unit: entry.itemUnit ?? "",
              })}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="settle-equipment">{t("settleEquipment")}</Label>
            <Select value={equipmentId} onValueChange={setEquipmentId}>
              <SelectTrigger id="settle-equipment">
                <SelectValue placeholder={t("settleEquipment")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {equipment
                  .filter((row) => row.active)
                  .map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Input
              placeholder={t("settleEquipmentText")}
              value={equipmentText}
              onChange={(event) => setEquipmentText(event.target.value)}
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="settle-wo">{t("settleWo")}</Label>
            <Input
              id="settle-wo"
              value={refNo}
              onChange={(event) => setRefNo(event.target.value)}
              className="font-mono"
            />
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] font-semibold text-danger-foreground"
            >
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t("keep")}
          </Button>
          <Button
            variant={outcome === "used" ? "primary" : "danger"}
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || Number(qty) <= 0 || Number(qty) > entry.qtyOpen}
          >
            {mutation.isPending ? <Icon name="spinner" className="size-4 animate-spin" /> : null}
            {outcome === "used" ? t("settleSubmit") : t("settleDamaged")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

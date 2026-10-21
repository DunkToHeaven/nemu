"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
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
import type { CustodyEntry } from "@/lib/types";
import { uuidv7 } from "@/lib/utils";

export function ReturnDialog({
  entry,
  open,
  onOpenChange,
  onSettled,
}: {
  entry: CustodyEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSettled?: () => void;
}) {
  const t = useTranslations("custody");
  const locale = useLocale();
  const queryClient = useQueryClientSafe();
  const [qty, setQty] = React.useState(String(entry.qtyOpen));
  const [locationId, setLocationId] = React.useState(entry.fromLocationId);
  const [error, setError] = React.useState<string | null>(null);

  const { data: locations } = useQuery({
    queryKey: keys.locations({ type: "rack" }),
    queryFn: () => api.master.locations({ type: "rack" }),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  React.useEffect(() => {
    if (!open) return;
    setQty(String(entry.qtyOpen));
    setLocationId(entry.fromLocationId);
    setError(null);
  }, [open, entry.qtyOpen, entry.fromLocationId]);

  const mutation = useMutation({
    mutationFn: () =>
      api.custody.settle(entry.id, {
        outcome: "returned",
        qty: Number(qty),
        toLocationId: locationId,
        idempotencyKey: uuidv7(),
        scanMethod: "in_app_scanner",
      }),
    onSuccess: () => {
      const path = locations?.data.find((row) => row.id === locationId)?.path ?? "";
      toast.success(
        t("returnDone", {
          qty: formatQty(Number(qty), locale),
          unit: entry.itemUnit ?? "",
          location: path,
        }),
      );
      void queryClient.invalidateQueries({ queryKey: keys.custody() });
      void queryClient.invalidateQueries({ queryKey: keys.custody("team") });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
      onOpenChange(false);
      onSettled?.();
    },
    onError: (cause) =>
      setError(
        cause instanceof ApiError
          ? cause.message
          : t("errorQty", { remaining: entry.qtyOpen, unit: entry.itemUnit ?? "" }),
      ),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("returnTitle")}</DialogTitle>
          <DialogDescription>{t("returnBody")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="return-location">{t("returnManual")}</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger id="return-location">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(locations?.data ?? []).slice(0, 60).map((row) => (
                  <SelectItem key={row.id} value={row.id}>
                    {row.path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="return-qty">{t("returnQty")}</Label>
            <Input
              id="return-qty"
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
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || Number(qty) <= 0 || Number(qty) > entry.qtyOpen}
          >
            {mutation.isPending ? <Icon name="spinner" className="size-4 animate-spin" /> : null}
            {t("returnSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useQueryClientSafe() {
  // Dipisah agar komponen tetap bisa diuji tanpa provider ganda.
  const { useQueryClient } =
    require("@tanstack/react-query") as typeof import("@tanstack/react-query");
  return useQueryClient();
}

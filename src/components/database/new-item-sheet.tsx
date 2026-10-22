"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ApiError, api } from "@/lib/api/client";

/**
 * Form buat item baru.
 *
 * Sebelumnya tombol "+ Item baru" hanya menautkan ke `?new=1`, tetapi tidak ada
 * kode yang membaca parameter itu dan tidak ada form untuk membuat item — jadi
 * mengklik tombol tidak mengubah apa pun. Form ini menutup celah tersebut dan
 * memakai `POST /api/v1/items` yang sudah ada di backend.
 */
export function NewItemSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const t = useTranslations("database");
  const queryClient = useQueryClient();

  const [sku, setSku] = React.useState("");
  const [name, setName] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [unitId, setUnitId] = React.useState("");
  const [minStock, setMinStock] = React.useState("0");
  const [locationId, setLocationId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const meta = useQuery({
    queryKey: ["meta"],
    queryFn: () => api.master.meta(),
    enabled: open,
    staleTime: 60_000,
  });

  // Reset saat dibuka, supaya sisa isian sebelumnya tidak ikut terkirim.
  React.useEffect(() => {
    if (!open) return;
    setSku("");
    setName("");
    setMinStock("0");
    setLocationId("");
    setError(null);
    setCategoryId("");
    setUnitId("");
  }, [open]);

  // Isi default kategori/satuan begitu daftar termuat.
  React.useEffect(() => {
    if (!open || !meta.data) return;
    setCategoryId((prev) => prev || (meta.data.categories[0]?.id ?? ""));
    setUnitId((prev) => prev || (meta.data.units[0]?.id ?? ""));
  }, [open, meta.data]);

  const create = useMutation({
    mutationFn: () =>
      api.items.create({
        sku: sku.trim(),
        name: name.trim(),
        categoryId,
        unitId,
        minStock: Number(minStock) || 0,
        primaryLocationId: locationId || null,
      }),
    onSuccess: () => {
      toast.success(t("saved"));
      void queryClient.invalidateQueries({ queryKey: ["items"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onCreated?.();
      onClose();
    },
    onError: (err) => {
      // SKU duplikat adalah kesalahan paling sering; sebutkan apa adanya.
      if (err instanceof ApiError) {
        setError(
          err.code === "CONFLICT" || /duplikat|sudah/i.test(err.message)
            ? t("duplicateSku")
            : err.message,
        );
        return;
      }
      setError(t("requiredField"));
    },
  });

  const valid = sku.trim().length >= 2 && name.trim().length >= 2 && categoryId && unitId;

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="max-w-[520px]">
        <SheetHeader>
          <SheetTitle>{t("newItem")}</SheetTitle>
          <SheetDescription>{t("drawerHint")}</SheetDescription>
        </SheetHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="new-sku" className="text-[13px] font-bold">
              {t("skuLabel")}
            </label>
            <Input
              id="new-sku"
              data-testid="new-item-sku"
              value={sku}
              onChange={(event) => setSku(event.target.value)}
              placeholder="BEA-9001"
              autoComplete="off"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="new-name" className="text-[13px] font-bold">
              {t("nameLabel")}
            </label>
            <Input
              id="new-name"
              data-testid="new-item-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Bearing 6205-2RS"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="new-category" className="text-[13px] font-bold">
                {t("categoryLabel")}
              </label>
              <select
                id="new-category"
                data-testid="new-item-category"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-card px-3 text-[13px] font-semibold"
              >
                {(meta.data?.categories ?? []).map((row: { id: string; name: string }) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="new-unit" className="text-[13px] font-bold">
                {t("unitLabel")}
              </label>
              <select
                id="new-unit"
                data-testid="new-item-unit"
                value={unitId}
                onChange={(event) => setUnitId(event.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-card px-3 text-[13px] font-semibold"
              >
                {(meta.data?.units ?? []).map(
                  (row: { id: string; name: string; symbol: string }) => (
                    <option key={row.id} value={row.id}>
                      {row.name} ({row.symbol})
                    </option>
                  ),
                )}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="new-min" className="text-[13px] font-bold">
                {t("minStockLabel")}
              </label>
              <Input
                id="new-min"
                data-testid="new-item-min"
                type="number"
                min={0}
                value={minStock}
                onChange={(event) => setMinStock(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="new-location" className="text-[13px] font-bold">
                {t("locationLabel")}
              </label>
              <select
                id="new-location"
                data-testid="new-item-location"
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-card px-3 text-[13px] font-semibold"
              >
                <option value="">—</option>
                {(meta.data?.locations ?? []).map((row: { id: string; path: string }) => (
                  <option key={row.id} value={row.id}>
                    {row.path}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="rounded-xl bg-muted px-3 py-2 text-2xs text-muted-foreground">
            {t("qtyReadOnly")}
          </p>

          {error ? (
            <p role="alert" className="text-2xs font-bold text-danger-foreground">
              {error}
            </p>
          ) : null}

          <div className="flex gap-2 pt-1">
            <Button
              className="h-11 flex-1"
              data-testid="new-item-save"
              disabled={!valid || create.isPending}
              onClick={() => create.mutate()}
            >
              {create.isPending ? (
                <Icon name="spinner" className="size-4 animate-spin" />
              ) : (
                <Icon name="check" className="size-4" />
              )}
              {t("save")}
            </Button>
            <Button variant="ghost" className="h-11" onClick={onClose}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

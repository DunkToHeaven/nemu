"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { useSession } from "@/components/session-provider";
import { QtyStepper } from "@/components/take/qty-stepper";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, api, type ItemDetailResponse, type TransactionResponse } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { clearDraft, draftKey, readDraft, saveDraft } from "@/lib/draft";
import { flags } from "@/lib/flags";
import { formatQty } from "@/lib/format";
import { enqueue } from "@/lib/offline-queue";
import { cn, uuidv7 } from "@/lib/utils";

export type TakeMode = "issue" | "return" | "receive";

export function TakeForm({
  detail,
  mode,
  locationId,
  onLocationChange,
  onSuccess,
}: {
  detail: ItemDetailResponse;
  mode: TakeMode;
  locationId: string;
  onLocationChange: (id: string) => void;
  onSuccess: (
    result: TransactionResponse,
    ctx: { qty: number; reasonId: string | null; refNo: string | null },
  ) => void;
}) {
  const t = useTranslations("take");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { user } = useSession();

  const [qty, setQty] = React.useState("1");
  const [reasonId, setReasonId] = React.useState("");
  const [refNo, setRefNo] = React.useState("");
  const [note, setNote] = React.useState("");
  const [unitPrice, setUnitPrice] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [draftRestored, setDraftRestored] = React.useState(false);
  const idempotencyRef = React.useRef<string>(uuidv7());

  const key = draftKey(detail.item.code, user?.id ?? "anon");

  // Pulihkan draf setelah login ulang (kasus tepi PRD).
  React.useEffect(() => {
    const draft = readDraft(key);
    if (!draft) return;
    setQty(draft.qty);
    setReasonId(draft.reasonId);
    setRefNo(draft.refNo);
    setNote(draft.note);
    setUnitPrice(draft.unitPrice ?? "");
    if (draft.locationId && detail.stock.some((row) => row.locationId === draft.locationId)) {
      onLocationChange(draft.locationId);
    }
    setDraftRestored(true);
  }, [key, detail.stock, onLocationChange]);

  // Simpan draf sambil mengetik.
  React.useEffect(() => {
    saveDraft(key, {
      itemCode: detail.item.code,
      locationId,
      qty,
      reasonId,
      refNo,
      note,
      unitPrice,
      savedAt: Date.now(),
    });
  }, [key, detail.item.code, locationId, qty, reasonId, refNo, note, unitPrice]);

  const { data: reasons } = useQuery({
    queryKey: keys.reasons(false),
    queryFn: () => api.master.reasons(false),
    staleTime: 5 * 60_000,
  });

  const level = detail.stock.find((row) => row.locationId === locationId) ?? detail.stock[0];
  const available = level?.qty ?? 0;
  const unit = detail.unit?.symbol ?? "";
  const decimals = detail.unit?.decimals ?? 0;
  const selectedReason = reasons?.data.find((reason) => reason.id === reasonId);
  const requiresWo = mode === "issue" && Boolean(selectedReason?.requiresWo);
  const numericQty = Number(qty) || 0;

  const mutation = useMutation({
    mutationFn: () =>
      api.tx.create({
        itemCode: detail.item.code,
        locationId,
        type: mode,
        qty: numericQty,
        reasonId: reasonId || null,
        refNo: refNo.trim() || null,
        note: note.trim() || null,
        // Harga hanya untuk receive; jenis lain tidak pernah mengirimnya.
        unitPrice: mode === "receive" && unitPrice.trim() !== "" ? Number(unitPrice) : null,
        idempotencyKey: idempotencyRef.current,
        scanMethod: "in_app_scanner",
      }),
    onSuccess: (result) => {
      clearDraft(key);
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
      void queryClient.invalidateQueries({ queryKey: keys.custody() });
      onSuccess(result, {
        qty: numericQty,
        reasonId: reasonId || null,
        refNo: refNo.trim() || null,
      });
    },
    onError: (cause) => {
      // OF-01…04: sinyal putus → simpan ke antrean perangkat, bukan gagal.
      const networkFailure =
        !(cause instanceof ApiError) || cause.code === "CONTRACT_MISMATCH" || cause.status >= 500;
      if (
        flags.offline &&
        networkFailure &&
        typeof navigator !== "undefined" &&
        !navigator.onLine
      ) {
        const payload = {
          itemCode: detail.item.code,
          locationId,
          type: mode,
          qty: numericQty,
          reasonId: reasonId || null,
          refNo: refNo.trim() || null,
          note: note.trim() || null,
          unitPrice: mode === "receive" && unitPrice.trim() !== "" ? Number(unitPrice) : null,
          idempotencyKey: idempotencyRef.current,
          scanMethod: "in_app_scanner" as const,
        };
        void enqueue({
          payload,
          userId: user?.id ?? "anon",
          label: `${detail.item.name} · ${numericQty}`,
        })
          .then(() => {
            clearDraft(key);
            setError(null);
            toast.success(t("offlineQueued"));
            queryClient.invalidateQueries({ queryKey: ["offline-queue"] });
          })
          .catch(() => setError(t("errorGeneric")));
        return;
      }
      if (
        cause instanceof ApiError &&
        cause.status === 409 &&
        cause.code === "INSUFFICIENT_STOCK"
      ) {
        const latest = Number(cause.details?.available ?? 0);
        setError(`${t("insufficientTitle")} ${t("insufficientBody", { available: latest, unit })}`);
        if (numericQty > latest && latest > 0) setQty(String(latest));
        // Kunci idempotensi baru: percobaan sebelumnya tidak tercatat.
        idempotencyRef.current = uuidv7();
        void queryClient.invalidateQueries({ queryKey: keys.item(detail.item.id) });
        return;
      }
      if (cause instanceof ApiError) {
        setError(cause.message);
        return;
      }
      setError(t("errorGeneric"));
    },
  });

  const validate = (): string | null => {
    if (numericQty <= 0) return t("qtyInvalid");
    if (mode === "receive" && unitPrice.trim() !== "" && !(Number(unitPrice) >= 0)) {
      return t("priceInvalid");
    }
    if (decimals === 0 && !Number.isInteger(numericQty)) return t("qtyDecimal");
    if (mode === "issue" && numericQty > available) {
      return t("qtyTooBig", { available: formatQty(available, locale), unit });
    }
    if (mode === "issue" && !reasonId) return t("reasonRequired");
    if (requiresWo && !refNo.trim()) return t("woRequired");
    return null;
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    mutation.mutate();
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {draftRestored ? (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-info-soft px-3 py-2 text-2xs font-semibold text-info-foreground">
          <span className="flex items-center gap-1.5">
            <Icon name="info" className="size-3.5" />
            {t("draftRestored")}
          </span>
          <button
            type="button"
            onClick={() => {
              clearDraft(key);
              setQty("1");
              setReasonId("");
              setRefNo("");
              setNote("");
              setUnitPrice("");
              setDraftRestored(false);
            }}
            className="underline underline-offset-2"
          >
            {t("draftDiscard")}
          </button>
        </div>
      ) : null}

      {mode === "issue" && detail.stock.length > 1 ? (
        <div className="space-y-1.5">
          <Label htmlFor="take-location">{t("locationLabel")}</Label>
          <Select value={locationId} onValueChange={onLocationChange}>
            <SelectTrigger id="take-location">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {detail.stock.map((row) => (
                <SelectItem key={row.locationId} value={row.locationId}>
                  {row.location.path} · {formatQty(row.qty, locale)} {unit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="qty-input">{t("qtyLabel")}</Label>
          <span id="qty-hint" className="tnum text-2xs font-semibold text-muted-foreground">
            {t("stockAvailable", { qty: formatQty(available, locale), unit })}
          </span>
        </div>
        <QtyStepper
          value={qty}
          onChange={setQty}
          max={mode === "issue" ? available : 100_000}
          decimals={decimals}
          autoFocus
        />
        {numericQty > available && mode === "issue" ? (
          <button
            type="button"
            onClick={() => setQty(String(available))}
            className="text-2xs font-bold text-primary underline"
          >
            {t("useMax", { qty: formatQty(available, locale) })}
          </button>
        ) : null}
      </div>

      {/* Harga hanya diminta saat menambah stok (receive). Saat mengambil
          barang tidak ada harga — pengeluaran tidak mengubah harga perolehan. */}
      {mode === "receive" ? (
        <div className="space-y-1.5">
          <Label htmlFor="take-unit-price">
            {t("unitPriceLabel")}{" "}
            <span className="font-normal text-muted-foreground">({t("optional")})</span>
          </Label>
          <Input
            id="take-unit-price"
            data-testid="unit-price-input"
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            placeholder="0"
            value={unitPrice}
            onChange={(event) => setUnitPrice(event.target.value)}
            className="tnum"
          />
        </div>
      ) : null}

      {mode === "issue" ? (
        <div className="space-y-1.5">
          <Label htmlFor="take-reason">{t("reasonLabel")}</Label>
          <Select value={reasonId} onValueChange={setReasonId}>
            <SelectTrigger id="take-reason" data-testid="reason-select">
              <SelectValue placeholder={t("reasonPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {(reasons?.data ?? []).map((reason) => (
                <SelectItem key={reason.id} value={reason.id}>
                  {reason.name}
                  {reason.requiresWo ? " · WO" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {requiresWo ? (
        <div className="space-y-1.5">
          <Label htmlFor="take-wo">
            {t("woLabel")} <span className="text-danger-foreground">*</span>
          </Label>
          <Input
            id="take-wo"
            value={refNo}
            onChange={(event) => setRefNo(event.target.value)}
            placeholder={t("woPlaceholder")}
            className="font-mono"
            data-testid="wo-input"
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="take-wo">
            {t("woLabel")}{" "}
            <span className="font-normal text-muted-foreground">
              ({t("noteLabel").toLowerCase()})
            </span>
          </Label>
          <Input
            id="take-wo"
            value={refNo}
            onChange={(event) => setRefNo(event.target.value)}
            placeholder={t("woPlaceholder")}
            className="font-mono"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="take-note">
          {t("noteLabel")}{" "}
          <span className="font-normal text-muted-foreground">
            ({t("notePlaceholder").toLowerCase()})
          </span>
        </Label>
        <Textarea
          id="take-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          maxLength={500}
        />
      </div>

      {mode === "issue" && available <= 0 ? (
        <div
          role="alert"
          data-testid="take-empty-stock"
          className="space-y-1.5 rounded-xl border border-warning/40 bg-warning-soft px-3 py-2.5"
        >
          <p className="flex items-center gap-1.5 text-[13px] font-bold text-warning-foreground">
            <Icon name="triangle" className="size-4" />
            {t("emptyStockTitle")}
          </p>
          <p className="text-2xs text-warning-foreground/90">{t("emptyStockBody")}</p>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          data-testid="take-error"
          className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] font-semibold text-danger-foreground"
        >
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="xl"
        block
        disabled={mutation.isPending || numericQty <= 0 || (mode === "issue" && available <= 0)}
        className={cn("sticky bottom-24 z-10 sm:bottom-4")}
        data-testid="submit-take"
      >
        {mutation.isPending ? (
          <Icon name="spinner" className="size-5 animate-spin" />
        ) : (
          <Icon name="packageCheck" className="size-5" />
        )}
        {mutation.isPending
          ? t("submitting")
          : mode === "issue"
            ? t("submit")
            : mode === "return"
              ? t("submitReturn")
              : t("submitReceive")}
      </Button>
    </form>
  );
}

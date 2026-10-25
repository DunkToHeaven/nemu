"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/app/states";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ApiError, api, type StockCountRow } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { formatQty, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Opname — satu layar, tanpa tab.
 *
 * Alurnya sengaja dipermudah untuk pengguna umum:
 *   1. Klik "Sesi baru", pilih SATU lokasi.
 *   2. Sistem menarik semua barang di lokasi itu beserta stok catatannya.
 *   3. Petugas menghitung barang asli, mengetik angkanya per baris; setiap
 *      baris punya tombol riwayat untuk melihat transaksi terakhir barang itu
 *      — saat angka beda, penyebabnya kelihatan tanpa pindah halaman.
 *   4. "Selesai & koreksi" membuat transaksi koreksi untuk setiap selisih.
 *      Angka lama tidak diedit diam-diam; riwayat tetap utuh.
 *
 * Kata "zona" dan hierarki lokasi dibuang: lokasi berdiri sendiri.
 */
export function OpnameView() {
  const t = useTranslations("opname");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [openCount, setOpenCount] = React.useState<StockCountRow | null>(null);

  const counts = useQuery({ queryKey: keys.counts, queryFn: () => api.counts.list() });

  // Panel yang terbuka mengikuti data terbaru (mis. setelah baris dihitung).
  const shown = openCount
    ? (counts.data?.data.find((c) => c.id === openCount.id) ?? openCount)
    : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold">{t("title")}</h1>
          <p className="text-[13px] text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button size="sm" data-testid="opname-new-session" onClick={() => setCreateOpen(true)}>
          <Icon name="plus" className="size-4" />
          {t("newSession")}
        </Button>
      </div>

      {counts.isLoading ? (
        <ListSkeleton rows={4} />
      ) : counts.isError ? (
        <ErrorState onRetry={() => void counts.refetch()} />
      ) : (counts.data?.data.length ?? 0) === 0 ? (
        <EmptyState icon="clipboard" title={t("empty")} body={t("emptyBody")} />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2" data-testid="opname-sessions">
          {counts.data?.data.map((count) => {
            const counted = count.lines.filter((line) => line.countedQty !== null).length;
            const variance = count.lines.filter((line) => (line.variance ?? 0) !== 0).length;
            return (
              <li key={count.id}>
                <button
                  type="button"
                  onClick={() => setOpenCount(count)}
                  className="flex w-full flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-border-strong"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold">{count.name}</p>
                      <p className="truncate text-2xs text-muted-foreground">
                        {count.locationPath ?? "—"}
                      </p>
                    </div>
                    <Badge tone={count.status === "open" ? "warning" : "success"}>
                      {count.status === "open" ? t("statusOpen") : t("statusClosed")}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-2xs text-muted-foreground">
                    <span>{t("lines", { count: count.lines.length })}</span>
                    <span>·</span>
                    <span>{t("counted", { count: counted })}</span>
                    {variance > 0 ? (
                      <>
                        <span>·</span>
                        <span className="font-bold text-danger-foreground">
                          {t("variances", { count: variance })}
                        </span>
                      </>
                    ) : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <CreateCountDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(created) => setOpenCount(created)}
      />

      {shown ? (
        <CountSheet
          count={shown}
          onClose={() => setOpenCount(null)}
          onChanged={() => void counts.refetch()}
        />
      ) : null}
    </div>
  );
}

/** Dialog sesi baru: cukup pilih lokasi, opsional beri nama. */
function CreateCountDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (count: StockCountRow) => void;
}) {
  const t = useTranslations("opname");
  const queryClient = useQueryClient();

  const meta = useQuery({
    queryKey: keys.meta,
    queryFn: () => api.master.meta(),
    staleTime: 5 * 60_000,
    enabled: open,
  });

  const [locationId, setLocationId] = React.useState("");
  const [name, setName] = React.useState("");
  const locations = meta.data?.locations ?? [];

  const create = useMutation({
    mutationFn: () => api.counts.create({ locationId, name: name.trim() || undefined }),
    onSuccess: async (result) => {
      setLocationId("");
      setName("");
      onOpenChange(false);
      const list = await queryClient.fetchQuery({
        queryKey: keys.counts,
        queryFn: () => api.counts.list(),
        staleTime: 0,
      });
      const created = (list.data ?? []).find((c) => c.id === result.count?.id);
      if (created) onCreated(created);
      toast.success(t("sessionCreated"));
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : t("sessionCreateFailed")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="opname-create-dialog">
        <DialogHeader>
          <DialogTitle>{t("newSessionTitle")}</DialogTitle>
          <DialogDescription>{t("newSessionBody")}</DialogDescription>
        </DialogHeader>

        {locations.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-muted/40 p-3 text-2xs leading-relaxed text-muted-foreground">
            {t("noLocationsHint")}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="opname-location" className="text-[13px] font-bold">
                {t("locationLabel")}
              </Label>
              <select
                id="opname-location"
                data-testid="opname-location"
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
                className="h-12 w-full rounded-[14px] border border-input bg-card px-3 text-base font-semibold"
              >
                <option value="">{t("locationPlaceholder")}</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="opname-name" className="text-[13px] font-bold">
                {t("nameLabel")}
              </Label>
              <Input
                id="opname-name"
                data-testid="opname-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("namePlaceholder")}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button
            data-testid="opname-create-submit"
            onClick={() => create.mutate()}
            disabled={!locationId || create.isPending || locations.length === 0}
          >
            {create.isPending ? t("creating") : t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Isi hasil hitungan + riwayat transaksi per barang. */
function CountSheet({
  count,
  onClose,
  onChanged,
}: {
  count: StockCountRow;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useTranslations("opname");
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const setLine = useCountLine(count.id, onChanged);
  const approve = useApproveCount(count.id, onClose);

  const open = count.status === "open";
  const counted = count.lines.filter((line) => line.countedQty !== null).length;
  const variance = count.lines.filter((line) => (line.variance ?? 0) !== 0).length;

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="max-w-[620px]">
        <SheetHeader>
          <SheetTitle>{count.name}</SheetTitle>
          <SheetDescription>
            {count.locationPath ? `${count.locationPath} · ` : ""}
            {t("lines", { count: count.lines.length })} · {counted} {t("countedShort")}
            {variance > 0 ? (
              <span className="font-bold text-danger-foreground">
                {" · "}
                {t("variances", { count: variance })}
              </span>
            ) : null}
          </SheetDescription>
        </SheetHeader>

        {count.lines.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{t("noLines")}</p>
        ) : (
          <ul className="divide-y divide-border" data-testid="opname-lines">
            {count.lines.map((line) => (
              <CountLineRow
                key={line.id}
                line={line}
                open={open}
                expanded={expanded === line.id}
                onToggle={() => setExpanded(expanded === line.id ? null : line.id)}
                onSave={(qty) => setLine.mutate({ lineId: line.id, qty })}
                saving={setLine.isPending}
              />
            ))}
          </ul>
        )}

        {open ? (
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
            <p className="max-w-[60%] text-2xs leading-relaxed text-muted-foreground">
              {t("approveHint")}
            </p>
            <Button
              data-testid="opname-approve"
              onClick={() => approve.mutate()}
              disabled={approve.isPending || counted === 0}
            >
              {approve.isPending ? t("approving") : t("approve")}
            </Button>
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-success-soft p-3 text-2xs font-semibold text-success-foreground">
            {t("sessionClosed")}
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}

function CountLineRow({
  line,
  open,
  expanded,
  onToggle,
  onSave,
  saving,
}: {
  line: StockCountRow["lines"][number];
  open: boolean;
  expanded: boolean;
  onToggle: () => void;
  onSave: (qty: number) => void;
  saving: boolean;
}) {
  const t = useTranslations("opname");
  const [draft, setDraft] = React.useState(line.countedQty?.toString() ?? "");

  React.useEffect(() => {
    if (line.countedQty !== null) setDraft(line.countedQty.toString());
  }, [line.countedQty]);

  const diff = line.countedQty === null ? null : line.countedQty - line.systemQty;
  const canSave = open && draft.trim() !== "" && line.countedQty === null;

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold">{line.itemName}</p>
          <p className="truncate font-mono text-2xs text-muted-foreground">{line.itemCode}</p>
        </div>

        <div className="w-14 text-right">
          <p className="text-2xs text-muted-foreground">{t("systemQty")}</p>
          <p className="tnum text-[13px] font-bold">
            {line.systemQty} {line.unitSymbol ?? ""}
          </p>
        </div>

        {open ? (
          <div className="flex w-36 items-center gap-1.5">
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              aria-label={`${t("countedQty")}: ${line.itemName}`}
              data-testid={`opname-line-${line.id}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t("enterQty")}
              className="h-10"
            />
            <Button
              size="icon"
              variant="ghost"
              className="size-10 shrink-0"
              disabled={!canSave || saving}
              aria-label={t("saveLine")}
              onClick={() => onSave(Number(draft))}
            >
              <Icon name="check" className="size-4" />
            </Button>
          </div>
        ) : (
          <div className="w-14 text-right">
            <p className="text-2xs text-muted-foreground">{t("countedQty")}</p>
            <p className="tnum text-[13px] font-bold">{line.countedQty ?? "—"}</p>
          </div>
        )}

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={t("history")}
          data-testid={`opname-history-toggle-${line.id}`}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-2 text-2xs font-bold transition-colors",
            expanded
              ? "border-primary bg-primary-soft text-primary"
              : "border-border text-muted-foreground hover:border-border-strong hover:bg-muted hover:text-foreground",
          )}
          title={t("history")}
        >
          <Icon name="history" className="size-4" />
          <span className="hidden sm:inline">{t("history")}</span>
        </button>
      </div>

      {diff !== null && diff !== 0 ? (
        <p
          className={cn(
            "mt-1 text-right text-2xs font-bold",
            diff < 0 ? "text-danger-foreground" : "text-success-foreground",
          )}
        >
          {t("variance")}: {diff > 0 ? "+" : ""}
          {diff}
        </p>
      ) : null}

      {expanded ? <LineHistory itemId={line.itemId} /> : null}
    </li>
  );
}

/** Transaksi terakhir barang ini — konteks saat angka tidak cocok. */
const TX_TONE: Record<string, "success" | "warning" | "danger" | "info" | "neutral"> = {
  issue: "warning",
  return: "success",
  receive: "info",
  consume: "neutral",
  adjust: "info",
  reversal: "danger",
  transfer: "neutral",
};

const TX_COLLAPSED = 6;

/** Arah stok dari transaksi: keluar (−), masuk (+), atau pindah (⇄). */
function txDirection(tx: { fromLocationId?: string | null; toLocationId?: string | null }): {
  sign: "−" | "+" | "⇄";
  cls: string;
} {
  const out = Boolean(tx.fromLocationId);
  const in_ = Boolean(tx.toLocationId);
  if (out && in_) return { sign: "⇄", cls: "text-info-foreground" };
  if (out) return { sign: "−", cls: "text-danger-foreground" };
  return { sign: "+", cls: "text-success-foreground" };
}

function LineHistory({ itemId }: { itemId: string }) {
  const t = useTranslations("opname");
  const th = useTranslations("history");
  const locale = useLocale();
  const [showAll, setShowAll] = React.useState(false);

  const history = useQuery({
    queryKey: keys.itemTx(itemId),
    queryFn: () => api.items.transactions(itemId),
  });

  if (history.isLoading)
    return (
      <div className="mt-3">
        <ListSkeleton rows={2} />
      </div>
    );
  if (history.isError) {
    return (
      <p className="mt-3 rounded-xl border border-dashed border-border p-2.5 text-2xs text-muted-foreground">
        {t("historyEmpty")}
      </p>
    );
  }
  const all = history.data?.data ?? [];
  if (all.length === 0) {
    return (
      <p className="mt-3 rounded-xl border border-dashed border-border p-2.5 text-2xs text-muted-foreground">
        {t("historyEmpty")}
      </p>
    );
  }
  const rows = showAll ? all : all.slice(0, TX_COLLAPSED);

  return (
    <div className="mt-2 rounded-xl border border-border bg-card p-3">
      <p className="mb-1.5 text-2xs font-bold uppercase tracking-wide text-muted-foreground">
        {t("historyTitle")}
      </p>
      <ul className="space-y-1.5">
        {rows.map((row) => {
          const dir = txDirection(row);
          return (
            <li
              key={row.id}
              data-testid={`opname-history-row-${row.id}`}
              className="flex items-start justify-between gap-2 rounded-lg bg-muted/60 px-2.5 py-2 text-xs ring-1 ring-border/60"
            >
              <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <Badge tone={TX_TONE[row.type] ?? "neutral"} className="shrink-0">
                  {th(`type${row.type.charAt(0).toUpperCase()}${row.type.slice(1)}` as "typeIssue")}
                </Badge>
                <span className={cn("tnum font-extrabold", dir.cls)}>
                  {dir.sign}
                  {formatQty(Math.abs(row.qty), locale)}
                </span>
                {row.note || row.refNo ? (
                  <span className="min-w-0 truncate text-foreground/80">
                    {row.note ?? row.refNo}
                  </span>
                ) : null}
                {row.userName ? (
                  <span className="shrink-0 text-2xs text-foreground/70">
                    {t("historyBy", { name: row.userName })}
                  </span>
                ) : null}
              </span>
              <span className="tnum shrink-0 text-2xs text-foreground/70">
                {relativeTime(row.createdAt, locale)}
              </span>
            </li>
          );
        })}
      </ul>
      {all.length > TX_COLLAPSED ? (
        <button
          type="button"
          data-testid="opname-history-expand"
          onClick={() => setShowAll((v) => !v)}
          className="mt-2 w-full rounded-lg py-1.5 text-2xs font-bold text-primary hover:bg-primary-soft"
        >
          {showAll ? t("historyShowLess") : t("historyShowAll", { count: all.length })}
        </button>
      ) : null}
    </div>
  );
}

function useCountLine(countId: string, onChanged: () => void) {
  const t = useTranslations("opname");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { lineId: string; qty: number }) =>
      api.counts.setLine(countId, input.lineId, input.qty),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.counts });
      onChanged();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : t("lineSaveFailed")),
  });
}

function useApproveCount(countId: string, onClose: () => void) {
  const t = useTranslations("opname");
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.counts.approve(countId),
    onSuccess: (result) => {
      toast.success(t("approved", { count: result.adjusted }));
      void queryClient.invalidateQueries({ queryKey: keys.counts });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
      void queryClient.invalidateQueries({ queryKey: ["items"] });
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("approveFailed")),
  });
}

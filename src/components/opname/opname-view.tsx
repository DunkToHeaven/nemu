"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Switch } from "@/components/ui/switch";
import { ApiError, api, type StockCountRow } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { formatQty, relativeTime } from "@/lib/format";
import type { Verification } from "@/lib/types";
import { cn } from "@/lib/utils";

export function OpnameView() {
  const t = useTranslations("opname");
  const locale = useLocale();
  const params = useSearchParams();
  const initialTab =
    params.get("tab") === "needs"
      ? "needs"
      : params.get("tab") === "variances"
        ? "variances"
        : "sessions";
  const [tab, setTab] = React.useState<"sessions" | "variances" | "needs">(
    initialTab as "sessions" | "variances" | "needs",
  );
  const [openCount, setOpenCount] = React.useState<StockCountRow | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);

  const counts = useQuery({ queryKey: keys.counts, queryFn: () => api.counts.list() });
  const variances = useQuery({
    queryKey: keys.verifyQueue,
    queryFn: () => api.verify.list("pending"),
  });
  const reports = useQuery({ queryKey: keys.reports(90), queryFn: () => api.reports(90) });
  const meta = useQuery({
    queryKey: keys.meta,
    queryFn: () => api.master.meta(),
    staleTime: 5 * 60_000,
  });

  const tabs = [
    { key: "sessions" as const, label: t("tabSessions"), count: counts.data?.data.length ?? 0 },
    {
      key: "variances" as const,
      label: t("tabVariances"),
      count: variances.data?.data.length ?? 0,
    },
    {
      key: "needs" as const,
      label: t("tabNeedsCount"),
      count: reports.data?.confidence.needsCount.length ?? 0,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold">{t("title")}</h1>
          <p className="text-[13px] text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Icon name="plus" className="size-4" />
          {t("newSession")}
        </Button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto rounded-full bg-muted p-1.5 scrollbar-thin">
        {tabs.map((entry) => (
          <button
            key={entry.key}
            type="button"
            onClick={() => setTab(entry.key)}
            aria-pressed={tab === entry.key}
            className={cn(
              "min-h-9 shrink-0 rounded-full px-3.5 text-[13px] font-bold transition-colors",
              tab === entry.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
            )}
          >
            {entry.label}
            {entry.count > 0 ? (
              <span className="tnum ml-1.5 text-2xs font-bold text-muted-foreground">
                {entry.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {tab === "sessions" ? (
        counts.isLoading ? (
          <ListSkeleton rows={4} />
        ) : counts.isError ? (
          <ErrorState onRetry={() => void counts.refetch()} />
        ) : (counts.data?.data.length ?? 0) === 0 ? (
          <EmptyState icon="clipboard" title={t("empty")} body={t("emptyBody")} />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {counts.data?.data.map((count) => (
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
                        {count.locationPath}
                      </p>
                    </div>
                    <Badge
                      tone={
                        count.status === "open"
                          ? "warning"
                          : count.status === "review"
                            ? "info"
                            : "success"
                      }
                    >
                      {count.status === "open"
                        ? t("statusOpen")
                        : count.status === "review"
                          ? t("statusReview")
                          : t("statusClosed")}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-2xs text-muted-foreground">
                    <span>{t("lines", { count: count.lines.length })}</span>
                    <span>·</span>
                    <span>
                      {t("counted", {
                        count: count.lines.filter((line) => line.countedQty !== null).length,
                      })}
                    </span>
                    <span>·</span>
                    <span>
                      {t("variances", {
                        count: count.lines.filter((line) => (line.variance ?? 0) !== 0).length,
                      })}
                    </span>
                    {count.blind ? <Badge tone="neutral">{t("blindLabel")}</Badge> : null}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}

      {tab === "variances" ? (
        variances.isLoading ? (
          <ListSkeleton rows={4} />
        ) : (variances.data?.data.length ?? 0) === 0 ? (
          <EmptyState icon="shieldCheck" title={t("emptyVariance")} body={t("emptyVarianceBody")} />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {variances.data?.data.map((verification) => (
              <VarianceRow
                key={verification.id}
                verification={verification}
                locale={locale}
                onReviewed={() => void variances.refetch()}
              />
            ))}
          </ul>
        )
      ) : null}

      {tab === "needs" ? (
        reports.isLoading ? (
          <ListSkeleton rows={5} />
        ) : (reports.data?.confidence.needsCount.length ?? 0) === 0 ? (
          <EmptyState
            icon="badgeCheck"
            title={t("emptyNeedsCount")}
            body={t("emptyNeedsCountBody")}
          />
        ) : (
          <>
            <Button size="sm" variant="soft" onClick={() => setCreateOpen(true)}>
              <Icon name="plus" className="size-4" />
              {t("createFromNeeds")}
            </Button>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {reports.data?.confidence.needsCount.map((row) => (
                <li
                  key={`${row.itemId}-${row.locationPath}`}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{row.itemName}</p>
                    <p className="truncate text-2xs text-muted-foreground">{row.locationPath}</p>
                  </div>
                  <span className="tnum text-[13px] font-bold text-muted-foreground">
                    {formatQty(row.qty, locale)}
                  </span>
                  <Badge tone="danger">{t("needsCountScore", { score: row.score })}</Badge>
                </li>
              ))}
            </ul>
          </>
        )
      ) : null}

      <CreateCountDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        zones={(meta.data?.locations ?? []).filter((location) => location.type === "zone")}
      />

      {openCount ? <CountSheet count={openCount} onClose={() => setOpenCount(null)} /> : null}
    </div>
  );
}

function VarianceRow({
  verification,
  locale,
  onReviewed,
}: {
  verification: Verification;
  locale: string;
  onReviewed: () => void;
}) {
  const t = useTranslations("opname");
  const queryClient = useQueryClient();
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [note, setNote] = React.useState("");

  const review = useMutation({
    mutationFn: (input: { decision: "approved" | "rejected"; note?: string }) =>
      api.verify.review(verification.id, input.decision, input.note),
    onSuccess: () => {
      toast.success(t("approved", { count: 1 }));
      void queryClient.invalidateQueries({ queryKey: keys.verifyQueue });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
      onReviewed();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Gagal menyimpan keputusan."),
  });

  return (
    <li className="flex flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{verification.itemName}</p>
          <p className="truncate text-2xs text-muted-foreground">{verification.locationPath}</p>
        </div>
        <Badge tone="warning">{t("pendingReview")}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/60 p-2.5 text-center">
        <div>
          <p className="text-2xs text-muted-foreground">{t("systemQty")}</p>
          <p className="tnum text-sm font-extrabold">{verification.systemQty}</p>
        </div>
        <div>
          <p className="text-2xs text-muted-foreground">{t("countedQty")}</p>
          <p className="tnum text-sm font-extrabold">{verification.countedQty ?? "—"}</p>
        </div>
        <div>
          <p className="text-2xs text-muted-foreground">{t("variance")}</p>
          <p
            className={cn(
              "tnum text-sm font-extrabold",
              (verification.variance ?? 0) < 0
                ? "text-danger-foreground"
                : "text-success-foreground",
            )}
          >
            {(verification.variance ?? 0) > 0 ? "+" : ""}
            {verification.variance ?? 0}
          </p>
        </div>
      </div>
      <p className="text-2xs text-muted-foreground">
        {verification.userName} · {relativeTime(verification.createdAt, locale)} ·{" "}
        {verification.mode === "blind" ? t("blindLabel") : t("sourcePickPrompt")}
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="h-10 flex-1"
          onClick={() => review.mutate({ decision: "approved" })}
          disabled={review.isPending}
        >
          <Icon name="check" className="size-4" />
          {t("approve")}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="h-10 flex-1"
          onClick={() => setRejectOpen(true)}
        >
          {t("reject")}
        </Button>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("rejectTitle")}</DialogTitle>
            <DialogDescription>{t("rejectBody")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-note">{t("rejectReason")}</Label>
            <Input
              id="reject-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRejectOpen(false)}>
              Batal
            </Button>
            <Button
              variant="danger"
              disabled={note.trim().length === 0 || review.isPending}
              onClick={() =>
                review.mutate(
                  { decision: "rejected", note: note.trim() },
                  {
                    onSuccess: () => {
                      setRejectOpen(false);
                      toast.success(t("rejectDone"));
                    },
                  },
                )
              }
            >
              {t("reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

function CountSheet({ count, onClose }: { count: StockCountRow; onClose: () => void }) {
  const t = useTranslations("opname");
  const queryClient = useQueryClient();
  const [values, setValues] = React.useState<Record<string, string>>({});

  const setLine = useMutation({
    mutationFn: (input: { lineId: string; qty: number }) =>
      api.counts.setLine(count.id, input.lineId, input.qty),
    onSuccess: () => {
      toast.success(t("lineSaved"));
      void queryClient.invalidateQueries({ queryKey: keys.counts });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Gagal menyimpan baris."),
  });

  const approve = useMutation({
    mutationFn: () => api.counts.approve(count.id),
    onSuccess: (result) => {
      toast.success(t("approved", { count: result.adjusted }));
      void queryClient.invalidateQueries({ queryKey: keys.counts });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
      onClose();
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Gagal menyetujui."),
  });

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-w-[560px]">
        <SheetHeader>
          <SheetTitle>{count.name}</SheetTitle>
          <SheetDescription>
            {count.locationPath} · {t("lines", { count: count.lines.length })}
          </SheetDescription>
        </SheetHeader>

        {count.lines.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">{t("noLines")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {count.lines.map((line) => (
              <li key={line.id} className="flex flex-col gap-2 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold">{line.itemName}</p>
                    <p className="truncate text-2xs text-muted-foreground">{line.locationPath}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xs text-muted-foreground">{t("systemQty")}</p>
                    <p className="tnum text-sm font-extrabold">
                      {count.blind ? "•••" : line.systemQty}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={values[line.id] ?? line.countedQty ?? ""}
                    onChange={(event) =>
                      setValues((prev) => ({ ...prev, [line.id]: event.target.value }))
                    }
                    placeholder={t("enterQty")}
                    className="h-10"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-10 shrink-0"
                    disabled={values[line.id] === undefined || values[line.id] === ""}
                    onClick={() =>
                      setLine.mutate({ lineId: line.id, qty: Number(values[line.id]) })
                    }
                  >
                    {t("saveLine")}
                  </Button>
                </div>
                {line.countedQty !== null && line.variance !== null && line.variance !== 0 ? (
                  <p
                    className={cn(
                      "tnum text-2xs font-bold",
                      line.variance < 0 ? "text-danger-foreground" : "text-success-foreground",
                    )}
                  >
                    {t("variance")}: {line.variance > 0 ? "+" : ""}
                    {line.variance}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        <Button
          block
          size="lg"
          className="mt-2"
          onClick={() => approve.mutate()}
          disabled={approve.isPending || count.status === "closed"}
        >
          <Icon name="check" className="size-5" />
          {t("approve")}
        </Button>
      </SheetContent>
    </Sheet>
  );
}

function CreateCountDialog({
  open,
  onOpenChange,
  zones,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zones: { id: string; name: string; path: string }[];
}) {
  const t = useTranslations("opname");
  const queryClient = useQueryClient();
  const [zoneId, setZoneId] = React.useState("");
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [blind, setBlind] = React.useState(false);

  const create = useMutation({
    mutationFn: () =>
      api.counts.create({ zoneId, name: name || undefined, blind, source: "manual" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.counts });
      onOpenChange(false);
      setZoneId("");
      setName("");
      toast.success(t("create"));
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Gagal membuat sesi."),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newSessionTitle")}</DialogTitle>
          <DialogDescription>{t("newSessionBody")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="zone">{t("zoneLabel")}</Label>
            <select
              id="zone"
              value={zoneId}
              onChange={(event) => setZoneId(event.target.value)}
              className="h-12 w-full rounded-[14px] border border-input bg-card px-3 text-base"
              disabled={zones.length === 0}
            >
              <option value="">{zones.length === 0 ? t("zoneEmpty") : t("zonePlaceholder")}</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.path}
                </option>
              ))}
            </select>
            {/*
              Opname dihitung per zona, jadi zona WAJIB ada. Sebelumnya dropdown
              kosong tanpa penjelasan dan tombol Simpan mati begitu saja —
              pengguna tidak tahu harus ke mana. Sekarang ada penjelasan dan
              tombol yang langsung mengantar ke halaman pembuatan zona.
            */}
            {zones.length === 0 ? (
              <div className="space-y-2 rounded-xl border border-dashed border-border bg-muted/40 p-3">
                <p className="text-2xs leading-relaxed text-muted-foreground">
                  {t("zoneEmptyHint")}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  data-testid="opname-create-zone"
                  onClick={() => {
                    onOpenChange(false);
                    router.push("/app/database/lokasi?new=1&type=zone");
                  }}
                >
                  <Icon name="plus" className="size-4" />
                  {t("zoneCreate")}
                </Button>
              </div>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="count-name">{t("nameLabel")}</Label>
            <Input
              id="count-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("newSessionTitle")}
            />
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
            <span>
              <span className="block text-sm font-bold">{t("blindLabel")}</span>
              <span className="block text-2xs text-muted-foreground">{t("blindHint")}</span>
            </span>
            <Switch checked={blind} onCheckedChange={setBlind} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!zoneId || create.isPending}
            title={!zoneId ? t("zoneRequired") : undefined}
          >
            {t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

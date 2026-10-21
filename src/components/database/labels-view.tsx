"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import * as React from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/app/states";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { cn } from "@/lib/utils";

const PRESETS = [
  { id: "50x30", label: "50 × 30 mm", width: 50, height: 30 },
  { id: "70x40", label: "70 × 40 mm", width: 70, height: 40 },
  { id: "100x50", label: "100 × 50 mm", width: 100, height: 50 },
  { id: "a4", label: "A4 3×8 (63,5 × 38,1 mm)", width: 63.5, height: 38.1 },
] as const;

const MAX_LABELS = 1000;

export function LabelsView() {
  const t = useTranslations("labels");
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [preset, setPreset] = React.useState<string>("70x40");
  const [customW, setCustomW] = React.useState("60");
  const [customH, setCustomH] = React.useState("40");
  const [qrs, setQrs] = React.useState<Record<string, string>>({});
  const [generating, setGenerating] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: keys.items({ q: debounced, labels: true }),
    queryFn: () => api.items.list({ q: debounced || undefined, limit: 60 }),
  });

  const rows = data?.data ?? [];
  const size = React.useMemo(() => {
    if (preset === "custom") return { width: Number(customW) || 0, height: Number(customH) || 0 };
    const found = PRESETS.find((entry) => entry.id === preset);
    return { width: found?.width ?? 70, height: found?.height ?? 40 };
  }, [preset, customW, customH]);

  React.useEffect(() => {
    let cancelled = false;
    const build = async () => {
      const next: Record<string, string> = { ...qrs };
      for (const row of rows.slice(0, 12)) {
        if (next[row.id]) continue;
        next[row.id] = await QRCode.toDataURL(`${window.location.origin}/i/${row.code}`, {
          errorCorrectionLevel: "Q",
          margin: 1,
          width: 256,
        });
      }
      if (!cancelled) setQrs(next);
    };
    if (rows.length > 0) void build();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, qrs]);

  const chosen = rows.filter((row) => selected.has(row.id));

  const generate = async () => {
    if (chosen.length === 0) {
      toast.error(t("errorNoItems"));
      return;
    }
    if (chosen.length > MAX_LABELS) {
      toast.error(t("errorTooMany"));
      return;
    }
    if (size.width < 20 || size.height < 20 || size.width > 210 || size.height > 210) {
      toast.error(t("errorCustomSize"));
      return;
    }
    setGenerating(true);
    try {
      const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const bold = await doc.embedFont(StandardFonts.HelveticaBold);
      const MM = 2.834645669;
      const pageWidth = 210 * MM;
      const pageHeight = 297 * MM;
      const margin = 10 * MM;
      const cellW = size.width * MM;
      const cellH = size.height * MM;
      const perRow = Math.max(1, Math.floor((pageWidth - margin * 2) / cellW));
      const perCol = Math.max(1, Math.floor((pageHeight - margin * 2) / cellH));
      const perPage = perRow * perCol;

      let page = doc.addPage([pageWidth, pageHeight]);
      for (const [index, row] of chosen.entries()) {
        if (index > 0 && index % perPage === 0) {
          page = doc.addPage([pageWidth, pageHeight]);
        }
        const slot = index % perPage;
        const col = slot % perRow;
        const rowIdx = Math.floor(slot / perRow);
        const x = margin + col * cellW;
        const y = pageHeight - margin - (rowIdx + 1) * cellH;

        page.drawRectangle({
          x,
          y,
          width: cellW,
          height: cellH,
          borderColor: rgb(0.8, 0.82, 0.86),
          borderWidth: 0.6,
        });

        const dataUrl = qrs[row.id];
        if (dataUrl) {
          const png = await doc.embedPng(dataUrl);
          const qrSize = Math.min(cellH * 0.72, cellW * 0.4);
          page.drawImage(png, {
            x: x + 4,
            y: y + (cellH - qrSize) / 2,
            width: qrSize,
            height: qrSize,
          });
        }

        const textX = x + Math.min(cellH * 0.72, cellW * 0.4) + 10;
        page.drawText(row.name.slice(0, 28), {
          x: textX,
          y: y + cellH - 14,
          size: 7,
          font: bold,
          color: rgb(0.08, 0.13, 0.24),
        });
        page.drawText(row.code, {
          x: textX,
          y: y + cellH - 24,
          size: 8,
          font,
          color: rgb(0.76, 0.25, 0.05),
        });
        const location = (row.primaryLocation?.path ?? "").slice(0, 34);
        page.drawText(location, {
          x: textX,
          y: y + cellH - 34,
          size: 5.5,
          font,
          color: rgb(0.29, 0.36, 0.48),
        });
      }

      const bytes = await doc.save();
      const blob = new Blob([bytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `nemu-label-${chosen.length}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      window.localStorage.setItem("nemu.labels.printed", "1");
      toast.success(t("generated"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal membuat PDF.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("selectItems")}
            className="h-11 pl-10"
          />
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="h-11"
          onClick={() => setSelected(new Set(rows.map((row) => row.id)))}
          disabled={rows.length === 0}
        >
          {t("selectAllFiltered", { count: rows.length })}
        </Button>
      </div>

      <p className="text-[13px] font-semibold">
        <Badge tone="primary">{t("selected", { count: selected.size })}</Badge>
      </p>

      <div className="grid gap-3 lg:grid-cols-2">
        <section>
          {isLoading ? (
            <ListSkeleton rows={5} />
          ) : isError ? (
            <ErrorState onRetry={() => void refetch()} />
          ) : rows.length === 0 ? (
            <EmptyState icon="print" title={t("emptyLabels")} body={t("emptyLabelsBody")} />
          ) : (
            <ul className="max-h-[420px] divide-y divide-border overflow-y-auto rounded-2xl border border-border bg-card scrollbar-thin">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Checkbox
                    checked={selected.has(row.id)}
                    onCheckedChange={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(row.id)) next.delete(row.id);
                        else next.add(row.id);
                        return next;
                      })
                    }
                    aria-label={row.name}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold">{row.name}</span>
                    <span className="block font-mono text-2xs text-muted-foreground">
                      {row.code}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-3">
          <div>
            <p className="mb-1.5 text-2xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("preset")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setPreset(entry.id)}
                  className={cn(
                    "min-h-9 rounded-full border px-3 text-2xs font-bold transition-colors",
                    preset === entry.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted",
                  )}
                >
                  {entry.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPreset("custom")}
                className={cn(
                  "min-h-9 rounded-full border px-3 text-2xs font-bold transition-colors",
                  preset === "custom"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                {t("presetCustom")}
              </button>
            </div>
          </div>

          {preset === "custom" ? (
            <div className="flex gap-2">
              <div className="flex-1 space-y-1">
                <Label htmlFor="w">{t("widthMm")}</Label>
                <Input
                  id="w"
                  type="number"
                  min={20}
                  max={210}
                  value={customW}
                  onChange={(event) => setCustomW(event.target.value)}
                  className="h-10"
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label htmlFor="h">{t("heightMm")}</Label>
                <Input
                  id="h"
                  type="number"
                  min={20}
                  max={210}
                  value={customH}
                  onChange={(event) => setCustomH(event.target.value)}
                  className="h-10"
                />
              </div>
            </div>
          ) : null}

          <div>
            <p className="mb-1.5 text-2xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("preview")}
            </p>
            {chosen[0] && qrs[chosen[0].id] ? (
              <div
                className="flex items-center gap-2 rounded-lg border border-border bg-white p-2"
                style={{
                  width: Math.min(280, size.width * 3),
                  height: Math.min(180, size.height * 3),
                }}
                data-testid="label-preview"
              >
                <img src={qrs[chosen[0].id]} alt={t("qrPreview")} className="h-full w-auto" />
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-bold text-[#14213D]">{chosen[0].name}</p>
                  <p className="font-mono text-[10px] font-bold text-[#C2410C]">{chosen[0].code}</p>
                  <p className="truncate text-[8px] text-[#4B5B7A]">
                    {chosen[0].primaryLocation?.path}
                  </p>
                </div>
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-2xs text-muted-foreground">
                {t("previewHint")}
              </p>
            )}
          </div>

          <Button
            block
            size="lg"
            onClick={() => void generate()}
            disabled={generating || chosen.length === 0}
          >
            {generating ? (
              <Icon name="spinner" className="size-5 animate-spin" />
            ) : (
              <Icon name="print" className="size-5" />
            )}
            {generating ? t("generating") : t("generate")}
          </Button>
          <p className="text-2xs text-muted-foreground">{t("printHint")}</p>
        </section>
      </div>
    </div>
  );
}

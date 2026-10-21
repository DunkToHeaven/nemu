"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/app/states";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, api, type ImportJobRow } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { relativeTime } from "@/lib/format";

const SAMPLE = `sku,name,unit,min_stock,location
BEA-9001,Bearing 6205-2RS,pcs,10,Gudang 1/Zona B/Rak B-03
SEA-9002,Seal 25×40×7,pcs,20,Gudang 1/Zona B/Rak B-04`;

export function ImportsView() {
  const t = useTranslations("imports");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [entity, setEntity] = React.useState<"items" | "locations" | "users" | "equipment">(
    "items",
  );
  const [filename, setFilename] = React.useState("import.csv");
  const [raw, setRaw] = React.useState("");
  const [job, setJob] = React.useState<ImportJobRow | null>(null);

  const history = useQuery({ queryKey: keys.imports, queryFn: () => api.admin.imports() });

  const parseRows = (text: string): Record<string, string>[] => {
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 2) return [];
    const headers = (lines[0] ?? "").split(",").map((cell) => cell.trim().toLowerCase());
    return lines.slice(1).map((line) => {
      const cells = line.split(",").map((cell) => cell.trim());
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = cells[index] ?? "";
      });
      return row;
    });
  };

  const preview = useMutation({
    mutationFn: async () => {
      const rows = parseRows(raw);
      if (rows.length === 0) throw new ApiError(422, "EMPTY", t("noFile"));
      if (rows.length > 5000) throw new ApiError(422, "TOO_LARGE", t("tooLarge"));
      return api.admin.previewImport({ entity, rows, filename });
    },
    onSuccess: (result) => {
      setJob(result.job);
      void queryClient.invalidateQueries({ queryKey: keys.imports });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("invalidFile")),
  });

  const apply = useMutation({
    mutationFn: () => api.admin.applyImport(job!.id),
    onSuccess: (result) => {
      toast.success(t("applied", { created: result.created, updated: result.updated }));
      setJob(result.job);
      setRaw("");
      void queryClient.invalidateQueries({ queryKey: keys.imports });
      void queryClient.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("invalidFile")),
  });

  const downloadErrors = () => {
    if (!job) return;
    const rows = job.rows.filter((row) => row.status === "error");
    const csv = [
      "row,sku,name,message",
      ...rows.map((row) => `${row.row},"${row.sku}","${row.name}","${row.message ?? ""}"`),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nemu-import-errors-${job.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {(["items", "locations", "users", "equipment"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setEntity(value)}
            className={
              entity === value
                ? "min-h-9 rounded-full border border-primary bg-primary px-3.5 text-[13px] font-bold text-primary-foreground"
                : "min-h-9 rounded-full border border-border bg-card px-3.5 text-[13px] font-bold text-muted-foreground hover:bg-muted"
            }
          >
            {value === "items"
              ? t("entityItems")
              : value === "locations"
                ? t("entityLocations")
                : value === "users"
                  ? t("entityUsers")
                  : t("entityEquipment")}
          </button>
        ))}
      </div>

      <section className="space-y-2 rounded-2xl border border-dashed border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <Icon name="upload" className="size-5 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm font-bold">{t("dropTitle")}</p>
            <p className="text-2xs text-muted-foreground">{t("dropBody")}</p>
          </div>
        </div>

        <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 text-[13px] font-bold">
          <Icon name="upload" className="size-4" />
          {t("chooseFile")}
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const text = await file.text();
              setFilename(file.name);
              setRaw(text);
            }}
          />
        </label>

        <div className="space-y-1.5">
          <label
            htmlFor="csv"
            className="text-2xs font-bold uppercase tracking-wide text-muted-foreground"
          >
            CSV
          </label>
          <textarea
            id="csv"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            rows={5}
            placeholder={SAMPLE}
            className="w-full rounded-xl border border-input bg-card p-3 font-mono text-2xs"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => preview.mutate()}
            disabled={preview.isPending || raw.trim().length === 0}
          >
            {preview.isPending ? (
              <Icon name="spinner" className="size-4 animate-spin" />
            ) : (
              <Icon name="eye" className="size-4" />
            )}
            {t("preview")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setRaw(SAMPLE);
              setFilename("template.csv");
            }}
          >
            <Icon name="download" className="size-4" />
            {t("downloadTemplate")}
          </Button>
        </div>
        <p className="text-2xs text-muted-foreground">{t("dryRunNote")}</p>
      </section>

      {job ? (
        <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-extrabold">{t("previewTitle")}</h2>
            <Badge tone="neutral">{job.filename}</Badge>
          </div>
          <p className="text-[13px] font-semibold">
            {t("summary", { new: job.newRows, updated: job.updatedRows, errors: job.errorRows })}
          </p>

          <ul className="max-h-64 divide-y divide-border overflow-y-auto rounded-xl border border-border scrollbar-thin">
            {job.rows.slice(0, 100).map((row) => (
              <li key={row.row} className="flex items-center gap-2 px-3 py-2 text-2xs">
                <span className="w-8 shrink-0 text-muted-foreground">{row.row}</span>
                <Badge
                  tone={
                    row.status === "error"
                      ? "danger"
                      : row.status === "update"
                        ? "warning"
                        : "success"
                  }
                >
                  {row.status === "error"
                    ? t("rowError")
                    : row.status === "update"
                      ? t("rowUpdate")
                      : t("rowNew")}
                </Badge>
                <span className="min-w-0 flex-1 truncate font-semibold">{row.name || row.sku}</span>
                {row.message ? (
                  <span className="shrink-0 text-danger-foreground">{row.message}</span>
                ) : null}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => apply.mutate()}
              disabled={apply.isPending || job.status !== "preview"}
            >
              <Icon name="check" className="size-4" />
              {t("apply", { count: job.newRows + job.updatedRows })}
            </Button>
            {job.errorRows > 0 ? (
              <Button variant="secondary" onClick={downloadErrors}>
                <Icon name="download" className="size-4" />
                {t("downloadErrors")}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setJob(null)}>
              {t("cancel")}
            </Button>
          </div>
          {job.errorRows > 0 ? (
            <p className="text-2xs text-danger-foreground">
              {t("errorsNote", { count: job.errorRows })}
            </p>
          ) : null}
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-2xs font-bold uppercase tracking-wide text-muted-foreground">
          {t("history")}
        </h2>
        {(history.data?.data.length ?? 0) === 0 ? (
          <EmptyState icon="upload" title={t("historyEmpty")} />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {history.data?.data.map((row) => (
              <li key={row.id} className="flex items-center gap-2 px-4 py-2.5 text-[13px]">
                <span className="min-w-0 flex-1 truncate font-semibold">{row.filename}</span>
                <Badge
                  tone={
                    row.status === "applied"
                      ? "success"
                      : row.status === "failed"
                        ? "danger"
                        : "warning"
                  }
                >
                  {row.status}
                </Badge>
                <span className="text-2xs text-muted-foreground">
                  {relativeTime(row.createdAt, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="sr-only">
        <Input value={filename} readOnly />
      </p>
    </div>
  );
}

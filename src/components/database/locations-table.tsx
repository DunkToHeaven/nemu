"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/states";
import { Icon } from "@/components/icons";
import { useSession } from "@/components/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, api, type LocationRow } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { formatQty } from "@/lib/format";

const TYPE_TONE = { warehouse: "primary", zone: "info", rack: "neutral", bin: "neutral" } as const;

export function LocationsTable() {
  const t = useTranslations("database");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { role } = useSession();
  const isAdmin = role === "admin";
  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: keys.locations({ q: debounced }),
    queryFn: () => api.master.locations({ q: debounced || undefined }),
  });

  // Form tambah lokasi. Sebelumnya tab Lokasi sama sekali tidak punya tombol
  // tambah — pengguna hanya bisa menonaktifkan lokasi yang sudah ada.
  const [newOpen, setNewOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    code: "",
    type: "rack" as LocationRow["type"],
    parentId: "",
  });

  const all = useQuery({
    queryKey: keys.locations({ q: "" }),
    queryFn: () => api.master.locations({}),
  });

  const create = useMutation({
    mutationFn: () =>
      api.admin.createLocation({
        name: form.name.trim(),
        code: form.code.trim(),
        type: form.type,
        parentId: form.parentId || null,
        active: true,
      }),
    onSuccess: () => {
      toast.success(t("saved"));
      void queryClient.invalidateQueries({ queryKey: ["locations"] });
      setForm({ name: "", code: "", type: "rack", parentId: "" });
      setNewOpen(false);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Gagal menyimpan."),
  });

  const toggle = useMutation({
    mutationFn: (row: LocationRow) => api.admin.updateLocation(row.id, { active: !row.active }),
    onSuccess: (result) => {
      toast.success(result.message ?? t("saved"));
      void queryClient.invalidateQueries({ queryKey: ["locations"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Gagal menyimpan."),
  });

  if (isLoading) return <TableSkeleton rows={10} />;
  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  const rows = data?.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder")}
            className="h-11 pl-10"
          />
        </div>
        {isAdmin ? (
          <Button
            className="h-11 shrink-0 gap-1.5"
            data-testid="add-location"
            onClick={() => setNewOpen((value) => !value)}
          >
            <Icon name="plus" className="size-4" />
            {t("newLocation")}
          </Button>
        ) : null}
      </div>

      {newOpen && isAdmin ? (
        <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
          <p className="text-2xs text-muted-foreground">{t("newLocationHint")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={form.name}
              data-testid="new-location-name"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder={t("nameLabel")}
              className="h-11"
            />
            <Input
              value={form.code}
              data-testid="new-location-code"
              onChange={(event) => setForm({ ...form, code: event.target.value })}
              placeholder={t("codeLabel")}
              className="h-11"
            />
            <select
              value={form.type}
              data-testid="new-location-type"
              onChange={(event) =>
                setForm({ ...form, type: event.target.value as LocationRow["type"] })
              }
              className="h-11 rounded-xl border border-border bg-card px-3 text-[13px] font-semibold"
            >
              <option value="warehouse">{t("typeWarehouse")}</option>
              <option value="zone">{t("typeZone")}</option>
              <option value="rack">{t("typeRack")}</option>
              <option value="bin">{t("typeBin")}</option>
            </select>
            <select
              value={form.parentId}
              data-testid="new-location-parent"
              onChange={(event) => setForm({ ...form, parentId: event.target.value })}
              className="h-11 rounded-xl border border-border bg-card px-3 text-[13px] font-semibold"
            >
              <option value="">{t("noParent")}</option>
              {(all.data?.data ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.path}
                </option>
              ))}
            </select>
          </div>
          <Button
            className="h-11 gap-1.5"
            data-testid="save-location"
            disabled={
              form.name.trim().length < 2 || form.code.trim().length < 1 || create.isPending
            }
            onClick={() => create.mutate()}
          >
            {create.isPending ? (
              <Icon name="spinner" className="size-4 animate-spin" />
            ) : (
              <Icon name="check" className="size-4" />
            )}
            {t("save")}
          </Button>
        </section>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState icon="boxes" title={t("empty")} body={t("emptyBody")} />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold">{row.path}</p>
                <p className="text-2xs text-muted-foreground">
                  {row.code} ·{" "}
                  {t("pageInfo", { shown: row.itemCount ?? 0, total: row.totalQty ?? 0 })}
                </p>
              </div>
              <Badge tone={TYPE_TONE[row.type]}>
                {row.type === "warehouse"
                  ? t("typeWarehouse")
                  : row.type === "zone"
                    ? t("typeZone")
                    : row.type === "rack"
                      ? t("typeRack")
                      : t("typeBin")}
              </Badge>
              {row.active ? null : <Badge tone="neutral">nonaktif</Badge>}
              {isAdmin ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9"
                  onClick={() => toggle.mutate(row)}
                  disabled={toggle.isPending}
                >
                  {row.active ? t("bulkDeactivate") : t("bulkActivate")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <p className="text-2xs text-muted-foreground">{t("cannotDeleteHasStock")}</p>
      <p className="sr-only">{formatQty(rows.length, locale)}</p>
    </div>
  );
}

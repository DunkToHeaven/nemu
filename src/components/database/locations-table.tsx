"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
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

/**
 * Lokasi berdiri sendiri — tidak berjenjang.
 *
 * Hierarki gudang > zona > rak > bin terlalu ribet untuk pengguna umum:
 * membuat satu gudang sederhana saja butuh memilih induk yang benar. Sekarang
 * satu lokasi = satu nama tempat ("Rak A", "Gudang Front", "Lemari Kantor"),
 * dan opname tinggal memilih lokasi itu.
 */
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

  const [newOpen, setNewOpen] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", code: "" });

  /**
   * Tautan `?new=1` (dipakai petunjuk di halaman Opname) langsung membuka form,
   * supaya pengguna yang belum punya lokasi tidak perlu mencari tombolnya.
   */
  const params = useSearchParams();
  React.useEffect(() => {
    if (params?.get("new") === "1") setNewOpen(true);
  }, [params]);

  const create = useMutation({
    mutationFn: () =>
      api.admin.createLocation({
        name: form.name.trim(),
        code: form.code.trim(),
        // Tipe disimpan 'bin' untuk kecocokan skema lama; UI tidak menampilkannya.
        type: "bin",
        parentId: null,
        active: true,
      }),
    onSuccess: () => {
      toast.success(t("saved"));
      void queryClient.invalidateQueries({ queryKey: ["locations"] });
      setForm({ name: "", code: "" });
      setNewOpen(false);
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("saveFailed")),
  });

  const toggle = useMutation({
    mutationFn: (row: LocationRow) => api.admin.updateLocation(row.id, { active: !row.active }),
    onSuccess: (result) => {
      toast.success(result.message ?? t("saved"));
      void queryClient.invalidateQueries({ queryKey: ["locations"] });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("saveFailed")),
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
          <p className="text-2xs leading-relaxed text-muted-foreground">{t("newLocationHint")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={form.name}
              data-testid="new-location-name"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder={t("locationNamePlaceholder")}
              className="h-11"
            />
            <Input
              value={form.code}
              data-testid="new-location-code"
              onChange={(event) => setForm({ ...form, code: event.target.value })}
              placeholder={t("locationCodePlaceholder")}
              className="h-11"
            />
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
                <p className="truncate text-[13px] font-bold">{row.name}</p>
                <p className="text-2xs text-muted-foreground">
                  {row.code} · {t("locationItems", { count: row.itemCount ?? 0 })} ·{" "}
                  {formatQty(row.totalQty ?? 0, locale)}
                </p>
              </div>
              {row.active ? null : <Badge tone="neutral">{t("inactiveBadge")}</Badge>}
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
    </div>
  );
}

"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/app/states";
import { ConfidenceBadge } from "@/components/confidence-badge";
import { Icon } from "@/components/icons";
import { useSession } from "@/components/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ApiError, api, type ItemListRow } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { formatQty, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type ItemRow = ItemListRow;

const UNDO_MS = 5000;

export function ItemsTable() {
  const t = useTranslations("database");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const { role } = useSession();
  const isAdmin = role === "admin";

  const [query, setQuery] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [activeOnly, setActiveOnly] = React.useState(true);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [openItem, setOpenItem] = React.useState<ItemRow | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: keys.items({ q: debounced, activeOnly }),
      initialPageParam: null as string | null,
      queryFn: ({ pageParam }) =>
        api.items.list({
          q: debounced || undefined,
          limit: 100,
          cursor: pageParam,
          active: activeOnly ? undefined : "false",
        }),
      getNextPageParam: (last) => last.nextCursor,
    });

  const rows = React.useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
    overscan: 14,
  });

  const virtualRows = virtualizer.getVirtualItems();

  React.useEffect(() => {
    const last = virtualRows[virtualRows.length - 1];
    if (!last) return;
    if (last.index >= rows.length - 5 && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [virtualRows, rows.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const bulk = useMutation({
    mutationFn: (input: { ids: string[]; action: string }) => api.items.bulk(input),
    onSuccess: (_result, variables) => {
      if (variables.action === "deactivate") {
        toast.success(t("bulkDone", { count: variables.ids.length }), {
          description: t("undoAvailable", { seconds: 5 }),
          action: {
            label: t("undoAvailable", { seconds: 5 }).split(".")[0] ?? "Undo",
            onClick: () => {
              void api.items.bulk({ ids: variables.ids, action: "activate" }).then(() => {
                void queryClient.invalidateQueries({ queryKey: ["items"] });
                toast.success(t("undoDone"));
              });
            },
          },
          duration: UNDO_MS,
        });
      } else {
        toast.success(t("bulkDone", { count: variables.ids.length }));
      }
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ["items"] });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Aksi massal gagal."),
  });

  const allOnPage = rows.length > 0 && rows.every((row) => selected.has(row.id));

  const toggleAll = () => {
    if (allOnPage) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((row) => row.id)));
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
            data-testid="db-search"
          />
        </div>
        <label className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-3 text-[13px] font-semibold">
          <Checkbox
            checked={activeOnly}
            onCheckedChange={(checked) => setActiveOnly(Boolean(checked))}
          />
          {t("activeOnly")}
        </label>
        {isAdmin ? (
          <Button size="sm" asChild className="h-11">
            <Link href="/app/database/items?new=1">
              <Icon name="plus" className="size-4" />
              {t("newItem")}
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
        <span>
          {t("pageInfo", { shown: rows.length, total: data?.pages[0]?.total ?? rows.length })}
        </span>
        <span>·</span>
        <span>{t("inlineEditHint")}</span>
        {selected.size > 0 ? (
          <>
            <Badge tone="primary">{t("rowCount", { count: selected.size })}</Badge>
            {isAdmin ? (
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8"
                  onClick={() => bulk.mutate({ ids: [...selected], action: "deactivate" })}
                >
                  {t("bulkDeactivate")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  onClick={() => bulk.mutate({ ids: [...selected], action: "activate" })}
                >
                  {t("bulkActivate")}
                </Button>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {isLoading ? (
        <TableSkeleton rows={10} />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon="database" title={t("empty")} body={t("emptyBody")} />
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="grid grid-cols-[36px_1fr_120px_100px_90px] items-center gap-2 border-b border-border bg-muted/60 px-3 py-2 text-2xs font-bold uppercase tracking-wide text-muted-foreground">
              <Checkbox
                checked={allOnPage}
                onCheckedChange={toggleAll}
                aria-label={t("selectAll")}
              />
              <span>{t("nameLabel")}</span>
              <span>{t("categoryLabel")}</span>
              <span className="text-right">{t("qty")}</span>
              <span>{t("activeLabel")}</span>
            </div>
            <div
              ref={scrollRef}
              className="max-h-[calc(100dvh-330px)] overflow-auto scrollbar-thin"
              data-testid="db-scroll"
            >
              <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                {virtualRows.map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  if (!row) return null;
                  return (
                    <div
                      key={row.id}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      className="grid h-14 grid-cols-[36px_1fr_120px_100px_90px] items-center gap-2 border-b border-border px-3 text-[13px] hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={selected.has(row.id)}
                        onCheckedChange={() => toggle(row.id)}
                        aria-label={t("selectRow", { name: row.name })}
                      />
                      <button
                        type="button"
                        onClick={() => setOpenItem(row)}
                        className="min-w-0 text-left"
                      >
                        <span className="block truncate font-semibold">{row.name}</span>
                        <span className="block truncate font-mono text-2xs text-muted-foreground">
                          {row.sku} · {row.code}
                        </span>
                      </button>
                      <span className="truncate text-2xs text-muted-foreground">
                        {row.primaryLocation?.path ?? "—"}
                      </span>
                      <span className="tnum text-right font-bold">
                        {formatQty(row.totalQty, locale)} {row.unit?.symbol ?? ""}
                      </span>
                      <span>
                        {row.active ? (
                          <Badge tone="success">{t("activeLabel")}</Badge>
                        ) : (
                          <Badge tone="neutral">—</Badge>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {hasNextPage ? (
            <Button
              variant="secondary"
              block
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? <Icon name="spinner" className="size-4 animate-spin" /> : null}
              {t("loadMore")}
            </Button>
          ) : null}
        </>
      )}

      <ItemSheet item={openItem} onClose={() => setOpenItem(null)} canEdit={isAdmin} />
    </div>
  );
}

function ItemSheet({
  item,
  onClose,
  canEdit,
}: {
  item: ItemRow | null;
  onClose: () => void;
  canEdit: boolean;
}) {
  const t = useTranslations("database");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [minStock, setMinStock] = React.useState("");
  const [name, setName] = React.useState("");

  React.useEffect(() => {
    if (!item) return;
    setMinStock(String(item.minStock));
    setName(item.name);
  }, [item]);

  const history = useQuery({
    queryKey: keys.itemTx(item?.id ?? "none"),
    queryFn: () => api.items.transactions(item!.id),
    enabled: Boolean(item),
  });

  const save = useMutation({
    mutationFn: () => api.items.update(item!.id, { name: name.trim(), minStock: Number(minStock) }),
    onSuccess: () => {
      toast.success(t("saved"));
      void queryClient.invalidateQueries({ queryKey: ["items"] });
      void queryClient.invalidateQueries({ queryKey: keys.item(item!.id) });
      onClose();
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Gagal menyimpan."),
  });

  return (
    <Sheet open={Boolean(item)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="max-w-[520px]">
        {item ? (
          <>
            <SheetHeader>
              <SheetTitle>{item.name}</SheetTitle>
              <SheetDescription>
                {item.sku} · <span className="font-mono">{item.code}</span>
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={item.active ? "success" : "neutral"}>
                {item.active ? t("activeLabel") : "—"}
              </Badge>
              <ConfidenceBadge confidence={item.confidence} showScore />
              <Badge tone="neutral">
                {formatQty(item.totalQty, locale)} {item.unit?.symbol}
              </Badge>
            </div>

            <p className="rounded-xl bg-muted px-3 py-2 text-2xs text-muted-foreground">
              {t("qtyReadOnly")}
            </p>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="item-name" className="text-[13px] font-bold">
                  {t("nameLabel")}
                </label>
                <Input
                  id="item-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="item-min" className="text-[13px] font-bold">
                  {t("minStockLabel")}
                </label>
                <Input
                  id="item-min"
                  type="number"
                  min={0}
                  value={minStock}
                  onChange={(event) => setMinStock(event.target.value)}
                  disabled={!canEdit}
                />
              </div>
              <div className="rounded-xl border border-border p-3 text-[13px]">
                <p className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                  {t("locationLabel")}
                </p>
                <p className="mt-0.5 font-semibold">{item.primaryLocation?.path ?? "—"}</p>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("history")}
              </p>
              {history.data?.data.length ? (
                <ul className="max-h-52 divide-y divide-border overflow-y-auto scrollbar-thin">
                  {history.data.data.slice(0, 12).map((tx) => (
                    <li
                      key={tx.id}
                      className="flex items-center justify-between gap-2 py-1.5 text-2xs"
                    >
                      <span className="font-semibold">{tx.type}</span>
                      <span className="tnum">{tx.qty}</span>
                      <span className="text-muted-foreground">
                        {relativeTime(tx.createdAt, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-2xs text-muted-foreground">{t("historyEmpty")}</p>
              )}
            </div>

            {canEdit ? (
              <Button block size="lg" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? <Icon name="spinner" className="size-4 animate-spin" /> : null}
                {save.isPending ? t("saving") : t("save")}
              </Button>
            ) : (
              <p className={cn("rounded-xl bg-muted px-3 py-2 text-2xs text-muted-foreground")}>
                {t("readOnly")}
              </p>
            )}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

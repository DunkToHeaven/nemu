"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import { pushRecentSearch, readRecentSearches } from "@/components/app/search-preview";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/app/states";
import { Icon } from "@/components/icons";
import { ResultRow } from "@/components/search/result-row";
import { SearchBox, useDebouncedValue } from "@/components/search/search-box";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { setLastSearched } from "@/lib/draft";

export function SearchPage() {
  const t = useTranslations("search");
  const locale = useLocale();
  const _router = useRouter();
  const params = useSearchParams();
  const initial = params.get("q") ?? "";
  const [query, setQuery] = React.useState(initial);
  const debounced = useDebouncedValue(query, 250);
  const [recent, setRecent] = React.useState<string[]>([]);

  React.useEffect(() => {
    setRecent(readRecentSearches());
  }, []);

  React.useEffect(() => {
    const next = debounced.trim();
    if (next.length >= 2) {
      pushRecentSearch(next);
      const url = new URL(window.location.href);
      url.searchParams.set("q", next);
      window.history.replaceState(null, "", url.toString());
    }
  }, [debounced]);

  const enabled = debounced.trim().length >= 2;
  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: keys.search(debounced),
    queryFn: ({ signal }) => api.items.search(debounced, { limit: 30, signal }),
    enabled,
    staleTime: 15_000,
  });

  const rows = data?.data ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <h1 className="sr-only">{t("title")}</h1>
      <SearchBox
        value={query}
        onChange={setQuery}
        autoFocus
        placeholder={t("placeholder")}
        showShortcut
      />

      {!enabled ? (
        <div className="space-y-4">
          {recent.length > 0 ? (
            <section>
              <h2 className="mb-2 text-2xs font-bold uppercase tracking-wide text-muted-foreground">
                {t("recentSearches")}
              </h2>
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                {recent.map((entry) => (
                  <li key={entry}>
                    <button
                      type="button"
                      onClick={() => setQuery(entry)}
                      className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm hover:bg-muted"
                    >
                      <Icon name="history" className="size-4 text-muted-foreground" />
                      <span className="flex-1 truncate">{entry}</span>
                      <Icon name="chevronRight" className="size-4 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <EmptyState icon="search" title={t("noQuery")} body={t("searchingHint")} />
        </div>
      ) : isFetching && !data ? (
        <ListSkeleton rows={5} />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon="search"
          title={t("empty")}
          body={t("emptyBody")}
          action={
            <Button asChild size="sm" variant="secondary">
              <Link href="/app/opname">{t("reportToSupervisor")}</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-[13px] font-semibold text-muted-foreground">
              {t("resultsCount", { count: data?.total ?? 0, query: debounced })}
            </p>
            <Badge tone="neutral">{data?.tookMs ?? 0} ms</Badge>
          </div>
          <ul className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
            {rows.map((row) => (
              <li key={row.item.id}>
                <ResultRow row={row} onSelect={() => setLastSearched(row.item.id, row.item.name)} />
              </li>
            ))}
          </ul>
          <p className="px-1 text-2xs text-muted-foreground">
            {locale === "id"
              ? "Pilih item untuk melihat lokasinya."
              : "Choose an item to see its location."}
          </p>
        </>
      )}
    </div>
  );
}

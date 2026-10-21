"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useTranslations } from "next-intl";
import * as React from "react";
import { ListSkeleton } from "@/components/app/states";
import { Icon } from "@/components/icons";
import { ResultRow } from "@/components/search/result-row";
import { SearchBox, useDebouncedValue } from "@/components/search/search-box";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";

const RECENT_KEY = "nemu:recent-searches";

export function readRecentSearches(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string").slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

export function pushRecentSearch(value: string) {
  if (typeof window === "undefined") return;
  const trimmed = value.trim();
  if (trimmed.length < 2) return;
  const next = [trimmed, ...readRecentSearches().filter((entry) => entry !== trimmed)].slice(0, 5);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

/** Kolom cari + hasil instan di dashboard (SC-10, SC-14). */
export function SearchPreview({ autoFocus = false }: { autoFocus?: boolean }) {
  const t = useTranslations("search");
  const td = useTranslations("dashboard");
  const [query, setQuery] = React.useState("");
  const [recent, setRecent] = React.useState<string[]>([]);
  const debounced = useDebouncedValue(query, 250);

  React.useEffect(() => {
    setRecent(readRecentSearches());
  }, []);

  const { data, isFetching, isError, refetch } = useQuery({
    queryKey: keys.search(debounced),
    queryFn: ({ signal }) => api.items.search(debounced, { limit: 6, signal }),
    enabled: debounced.trim().length >= 2,
    staleTime: 15_000,
  });

  const showResults = debounced.trim().length >= 2;

  return (
    <div className="space-y-3">
      <SearchBox
        value={query}
        onChange={setQuery}
        onSubmit={(value) => {
          pushRecentSearch(value);
          window.location.href = `/app/cari?q=${encodeURIComponent(value)}`;
        }}
        autoFocus={autoFocus}
        showShortcut
      />

      {!showResults && recent.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
            {t("recentSearches")}
          </span>
          {recent.map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setQuery(entry)}
              className="rounded-full border border-border bg-card px-3 py-1 text-2xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {entry}
            </button>
          ))}
        </div>
      ) : null}

      {showResults ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
          {isFetching && !data ? (
            <ListSkeleton rows={3} />
          ) : isError ? (
            <div className="flex items-center gap-3 px-4 py-4">
              <Icon name="triangle" className="size-4 text-danger-foreground" />
              <p className="flex-1 text-[13px] text-muted-foreground">Pencarian gagal dimuat.</p>
              <Button size="sm" variant="secondary" onClick={() => void refetch()}>
                Coba lagi
              </Button>
            </div>
          ) : data && data.data.length > 0 ? (
            <>
              {data.data.map((row) => (
                <ResultRow key={row.item.id} row={row} compact />
              ))}
              <div className="border-t border-border bg-muted/40 px-4 py-2.5">
                <Link
                  href={`/app/cari?q=${encodeURIComponent(query)}`}
                  className="flex items-center justify-between text-[13px] font-bold text-primary"
                >
                  {t("resultsCount", { count: data.total, query })}
                  <Icon name="chevronRight" className="size-4" />
                </Link>
              </div>
            </>
          ) : (
            <div className="px-4 py-6 text-center">
              <p className="text-sm font-bold">{t("empty")}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">{t("emptyBody")}</p>
              <Button asChild variant="secondary" size="sm" className="mt-3">
                <Link href={`/app/cari?q=${encodeURIComponent(query)}`}>{td("viewAll")}</Link>
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

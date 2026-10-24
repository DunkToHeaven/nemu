"use client";

import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import * as React from "react";
import { Icon, type IconName } from "@/components/icons";
import { useSession } from "@/components/session-provider";
import { api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { navForRole } from "@/lib/nav";
import { cn } from "@/lib/utils";

function useDebounced(value: string, delay = 180) {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const { role } = useSession();
  const { setTheme, resolvedTheme } = useTheme();
  const [query, setQuery] = React.useState("");
  const debounced = useDebounced(query, 180);

  const { data, isFetching } = useQuery({
    queryKey: keys.search(debounced),
    queryFn: ({ signal }) => api.items.search(debounced, { limit: 8, signal }),
    enabled: open && debounced.trim().length > 0,
    staleTime: 20_000,
  });

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  const items = navForRole(role ?? "worker");

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label={t("palette.placeholder")}
      shouldFilter={false}
      className="fixed inset-0 z-50 flex items-start justify-center bg-[oklch(0.25_0.05_264/0.45)] p-4 pt-[10vh] backdrop-blur-[2px]"
    >
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-float)]">
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Icon name="search" className="size-4 shrink-0 text-muted-foreground" />
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder={t("palette.placeholder")}
            data-testid="palette-input"
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
          {isFetching ? (
            <Icon name="spinner" className="size-4 animate-spin text-muted-foreground" />
          ) : null}
          <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-2xs text-muted-foreground sm:block">
            ESC
          </kbd>
        </div>

        <Command.List className="max-h-[60vh] overflow-y-auto p-2 scrollbar-thin">
          <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
            {t("palette.empty")}
          </Command.Empty>

          {data && data.data.length > 0 ? (
            <Command.Group
              heading={t("palette.items")}
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
            >
              {data.data.map((row) => (
                <Command.Item
                  key={row.item.id}
                  value={`${row.item.name} ${row.item.sku} ${row.item.code}`}
                  onSelect={() => go(`/app/item/${row.item.id}`)}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm data-[selected=true]:bg-muted"
                >
                  <Icon name="box" className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{row.item.name}</span>
                    <span className="block truncate font-mono text-2xs text-muted-foreground">
                      {row.item.sku} · {row.primaryLocation?.path ?? "—"}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-2xs font-bold text-muted-foreground">
                    {row.totalQty} {row.unit?.symbol}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          ) : null}

          <Command.Group
            heading={t("palette.pages")}
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
          >
            {items.map((item) => (
              <Command.Item
                key={item.href}
                value={t(item.labelKey)}
                onSelect={() => go(item.href)}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm data-[selected=true]:bg-muted"
              >
                <Icon name={item.icon as IconName} className="size-4 text-muted-foreground" />
                {t(item.labelKey)}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group
            heading={t("palette.actions")}
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground"
          >
            <Command.Item
              value={t("palette.toggleTheme")}
              onSelect={() => {
                setTheme(resolvedTheme === "dark" ? "light" : "dark");
                onOpenChange(false);
              }}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm data-[selected=true]:bg-muted"
            >
              <Icon name="moon" className="size-4 text-muted-foreground" />
              {t("palette.toggleTheme")}
            </Command.Item>
            <Command.Item
              value={t("palette.goScan")}
              onSelect={() => go("/scan")}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm data-[selected=true]:bg-muted"
            >
              <Icon name="scan" className="size-4 text-muted-foreground" />
              {t("palette.goScan")}
            </Command.Item>
          </Command.Group>
        </Command.List>

        <div
          className={cn(
            "flex items-center justify-between border-t border-border px-4 py-2 text-2xs text-muted-foreground",
          )}
        >
          <span>{t("palette.hint")}</span>
          <span className="font-mono">↑↓ · ⏎</span>
        </div>
      </div>
    </Command.Dialog>
  );
}

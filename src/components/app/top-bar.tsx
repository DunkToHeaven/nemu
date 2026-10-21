"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import * as React from "react";
import { CommandPalette } from "@/components/app/command-palette";
import { ConnectionStatus } from "@/components/connection-status";
import { Icon } from "@/components/icons";
import { useSession } from "@/components/session-provider";
import { LocaleToggle, ThemeToggle } from "@/components/theme-locale";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const TITLES: { pattern: RegExp; key: string }[] = [
  { pattern: /^\/app\/cari/, key: "search.title" },
  { pattern: /^\/app\/item\//, key: "item.title" },
  { pattern: /^\/app\/riwayat/, key: "history.title" },
  { pattern: /^\/app\/dibawa/, key: "custody.title" },
  { pattern: /^\/app\/transaksi/, key: "transactions.title" },
  { pattern: /^\/app\/opname/, key: "opname.title" },
  { pattern: /^\/app\/laporan/, key: "reports.title" },
  { pattern: /^\/app\/database/, key: "database.title" },
  { pattern: /^\/admin\/settings/, key: "admin.settingsTitle" },
  { pattern: /^\/admin\/audit/, key: "admin.auditTitle" },
  { pattern: /^\/admin\/integrations/, key: "admin.googleTitle" },
  { pattern: /^\/admin\/setup/, key: "admin.setupTitle" },
  { pattern: /^\/scan/, key: "scan.title" },
  { pattern: /^\/app/, key: "dashboard.title" },
];

export function TopBar() {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useSession();
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  const title = TITLES.find((entry) => entry.pattern.test(pathname))?.key ?? "dashboard.title";
  const initials = (user?.name ?? "?")
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="flex h-14 items-center gap-2 px-3 sm:h-16 sm:gap-3 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-sm font-extrabold sm:text-base">{t(title)}</span>
            <ConnectionStatus className="hidden sm:inline-flex" />
          </div>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            data-testid="palette-trigger"
            className="hidden h-10 min-w-56 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted md:flex"
          >
            <Icon name="search" className="size-4" />
            <span className="flex-1 truncate">{t("common.searchPlaceholder")}</span>
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-2xs">
              ⌘K
            </kbd>
          </button>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label={t("common.search")}
            className="grid size-10 place-items-center rounded-full border border-border bg-card md:hidden"
          >
            <Icon name="search" className="size-[18px]" />
          </button>

          <ConnectionStatus className="sm:hidden" />
          <LocaleToggle />
          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`${initials} — ${t("common.profile")}`}
                data-testid="user-menu"
                className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-soft text-[13px] font-extrabold text-primary-soft-foreground"
              >
                {initials}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>{user?.name ?? "—"}</DropdownMenuLabel>
              <div className="flex items-center gap-2 px-3 pb-2">
                <Badge tone="primary">{t(`roles.${user?.role ?? "worker"}`)}</Badge>
                <span className="font-mono text-2xs text-muted-foreground">{user?.code}</span>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => router.push("/app/menu")}>
                <Icon name="menu" className="size-4 text-muted-foreground" />
                {t("nav.menu")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push("/app/dibawa")}>
                <Icon name="package" className="size-4 text-muted-foreground" />
                {t("nav.custody")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                destructive
                onSelect={() => {
                  void logout();
                }}
              >
                <Icon name="logout" className="size-4" />
                {t("common.logout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <PaletteShortcut onOpen={() => setPaletteOpen(true)} />
    </>
  );
}

function PaletteShortcut({ onOpen }: { onOpen: () => void }) {
  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onOpen]);
  return null;
}

export function SkipLink() {
  const t = useTranslations("common");
  return (
    <a
      href="#main"
      className={cn(
        "sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50",
        "focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-bold focus:text-primary-foreground",
      )}
    >
      {t("skipToContent")}
    </a>
  );
}

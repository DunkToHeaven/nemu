"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import * as React from "react";
import { Logo, LogoMark } from "@/components/brand";
import { Icon, type IconName } from "@/components/icons";
import { navForRole } from "@/lib/nav";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";

const _GROUP_LABEL: Record<string, string> = {
  main: "nav.overview",
  ops: "nav.transactions",
  admin: "nav.database",
};

function isActive(pathname: string, href: string) {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ role }: { role: Role }) {
  const t = useTranslations();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const items = navForRole(role);

  return (
    <aside
      data-testid="sidebar"
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-card/70 backdrop-blur lg:flex",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      <div className={cn("flex h-16 items-center gap-2 px-4", collapsed && "justify-center px-0")}>
        <Logo href="/app" showWordmark={!collapsed} />
      </div>

      <nav
        aria-label={t("common.mainNavigation")}
        className="flex-1 overflow-y-auto px-2 pb-4 scrollbar-thin"
      >
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? t(item.labelKey) : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors",
                    collapsed && "justify-center px-0",
                    active
                      ? "bg-primary-soft text-primary-soft-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon name={item.icon as IconName} className="size-[18px] shrink-0" />
                  {collapsed ? (
                    <span className="sr-only">{t(item.labelKey)}</span>
                  ) : (
                    <span className="truncate">{t(item.labelKey)}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border p-2">
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
          className={cn(
            "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            collapsed && "justify-center px-0",
          )}
        >
          <Icon name={collapsed ? "chevronRight" : "chevronDown"} className="size-[18px]" />
          {collapsed ? null : <span>{t("nav.more")}</span>}
        </button>
      </div>
    </aside>
  );
}

export function Rail({ role }: { role: Role }) {
  const t = useTranslations();
  const pathname = usePathname();
  const items = navForRole(role);

  return (
    <aside
      data-testid="rail"
      className="sticky top-0 hidden h-dvh w-[72px] shrink-0 flex-col items-center border-r border-border bg-card/70 py-3 backdrop-blur sm:flex lg:hidden"
    >
      <Link href="/app" aria-label="Nemu" className="mb-3">
        <LogoMark className="size-10" />
      </Link>
      <nav
        aria-label={t("common.mainNavigation")}
        className="flex flex-1 flex-col items-center gap-1 overflow-y-auto scrollbar-thin"
      >
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={t(item.labelKey)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "grid size-12 place-items-center rounded-xl transition-colors",
                active
                  ? "bg-primary-soft text-primary-soft-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon name={item.icon as IconName} className="size-5" />
              <span className="sr-only">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/icons";
import { isActivePath } from "@/lib/nav";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Tab {
  href: string;
  labelKey: string;
  icon: IconName;
  primary?: boolean;
}

function tabsForRole(role: Role): Tab[] {
  if (role === "worker") {
    return [
      { href: "/app", labelKey: "nav.home", icon: "home" },
      { href: "/app/riwayat", labelKey: "nav.history", icon: "history" },
      { href: "/scan", labelKey: "nav.scan", icon: "scan", primary: true },
      { href: "/app/dibawa", labelKey: "nav.custody", icon: "package" },
      { href: "/app/menu", labelKey: "nav.menu", icon: "menu" },
    ];
  }
  return [
    { href: "/app", labelKey: "nav.home", icon: "home" },
    { href: "/app/transaksi", labelKey: "nav.transactions", icon: "list" },
    { href: "/scan", labelKey: "nav.scan", icon: "scan", primary: true },
    { href: "/app/opname", labelKey: "nav.counts", icon: "clipboard" },
    { href: "/app/menu", labelKey: "nav.menu", icon: "menu" },
  ];
}

export function TabBar({ role }: { role: Role }) {
  const t = useTranslations();
  const pathname = usePathname();
  const tabs = tabsForRole(role);

  return (
    <nav
      aria-label={t("common.mainNavigation")}
      data-testid="tab-bar"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-md sm:hidden"
    >
      <ul className="grid grid-cols-5 items-end px-1 pb-1 pt-1.5">
        {tabs.map((tab) => {
          const active = isActivePath(pathname, tab.href);
          if (tab.primary) {
            return (
              <li key={tab.href} className="flex justify-center">
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className="-mt-5 flex flex-col items-center gap-1"
                >
                  <span className="grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-cta)]">
                    <Icon name={tab.icon} className="size-6" />
                  </span>
                  <span className="text-2xs font-bold text-primary">{t(tab.labelKey)}</span>
                </Link>
              </li>
            );
          }
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-lg text-2xs font-semibold transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon name={tab.icon} className="size-5" />
                {t(tab.labelKey)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

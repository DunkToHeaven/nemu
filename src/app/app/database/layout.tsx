"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSession } from "@/components/session-provider";
import { DATABASE_TABS } from "@/lib/nav";
import { cn } from "@/lib/utils";

export default function DatabaseLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("database");
  const pathname = usePathname();
  const { role } = useSession();
  const isAdmin = role === "admin";

  const tabs = DATABASE_TABS.filter((tab) => !tab.adminOnly || isAdmin);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-lg font-extrabold">{t("title")}</h1>
          <p className="text-[13px] text-muted-foreground">{t("subtitle")}</p>
        </div>
        {!isAdmin ? (
          <p className="rounded-full bg-warning-soft px-3 py-1 text-2xs font-bold text-warning-foreground">
            {t("readOnly")}
          </p>
        ) : null}
      </div>

      <nav
        aria-label={t("title")}
        className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 scrollbar-thin"
      >
        {tabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const label = tab.labelKey.replace("database.tab", "");
          const key = `tab${label}` as "tabItems";
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-9 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-bold transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {t(key)}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}

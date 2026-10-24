"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Icon, type IconName } from "@/components/icons";
import { useSession } from "@/components/session-provider";
import { LocaleToggle, ThemeToggle } from "@/components/theme-locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { navForRole } from "@/lib/nav";

export function MenuPage() {
  const t = useTranslations();
  const locale = useLocale();
  const { user, role, logout } = useSession();
  const items = navForRole(role ?? "worker");

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-full bg-primary-soft text-base font-extrabold text-primary-soft-foreground">
            {(user?.name ?? "?").slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold">{user?.name}</p>
            <p className="font-mono text-2xs text-muted-foreground">{user?.code}</p>
          </div>
          <Badge tone="primary">{t(`roles.${role}`)}</Badge>
        </div>
        <div className="mt-3 flex gap-2 border-t border-border pt-3">
          <LocaleToggle />
          <ThemeToggle />
        </div>
      </section>

      <section>
        <h2 className="mb-2 px-1 text-2xs font-bold uppercase tracking-wide text-muted-foreground">
          {t("common.mainNavigation")}
        </h2>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex min-h-14 items-center gap-3 px-4 hover:bg-muted"
              >
                <Icon name={item.icon as IconName} className="size-5 text-muted-foreground" />
                <span className="flex-1 text-sm font-semibold">{t(item.labelKey)}</span>
                <Icon name="chevronRight" className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Button
        variant="danger-soft"
        size="lg"
        block
        onClick={() => {
          void logout();
        }}
      >
        <Icon name="logout" className="size-5" />
        {t("common.logout")}
      </Button>

      <p className="text-center text-2xs text-muted-foreground">
        {t("common.appName")} v0.1.0 · {locale.toUpperCase()}
      </p>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import * as React from "react";
import { Icon } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCALE_COOKIE } from "@/i18n/config";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("common");
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const isDark = mounted ? resolvedTheme === "dark" : false;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("theme")}
          data-testid="theme-toggle"
          className={cn(
            "grid size-10 place-items-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted",
            className,
          )}
        >
          {isDark ? (
            <Icon name="moon" className="size-[18px]" />
          ) : (
            <Icon name="sun" className="size-[18px]" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("theme")}</DropdownMenuLabel>
        {(["light", "dark", "system"] as const).map((value) => (
          <DropdownMenuItem key={value} onSelect={() => setTheme(value)}>
            <Icon
              name={value === "light" ? "sun" : value === "dark" ? "moon" : "settings"}
              className="size-4 text-muted-foreground"
            />
            <span className="flex-1">
              {t(value === "light" ? "themeLight" : value === "dark" ? "themeDark" : "themeSystem")}
            </span>
            {mounted && theme === value ? (
              <Icon name="check" className="size-4 text-primary" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LocaleToggle({ className }: { className?: string }) {
  const t = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();

  const setLocale = (next: "id" | "en") => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    document.documentElement.lang = next;
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t("language")}
          data-testid="locale-toggle"
          className={cn(
            "inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[13px] font-bold text-foreground transition-colors hover:bg-muted",
            className,
          )}
        >
          <Icon name="languages" className="size-4" />
          {locale.toUpperCase()}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{t("language")}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => setLocale("id")}>
          <span className="flex-1">Bahasa Indonesia</span>
          {locale === "id" ? <Icon name="check" className="size-4 text-primary" /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setLocale("en")}>
          <span className="flex-1">English</span>
          {locale === "en" ? <Icon name="check" className="size-4 text-primary" /> : null}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled className="text-2xs text-muted-foreground">
          ID · EN
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

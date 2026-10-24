import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { BackButton } from "@/components/landing/back-button";
import { LoginCard } from "@/components/landing/login-card";
import { LocaleToggle, ThemeToggle } from "@/components/theme-locale";

export const metadata = { title: "Masuk · Nemu", robots: { index: false, follow: false } };

export default async function LoginPage() {
  const t = await getTranslations("login");
  return (
    <div className="hero-canvas flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-2 px-4 py-4 sm:px-8">
        <div className="flex items-center gap-1">
          <BackButton />
          <Logo />
        </div>
        <div className="flex items-center gap-2">
          <LocaleToggle />
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pb-10 pt-2 sm:items-center sm:pt-0">
        <div className="w-full max-w-[430px]">
          <Suspense
            fallback={<div className="h-[520px] rounded-[28px] border border-border bg-card/70" />}
          >
            <LoginCard className="max-w-none" />
          </Suspense>
          <p className="mt-4 text-center text-2xs text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              {t("openDashboard")} · Nemu
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

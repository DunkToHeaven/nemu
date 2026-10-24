import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { ResetPasswordForm } from "@/components/landing/reset-password-form";
import { LocaleToggle, ThemeToggle } from "@/components/theme-locale";

export const metadata = { title: "Reset kata sandi · Nemu", robots: { index: false } };

export default async function ResetPasswordPage() {
  const t = await getTranslations("reset");

  return (
    <div className="hero-canvas flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Logo />
        <div className="flex items-center gap-2">
          <LocaleToggle />
          <ThemeToggle />
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 pb-10 pt-2 sm:items-center sm:pt-0">
        <div className="w-full max-w-[430px] rounded-[28px] border border-border bg-card/85 p-5 shadow-[var(--shadow-card)] backdrop-blur sm:p-6">
          <h1 className="text-xl font-extrabold tracking-[-0.02em]">{t("title")}</h1>
          <p className="mb-4 mt-1 text-[13px] leading-relaxed text-muted-foreground">
            {t("subtitle")}
          </p>
          <Suspense fallback={<div className="h-40" />}>
            <ResetPasswordForm />
          </Suspense>
          <p className="mt-4 text-center text-2xs text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              Nemu
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}

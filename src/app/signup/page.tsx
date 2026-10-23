import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand";
import { SignupForm } from "@/components/landing/signup-form";
import { LocaleToggle, ThemeToggle } from "@/components/theme-locale";

export const metadata = { title: "Daftar · Nemu" };

export default async function SignupPage() {
  const t = await getTranslations("signup");

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
          <SignupForm />
        </div>
      </main>
    </div>
  );
}

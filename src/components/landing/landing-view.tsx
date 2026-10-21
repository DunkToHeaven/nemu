"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/brand";
import { Icon, type IconName } from "@/components/icons";
import { LoginCard } from "@/components/landing/login-card";
import { LocaleToggle, ThemeToggle } from "@/components/theme-locale";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { cn } from "@/lib/utils";

export function LandingView() {
  const t = useTranslations("landing");
  const tl = useTranslations("login");
  const params = useSearchParams();

  const { data: session } = useQuery({
    queryKey: keys.session,
    queryFn: () => api.auth.session(),
    retry: false,
    staleTime: 30_000,
  });

  const nextParam = params.get("next");

  const features: { icon: IconName; title: string; body: string }[] = [
    { icon: "shieldCheck", title: t("featureLog"), body: t("featureLogBody") },
    { icon: "wifi", title: t("featureOffline"), body: t("featureOfflineBody") },
    { icon: "chart", title: t("featureLive"), body: t("featureLiveBody") },
    { icon: "cloud", title: t("featureSheets"), body: t("featureSheetsBody") },
  ];

  return (
    <div className="hero-canvas relative flex min-h-dvh flex-col overflow-hidden">
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8 sm:py-6 lg:px-12">
        <Logo />
        <nav
          aria-label={t("navFeatures")}
          className="hidden items-center gap-1 rounded-full border border-border/80 bg-card/70 p-1.5 shadow-[var(--shadow-card)] backdrop-blur lg:flex"
        >
          <a
            href="#fitur"
            className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("navFeatures")}
          </a>
          <a
            href="#cara-kerja"
            className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("navHow")}
          </a>
          <Link
            href="/docs"
            className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("navDocs")}
          </Link>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="rounded-full px-4 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("navGithub")}
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <LocaleToggle />
          <ThemeToggle />
        </div>
      </header>

      <main className="relative z-10 flex-1 px-4 pb-8 sm:px-8 lg:px-12">
        <div className="mx-auto grid max-w-[1200px] items-start gap-8 lg:grid-cols-[minmax(0,1fr)_430px] lg:gap-14">
          {/* Login lebih dulu di HP (order-1), konten pengenalan di bawahnya. */}
          <div className="order-1 lg:order-2 lg:pt-6">
            {session ? (
              <div className="rounded-[28px] border border-border bg-card/90 p-6 shadow-[var(--shadow-float)] backdrop-blur-xl">
                <p className="text-sm text-muted-foreground">
                  {tl("loggedInAs", { name: session.name })}
                </p>
                <h2 className="mt-1 text-2xl font-extrabold tracking-[-0.02em]">{tl("title")}</h2>
                <Button asChild size="lg" block className="mt-4">
                  <Link href={nextParam ? nextParam : "/app"}>
                    {tl("openDashboard")}
                    <Icon name="chevronRight" className="size-5" />
                  </Link>
                </Button>
              </div>
            ) : (
              <LoginCard />
            )}
          </div>

          <section className="order-2 flex max-w-[660px] flex-col gap-6 lg:order-1 lg:pt-4">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border/80 bg-card/70 px-4 py-2 text-[13px] font-bold text-muted-foreground backdrop-blur">
              <span className="size-2 rounded-full bg-accent-2" />
              {t("badge")}
            </span>

            <h1 className="text-[34px] font-extrabold leading-[1.04] tracking-[-0.03em] sm:text-[48px] lg:text-[60px]">
              {t("heroLine1")}
              <br />
              <span className="text-primary">{t("heroLine2")}</span>
            </h1>

            <p className="max-w-[520px] text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t("heroBody")}
            </p>

            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <a href="#cara-kerja">{t("ctaDemo")}</a>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/docs">{t("ctaDocs")}</Link>
              </Button>
            </div>

            <ol className="flex flex-wrap gap-3" id="cara-kerja">
              {[t("step1Title"), t("step2Title"), t("step3Title")].map((title, index) => (
                <li
                  key={title}
                  className="flex min-w-[150px] flex-1 flex-col gap-2.5 rounded-2xl border border-border/80 bg-card/75 p-4 shadow-[var(--shadow-card)] backdrop-blur"
                >
                  <span className="grid size-8 place-items-center rounded-full bg-primary-soft text-sm font-extrabold text-primary-soft-foreground">
                    {index + 1}
                  </span>
                  <span className="text-[15px] font-bold leading-snug">{title}</span>
                </li>
              ))}
            </ol>

            <div className="flex w-fit items-center gap-3.5 rounded-2xl border border-border/80 bg-card/80 p-3 pr-5 shadow-[var(--shadow-card)]">
              <span className="grid size-10 place-items-center rounded-xl bg-success-soft text-success-foreground">
                <Icon name="check" className="size-5" strokeWidth={2.6} />
              </span>
              <div className="min-w-[210px] space-y-1.5">
                <p className="text-sm font-bold">
                  {t("proofTitle", { qty: 2, unit: "pcs", name: "Bearing 6205" })}
                </p>
                <div className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full w-[86%] rounded-full bg-accent-2" />
                  </span>
                  {t("proofRemaining", { remaining: 12, total: 14 })}
                </div>
              </div>
            </div>
          </section>
        </div>

        <section id="fitur" className="mx-auto mt-14 max-w-[1200px]">
          <div className="max-w-[560px] space-y-2">
            <h2 className="text-2xl font-extrabold tracking-[-0.02em] sm:text-3xl">
              {t("featuresTitle")}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              {t("featuresBody")}
            </p>
          </div>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <li
                key={feature.title}
                className="flex flex-col gap-2.5 rounded-2xl border border-border/80 bg-card/80 p-4"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                  <Icon name={feature.icon} className="size-5" />
                </span>
                <p className="text-sm font-bold">{feature.title}</p>
                <p className="text-[13px] leading-relaxed text-muted-foreground">{feature.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="relative z-10 px-4 pb-6 sm:px-8 lg:px-12">
        <ul className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-center gap-x-7 gap-y-3 rounded-3xl border border-border/80 bg-card/70 px-6 py-4 text-sm font-bold backdrop-blur">
          {[
            { icon: "shieldCheck" as IconName, label: t("featureLog") },
            { icon: "wifi" as IconName, label: t("featureOffline") },
            { icon: "chart" as IconName, label: t("featureLive") },
            { icon: "cloud" as IconName, label: t("featureSheets") },
          ].map((entry) => (
            <li key={entry.label} className="flex items-center gap-2.5">
              <Icon name={entry.icon} className="size-5 text-primary" />
              {entry.label}
            </li>
          ))}
        </ul>
        <div
          className={cn(
            "mx-auto mt-4 flex max-w-[1200px] flex-wrap items-center justify-center gap-4 text-2xs text-muted-foreground",
          )}
        >
          <Link href="/docs" className="hover:text-foreground">
            {t("footerDocs")}
          </Link>
          <Link href="/privacy" className="hover:text-foreground">
            {t("footerPrivacy")}
          </Link>
          <span>MIT · v0.1.0</span>
        </div>
      </footer>
    </div>
  );
}

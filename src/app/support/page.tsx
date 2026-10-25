/**
 * Halaman "Dukung Kreator" — menggantikan halaman dokumentasi.
 *
 * Nemu dibagikan gratis dan open source; jalur keberlanjutannya adalah
 * dukungan sukarela lewat Saweria plus kanal kontak langsung ke kreator
 * (email, WhatsApp, GitHub, Instagram).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand";
import { Icon, type IconName } from "@/components/icons";
import { LocaleToggle, ThemeToggle } from "@/components/theme-locale";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Dukung Kreator",
  description:
    "Nemu gratis dan open source. Dukung pengembangan berkelanjutan lewat Saweria, atau hubungi kreator langsung.",
};

const CREATOR = {
  name: "Muhamad Fillah Alifan",
  saweria: "https://saweria.co/fillindata",
  email: "fillahalifan0@gmail.com",
  whatsapp: "https://wa.me/6283120742763",
  whatsappLabel: "0831-2074-2763",
  github: "https://github.com/Dunktoheaven",
  githubLabel: "Dunktoheaven",
  instagram: "https://instagram.com/fill.in.data",
  instagramLabel: "@fill.in.data",
};

export default async function SupportPage() {
  const t = await getTranslations("support");

  const contacts: { icon: IconName; label: string; value: string; href: string }[] = [
    {
      icon: "mail",
      label: t("contactEmail"),
      value: CREATOR.email,
      href: `mailto:${CREATOR.email}`,
    },
    {
      icon: "phone",
      label: t("contactWhatsapp"),
      value: CREATOR.whatsappLabel,
      href: CREATOR.whatsapp,
    },
    {
      icon: "code",
      label: t("contactGithub"),
      value: CREATOR.githubLabel,
      href: CREATOR.github,
    },
    {
      icon: "atSign",
      label: t("contactInstagram"),
      value: CREATOR.instagramLabel,
      href: CREATOR.instagram,
    },
  ];

  const ways: { icon: IconName; title: string; body: string }[] = [
    { icon: "gift", title: t("wayDonate"), body: t("wayDonateBody") },
    { icon: "shieldCheck", title: t("wayCode"), body: t("wayCodeBody") },
    { icon: "send", title: t("waySpread"), body: t("waySpreadBody") },
  ];

  return (
    <div className="hero-canvas relative flex min-h-dvh flex-col overflow-hidden">
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8 sm:py-6 lg:px-12">
        <div className="flex items-center gap-3">
          {/* Tombol kembali: halaman ini sering dibuka dari tautan eksternal
              (Saweria, profil GitHub) dan pengunjung butuh jalan balik yang
              jelas tanpa mengandalkan tombol back browser. */}
          <Link
            href="/"
            aria-label="Kembali"
            className="grid size-10 place-items-center rounded-xl border border-border/80 bg-card/70 text-muted-foreground shadow-[var(--shadow-card)] backdrop-blur transition-colors hover:text-foreground"
          >
            <Icon name="arrowLeft" className="size-5" />
          </Link>
          <Logo />
        </div>
        <div className="flex items-center gap-2">
          <LocaleToggle />
          <ThemeToggle />
        </div>
      </header>

      <main className="relative z-10 flex-1 px-4 pb-10 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[880px] flex-col gap-8">
          {/* Kartu hero: sama seperti kartu di homepage — badge pill, judul
              besar dua baris dengan aksen warna, CTA primer + sekunder, semua
              dibungkus satu panel translucent agar tidak "mengambang" di
              atas gradient sementara blok bawahnya pakai kartu. */}
          <section className="flex flex-col gap-4 rounded-3xl border border-border/80 bg-card/80 p-6 shadow-[var(--shadow-card)] backdrop-blur sm:p-8">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border/80 bg-card/70 px-4 py-2 text-[13px] font-bold text-muted-foreground backdrop-blur">
              <span className="size-2 rounded-full bg-accent-2" />
              {t("badge")}
            </span>
            <h1 className="text-[34px] font-extrabold leading-[1.04] tracking-[-0.03em] sm:text-[48px]">
              {t("title1")}
              <br />
              <span className="text-primary">{t("title2")}</span>
            </h1>
            <p className="max-w-[620px] text-base leading-relaxed text-muted-foreground sm:text-lg">
              {t("intro", { creator: CREATOR.name })}
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button asChild size="lg">
                <a href={CREATOR.saweria} target="_blank" rel="noreferrer">
                  <Icon name="heart" className="size-5" />
                  {t("ctaSaweria")}
                </a>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/">{t("backHome")}</Link>
              </Button>
            </div>
            <p className="text-[13px] text-muted-foreground">{t("saweriaNote")}</p>
          </section>

          <section className="rounded-3xl border border-border/80 bg-card/80 p-5 shadow-[var(--shadow-card)] backdrop-blur sm:p-6">
            <h2 className="text-lg font-extrabold tracking-[-0.02em]">{t("contactsTitle")}</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">{t("contactsBody")}</p>
            <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {contacts.map((c) => (
                <li key={c.label}>
                  <a
                    href={c.href}
                    target={c.href.startsWith("http") ? "_blank" : undefined}
                    rel={c.href.startsWith("http") ? "noreferrer" : undefined}
                    className="flex items-center gap-3.5 rounded-2xl border border-border/70 bg-card p-3.5 transition-colors hover:border-primary/50 hover:bg-primary-soft/40"
                    data-testid={`support-contact-${c.label}`}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                      <Icon name={c.icon} className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                        {c.label}
                      </span>
                      <span className="block truncate text-sm font-bold text-foreground">
                        {c.value}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <section className="grid gap-3 sm:grid-cols-3">
            {ways.map((w) => (
              <article
                key={w.title}
                className="flex flex-col gap-2.5 rounded-2xl border border-border/80 bg-card/80 p-4"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-primary-soft text-primary-soft-foreground">
                  <Icon name={w.icon} className="size-5" />
                </span>
                <p className="text-sm font-bold">{w.title}</p>
                <p className="text-[13px] leading-relaxed text-muted-foreground">{w.body}</p>
              </article>
            ))}
          </section>

          <p className="text-center text-[13px] text-muted-foreground">{t("thanks")}</p>
        </div>
      </main>

      <footer className="relative z-10 px-4 pb-6 sm:px-8 lg:px-12">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-center gap-4 text-2xs text-muted-foreground">
          <Link href="/support" className="hover:text-foreground">
            {t("title2")}
          </Link>
          <a
            href={CREATOR.saweria}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            Saweria
          </a>
          <span>MIT · v0.1.0</span>
        </div>
      </footer>
    </div>
  );
}

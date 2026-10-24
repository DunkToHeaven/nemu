"use client";

import { useTranslations } from "next-intl";
import type * as React from "react";
import { Rail, Sidebar } from "@/components/app/sidebar";
import { TabBar } from "@/components/app/tab-bar";
import { SkipLink, TopBar } from "@/components/app/top-bar";
import { CustodyReminder } from "@/components/custody/custody-reminder";
import { DevPanel } from "@/components/dev/dev-panel";
import { NavProgress } from "@/components/nav-progress";
import { useSession } from "@/components/session-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Role } from "@/lib/types";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { role, user } = useSession();
  // Kerangka navigasi butuh Role konkret. "worker" adalah tampilan paling
  // terbatas, jadi tidak ada menu berlebih yang bocor selagi sesi dimuat;
  // setelah sesi tiba, menu admin muncul.
  const navRole: Role = role ?? "worker";
  const t = useTranslations();

  return (
    // TooltipProvider hanya dibutuhkan di dalam aplikasi (grafik tren memakai
    // tooltip). Sebelumnya dipasang global, sehingga rute publik seperti `/`
    // dan `/login` ikut membayar biaya hidrasinya.
    <TooltipProvider delayDuration={250}>
      {/* Indikator loading navigasi: klik menu langsung memberi umpan balik. */}
      <NavProgress />
      <div className="flex min-h-dvh bg-canvas">
        <SkipLink />
        <Sidebar role={navRole} />
        <Rail role={navRole} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main
            id="main"
            className="mx-auto w-full max-w-[1440px] flex-1 px-3 pb-28 pt-3 sm:px-5 sm:pb-10 sm:pt-5"
          >
            {children}
          </main>
          <footer className="hidden border-t border-border px-5 py-3 text-2xs text-muted-foreground sm:block">
            {t("common.appName")} · v0.1.0 · {user?.name ?? ""}
          </footer>
        </div>
        <TabBar role={navRole} />
        <CustodyReminder />
        <DevPanel />
      </div>
    </TooltipProvider>
  );
}

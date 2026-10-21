"use client";

import { useTranslations } from "next-intl";
import type * as React from "react";
import { Rail, Sidebar } from "@/components/app/sidebar";
import { TabBar } from "@/components/app/tab-bar";
import { SkipLink, TopBar } from "@/components/app/top-bar";
import { CustodyReminder } from "@/components/custody/custody-reminder";
import { DevPanel } from "@/components/dev/dev-panel";
import { SessionExpiredDialog } from "@/components/session-expired-dialog";
import { useSession } from "@/components/session-provider";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { role, user } = useSession();
  const t = useTranslations();

  return (
    <div className="flex min-h-dvh bg-canvas">
      <SkipLink />
      <Sidebar role={role} />
      <Rail role={role} />
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
      <TabBar role={role} />
      <CustodyReminder />
      <DevPanel />
      <SessionExpiredDialog />
    </div>
  );
}

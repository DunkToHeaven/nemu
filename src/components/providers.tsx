"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import * as React from "react";
import { SessionProvider } from "@/components/session-provider";
import { LazySessionExpiredDialog } from "@/components/ui/lazy-session-dialog";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              const status = (error as { status?: number }).status;
              if (status && status >= 400 && status < 500) return false;
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          {children}
          {/* Global: /i/[kode] dan /scan tidak memakai AppShell, jadi dialog
              sesi berakhir tidak boleh hanya dipasang di dalam shell.
              Dimuat malas: hanya perlu saat sesi benar-benar habis. */}
          <LazySessionExpiredDialog />
        </SessionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

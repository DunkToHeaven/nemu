"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import * as React from "react";
import { api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import type { Role, SessionUser } from "@/lib/types";

interface SessionContextValue {
  user: SessionUser | null;
  role: Role;
  isLoading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: keys.session,
    queryFn: () => api.auth.session(),
    staleTime: 60_000,
    retry: false,
    // 401 di sini adalah keadaan normal (belum login), bukan kegagalan.
    refetchOnWindowFocus: false,
  });

  React.useEffect(() => {
    const onExpired = () => {
      queryClient.setQueryData(keys.session, null);
      queryClient.invalidateQueries();
    };
    window.addEventListener("nemu:session-expired", onExpired);
    return () => window.removeEventListener("nemu:session-expired", onExpired);
  }, [queryClient]);

  const refresh = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: keys.session });
  }, [queryClient]);

  const logout = React.useCallback(async () => {
    await api.auth.logout();
    queryClient.setQueryData(keys.session, null);
    queryClient.clear();
    router.push("/");
  }, [queryClient, router]);

  const value = React.useMemo<SessionContextValue>(
    () => ({
      user: data ?? null,
      role: data?.role ?? "worker",
      isLoading,
      refresh,
      logout,
    }),
    [data, isLoading, refresh, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSession harus dipakai di dalam SessionProvider");
  return ctx;
}

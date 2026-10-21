"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { LoginCard } from "@/components/landing/login-card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";

/**
 * Satu-satunya bagian beranda yang benar-benar interaktif.
 *
 * Dipisah dari `LandingView` supaya hero, daftar fitur, dan footer tetap
 * dirender di server. Sebelumnya seluruh beranda adalah komponen klien,
 * sehingga teks pemasaran yang statis ikut dihidrasi dan membebani main
 * thread (TBT 280 ms, skor performa Lighthouse 86).
 */
export function LandingAuth() {
  const tl = useTranslations("login");
  const params = useSearchParams();

  const { data: session } = useQuery({
    queryKey: keys.session,
    queryFn: () => api.auth.session(),
    retry: false,
    staleTime: 30_000,
  });

  const nextParam = params.get("next");

  if (!session) return <LoginCard />;

  return (
    <div className="rounded-[28px] border border-border bg-card/90 p-6 shadow-[var(--shadow-float)] backdrop-blur-xl">
      <p className="text-sm text-muted-foreground">{tl("loggedInAs", { name: session.name })}</p>
      <h2 className="mt-1 text-2xl font-extrabold tracking-[-0.02em]">{tl("title")}</h2>
      <Button asChild size="lg" block className="mt-4">
        <Link href={nextParam ? nextParam : "/app"}>
          {tl("openDashboard")}
          <Icon name="chevronRight" className="size-5" />
        </Link>
      </Button>
    </div>
  );
}

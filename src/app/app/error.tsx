"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import * as React from "react";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";

/**
 * Batas galat untuk seluruh area aplikasi.
 *
 * Tanpa berkas ini, satu kegagalan render (mis. satu field hilang dari respons
 * API) menjatuhkan seluruh halaman menjadi layar putih "This page couldn't
 * load". Pengguna tidak tahu apa yang terjadi dan tidak punya jalan kembali.
 *
 * Di sini: pesan singkat, tombol coba lagi (render ulang rute), dan jalan
 * keluar ke beranda. Detail teknis TIDAK ditampilkan ke pengguna.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  const router = useRouter();

  React.useEffect(() => {
    // Simpan ke konsol supaya bisa ditelusuri; pengguna cukup melihat pesan ramah.
    console.error("[app] render gagal:", error.message, error.digest ?? "");
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60dvh] w-full max-w-[520px] flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-danger-soft text-danger-foreground">
        <Icon name="alert" className="size-6" />
      </span>
      <div className="space-y-1.5">
        <h1 className="text-lg font-extrabold tracking-[-0.02em]">{t("pageTitle")}</h1>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{t("pageBody")}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset} data-testid="error-retry">
          {t("retry")}
        </Button>
        <Button variant="secondary" onClick={() => router.push("/app")}>
          {t("toHome")}
        </Button>
      </div>
      {error.digest ? (
        <p className="font-mono text-2xs text-muted-foreground">ref: {error.digest}</p>
      ) : null}
    </div>
  );
}

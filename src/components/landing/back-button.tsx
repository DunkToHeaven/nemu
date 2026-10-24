"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";

/**
 * Tombol kembali di halaman masuk.
 *
 * Perilaku: kembali ke halaman sebelumnya bila ada riwayat di dalam aplikasi;
 * kalau tidak (mis. tautan dibuka langsung dari WhatsApp), pergi ke beranda.
 * Memakai tombol sendiri, bukan `history.back()` saja, supaya pengguna tidak
 * terjebak di halaman kosong ketika tab baru dibuka.
 */
export function BackButton() {
  const t = useTranslations("common");
  const router = useRouter();

  const goBack = () => {
    const hasHistory = typeof window !== "undefined" && window.history.length > 1;
    if (hasHistory) router.back();
    else router.push("/");
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={goBack}
      data-testid="login-back"
      className="h-9 gap-1.5 rounded-full px-2.5 text-[13px] font-bold"
    >
      <Icon name="arrowLeft" className="size-4" />
      {t("back")}
    </Button>
  );
}

/** Versi tautan, dipakai bila ingin selalu menuju beranda. */
export function BackHomeLink() {
  const t = useTranslations("common");
  return (
    <Link
      href="/"
      className="inline-flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-bold text-muted-foreground hover:text-foreground"
    >
      <Icon name="arrowLeft" className="size-4" />
      {t("back")}
    </Link>
  );
}

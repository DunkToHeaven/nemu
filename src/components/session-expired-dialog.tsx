"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import * as React from "react";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Sesi berakhir: pengguna diarahkan ke beranda, BUKAN ke /login?next=…
 *
 * Alur lama: dialog ini mengirim ke /login dengan `?next=<halaman saat ini>`.
 * Karena guard server ikut menempelkan `next` saat rute terlindung dibuka
 * ulang, tujuan login bisa berputar kembali ke /login — terasa seperti
 * "loop sesi habis". Beranda adalah titik masuk alami: kartu masuk selalu
 * ada di sana, dan draf pengambilan barang tersimpan di localStorage sehingga
 * tidak hilang saat berpindah halaman.
 *
 * Cookie sesi lama dinetralkan lewat logout (server ikut mencabut id sesinya)
 * supaya tidak ada permintaan berikutnya yang memakai sesi mati. Kegagalan
 * logout diabaikan — sesi kedaluwarsa memang sudah ditolak server.
 */
export function SessionExpiredDialog() {
  const t = useTranslations("login");
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("nemu:session-expired", handler);
    return () => window.removeEventListener("nemu:session-expired", handler);
  }, []);

  const goHome = () => {
    setOpen(false);
    fetch("/api/v1/auth/logout", { method: "POST", credentials: "same-origin" }).catch(
      () => undefined,
    );
    router.push("/");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showClose={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="lock" className="size-5 text-warning-foreground" />
            {t("sessionExpired")}
          </DialogTitle>
          <DialogDescription>{t("sessionExpiredBody")}</DialogDescription>
        </DialogHeader>
        <Button size="lg" block onClick={goHome}>
          {t("backHome")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

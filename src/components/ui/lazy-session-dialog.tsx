"use client";

import dynamic from "next/dynamic";

/**
 * Dialog "sesi berakhir" hanya muncul setelah permintaan API gagal karena sesi
 * kedaluwarsa — tidak pernah saat paint pertama. Memuatnya secara dinamis
 * mengeluarkannya dari JS muatan awal semua rute (termasuk `/i/[kode]` dan
 * `/scan`, yang berada di luar AppShell) sehingga TBT turun.
 */
export const LazySessionExpiredDialog = dynamic(
  () => import("@/components/session-expired-dialog").then((mod) => mod.SessionExpiredDialog),
  { ssr: false },
);

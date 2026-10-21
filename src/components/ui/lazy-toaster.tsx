"use client";

import dynamic from "next/dynamic";

/**
 * Toaster (Sonner) hanya dibutuhkan setelah pengguna memicu aksi yang
 * memunculkan toast, bukan saat paint pertama. Membungkusnya dengan
 * `next/dynamic({ ssr: false })` mengeluarkannya dari JS muatan awal setiap
 * rute sehingga Total Blocking Time turun.
 *
 * `ssr: false` hanya sah di Client Component, jadi pembungkus ini ada supaya
 * `app/layout.tsx` (Server Component) bisa memakainya.
 */
export const LazyToaster = dynamic(
  () => import("@/components/ui/sonner").then((mod) => mod.Toaster),
  { ssr: false },
);

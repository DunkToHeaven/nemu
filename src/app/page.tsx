import { Suspense } from "react";
import { LandingView } from "@/components/landing/landing-view";

export const metadata = {
  title: "Nemu — WMS berbasis QR",
  description:
    "Cari barang, scan QR di rak, isi jumlah, selesai dalam 10 detik. Stok langsung baru dan setiap pengambilan tercatat permanen.",
};

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-canvas" />}>
      <LandingView />
    </Suspense>
  );
}

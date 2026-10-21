import { Suspense } from "react";
import { ScanPage } from "@/components/item/scan-page";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "Ambil barang", robots: { index: false, follow: false } };

export default async function ItemScanPage({ params }: { params: Promise<{ kode: string }> }) {
  const { kode } = await params;
  return (
    <div className="min-h-dvh bg-canvas px-3 pb-8 pt-3 sm:px-5 sm:pt-5">
      <Suspense
        fallback={
          <div className="mx-auto max-w-lg space-y-3">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-56 w-full rounded-2xl" />
          </div>
        }
      >
        <ScanPage code={kode} />
      </Suspense>
    </div>
  );
}

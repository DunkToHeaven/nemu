import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/**
 * Kerangka halaman saat data sedang dimuat.
 *
 * Next.js menampilkan berkas `loading.tsx` secara instan ketika sebuah rute
 * sedang dirender di server. Tanpa ini, layar kosong membuat pengguna mengira
 * halaman gagal dimuat — terutama saat banyak pengguna mengakses bersamaan.
 */
export default function AppLoading() {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6" aria-busy="true">
      <div className="mb-6 space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3.5 w-64" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-border bg-card p-4">
            <Skeleton className="mb-3 h-3 w-20" />
            <Skeleton className="mb-2 h-7 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-border bg-card p-4">
        <Skeleton className="mb-4 h-4 w-32" />
        <SkeletonText lines={5} />
      </div>
    </div>
  );
}

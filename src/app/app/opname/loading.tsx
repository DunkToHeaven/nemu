import { Skeleton } from "@/components/ui/skeleton";

/** Loading untuk halaman daftar data (database, riwayat, opname, laporan). */
export default function DataLoading() {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6" aria-busy="true">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-3.5 w-52" />
        </div>
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>

      <Skeleton className="mb-3 h-10 w-full rounded-xl" />

      <div className="rounded-2xl border border-border bg-card">
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 border-b border-border px-3 py-3.5 last:border-b-0"
          >
            <Skeleton className="size-4 shrink-0 rounded" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-3.5 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

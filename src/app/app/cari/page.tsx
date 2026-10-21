import { Suspense } from "react";
import { ListSkeleton } from "@/components/app/states";
import { SearchPage } from "@/components/search/search-page";

export const metadata = { title: "Cari barang" };

export default function CariPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={5} />}>
      <SearchPage />
    </Suspense>
  );
}

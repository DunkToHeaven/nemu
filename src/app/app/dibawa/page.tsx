import { Suspense } from "react";
import { ListSkeleton } from "@/components/app/states";
import { CustodyView } from "@/components/custody/custody-view";

export const metadata = { title: "Barang dibawa" };

export default function DibawaPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={5} />}>
      <CustodyView />
    </Suspense>
  );
}

import { Suspense } from "react";
import { ListSkeleton } from "@/components/app/states";
import { OpnameView } from "@/components/opname/opname-view";

export const metadata = { title: "Opname" };

export default function OpnamePage() {
  return (
    <Suspense fallback={<ListSkeleton rows={4} />}>
      <OpnameView />
    </Suspense>
  );
}

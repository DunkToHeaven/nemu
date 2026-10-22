import { Suspense } from "react";
import { ListSkeleton } from "@/components/app/states";
import { OpnameView } from "@/components/opname/opname-view";
import { requirePageRole } from "@/server/guards";

export const metadata = { title: "Opname" };

export default async function OpnamePage() {
  // Dijaga di server, bukan hanya disembunyikan dari menu: tanpa ini pekerja
  // yang mengetik URL langsung tetap bisa membuka data opname.
  await requirePageRole("supervisor", "/app/opname");

  return (
    <Suspense fallback={<ListSkeleton rows={4} />}>
      <OpnameView />
    </Suspense>
  );
}

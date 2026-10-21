import { Suspense } from "react";
import { DashboardView } from "@/components/app/dashboard-view";
import { KpiSkeleton } from "@/components/app/states";

export const metadata = { title: "Beranda" };

export default function DashboardPage() {
  return (
    <Suspense fallback={<KpiSkeleton />}>
      <DashboardView />
    </Suspense>
  );
}

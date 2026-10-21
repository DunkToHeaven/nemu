import { ScanView } from "@/components/scan/scan-view";

export const metadata = { title: "Scan QR", robots: { index: false, follow: false } };

export default function ScanPage() {
  return (
    <div className="min-h-dvh bg-canvas px-3 pb-24 pt-3 sm:px-5 sm:pt-5">
      <ScanView />
    </div>
  );
}

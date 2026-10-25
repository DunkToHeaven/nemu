import Link from "next/link";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1920 1920"
      role="img"
      aria-label="Logo Nemu"
      className={cn("size-10 shrink-0", className)}
    >
      {/* rx 300/1920 ≈ sudut sedikit membulat di semua ukuran render */}
      <rect width="1920" height="1920" rx="300" fill="#AD3400" />
      <path fill="#FFFFFF" d="M378 378H636L1089 1085V378H1347V1568H1089L636 861V1568H378Z" />
      <circle cx="1466" cy="200" r="86" fill="none" stroke="#FFFFFF" strokeWidth="28" />
      <path
        d="M1528 262L1608 342"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="28"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({
  className,
  href = "/",
  showWordmark = true,
}: {
  className?: string;
  href?: string;
  showWordmark?: boolean;
}) {
  return (
    <Link href={href} className={cn("flex items-center gap-3", className)} aria-label="Nemu">
      <LogoMark />
      {showWordmark ? (
        <span className="text-[22px] font-extrabold tracking-[-0.02em] text-foreground">Nemu</span>
      ) : null}
    </Link>
  );
}

"use client";

import { usePathname } from "next/navigation";
import * as React from "react";

/**
 * Bilah kemajuan di atas layar saat berpindah halaman.
 *
 * KENAPA PERLU: Next.js App Router tidak punya event "navigasi mulai". Tanpa
 * indikator, klik menu terasa tidak bereaksi selama server merender halaman
 * berikutnya — pada koneksi lambat atau saat banyak pengguna aktif, pengguna
 * mengira tombolnya rusak lalu mengklik berkali-kali.
 *
 * CARA KERJA: menangkap klik pada tautan internal (termasuk Ctrl/⌘-klik yang
 * harus diabaikan), menampilkan bilah, lalu menyelesaikannya ketika `pathname`
 * benar-benar berubah. Ada batas waktu agar bilah tidak macet bila navigasi
 * dibatalkan.
 */
export function NavProgress() {
  const pathname = usePathname();
  const [active, setActive] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = React.useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // Selesai saat rute berganti.
  React.useEffect(() => {
    if (!active) return;
    setActive(false);
    setDone(true);
    clear();
    const hide = setTimeout(() => setDone(false), 320);
    return () => clearTimeout(hide);
  }, [active, clear]);

  React.useEffect(() => {
    const onClick = (event: MouseEvent) => {
      // Hanya abaikan klik dengan modifier atau tombol non-kiri.
      //
      // JANGAN menolak `event.defaultPrevented`: Next.js `<Link>` memanggil
      // preventDefault() untuk navigasi internal, jadi menolaknya membuat bilah
      // tidak pernah aktif sama sekali.
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href?.startsWith("/")) return;
      if (anchor.getAttribute("target") === "_blank") return;
      if (anchor.hasAttribute("download")) return;
      // Tautan ke halaman yang sama tidak memicu navigasi.
      if (href === pathname) return;

      setDone(false);
      setActive(true);
      clear();
      // Jaring pengaman: bila navigasi gagal, jangan biarkan bilah berjalan
      // selamanya.
      timer.current = setTimeout(() => {
        setActive(false);
        setDone(false);
      }, 12_000);
    };

    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      clear();
    };
  }, [pathname, clear]);

  return (
    <div
      aria-hidden="true"
      data-testid="nav-progress"
      data-state={active ? "loading" : done ? "done" : "idle"}
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5"
    >
      <div
        className={
          active
            ? "h-full bg-primary transition-[width] duration-[8000ms] ease-out"
            : done
              ? "h-full bg-primary transition-opacity duration-300"
              : "h-full bg-primary opacity-0"
        }
        style={{ width: active ? "85%" : done ? "100%" : "0%" }}
      />
    </div>
  );
}

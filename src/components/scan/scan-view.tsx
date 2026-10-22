"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import * as React from "react";
import { Icon } from "@/components/icons";
import { useSession } from "@/components/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const RECENT_KEY = "nemu:recent-scans";

interface RecentScan {
  code: string;
  name: string;
  at: string;
}

function readRecent(): RecentScan[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as RecentScan[]).slice(0, 5) : [];
  } catch {
    return [];
  }
}

export function pushRecentScan(entry: RecentScan) {
  if (typeof window === "undefined") return;
  const next = [entry, ...readRecent().filter((row) => row.code !== entry.code)].slice(0, 5);
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function ScanView() {
  const t = useTranslations("scan");
  const router = useRouter();
  const { user } = useSession();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [state, setState] = React.useState<
    "starting" | "running" | "denied" | "unsupported" | "error"
  >("starting");
  const [torchOn, setTorchOn] = React.useState(false);
  const [manual, setManual] = React.useState("");
  const [manualError, setManualError] = React.useState<string | null>(null);
  const [recent, setRecent] = React.useState<RecentScan[]>([]);

  React.useEffect(() => {
    setRecent(readRecent());
  }, []);

  const goToItem = React.useCallback(
    (code: string, name = code) => {
      pushRecentScan({ code, name, at: new Date().toISOString() });
      router.push(`/i/${encodeURIComponent(code)}`);
    },
    [router],
  );

  /**
   * Terima hasil decode (bisa berupa URL `/i/<kode>` atau kode mentah).
   * Dipakai jalur kamera maupun unggah foto.
   */
  const handleDecoded = React.useCallback(
    (raw: string) => {
      const code = raw.split("/").pop() ?? raw;
      if (!code) return;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      goToItem(decodeURIComponent(code));
    },
    [goToItem],
  );

  /**
   * Pemindaian kamera.
   *
   * Bug yang diperbaiki: sebelumnya kamera HANYA diminta bila
   * `BarcodeDetector` tersedia. API itu tidak ada di Chrome untuk Windows,
   * sehingga halaman langsung berstatus "unsupported" dan kamera tidak pernah
   * terbuka sama sekali — padahal izin kamera normal.
   *
   * Sekarang: kamera selalu diminta lebih dulu (itu yang dilihat pengguna),
   * lalu deteksi memakai `BarcodeDetector` bila ada, atau `jsQR` sebagai
   * cadangan yang bekerja di semua browser.
   */
  React.useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let scanTimer: ReturnType<typeof setInterval> | null = null;

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }

    type NativeDetector = {
      detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
    };

    const nativeDetector: NativeDetector | null =
      "BarcodeDetector" in window
        ? new (
            window as unknown as {
              BarcodeDetector: new (options: { formats: string[] }) => NativeDetector;
            }
          ).BarcodeDetector({ formats: ["qr_code"] })
        : null;

    /** Terima hasil decode; hentikan kamera lalu buka halaman item. */
    const accept = (raw: string) => {
      if (cancelled) return;
      cancelled = true;
      handleDecoded(raw);
    };

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setState("running");

        // Jalur 1: BarcodeDetector bawaan (Android Chrome, macOS Safari 17+).
        if (nativeDetector) {
          const tick = async () => {
            if (cancelled || !videoRef.current) return;
            try {
              const results = await nativeDetector.detect(videoRef.current);
              const value = results[0]?.rawValue;
              if (value) {
                accept(value);
                return;
              }
            } catch {
              /* frame gagal: lanjut */
            }
            raf = requestAnimationFrame(() => void tick());
          };
          raf = requestAnimationFrame(() => void tick());
          return;
        }

        // Jalur 2: jsQR pada frame canvas. Di-throttle ~5 fps supaya baterai
        // tidak terkuras; QR tetap terbaca karena pengguna menahan kamera diam.
        const { default: jsQR } = await import("jsqr");
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        scanTimer = setInterval(() => {
          const video = videoRef.current;
          if (cancelled || !video || !ctx) return;
          const w = video.videoWidth;
          const h = video.videoHeight;
          if (!w || !h) return;
          // Perkecil frame agar decode cepat di ponsel kelas bawah.
          const scale = Math.min(1, 480 / Math.max(w, h));
          canvas.width = Math.round(w * scale);
          canvas.height = Math.round(h * scale);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          try {
            const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const found = jsQR(image.data, image.width, image.height, {
              inversionAttempts: "dontInvert",
            });
            if (found?.data) accept(found.data);
          } catch {
            /* frame gagal: lanjut */
          }
        }, 200);
      } catch {
        if (!cancelled) setState("denied");
      }
    };

    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (scanTimer) clearInterval(scanTimer);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [handleDecoded]);

  /**
   * Apakah halaman berjalan di secure context?
   *
   * `getUserMedia` HANYA tersedia di HTTPS atau localhost. Saat aplikasi dibuka
   * lewat `http://192.168.x.x:3100` (akses dari HP di WiFi kantor), browser
   * memblokir kamera sepenuhnya — bukan karena izin ditolak, tetapi karena
   * konteksnya tidak aman. Tanpa pesan khusus, pengguna melihat "tidak
   * didukung" dan mengira aplikasinya rusak.
   */
  const insecureContext = React.useMemo(() => {
    if (typeof window === "undefined") return false;
    return !window.isSecureContext;
  }, []);

  /** Decode QR dari gambar yang diunggah — bekerja juga di HTTP. */
  const onPickPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { default: jsQR } = await import("jsqr");
      const found = jsQR(image.data, image.width, image.height, {
        inversionAttempts: "attemptBoth",
      });
      if (found?.data) {
        handleDecoded(found.data);
      } else {
        setManualError(t("invalidCode"));
      }
    } catch {
      setManualError(t("invalidCode"));
    } finally {
      event.target.value = "";
    }
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const constraints = { advanced: [{ torch: !torchOn }] } as unknown as MediaTrackConstraints;
      await track.applyConstraints(constraints);
      setTorchOn((value) => !value);
    } catch {
      /* torch tidak didukung */
    }
  };

  const submitManual = (event: React.FormEvent) => {
    event.preventDefault();
    const code = manual.trim().toUpperCase();
    if (code.length < 3) {
      setManualError(t("invalidCode"));
      return;
    }
    setManualError(null);
    goToItem(code);
  };

  return (
    <div className="mx-auto max-w-lg space-y-3">
      <h1 className="text-lg font-extrabold">{t("title")}</h1>

      <div className="relative overflow-hidden rounded-3xl border border-border bg-[oklch(0.2_0.02_264)]">
        <video
          ref={videoRef}
          playsInline
          muted
          aria-label={t("hint")}
          className="aspect-[3/4] w-full object-cover sm:aspect-video"
        />

        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="relative size-56 rounded-3xl border-2 border-white/80">
            <span className="absolute -left-0.5 -top-0.5 size-6 rounded-tl-3xl border-l-4 border-t-4 border-primary" />
            <span className="absolute -right-0.5 -top-0.5 size-6 rounded-tr-3xl border-r-4 border-t-4 border-primary" />
            <span className="absolute -bottom-0.5 -left-0.5 size-6 rounded-bl-3xl border-b-4 border-l-4 border-primary" />
            <span className="absolute -bottom-0.5 -right-0.5 size-6 rounded-br-3xl border-b-4 border-r-4 border-primary" />
          </div>
        </div>

        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
          <Badge tone="success" className="bg-white/90 text-[oklch(0.25_0.05_264)]">
            <Icon name="scan" className="size-3.5" />
            {state === "running"
              ? t("success")
              : state === "starting"
                ? t("starting")
                : t("manualTitle")}
          </Badge>
          <Button
            size="icon"
            variant="secondary"
            onClick={() => void toggleTorch()}
            aria-label={torchOn ? t("torchOff") : t("torchOn")}
          >
            <Icon name={torchOn ? "sun" : "moon"} className="size-5" />
          </Button>
        </div>
      </div>

      {insecureContext || state === "denied" || state === "unsupported" || state === "error" ? (
        <section className="space-y-2 rounded-2xl border border-warning/40 bg-warning-soft/60 p-4">
          <p className="flex items-center gap-2 text-sm font-extrabold text-warning-foreground">
            <Icon name="alert" className="size-4" />
            {insecureContext
              ? t("insecureTitle")
              : state === "unsupported"
                ? t("notSupported")
                : t("permissionTitle")}
          </p>
          <p className="text-[13px] text-foreground">
            {insecureContext ? t("insecureBody") : t("permissionBody")}
          </p>
          {insecureContext ? null : (
            <ul className="space-y-1 text-2xs text-muted-foreground">
              <li>· {t("permissionChrome")}</li>
              <li>· {t("permissionSafari")}</li>
              <li>· {t("permissionFirefox")}</li>
            </ul>
          )}
          {/* Unggah foto TETAP bekerja di HTTP, jadi ini jalan keluar nyata
              ketika kamera diblokir karena konteks tidak aman. */}
          <label className="mt-1 flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card text-[13px] font-bold">
            <Icon name="upload" className="size-4" />
            {t("uploadPhoto")}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              data-testid="scan-photo"
              onChange={onPickPhoto}
            />
          </label>
          <p className="text-2xs text-muted-foreground">{t("uploadHint")}</p>
        </section>
      ) : null}

      <form
        onSubmit={submitManual}
        className="space-y-2 rounded-2xl border border-border bg-card p-4"
      >
        <Label htmlFor="manual-code">{t("manualLabel")}</Label>
        <div className="flex gap-2">
          <Input
            id="manual-code"
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            placeholder="7K2M9QXP4"
            autoCapitalize="characters"
            className="font-mono uppercase tracking-wider"
            data-testid="scan-manual-input"
          />
          <Button type="submit" className="shrink-0" data-testid="scan-manual-submit">
            {t("manualSubmit")}
          </Button>
        </div>
        {manualError ? (
          <p className="text-2xs font-semibold text-danger-foreground">{manualError}</p>
        ) : null}
      </form>

      <section>
        <h2 className="mb-2 text-2xs font-bold uppercase tracking-wide text-muted-foreground">
          {t("recent")}
        </h2>
        {recent.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-[13px] text-muted-foreground">
            {t("recentEmpty")}
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {recent.map((entry) => (
              <li key={entry.code}>
                <button
                  type="button"
                  onClick={() => goToItem(entry.code, entry.name)}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 px-4 text-left hover:bg-muted",
                  )}
                >
                  <Icon name="box" className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{entry.name}</span>
                    <span className="block font-mono text-2xs text-muted-foreground">
                      {entry.code}
                    </span>
                  </span>
                  <Icon name="chevronRight" className="size-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {user ? <span className="sr-only">{user.name}</span> : null}
    </div>
  );
}

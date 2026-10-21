import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Providers } from "@/components/providers";
import { LazyToaster } from "@/components/ui/lazy-toaster";
import "./globals.css";

const jakarta = localFont({
  src: [{ path: "./fonts/plus-jakarta-sans-latin.woff2", weight: "200 800", style: "normal" }],
  variable: "--font-app-sans",
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "sans-serif"],
});

const mono = localFont({
  src: [{ path: "./fonts/jetbrains-mono-latin.woff2", weight: "400 600", style: "normal" }],
  variable: "--font-app-mono",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "monospace"],
});

export const metadata: Metadata = {
  title: { default: "Nemu — WMS berbasis QR", template: "%s · Nemu" },
  description:
    "Cari barang, scan QR di rak, isi jumlah, selesai dalam 10 detik. Stok langsung baru dan setiap pengambilan tercatat permanen.",
  applicationName: "Nemu",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F8FD" },
    { media: "(prefers-color-scheme: dark)", color: "#141C2E" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning className={`${jakarta.variable} ${mono.variable}`}>
      <body className="min-h-dvh antialiased">
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Jakarta">
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
        <LazyToaster />
      </body>
    </html>
  );
}

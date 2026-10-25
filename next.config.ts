import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects() {
    return [
      // Halaman dokumentasi digantikan halaman dukungan kreator.
      { source: "/docs", destination: "/support", permanent: true },
      { source: "/privacy", destination: "/support", permanent: true },
    ];
  },
  /**
   * pnpm memasang dua varian peer @tanstack/react-query (satu untuk build
   * modern, satu lagi hasil resolusi peer berbeda). Dua salinan = dua React
   * context, sehingga QueryClientProvider di satu salinan tidak terlihat oleh
   * hook di salinan lain dan muncul "No QueryClient set". Alias ini memaksa
   * semua import memakai satu salinan saja.
   */
  turbopack: {
    resolveAlias: {
      "@tanstack/react-query": "./node_modules/@tanstack/react-query",
    },
  },
  experimental: {
    /**
     * Jangan masukkan "@tanstack/react-query" ke sini. Optimasi ini menulis
     * ulang import menjadi jalur dalam, yang bisa memuat paket itu dua kali;
     * dua instance = dua React context berbeda, dan provider di satu instance
     * tidak terlihat oleh hook di instance lain ("No QueryClient set").
     */
    optimizePackageImports: ["lucide-react", "recharts"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);

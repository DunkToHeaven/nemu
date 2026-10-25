const rtfCache = new Map<string, Intl.RelativeTimeFormat>();

export function relativeTime(
  value: string | null | undefined,
  locale: string,
  now = Date.now(),
): string {
  if (!value) return "";
  const diff = Date.parse(value) - now;
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000_000],
    ["month", 2_592_000_000],
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];
  const key = locale;
  let formatter = rtfCache.get(key);
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    rtfCache.set(key, formatter);
  }
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === "minute") {
      return formatter.format(Math.round(diff / ms), unit);
    }
  }
  return formatter.format(0, "minute");
}

export function formatNumber(value: number, locale: string, decimals = 0): string {
  return new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Harga dalam Rupiah tanpa desimal. UI memakai angka telanjang tanpa ribuan
 * membuat harga Rp150.000 terbaca seperti 150 — format ini dipakai bersama
 * oleh form, tabel item, dan laporan tren harga.
 */
export function formatPrice(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "id" ? "id-ID" : "en-GB", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: string, locale: string, withTime = false): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export function formatTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDateTimeLocal(value: string): string {
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function dayKey(value: string): string {
  return value.slice(0, 10);
}

/** Angka qty tanpa nol tak berguna: 12 · 12,5 · 0,25 */
export function formatQty(value: number, locale: string, decimals = 3): string {
  const rounded = Math.round(value * 1000) / 1000;
  const isInt = Number.isInteger(rounded);
  return formatNumber(rounded, locale, isInt ? 0 : Math.min(decimals, 3));
}

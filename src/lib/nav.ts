import type { Role } from "@/lib/types";
import { hasRole } from "@/lib/types";

export interface NavItem {
  href: string;
  labelKey: string;
  icon: string;
  required: Role;
}

/** Sumber tunggal menu. Item yang tidak boleh diakses role tidak dirender (WB-05). */
export const NAV_ITEMS: NavItem[] = [
  { href: "/app", labelKey: "nav.home", icon: "home", required: "worker" },
  { href: "/app/cari", labelKey: "nav.search", icon: "search", required: "worker" },
  { href: "/scan", labelKey: "nav.scan", icon: "scan", required: "worker" },
  { href: "/app/riwayat", labelKey: "nav.history", icon: "history", required: "worker" },
  { href: "/app/dibawa", labelKey: "nav.custody", icon: "package", required: "worker" },
  { href: "/app/antrean", labelKey: "nav.queue", icon: "wifiOff", required: "worker" },
  { href: "/app/transaksi", labelKey: "nav.transactions", icon: "list", required: "supervisor" },
  { href: "/app/opname", labelKey: "nav.counts", icon: "clipboard", required: "supervisor" },
  { href: "/app/laporan", labelKey: "nav.reports", icon: "chart", required: "supervisor" },
  {
    href: "/app/database/items",
    labelKey: "nav.database",
    icon: "database",
    required: "supervisor",
  },
  { href: "/admin/setup", labelKey: "nav.setup", icon: "checkCircle", required: "admin" },
  { href: "/admin/settings", labelKey: "nav.settings", icon: "settings", required: "admin" },
  { href: "/admin/audit", labelKey: "nav.audit", icon: "shield", required: "admin" },
];

export function navForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => hasRole(role, item.required));
}

export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export const DATABASE_TABS: { href: string; labelKey: string; adminOnly?: boolean }[] = [
  { href: "/app/database/items", labelKey: "database.tabItems" },
  { href: "/app/database/lokasi", labelKey: "database.tabLocations", adminOnly: true },
  { href: "/app/database/kategori", labelKey: "database.tabCategories", adminOnly: true },
  { href: "/app/database/alasan", labelKey: "database.tabReasons", adminOnly: true },
  { href: "/app/database/mesin", labelKey: "database.tabEquipment", adminOnly: true },
  { href: "/app/database/pengguna", labelKey: "database.tabUsers", adminOnly: true },
  { href: "/app/database/label", labelKey: "database.tabLabels", adminOnly: true },
  { href: "/app/database/impor", labelKey: "database.tabImports", adminOnly: true },
];

/** Tab Database yang hanya untuk admin, sebagai entri penjaga path. */
const DATABASE_TABS_ADMIN_PREFIXES: { prefix: string; required: Role }[] = DATABASE_TABS.filter(
  (tab) => tab.adminOnly,
).map((tab) => ({ prefix: tab.href, required: "admin" as Role }));

/**
 * Peran minimum untuk sebuah path, diturunkan dari NAV_ITEMS.
 *
 * Dipakai `src/app/app/layout.tsx` untuk menolak akses URL langsung. Tanpa
 * peta terpusat ini, setiap rute baru harus diingat satu per satu — dan yang
 * terlupa menjadi celah otorisasi (pernah terjadi pada /app/opname,
 * /app/transaksi, dan /app/laporan yang terbuka untuk worker).
 */
const GUARDED_PREFIXES: { prefix: string; required: Role }[] = [
  // Sub-rute Database yang hanya untuk admin (tab adminOnly di DATABASE_TABS).
  ...DATABASE_TABS_ADMIN_PREFIXES,
  ...NAV_ITEMS.filter((item) => item.required !== "worker")
    .map((item) => ({ prefix: item.href, required: item.required }))
    // Prefix terpanjang menang: /app/database/items (supervisor) tidak boleh
    // menutupi /app/database/pengguna (admin).
    .sort((a, b) => b.prefix.length - a.prefix.length),
];

/** Peran minimum yang dibutuhkan untuk path ini, atau null bila bebas. */
export function requiredRoleForPath(pathname: string): Role | null {
  for (const entry of GUARDED_PREFIXES) {
    if (pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`)) {
      return entry.required;
    }
  }
  return null;
}

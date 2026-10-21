/**
 * Sanitasi parameter `next` untuk redirect setelah login (SC-02 + proteksi
 * open redirect).
 *
 * Fungsi ini murni (tanpa Buffer, cookie, atau API Node) sehingga aman dipakai
 * di middleware (edge), server, DAN komponen klien. Sebelumnya ia tinggal di
 * `src/mocks/session.ts`, yang membuat komponen klien mengimpor modul mock —
 * ikut menarik kode cookie/Buffer ke bundel browser.
 */
function hasControlChars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** `next` hanya boleh path internal. */
export function safeNext(value: string | null | undefined, fallback = "/app"): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return fallback;
  // Kontrol karakter (newline, CR, tab) bisa dipakai untuk header injection.
  if (hasControlChars(trimmed)) return fallback;
  if (trimmed.startsWith("//")) return fallback;
  if (trimmed.includes("\\")) return fallback;
  if (/^\/\s*\//.test(trimmed)) return fallback;
  if (/^\/[a-z]+:/i.test(trimmed)) return fallback;
  try {
    const url = new URL(trimmed, "http://nemu.local");
    if (url.origin !== "http://nemu.local") return fallback;
    // "/" adalah halaman publik; setelah login tujuannya harus di dalam aplikasi.
    if (url.pathname === "/" || url.pathname === "") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

/** Draf form disimpan lokal & dipulihkan setelah login ulang (kasus tepi PRD). */
const PREFIX = "nemu:draft:";

export interface TakeDraft {
  itemCode: string;
  locationId: string;
  qty: string;
  reasonId: string;
  refNo: string;
  note: string;
  savedAt: number;
}

export function saveDraft(key: string, draft: TakeDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(draft));
  } catch {
    /* kuota penuh: abaikan, draf hanya kenyamanan */
  }
}

export function readDraft(key: string): TakeDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TakeDraft>;
    if (!parsed.itemCode || !parsed.locationId) return null;
    if (Date.now() - (parsed.savedAt ?? 0) > 12 * 3_600_000) return null;
    return {
      itemCode: parsed.itemCode,
      locationId: parsed.locationId,
      qty: parsed.qty ?? "1",
      reasonId: parsed.reasonId ?? "",
      refNo: parsed.refNo ?? "",
      note: parsed.note ?? "",
      savedAt: parsed.savedAt ?? Date.now(),
    };
  } catch {
    return null;
  }
}

export function clearDraft(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(`${PREFIX}${key}`);
}

export function draftKey(itemCode: string, userId: string): string {
  return `${itemCode}:${userId}`;
}

/** Pencarian terakhir disimpan agar SC-13 bisa membandingkan item yang dicari vs dipindai. */
const LAST_SEARCH_KEY = "nemu:last-search-item";

export function setLastSearched(itemId: string, itemName: string): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(LAST_SEARCH_KEY, JSON.stringify({ itemId, itemName }));
}

export function getLastSearched(): { itemId: string; itemName: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(LAST_SEARCH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { itemId?: string; itemName?: string };
    return parsed.itemId && parsed.itemName
      ? { itemId: parsed.itemId, itemName: parsed.itemName }
      : null;
  } catch {
    return null;
  }
}

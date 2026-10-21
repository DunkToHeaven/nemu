/**
 * Antrean offline (OF-01…04). Disimpan di IndexedDB agar bertahan saat tab ditutup.
 * Kunci idempotensi dibuat sekali saat masuk antrean, sehingga kirim ulang tidak
 * pernah menghasilkan transaksi ganda. Urutan per perangkat dijaga lewat `seq`.
 */
import type { CreateTransactionInput } from "@/lib/api/schemas";

const DB_NAME = "nemu-offline";
const DB_VERSION = 1;
const STORE = "queue";
const META = "meta";

export type QueueStatus = "pending" | "syncing" | "needs_review" | "failed";

export interface QueuedTx {
  id: string;
  seq: number;
  createdAt: number;
  userId: string;
  label: string;
  payload: CreateTransactionInput;
  status: QueueStatus;
  attempts: number;
  lastError: string | null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB tidak tersedia"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("seq", "seq");
        store.createIndex("status", "status");
      }
      if (!db.objectStoreNames.contains(META)) {
        db.createObjectStore(META, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Gagal membuka IndexedDB"));
  });
}

function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = run(transaction.objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Operasi IndexedDB gagal"));
  });
}

async function nextSeq(db: IDBDatabase): Promise<number> {
  const current = (await tx<{ key: string; value: number } | undefined>(db, META, "readonly", (s) => s.get("seq"))) as
    | { key: string; value: number }
    | undefined;
  const value = (current?.value ?? 0) + 1;
  await tx(db, META, "readwrite", (s) => s.put({ key: "seq", value }));
  return value;
}

export async function enqueue(input: {
  payload: CreateTransactionInput;
  userId: string;
  label: string;
}): Promise<QueuedTx> {
  const db = await openDb();
  const entry: QueuedTx = {
    id: input.payload.idempotencyKey,
    seq: await nextSeq(db),
    createdAt: Date.now(),
    userId: input.userId,
    label: input.label,
    payload: input.payload,
    status: "pending",
    attempts: 0,
    lastError: null,
  };
  await tx(db, STORE, "readwrite", (s) => s.put(entry));
  db.close();
  return entry;
}

export async function listQueue(): Promise<QueuedTx[]> {
  try {
    const db = await openDb();
    const rows = await tx<QueuedTx[]>(db, STORE, "readonly", (s) => s.getAll());
    db.close();
    return rows.sort((a, b) => a.seq - b.seq);
  } catch {
    return [];
  }
}

export async function updateEntry(id: string, patch: Partial<QueuedTx>): Promise<void> {
  const db = await openDb();
  const existing = await tx<QueuedTx | undefined>(db, STORE, "readonly", (s) => s.get(id));
  if (existing) await tx(db, STORE, "readwrite", (s) => s.put({ ...existing, ...patch }));
  db.close();
}

export async function removeEntry(id: string): Promise<void> {
  const db = await openDb();
  await tx(db, STORE, "readwrite", (s) => s.delete(id));
  db.close();
}

export async function clearQueue(): Promise<void> {
  const db = await openDb();
  await tx(db, STORE, "readwrite", (s) => s.clear());
  db.close();
}

export async function queueCount(): Promise<number> {
  try {
    const db = await openDb();
    const n = await tx<number>(db, STORE, "readonly", (s) => s.count());
    db.close();
    return n;
  } catch {
    return 0;
  }
}

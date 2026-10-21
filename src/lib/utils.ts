import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** UUID v7-like generator (time ordered) untuk idempotency key & id mock. */
export function uuidv7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  let ts = now;
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = ts % 256;
    ts = Math.floor(ts / 256);
  }
  const rand = new Uint8Array(10);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(rand);
  } else {
    for (let i = 0; i < rand.length; i += 1) rand[i] = Math.floor(Math.random() * 256);
  }
  bytes.set(rand, 6);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

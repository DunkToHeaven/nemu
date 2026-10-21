import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "@/i18n/messages/en.json";
import id from "@/i18n/messages/id.json";

/**
 * Regresi untuk MISSING_MESSAGE: setiap kunci yang dipakai `t("...")` di sumber
 * harus ada di **kedua** bahasa. Kesalahan seperti ini dulu hanya muncul saat
 * runtime (console error di dev), jadi mudah lolos.
 */

const MESSAGES: Record<"id" | "en", Record<string, unknown>> = { id, en };

function flatten(node: unknown, prefix = ""): Set<string> {
  const out = new Set<string>();
  if (!node || typeof node !== "object") return out;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") {
      for (const nested of flatten(value, path)) out.add(nested);
    } else {
      out.add(path);
    }
  }
  return out;
}

const FLAT = {
  id: flatten(MESSAGES.id),
  en: flatten(MESSAGES.en),
};

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, acc);
    } else if (entry.endsWith(".tsx") || entry.endsWith(".ts")) {
      acc.push(full);
    }
  }
  return acc;
}

interface Usage {
  file: string;
  key: string;
  namespace: string;
}

/** Kunci yang memang bukan message, mis. label debug di tes. */
const IGNORED = new Set(["test", "button", "a", "b"]);

/**
 * Ikat setiap pemanggilan penerjemah ke namespace-nya sendiri:
 *   const t = useTranslations("take")   -> t("qtyLabel")      => take.qtyLabel
 *   const tc = useTranslations()        -> tc("nav.home")     => nav.home
 * Satu berkas sering punya beberapa namespace, jadi memeriksa semua kunci
 * terhadap semua namespace menghasilkan positif palsu.
 */
function collectUsages(): Usage[] {
  const usages: Usage[] = [];

  for (const file of sourceFiles(join(process.cwd(), "src"))) {
    const source = readFileSync(file, "utf8");

    const translators = new Map<string, string>();
    for (const match of source.matchAll(
      /const\s+(\w+)\s*=\s*useTranslations\(\s*(?:"([^"]+)")?\s*\)/g,
    )) {
      translators.set(match[1] as string, match[2] ?? "");
    }
    if (translators.size === 0) continue;

    for (const [variable, namespace] of translators) {
      const pattern = new RegExp(`\\b${variable}\\(\\s*"([^"]+)"`, "g");
      for (const match of source.matchAll(pattern)) {
        const key = match[1] as string;
        if (IGNORED.has(key)) continue;
        usages.push({ file: file.replace(process.cwd(), ""), key, namespace });
      }
    }
  }
  return usages;
}

describe("kunci i18n", () => {
  it("setiap kunci yang dipakai ada di id dan en", () => {
    const usages = collectUsages();
    expect(usages.length).toBeGreaterThan(50);

    const missing: string[] = [];
    for (const usage of usages) {
      // `useTranslations()` tanpa namespace memakai jalur absolut ("nav.home");
      // `useTranslations("nav")` memakai kunci relatif ("home"), tetapi boleh
      // juga jalur absolut untuk namespace lain.
      const candidates =
        usage.namespace === "" ? [usage.key] : [`${usage.namespace}.${usage.key}`, usage.key];
      const found = candidates.some(
        (candidate) => FLAT.id.has(candidate) && FLAT.en.has(candidate),
      );
      if (!found) {
        missing.push(
          `${usage.file}: t("${usage.key}")${usage.namespace ? ` dalam "${usage.namespace}"` : ""}`,
        );
      }
    }

    expect([...new Set(missing)]).toEqual([]);
  });

  it("id dan en punya kumpulan namespace yang sama", () => {
    expect(Object.keys(MESSAGES.id).sort()).toEqual(Object.keys(MESSAGES.en).sort());
  });

  it("tidak ada namespace yang punya kunci hanya di satu bahasa", () => {
    const differences: string[] = [];
    for (const namespace of Object.keys(MESSAGES.id)) {
      const idKeys = flatten(MESSAGES.id[namespace]);
      const enKeys = flatten(MESSAGES.en[namespace]);
      for (const key of idKeys) {
        if (!enKeys.has(key)) differences.push(`en kurang: ${namespace}.${key}`);
      }
      for (const key of enKeys) {
        if (!idKeys.has(key)) differences.push(`id kurang: ${namespace}.${key}`);
      }
    }
    expect(differences).toEqual([]);
  });

  it("semua nilai berupa string tidak kosong", () => {
    const empty: string[] = [];
    for (const locale of ["id", "en"] as const) {
      const walk = (node: unknown, path: string) => {
        if (node && typeof node === "object") {
          for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
            walk(value, path ? `${path}.${key}` : key);
          }
        } else if (typeof node === "string" && node.trim() === "") {
          empty.push(`${locale}:${path}`);
        }
      };
      walk(MESSAGES[locale], "");
    }
    expect(empty).toEqual([]);
  });

  it("placeholder ICU seimbang di kedua bahasa", () => {
    const mismatched: string[] = [];
    const placeholders = (value: string) =>
      [...value.matchAll(/\{(\w+)/g)]
        .map((m) => m[1])
        .sort()
        .join(",");

    const walk = (idNode: unknown, enNode: unknown, path: string) => {
      if (idNode && typeof idNode === "object") {
        for (const key of Object.keys(idNode as Record<string, unknown>)) {
          walk(
            (idNode as Record<string, unknown>)[key],
            (enNode as Record<string, unknown> | undefined)?.[key],
            path ? `${path}.${key}` : key,
          );
        }
        return;
      }
      if (typeof idNode === "string" && typeof enNode === "string") {
        if (placeholders(idNode) !== placeholders(enNode)) {
          mismatched.push(`${path}: id{${placeholders(idNode)}} vs en{${placeholders(enNode)}}`);
        }
      }
    };
    walk(MESSAGES.id, MESSAGES.en, "");
    expect(mismatched).toEqual([]);
  });
});

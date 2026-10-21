"use client";

import { useTranslations } from "next-intl";
import * as React from "react";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";

export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function SearchBox({
  value,
  onChange,
  onSubmit,
  autoFocus = false,
  placeholder,
  size = "lg",
  className,
  id = "search-input",
  showShortcut = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
  size?: "lg" | "md";
  className?: string;
  id?: string;
  showShortcut?: boolean;
}) {
  const t = useTranslations("common");
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return (
    <form
      aria-label={t("search")}
      className={cn("relative", className)}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.(value);
        inputRef.current?.blur();
      }}
    >
      <label htmlFor={id} className="sr-only">
        {t("search")}
      </label>
      <Icon
        name="search"
        className={cn(
          "pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground",
          size === "lg" ? "size-5" : "size-4",
        )}
      />
      <input
        ref={inputRef}
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? t("searchPlaceholder")}
        autoComplete="off"
        enterKeyHint="search"
        data-testid="search-input"
        className={cn(
          "w-full rounded-full border border-input bg-card text-foreground shadow-[var(--shadow-card)] outline-none transition-colors",
          "placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
          "[&::-webkit-search-cancel-button]:appearance-none",
          size === "lg" ? "h-14 pl-12 pr-12 text-base" : "h-11 pl-10 pr-10 text-sm",
        )}
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          aria-label={t("clear")}
          className={cn(
            "absolute right-2 top-1/2 grid -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground",
            size === "lg" ? "size-10" : "size-8",
          )}
        >
          <Icon name="x" className="size-4" />
        </button>
      ) : showShortcut ? (
        <kbd className="absolute right-4 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-2xs text-muted-foreground sm:block">
          ⌘K
        </kbd>
      ) : null}
    </form>
  );
}

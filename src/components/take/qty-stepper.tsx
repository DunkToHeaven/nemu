"use client";

import { useTranslations } from "next-intl";
import * as React from "react";
import { Icon } from "@/components/icons";
import { cn } from "@/lib/utils";

export function QtyStepper({
  value,
  onChange,
  max,
  decimals = 0,
  autoFocus = false,
  id = "qty-input",
}: {
  value: string;
  onChange: (next: string) => void;
  max: number;
  decimals?: number;
  autoFocus?: boolean;
  id?: string;
}) {
  const t = useTranslations("take");
  const ref = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!autoFocus) return;
    const timer = setTimeout(() => {
      ref.current?.focus();
      ref.current?.select();
    }, 120);
    return () => clearTimeout(timer);
  }, [autoFocus]);

  const numeric = Number(value) || 0;
  const step = decimals > 0 ? 0.1 : 1;

  const set = (next: number) => {
    const clamped = Math.min(max, Math.max(0, next));
    onChange(decimals > 0 ? String(Math.round(clamped * 100) / 100) : String(Math.round(clamped)));
  };

  const bump = (delta: number) => set(numeric + delta);

  return (
    <div className="space-y-2">
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={() => bump(-step)}
          aria-label={t("stepperMinus")}
          disabled={numeric <= 0}
          className="grid size-14 shrink-0 place-items-center rounded-2xl border border-border bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-40"
        >
          <Icon name="minus" className="size-5" />
        </button>

        <input
          ref={ref}
          id={id}
          type="text"
          inputMode={decimals > 0 ? "decimal" : "numeric"}
          pattern={decimals > 0 ? "[0-9]*[.,]?[0-9]*" : "[0-9]*"}
          value={value}
          onChange={(event) => {
            const raw = event.target.value.replace(",", ".");
            if (raw === "" || /^\d*\.?\d*$/.test(raw)) onChange(raw);
          }}
          onFocus={(event) => event.currentTarget.select()}
          aria-describedby="qty-hint"
          data-testid="qty-input"
          className="tnum h-14 min-w-0 flex-1 rounded-2xl border-2 border-input bg-card text-center text-2xl font-extrabold text-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
        />

        <button
          type="button"
          onClick={() => bump(step)}
          aria-label={t("stepperPlus")}
          disabled={numeric >= max}
          className="grid size-14 shrink-0 place-items-center rounded-2xl border border-border bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-40"
        >
          <Icon name="plus" className="size-5" />
        </button>
      </div>

      <div className="flex gap-2">
        {[1, 5, 10].map((amount) => (
          <button
            key={amount}
            type="button"
            onClick={() => bump(amount)}
            disabled={numeric >= max}
            className={cn(
              "h-11 flex-1 rounded-xl border border-border bg-card text-sm font-bold text-foreground transition-colors",
              "hover:border-primary hover:bg-primary-soft hover:text-primary-soft-foreground disabled:opacity-40",
            )}
          >
            {t("quickAdd", { count: amount })}
          </button>
        ))}
      </div>
    </div>
  );
}

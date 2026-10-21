"use client";

import { useTranslations } from "next-intl";
import * as React from "react";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface WidgetBoundaryProps {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Dipakai tes untuk memaksa error pada satu widget. */
  forceError?: boolean;
}

interface WidgetBoundaryState {
  error: Error | null;
}

/** Setiap widget dashboard punya error boundary sendiri (PRD 7). */
export class WidgetBoundary extends React.Component<WidgetBoundaryProps, WidgetBoundaryState> {
  override state: WidgetBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): WidgetBoundaryState {
    return { error };
  }

  override render() {
    if (this.state.error || this.props.forceError) {
      return (
        <section
          aria-label={this.props.title}
          className={cn("rounded-2xl border border-border bg-card p-4", this.props.className)}
        >
          <WidgetHeader title={this.props.title} action={this.props.action} />
          <WidgetError onRetry={() => this.setState({ error: null })} />
        </section>
      );
    }
    return (
      <section
        aria-label={this.props.title}
        data-testid={`widget-${this.props.title.toLowerCase().replace(/\s+/g, "-")}`}
        className={cn("rounded-2xl border border-border bg-card p-4 sm:p-5", this.props.className)}
      >
        <WidgetHeader title={this.props.title} action={this.props.action} />
        <div className={cn("mt-3", this.props.bodyClassName)}>{this.props.children}</div>
      </section>
    );
  }
}

export function WidgetHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-[13px] font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {action}
    </div>
  );
}

export function WidgetError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("errors");
  return (
    <div
      role="alert"
      className="mt-3 flex items-center gap-3 rounded-xl bg-danger-soft/70 px-3 py-2.5"
    >
      <Icon name="triangle" className="size-4 shrink-0 text-danger-foreground" />
      <p className="flex-1 text-[13px] text-danger-foreground">{t("body")}</p>
      <Button
        size="sm"
        variant="ghost"
        onClick={onRetry}
        className="h-8 px-2 text-danger-foreground"
      >
        {t("retry")}
      </Button>
    </div>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  tone = "neutral",
  href,
  icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "danger" | "warning" | "success" | "primary";
  href?: string;
  icon?: React.ReactNode;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[12px] font-semibold leading-tight text-muted-foreground">
          {label}
        </span>
        {icon}
      </div>
      <p
        className={cn(
          "tnum mt-2 text-2xl font-extrabold tracking-[-0.02em]",
          tone === "danger" && "text-danger-foreground",
          tone === "warning" && "text-warning-foreground",
          tone === "success" && "text-success-foreground",
          tone === "primary" && "text-primary",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-2xs text-muted-foreground">{hint}</p> : null}
    </>
  );

  const className = cn(
    "flex flex-col rounded-2xl border border-border bg-card p-4 transition-colors",
    href && "hover:border-border-strong hover:bg-muted/40",
  );

  if (href) {
    return (
      <a href={href} className={className}>
        {content}
      </a>
    );
  }
  return <div className={className}>{content}</div>;
}

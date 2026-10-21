"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";
import { ErrorState, ListSkeleton } from "@/components/app/states";
import { Icon, type IconName } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "nemu.setup.done";

interface Step {
  id: string;
  titleKey: string;
  bodyKey: string;
  ctaKey: string;
  href: string;
  icon: IconName;
  done: boolean;
  optional?: boolean;
}

export function SetupWizard() {
  const t = useTranslations("setup");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [orgName, setOrgName] = React.useState("");
  const [done, setDone] = React.useState(false);

  const settings = useQuery({ queryKey: keys.settings, queryFn: () => api.admin.settings() });
  const items = useQuery({ queryKey: keys.items({ setup: true }), queryFn: () => api.items.list({ limit: 1 }) });
  const locations = useQuery({ queryKey: keys.locations({ setup: true }), queryFn: () => api.master.locations() });
  const users = useQuery({ queryKey: keys.users, queryFn: () => api.master.users() });
  const google = useQuery({ queryKey: keys.google, queryFn: () => api.admin.google() });

  React.useEffect(() => {
    if (settings.data?.settings.orgName) setOrgName(settings.data.settings.orgName);
  }, [settings.data]);

  React.useEffect(() => {
    setDone(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  const saveOrg = useMutation({
    mutationFn: () => api.admin.updateSettings({ orgName: orgName.trim() }),
    onSuccess: () => {
      toast.success(t("orgSaved"));
      void queryClient.invalidateQueries({ queryKey: keys.settings });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : t("orgError")),
  });

  if (settings.isLoading || items.isLoading || locations.isLoading || users.isLoading || google.isLoading) {
    return <ListSkeleton rows={6} />;
  }
  if (settings.isError) return <ErrorState onRetry={() => void settings.refetch()} />;

  const itemCount = items.data?.total ?? 0;
  const locationCount = locations.data?.data.length ?? 0;
  const hasAdmin = (users.data?.data ?? []).some((user) => user.role === "admin" && user.active);
  const googleConnected = google.data?.integration.connected ?? false;
  const labelsPrinted = typeof window !== "undefined" && window.localStorage.getItem("nemu.labels.printed") === "1";

  const steps: Step[] = [
    { id: "admin", titleKey: "stepAdminTitle", bodyKey: "stepAdminBody", ctaKey: "stepAdminCta", href: "/app/database/pengguna", icon: "shield", done: hasAdmin },
    { id: "locations", titleKey: "stepLocationsTitle", bodyKey: "stepLocationsBody", ctaKey: "stepLocationsCta", href: "/app/database/lokasi", icon: "boxes", done: locationCount > 0 },
    { id: "items", titleKey: "stepItemsTitle", bodyKey: "stepItemsBody", ctaKey: "stepItemsCta", href: "/app/database/impor", icon: "upload", done: itemCount > 0 },
    { id: "labels", titleKey: "stepLabelsTitle", bodyKey: "stepLabelsBody", ctaKey: "stepLabelsCta", href: "/app/database/label", icon: "print", done: labelsPrinted, optional: true },
    { id: "google", titleKey: "stepGoogleTitle", bodyKey: "stepGoogleBody", ctaKey: "stepGoogleCta", href: "/admin/integrations/google", icon: "cloud", done: googleConnected, optional: true },
  ];

  const required = steps.filter((step) => !step.optional);
  const requiredDone = required.filter((step) => step.done).length + (settings.data?.settings.orgName ? 1 : 0);
  const totalRequired = required.length + 1;
  const progress = Math.round((requiredDone / totalRequired) * 100);

  const finish = () => {
    window.localStorage.setItem(STORAGE_KEY, "1");
    setDone(true);
    toast.success(t("finishDone"));
    router.push("/app");
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-extrabold">{t("title")}</h1>
        <p className="text-[13px] text-muted-foreground">{t("subtitle")}</p>
      </div>

      <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-bold">{t("progress", { done: requiredDone, total: totalRequired })}</p>
          <span className="tnum text-2xs font-bold text-muted-foreground">{progress}%</span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={t("progressLabel")}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
        </div>
        {done ? (
          <p className="flex items-center gap-1.5 rounded-xl bg-success-soft px-3 py-2 text-2xs font-bold text-success-foreground">
            <Icon name="checkCircle" className="size-3.5" />
            {t("alreadyDone")}
          </p>
        ) : null}
      </section>

      <section className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-muted text-muted-foreground">
            <Icon name="settings" className="size-4" />
          </span>
          <p className="text-[13px] font-bold">1. {t("stepOrgTitle")}</p>
          {settings.data?.settings.orgName ? <Badge tone="success">{t("done")}</Badge> : null}
        </div>
        <p className="text-2xs text-muted-foreground">{t("stepOrgBody")}</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="setup-org">{t("orgLabel")}</Label>
            <Input
              id="setup-org"
              value={orgName}
              onChange={(event) => setOrgName(event.target.value)}
              placeholder="PT Nemu Manufaktur"
            />
          </div>
          <Button
            className="h-11"
            onClick={() => saveOrg.mutate()}
            disabled={orgName.trim().length < 2 || saveOrg.isPending}
          >
            {saveOrg.isPending ? <Icon name="spinner" className="size-4 animate-spin" /> : <Icon name="check" className="size-4" />}
            {t("stepOrgCta")}
          </Button>
        </div>
      </section>

      <ol className="space-y-2">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={cn(
              "flex items-start gap-3 rounded-2xl border bg-card p-4",
              step.done ? "border-success/40" : "border-border",
            )}
          >
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-xl",
                step.done ? "bg-success-soft text-success-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              <Icon name={step.done ? "check" : step.icon} className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="text-[13px] font-bold">
                  {index + 2}. {t(step.titleKey as "stepAdminTitle")}
                </p>
                {step.optional ? <Badge tone="neutral">{t("optional")}</Badge> : null}
                {step.done ? <Badge tone="success">{t("done")}</Badge> : null}
              </div>
              <p className="mt-0.5 text-2xs text-muted-foreground">{t(step.bodyKey as "stepAdminBody")}</p>
              {step.id === "items" && itemCount > 0 ? (
                <p className="tnum mt-1 text-2xs font-bold">{t("itemsPresent", { count: itemCount })}</p>
              ) : null}
              {step.id === "locations" && locationCount > 0 ? (
                <p className="tnum mt-1 text-2xs font-bold">{t("locationsPresent", { count: locationCount })}</p>
              ) : null}
            </div>
            <Button asChild size="sm" variant={step.done ? "ghost" : "secondary"} className="shrink-0">
              <Link href={step.href}>{t(step.ctaKey as "stepAdminCta")}</Link>
            </Button>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button block size="lg" onClick={finish}>
          <Icon name="check" className="size-5" />
          {t("finish")}
        </Button>
        <Button variant="ghost" size="lg" onClick={() => router.push("/app")}>
          {t("skip")}
        </Button>
      </div>
      <p className="text-2xs text-muted-foreground">{t("finishHint")}</p>
    </div>
  );
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";
import { ErrorState, ListSkeleton } from "@/components/app/states";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ApiError, api, type OrgSettings } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";

export function SettingsView() {
  const t = useTranslations("admin");
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: keys.settings,
    queryFn: () => api.admin.settings(),
  });
  const [form, setForm] = React.useState<OrgSettings | null>(null);

  React.useEffect(() => {
    if (data?.settings) setForm(data.settings);
  }, [data]);

  const save = useMutation({
    mutationFn: (patch: Partial<OrgSettings>) => api.admin.updateSettings(patch),
    onSuccess: () => {
      toast.success(t("saved"));
      void queryClient.invalidateQueries({ queryKey: keys.settings });
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Gagal menyimpan."),
  });

  if (isLoading || !form) return <ListSkeleton rows={6} />;
  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  const patch = (value: Partial<OrgSettings>) => setForm({ ...form, ...value });

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <div>
        <h1 className="text-lg font-extrabold">{t("settingsTitle")}</h1>
        <p className="text-[13px] text-muted-foreground">{t("settingsSubtitle")}</p>
      </div>

      <Section title={t("orgSection")}>
        <Field label={t("orgName")} htmlFor="org">
          <Input
            id="org"
            value={form.orgName}
            onChange={(event) => patch({ orgName: event.target.value })}
          />
        </Field>
        <Field label={t("timezone")} htmlFor="tz">
          <Input
            id="tz"
            value={form.timezone}
            onChange={(event) => patch({ timezone: event.target.value })}
            className="font-mono"
          />
        </Field>
        <Field label={t("shiftEnds")} htmlFor="shift" hint={t("shiftEndsHint")}>
          <Input
            id="shift"
            value={form.shiftEndsAt.join(", ")}
            onChange={(event) =>
              patch({
                shiftEndsAt: event.target.value
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              })
            }
            className="font-mono"
          />
        </Field>
      </Section>

      <Section title={t("verifySection")}>
        <Toggle
          label={t("verifyEnabled")}
          hint={t("verifyEnabledHint")}
          checked={form.verifyPromptEnabled}
          onChange={(checked) => patch({ verifyPromptEnabled: checked })}
        />
        <Field label={t("verifyQuota")} htmlFor="quota">
          <Input
            id="quota"
            type="number"
            min={0}
            max={20}
            value={form.verifyMaxPerShift}
            onChange={(event) => patch({ verifyMaxPerShift: Number(event.target.value) })}
          />
        </Field>
        <Field label={t("verifyThreshold")} htmlFor="threshold" hint={t("verifyThresholdHint")}>
          <Input
            id="threshold"
            type="number"
            min={0}
            value={form.verifyCountThreshold}
            onChange={(event) => patch({ verifyCountThreshold: Number(event.target.value) })}
          />
        </Field>
        <Field label={t("blindEveryN")} htmlFor="blind">
          <Input
            id="blind"
            type="number"
            min={1}
            max={20}
            value={form.blindEveryN}
            onChange={(event) => patch({ blindEveryN: Number(event.target.value) })}
          />
        </Field>
      </Section>

      <Section title={t("confidenceSection")}>
        <Field label={t("decayDays")} htmlFor="decay">
          <Input
            id="decay"
            type="number"
            min={7}
            max={365}
            value={form.confidenceDecayDays}
            onChange={(event) => patch({ confidenceDecayDays: Number(event.target.value) })}
          />
        </Field>
      </Section>

      <Section title={t("custodySection")}>
        <Toggle
          label={t("custodyEnabled")}
          checked={form.custodyEnabled}
          onChange={(checked) => patch({ custodyEnabled: checked })}
        />
        <Field label={t("custodyOverdue")} htmlFor="overdue">
          <Input
            id="overdue"
            type="number"
            min={1}
            max={240}
            value={form.custodyOverdueHours}
            onChange={(event) => patch({ custodyOverdueHours: Number(event.target.value) })}
          />
        </Field>
      </Section>

      <Section title={t("notificationSection")}>
        <Toggle
          label={t("telegram")}
          checked={form.notifications.telegram}
          onChange={(checked) =>
            patch({ notifications: { ...form.notifications, telegram: checked } })
          }
        />
        <Toggle
          label={t("email")}
          checked={form.notifications.email}
          onChange={(checked) =>
            patch({ notifications: { ...form.notifications, email: checked } })
          }
        />
      </Section>

      <Button block size="lg" onClick={() => save.mutate(form)} disabled={save.isPending}>
        {save.isPending ? (
          <Icon name="spinner" className="size-5 animate-spin" />
        ) : (
          <Icon name="check" className="size-5" />
        )}
        {t("save")}
      </Button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-2xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
      <span>
        <span className="block text-sm font-bold">{label}</span>
        {hint ? <span className="block text-2xs text-muted-foreground">{hint}</span> : null}
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";
import { ErrorState, TableSkeleton } from "@/components/app/states";
import { Icon } from "@/components/icons";
import { useSession } from "@/components/session-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ApiError, api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { relativeTime } from "@/lib/format";

/* ------------------------------- kategori -------------------------------- */

export function CategoriesTable() {
  const t = useTranslations("database");
  const { role } = useSession();
  const isAdmin = role === "admin";
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");

  const categories = useQuery({
    queryKey: keys.categories,
    queryFn: () => api.master.categories(),
  });
  const units = useQuery({ queryKey: keys.units, queryFn: () => api.master.units() });

  const addCategory = useMutation({
    mutationFn: () => api.admin.upsertCategory({ name: name.trim() }),
    onSuccess: () => {
      setName("");
      void queryClient.invalidateQueries({ queryKey: keys.categories });
      toast.success(t("saved"));
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Gagal menyimpan."),
  });

  if (categories.isLoading) return <TableSkeleton rows={6} />;
  if (categories.isError) return <ErrorState onRetry={() => void categories.refetch()} />;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-2">
        <h2 className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
          {t("tabCategories")}
        </h2>
        {isAdmin ? (
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("newCategory")}
              className="h-11"
            />
            <Button
              className="h-11 shrink-0"
              onClick={() => addCategory.mutate()}
              disabled={name.trim().length < 2 || addCategory.isPending}
            >
              <Icon name="plus" className="size-4" />
            </Button>
          </div>
        ) : null}
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {(categories.data?.data ?? []).map((row) => (
            <li key={row.id} className="flex items-center gap-2 px-4 py-3">
              <span className="flex-1 text-[13px] font-semibold">{row.name}</span>
              <Badge tone="neutral">{row.itemCount ?? 0}</Badge>
              {row.active ? null : <Badge tone="neutral">nonaktif</Badge>}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-2xs font-bold uppercase tracking-wide text-muted-foreground">
          {t("unitLabel")}
        </h2>
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {(units.data?.data ?? []).map((row) => (
            <li key={row.id} className="flex items-center gap-2 px-4 py-3">
              <span className="flex-1 text-[13px] font-semibold">{row.name}</span>
              <Badge tone="neutral">{row.symbol}</Badge>
              <span className="text-2xs text-muted-foreground">
                {t("decimalsLabel")}: {row.decimals}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* --------------------------------- alasan -------------------------------- */

export function ReasonsTable() {
  const t = useTranslations("database");
  const { role } = useSession();
  const isAdmin = role === "admin";
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const [requiresWo, setRequiresWo] = React.useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: keys.reasons(true),
    queryFn: () => api.master.reasons(true),
  });

  const upsert = useMutation({
    mutationFn: (input: {
      id?: string;
      body: { name?: string; requiresWo?: boolean; active?: boolean };
    }) => api.admin.upsertReason(input.body, input.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reasons"] });
      toast.success(t("saved"));
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Gagal menyimpan."),
  });

  if (isLoading) return <TableSkeleton rows={6} />;
  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      {isAdmin ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("newReason")}
            className="h-11 flex-1"
          />
          <label className="flex min-h-11 items-center gap-2 text-[13px] font-semibold">
            <Switch checked={requiresWo} onCheckedChange={setRequiresWo} />
            {t("requiresWoLabel")}
          </label>
          <Button
            className="h-11"
            disabled={name.trim().length < 2 || upsert.isPending}
            onClick={() =>
              upsert.mutate(
                { body: { name: name.trim(), requiresWo, active: true } },
                {
                  onSuccess: () => {
                    setName("");
                    setRequiresWo(false);
                  },
                },
              )
            }
          >
            <Icon name="plus" className="size-4" />
            {t("newReason")}
          </Button>
        </div>
      ) : null}

      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {(data?.data ?? []).map((row) => (
          <li key={row.id} className="flex items-center gap-3 px-4 py-3">
            <span className="flex-1 text-[13px] font-semibold">{row.name}</span>
            {row.requiresWo ? <Badge tone="info">{t("requiresWoLabel")}</Badge> : null}
            <Badge tone={row.active ? "success" : "neutral"}>
              {row.active ? t("activeLabel") : "nonaktif"}
            </Badge>
            {isAdmin ? (
              <Switch
                checked={row.active}
                onCheckedChange={(checked) =>
                  upsert.mutate({ id: row.id, body: { active: checked } })
                }
                aria-label={`${row.name} ${t("activeLabel")}`}
              />
            ) : null}
          </li>
        ))}
      </ul>
      <p className="text-2xs text-muted-foreground">
        Alasan nonaktif tidak muncul di form pengambilan baru (TX-07).
      </p>
    </div>
  );
}

/* --------------------------------- mesin --------------------------------- */

export function EquipmentTable() {
  const t = useTranslations("database");
  const { role } = useSession();
  const isAdmin = role === "admin";
  const queryClient = useQueryClient();
  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: keys.equipment,
    queryFn: () => api.master.equipment(),
  });

  const add = useMutation({
    mutationFn: () =>
      api.admin.upsertEquipment({ code: code.trim(), name: name.trim(), active: true }),
    onSuccess: () => {
      setCode("");
      setName("");
      void queryClient.invalidateQueries({ queryKey: keys.equipment });
      toast.success(t("saved"));
    },
    onError: (error) => toast.error(error instanceof ApiError ? error.message : "Gagal menyimpan."),
  });

  if (isLoading) return <TableSkeleton rows={5} />;
  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      {isAdmin ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 sm:flex-row">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="MCH-11"
            className="h-11 font-mono sm:w-32"
          />
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("newEquipment")}
            className="h-11 flex-1"
          />
          <Button
            className="h-11"
            disabled={!code.trim() || !name.trim() || add.isPending}
            onClick={() => add.mutate()}
          >
            <Icon name="plus" className="size-4" />
          </Button>
        </div>
      ) : null}
      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {(data?.data ?? []).map((row) => (
          <li key={row.id} className="flex items-center gap-3 px-4 py-3">
            <span className="font-mono text-2xs text-muted-foreground">{row.code}</span>
            <span className="flex-1 text-[13px] font-semibold">{row.name}</span>
            <Badge tone={row.active ? "success" : "neutral"}>
              {row.active ? t("activeLabel") : "nonaktif"}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------- pengguna ------------------------------- */

export function UsersTable() {
  const t = useTranslations("database");
  const locale = useLocale();
  const { role } = useSession();
  const isAdmin = role === "admin";
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [userRole, setUserRole] = React.useState<"worker" | "supervisor" | "admin">("worker");
  const [initialPin, setInitialPin] = React.useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: keys.users,
    queryFn: () => api.master.users(),
  });

  const create = useMutation({
    mutationFn: () =>
      api.admin.createUser({ name: name.trim(), code: code.trim().toUpperCase(), role: userRole }),
    onSuccess: (result) => {
      setInitialPin(result.initialPin);
      setName("");
      setCode("");
      void queryClient.invalidateQueries({ queryKey: keys.users });
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Gagal membuat pengguna."),
  });

  const resetPin = useMutation({
    mutationFn: (id: string) => api.admin.updateUser(id, { resetPin: true }),
    onSuccess: (result) => {
      if (result.initialPin) {
        setInitialPin(result.initialPin);
        toast.success(t("pinResetDone", { pin: result.initialPin }));
      }
      void queryClient.invalidateQueries({ queryKey: keys.users });
    },
  });

  if (isLoading) return <TableSkeleton rows={8} />;
  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {isAdmin ? (
        <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("nameLabel")}
              className="h-11 flex-1"
            />
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="WRK13"
              className="h-11 font-mono uppercase sm:w-32"
            />
            <select
              value={userRole}
              onChange={(event) => setUserRole(event.target.value as typeof userRole)}
              className="h-11 rounded-[14px] border border-input bg-card px-3 text-sm"
              aria-label={t("roleLabel")}
            >
              <option value="worker">worker</option>
              <option value="supervisor">supervisor</option>
              <option value="admin">admin</option>
            </select>
            <Button
              className="h-11"
              disabled={!name.trim() || !code.trim() || create.isPending}
              onClick={() => create.mutate()}
            >
              <Icon name="plus" className="size-4" />
              {t("newUser")}
            </Button>
          </div>
          {initialPin ? (
            <p
              className="rounded-xl bg-success-soft px-3 py-2 text-[13px] font-bold text-success-foreground"
              data-testid="initial-pin"
            >
              {t("pinResetDone", { pin: initialPin })} · {t("pinOnce")}
            </p>
          ) : null}
        </div>
      ) : null}

      <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {(data?.data ?? []).map((row) => (
          <li key={row.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold">{row.name}</p>
              <p className="font-mono text-2xs text-muted-foreground">
                {row.code} · {row.email ?? "—"}
              </p>
            </div>
            <Badge
              tone={
                row.role === "admin" ? "primary" : row.role === "supervisor" ? "info" : "neutral"
              }
            >
              {row.role}
            </Badge>
            <span className="text-2xs text-muted-foreground">
              {row.lastLoginAt ? relativeTime(row.lastLoginAt, locale) : t("never")}
            </span>
            {isAdmin ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-9"
                onClick={() => resetPin.mutate(row.id)}
              >
                {t("pinReset")}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="sr-only">{open ? "open" : "closed"}</p>
      <button type="button" className="sr-only" onClick={() => setOpen(true)}>
        {t("newUser")}
      </button>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import * as React from "react";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api/client";

/**
 * Halaman reset kata sandi.
 *
 * Dua mode:
 *  - tanpa `?token=`  -> form minta tautan (lupa kata sandi)
 *  - dengan `?token=` -> form kata sandi baru
 */
export function ResetPasswordForm() {
  const t = useTranslations("reset");
  const router = useRouter();
  const params = useSearchParams();
  const token = params?.get("token") ?? "";

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);

  const submitForgot = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/.+@.+\..+/.test(email.trim()) || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await api.auth.forgot(email.trim().toLowerCase());
      setDone(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    } finally {
      setPending(false);
    }
  };

  const submitReset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (password.length < 8) {
      setError(t("tooShort"));
      return;
    }
    if (password !== confirm) {
      setError(t("mismatch"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      await api.auth.reset(token, password);
      setDone(t("success"));
      setTimeout(() => router.replace("/login"), 1800);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("genericError"));
    } finally {
      setPending(false);
    }
  };

  if (done) {
    return (
      <div className="space-y-3 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-success-soft text-success-foreground">
          <Icon name="checkCircle" className="size-6" />
        </span>
        <p className="text-[13px] font-semibold leading-relaxed">{done}</p>
        <Button asChild variant="secondary" className="h-11 w-full">
          <Link href="/login">{t("backToLogin")}</Link>
        </Button>
      </div>
    );
  }

  if (!token) {
    return (
      <form onSubmit={submitForgot} className="space-y-3" data-testid="forgot-form">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-[13px] font-bold">
            {t("emailLabel")}
          </Label>
          <Input
            id="email"
            data-testid="forgot-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nama@perusahaan.com"
            autoComplete="email"
            className="h-11"
            required
          />
        </div>
        {error ? (
          <p role="alert" className="text-2xs font-bold text-danger-foreground">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="h-11 w-full" disabled={pending}>
          {pending ? t("sending") : t("sendLink")}
        </Button>
        <p className="text-center text-2xs text-muted-foreground">
          {t("onlyAdmin")}{" "}
          <Link href="/login" className="font-bold text-primary hover:underline">
            {t("backToLogin")}
          </Link>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={submitReset} className="space-y-3" data-testid="reset-form">
      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-[13px] font-bold">
          {t("newPassword")}
        </Label>
        <Input
          id="password"
          data-testid="reset-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="h-11"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm" className="text-[13px] font-bold">
          {t("confirmPassword")}
        </Label>
        <Input
          id="confirm"
          data-testid="reset-confirm"
          type="password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          className="h-11"
          autoComplete="new-password"
          required
          minLength={8}
        />
      </div>
      {error ? (
        <p role="alert" className="text-2xs font-bold text-danger-foreground">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="h-11 w-full" data-testid="reset-submit" disabled={pending}>
        {pending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}

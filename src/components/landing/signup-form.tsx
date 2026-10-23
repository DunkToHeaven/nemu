"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import * as React from "react";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api } from "@/lib/api/client";

/**
 * Pendaftaran organisasi baru.
 *
 * Ini pintu masuk publik: siapa pun yang mendaftar menjadi **admin** dan
 * langsung mendapat organisasi (schema database) sendiri. Admin lalu membuat
 * akun pekerja dari menu Pengguna; pekerja login dengan kode + PIN dan hanya
 * melihat data gudang tempat ia dibuat.
 */
export function SignupForm() {
  const t = useTranslations("signup");
  const router = useRouter();
  const [orgName, setOrgName] = React.useState("");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const valid =
    orgName.trim().length >= 2 &&
    name.trim().length >= 2 &&
    /.+@.+\..+/.test(email.trim()) &&
    password.length >= 8;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || pending) return;
    setError(null);
    setPending(true);
    try {
      await api.auth.signup({
        orgName: orgName.trim(),
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      });
      // Sesi sudah dibuat server; pindah ke dashboard.
      router.replace("/app");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        // 409 = email sudah terdaftar. Arahkan ke login, jangan hanya bilang gagal.
        setError(err.code === "EMAIL_TAKEN" ? t("emailTaken") : err.message);
      } else {
        setError(t("genericError"));
      }
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3" data-testid="signup-form">
      <div className="space-y-1.5">
        <Label htmlFor="org" className="text-[13px] font-bold">
          {t("orgLabel")}
        </Label>
        <Input
          id="org"
          data-testid="signup-org"
          value={orgName}
          onChange={(event) => setOrgName(event.target.value)}
          placeholder={t("orgPlaceholder")}
          autoComplete="organization"
          className="h-11"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="name" className="text-[13px] font-bold">
          {t("nameLabel")}
        </Label>
        <Input
          id="name"
          data-testid="signup-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("namePlaceholder")}
          autoComplete="name"
          className="h-11"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-[13px] font-bold">
          {t("emailLabel")}
        </Label>
        <Input
          id="email"
          data-testid="signup-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="nama@perusahaan.com"
          autoComplete="email"
          className="h-11"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" className="text-[13px] font-bold">
          {t("passwordLabel")}
        </Label>
        <div className="relative">
          <Input
            id="password"
            data-testid="signup-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t("passwordHint")}
            autoComplete="new-password"
            className="h-11 pr-11"
            required
            minLength={8}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? t("hidePassword") : t("showPassword")}
            className="absolute right-1 top-1 grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <Icon name={showPassword ? "eyeOff" : "eye"} className="size-4" />
          </button>
        </div>
        <p className="text-2xs text-muted-foreground">{t("passwordRule")}</p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl bg-danger-soft px-3 py-2 text-2xs font-bold text-danger-foreground"
        >
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        className="h-11 w-full"
        data-testid="signup-submit"
        disabled={!valid || pending}
      >
        {pending ? <Icon name="spinner" className="size-4 animate-spin" /> : null}
        {pending ? t("submitting") : t("submit")}
      </Button>

      <p className="text-center text-2xs text-muted-foreground">
        {t("haveAccount")}{" "}
        <Link href="/login" className="font-bold text-primary underline-offset-2 hover:underline">
          {t("login")}
        </Link>
      </p>
    </form>
  );
}

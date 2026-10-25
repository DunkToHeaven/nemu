"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, api } from "@/lib/api/client";
import { keys } from "@/lib/api/keys";
import { safeNext } from "@/lib/safe-next";
import { cn } from "@/lib/utils";

const pinSchema = z.object({
  code: z.string().min(2, "Kode karyawan wajib diisi").max(24),
  pin: z.string().regex(/^\d{4,6}$/, "PIN 4–6 digit angka"),
});

const emailSchema = z.object({
  email: z.string().email("Format email tidak valid"),
  password: z.string().min(1, "Kata sandi wajib diisi"),
});

type PinValues = z.infer<typeof pinSchema>;
type EmailValues = z.infer<typeof emailSchema>;

export function LoginCard({
  className,
  autoFocus = false,
}: {
  className?: string;
  autoFocus?: boolean;
}) {
  const t = useTranslations("login");
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [tab, setTab] = React.useState<"pin" | "email">("pin");
  const [serverError, setServerError] = React.useState<string | null>(null);

  const nextParam = params.get("next");
  const target = safeNext(nextParam, "/app");
  const nextInvalid = Boolean(nextParam) && target === "/app" && nextParam !== "/app";

  const pinForm = useForm<PinValues>({
    resolver: zodResolver(pinSchema),
    defaultValues: { code: "", pin: "" },
  });
  const emailForm = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: (
      input:
        | { mode: "pin"; code: string; pin: string }
        | { mode: "email"; email: string; password: string },
    ) => api.auth.login(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.session });
      router.replace(target);
      router.refresh();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        if (error.code === "LOCKED") {
          const seconds = Number(error.details?.retryAfter ?? 300);
          setServerError(t("errorLocked", { seconds }));
          return;
        }
        if (error.code === "INVALID_CREDENTIALS") {
          const remaining = Number(error.details?.remaining ?? -1);
          setServerError(
            remaining > 0
              ? `${t("errorGeneric")} ${t("errorRemaining", { count: remaining })}`
              : t("errorGeneric"),
          );
          return;
        }
        setServerError(error.message);
        return;
      }
      setServerError(t("errorGeneric"));
    },
  });

  const onSubmitPin = pinForm.handleSubmit((values) => {
    setServerError(null);
    mutation.mutate({
      mode: "pin",
      code: values.code.trim().toUpperCase(),
      pin: values.pin.trim(),
    });
  });

  const onSubmitEmail = emailForm.handleSubmit((values) => {
    setServerError(null);
    mutation.mutate({ mode: "email", email: values.email.trim(), password: values.password });
  });

  return (
    <section
      aria-label={t("title")}
      data-testid="login-card"
      className={cn(
        "flex w-full max-w-[430px] flex-col gap-5 rounded-[28px] border border-border bg-card/90 p-5 shadow-[var(--shadow-float)] backdrop-blur-xl sm:p-7",
        className,
      )}
    >
      <div className="space-y-1.5">
        <h2 className="text-[26px] font-extrabold leading-tight tracking-[-0.02em]">
          {t("title")}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">{t("subtitle")}</p>
      </div>

      {nextParam ? (
        <p className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-2 text-[13px] leading-snug text-info-foreground">
          <Icon name="info" className="mt-0.5 size-4 shrink-0" />
          {nextInvalid ? t("invalidNext") : t("nextNotice")}
        </p>
      ) : null}

      <Tabs value={tab} onValueChange={(value) => setTab(value as "pin" | "email")}>
        <TabsList className="w-full">
          <TabsTrigger value="pin" data-testid="tab-employee">
            {t("tabEmployee")}
          </TabsTrigger>
          <TabsTrigger value="email" data-testid="tab-email">
            {t("tabEmail")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pin" className="pt-1">
          <form onSubmit={onSubmitPin} className="flex flex-col gap-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="employee-code">{t("employeeCode")}</Label>
              <Input
                id="employee-code"
                autoComplete="username"
                autoCapitalize="characters"
                placeholder={t("employeeCodePlaceholder")}
                aria-invalid={Boolean(pinForm.formState.errors.code)}
                data-testid="input-code"
                autoFocus={autoFocus}
                className={pinForm.formState.errors.code ? "border-danger" : undefined}
                {...pinForm.register("code")}
              />
              {pinForm.formState.errors.code ? (
                <p className="text-2xs font-semibold text-danger-foreground">
                  {pinForm.formState.errors.code.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="pin">{t("pin")}</Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                maxLength={6}
                placeholder={t("pinPlaceholder")}
                aria-invalid={Boolean(pinForm.formState.errors.pin)}
                data-testid="input-pin"
                className={pinForm.formState.errors.pin ? "border-danger" : undefined}
                {...pinForm.register("pin")}
              />
              {pinForm.formState.errors.pin ? (
                <p className="text-2xs font-semibold text-danger-foreground">
                  {pinForm.formState.errors.pin.message}
                </p>
              ) : null}
            </div>
            {serverError ? (
              <p
                role="alert"
                data-testid="login-error"
                className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] font-semibold text-danger-foreground"
              >
                {serverError}
              </p>
            ) : null}
            <Button
              type="submit"
              size="lg"
              block
              disabled={mutation.isPending}
              data-testid="submit-login"
            >
              {mutation.isPending ? t("submitting") : t("submit")}
            </Button>
          </form>
        </TabsContent>

        <TabsContent value="email" className="pt-1">
          <form onSubmit={onSubmitEmail} className="flex flex-col gap-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder={t("emailPlaceholder")}
                aria-invalid={Boolean(emailForm.formState.errors.email)}
                data-testid="input-email"
                {...emailForm.register("email")}
              />
              {emailForm.formState.errors.email ? (
                <p className="text-2xs font-semibold text-danger-foreground">
                  {emailForm.formState.errors.email.message}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={Boolean(emailForm.formState.errors.password)}
                data-testid="input-password"
                {...emailForm.register("password")}
              />
              {emailForm.formState.errors.password ? (
                <p className="text-2xs font-semibold text-danger-foreground">
                  {emailForm.formState.errors.password.message}
                </p>
              ) : null}
            </div>
            {serverError ? (
              <p
                role="alert"
                className="rounded-xl bg-danger-soft px-3 py-2 text-[13px] font-semibold text-danger-foreground"
              >
                {serverError}
              </p>
            ) : null}
            <Button
              type="submit"
              size="lg"
              block
              disabled={mutation.isPending}
              data-testid="submit-login-email"
            >
              {mutation.isPending ? t("submitting") : t("submit")}
            </Button>
          </form>
        </TabsContent>
      </Tabs>

      <p className="text-center text-2xs leading-relaxed text-muted-foreground">
        {t("forgotPin")}{" "}
        <Link href="/reset-password" className="font-bold text-primary hover:underline">
          {t("forgotPasswordLink")}
        </Link>
      </p>
    </section>
  );
}

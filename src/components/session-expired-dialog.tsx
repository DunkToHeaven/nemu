"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import * as React from "react";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { safeNext } from "@/lib/safe-next";

export function SessionExpiredDialog() {
  const t = useTranslations("login");
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("nemu:session-expired", handler);
    return () => window.removeEventListener("nemu:session-expired", handler);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent showClose={false}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon name="lock" className="size-5 text-warning-foreground" />
            {t("sessionExpired")}
          </DialogTitle>
          <DialogDescription>{t("nextNotice")}</DialogDescription>
        </DialogHeader>
        <Button
          size="lg"
          block
          onClick={() => {
            setOpen(false);
            router.push(`/login?next=${encodeURIComponent(safeNext(pathname, "/app"))}`);
          }}
        >
          {t("submit")}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import * as React from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownMenuTrigger = DropdownPrimitive.Trigger;
export const DropdownMenuGroup = DropdownPrimitive.Group;
export const DropdownMenuSeparator = ({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Separator>) => (
  <DropdownPrimitive.Separator className={cn("my-1 h-px bg-border", className)} {...props} />
);

export function DropdownMenuContent({
  className,
  align = "end",
  sideOffset = 8,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-52 overflow-hidden rounded-xl border border-border bg-card p-1.5 shadow-[var(--shadow-float)]",
          className,
        )}
        {...props}
      />
    </DropdownPrimitive.Portal>
  );
}

export const DropdownMenuItem = React.forwardRef<
  React.ComponentRef<typeof DropdownPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item> & { destructive?: boolean }
>(function DropdownMenuItem({ className, destructive, ...props }, ref) {
  return (
    <DropdownPrimitive.Item
      ref={ref}
      className={cn(
        "flex min-h-10 cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 text-sm font-medium outline-none",
        "focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        destructive && "text-danger-foreground focus:bg-danger-soft",
        className,
      )}
      {...props}
    />
  );
});

export function DropdownMenuLabel({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Label>) {
  return (
    <DropdownPrimitive.Label
      className={cn(
        "px-3 py-2 text-2xs font-bold uppercase tracking-wide text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

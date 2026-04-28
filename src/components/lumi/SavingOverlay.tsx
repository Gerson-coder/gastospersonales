"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

export type SavingOverlayProps = {
  open: boolean;
  label?: string;
  className?: string;
};

export function SavingOverlay({
  open,
  label = "Guardando…",
  className,
}: SavingOverlayProps) {
  if (!open) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-[2px]",
        className,
      )}
    >
      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-[13px] font-semibold text-foreground shadow-[var(--shadow-float)]">
        <Loader2 size={16} aria-hidden="true" className="animate-spin" />
        <span>{label}</span>
      </div>
    </div>
  );
}

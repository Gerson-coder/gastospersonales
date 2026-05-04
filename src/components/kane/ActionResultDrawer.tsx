/**
 * ActionResultDrawer — modal-style success/result confirmation that
 * replaces toast.success for actions important enough to warrant an
 * acknowledgement step.
 *
 * Used for:
 *   - Reset / restablecer / borrar destructive actions in /settings
 *     (factory reset, archive all categories, archive all accounts).
 *     A toast that disappears in 3 seconds is too easy to miss for an
 *     irreversible operation; the user wants a clear ✓ + "Listo" tap.
 *   - Inline-abono confirmation (saldo modal) — the user explicitly
 *     asked to replace the green sonner toast with this pattern.
 *
 * Tone defaults to `success` (Kane green, low chroma at hue 162). Pass
 * `tone="info"` for neutral acknowledgements and `tone="warning"` for
 * potentially-incomplete results (e.g. "Borramos 3 cuentas pero 1
 * quedó archivada por restricción de FK").
 */
"use client";

import * as React from "react";
import { Check, Info, AlertTriangle } from "lucide-react";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

export type ActionResultTone = "success" | "info" | "warning";

export type ActionResultDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  /** Defaults to "Listo". */
  closeLabel?: string;
  /** Defaults to `success`. */
  tone?: ActionResultTone;
};

const TONE_CLASS: Record<ActionResultTone, string> = {
  success:
    "bg-[oklch(0.94_0.05_162)] text-[oklch(0.45_0.16_162)] dark:bg-[oklch(0.30_0.06_162)] dark:text-[oklch(0.85_0.14_162)]",
  info:
    "bg-[oklch(0.94_0.04_220)] text-[oklch(0.45_0.10_220)] dark:bg-[oklch(0.30_0.05_220)] dark:text-[oklch(0.85_0.10_220)]",
  warning:
    "bg-[oklch(0.94_0.05_70)] text-[oklch(0.45_0.14_70)] dark:bg-[oklch(0.30_0.06_70)] dark:text-[oklch(0.85_0.14_70)]",
};

const TONE_ICON: Record<ActionResultTone, React.ComponentType<{ size?: number; "aria-hidden"?: boolean; strokeWidth?: number }>> = {
  success: Check,
  info: Info,
  warning: AlertTriangle,
};

export function ActionResultDrawer({
  open,
  onOpenChange,
  title,
  description,
  closeLabel = "Listo",
  tone = "success",
}: ActionResultDrawerProps) {
  const Icon = TONE_ICON[tone];
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        aria-describedby="action-result-desc"
        className="bg-background md:!max-w-2xl"
      >
        <DrawerHeader className="text-center">
          <div
            aria-hidden="true"
            className={cn(
              "mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full",
              TONE_CLASS[tone],
            )}
          >
            <Icon size={28} aria-hidden strokeWidth={2.4} />
          </div>
          <DrawerTitle className="font-sans not-italic text-lg font-semibold">
            {title}
          </DrawerTitle>
          {description ? (
            <DrawerDescription
              id="action-result-desc"
              className="text-[13px] leading-relaxed"
            >
              {description}
            </DrawerDescription>
          ) : (
            // DrawerDescription is required by the Drawer A11y contract;
            // when no body text is needed we still mount an empty one
            // bound to aria-describedby so the dialog stays compliant.
            <DrawerDescription
              id="action-result-desc"
              className="sr-only"
            >
              {title}
            </DrawerDescription>
          )}
        </DrawerHeader>
        <div className="flex flex-col gap-2 px-4 pb-6">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-foreground text-[14px] font-semibold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {closeLabel}
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export default ActionResultDrawer;

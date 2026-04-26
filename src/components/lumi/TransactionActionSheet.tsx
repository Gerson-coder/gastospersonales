/**
 * TransactionActionSheet — long-press contextual menu for a single
 * transaction row.
 *
 * Mirrors the structural patterns of {@link CategoryFormSheet} and
 * {@link MerchantFormSheet}: bottom Sheet via Base UI Dialog, kept
 * presentational, parent owns submit state and toasts.
 *
 * Two actions:
 *   - Editar → fires `onEdit()` (parent navigates to /capture?edit=<id>).
 *   - Eliminar → first tap arms an inline "¿Eliminar?" confirm; second tap
 *     fires `onArchive()`. The confirm copy + colors mirror the archive
 *     pattern in CategoryFormSheet so the visual language is consistent.
 *
 * Local state (`archiveArmed`, `submitting`) resets every time the sheet
 * opens — closing via swipe / escape behaves the same as Cancelar.
 */
"use client";

import * as React from "react";
import { Loader2, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Currency } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionId: string;
  merchantName: string | null;
  categoryName: string | null;
  amount: number;
  currency: Currency;
  onEdit: () => void;
  onArchive: () => Promise<void>;
};

function formatMoney(amount: number, currency: Currency): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function TransactionActionSheet({
  open,
  onOpenChange,
  merchantName,
  categoryName,
  amount,
  currency,
  onEdit,
  onArchive,
}: Props) {
  const [archiveArmed, setArchiveArmed] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // Reset internal state every time the sheet opens so an aborted action
  // (cancel / swipe / escape) doesn't leak into the next session.
  React.useEffect(() => {
    if (!open) return;
    setArchiveArmed(false);
    setSubmitting(false);
  }, [open]);

  const titleId = "tx-action-title";
  const label = merchantName ?? categoryName ?? "Sin nombre";
  const subtitle = `${label} · ${formatMoney(amount, currency)}`;

  async function handleArchiveClick() {
    if (submitting) return;
    if (!archiveArmed) {
      setArchiveArmed(true);
      return;
    }
    setSubmitting(true);
    try {
      await onArchive();
      // Parent closes the sheet via onOpenChange; we leave submitting=true
      // to prevent a double-tap during the close transition.
    } catch {
      // Parent surfaces the toast. Re-enable so the user can retry or close.
      setSubmitting(false);
      setArchiveArmed(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        aria-labelledby={titleId}
        className="rounded-t-3xl px-5 pb-6 pt-2 md:max-w-md"
      >
        <SheetHeader className="px-0">
          <SheetTitle id={titleId}>Movimiento</SheetTitle>
          <SheetDescription className="truncate">{subtitle}</SheetDescription>
        </SheetHeader>

        <div className="mt-2 flex flex-col gap-2 px-0 pb-2">
          {/* Editar — primary action, full-width tappable row. */}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (submitting) return;
              onEdit();
            }}
            disabled={submitting}
            className={cn(
              "min-h-12 justify-start gap-3 rounded-2xl border-border bg-card px-4 text-[14px] font-semibold",
            )}
          >
            <Pencil size={16} aria-hidden />
            Editar
          </Button>

          {/* Eliminar — first tap arms the inline confirm (below).
              When NOT armed, render the calm destructive button. */}
          {!archiveArmed ? (
            <Button
              type="button"
              variant="outline"
              onClick={handleArchiveClick}
              disabled={submitting}
              className="min-h-12 justify-start gap-3 rounded-2xl border-destructive/30 bg-card px-4 text-[14px] font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 size={16} aria-hidden />
              Eliminar
            </Button>
          ) : (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-2xl border border-destructive/30 bg-[var(--color-destructive-soft)] px-3.5 py-3 text-[13px] text-foreground"
            >
              <p className="font-semibold leading-snug">
                ¿Eliminar este movimiento?
              </p>
              <p className="text-[12px] leading-snug text-muted-foreground">
                Lo archivamos. Vas a tener 5 segundos para deshacer.
              </p>
              <div className="mt-1 flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setArchiveArmed(false)}
                  disabled={submitting}
                  className="min-h-9 flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={handleArchiveClick}
                  disabled={submitting}
                  className="min-h-9 flex-1"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={14} aria-hidden className="animate-spin" />
                      <span className="ml-1.5">Eliminando…</span>
                    </>
                  ) : (
                    "Eliminar"
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

"use client";

/**
 * MonthlyReportButton — downloads a PDF statement for a given month +
 * currency from `/api/reports/monthly`. Server-side rendering means the
 * client only triggers the request, gets back a Blob, and stitches an
 * anchor element to force the browser's "save file" dialog.
 *
 * Usage (e.g. on /insights):
 *
 *   <MonthlyReportButton year={2026} month={5} currency="PEN" />
 *
 * The button is intentionally compact — it lives next to other header
 * actions and keeps a stable footprint while loading (the spinner
 * replaces the icon, label stays the same so the button doesn't reflow).
 */

import * as React from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { Currency } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

export interface MonthlyReportButtonProps {
  /** Calendar year (e.g. 2026). */
  year: number;
  /** Calendar month, 1-12. */
  month: number;
  /** Currency to filter transactions by. */
  currency: Currency;
  /** Optional className override. */
  className?: string;
  /** Render the full label ("Reporte del mes") next to the icon. Defaults
   *  to true on md+ and falls back to icon-only on narrow screens. */
  showLabel?: boolean;
}

export function MonthlyReportButton({
  year,
  month,
  currency,
  className,
  showLabel = true,
}: MonthlyReportButtonProps): React.ReactElement {
  const [loading, setLoading] = React.useState(false);

  const onClick = React.useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/reports/monthly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, month, currency }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        let message = "No pudimos generar el reporte.";
        try {
          const parsed = JSON.parse(text) as { error?: string };
          if (parsed?.error) message = parsed.error;
        } catch {
          // body wasn't JSON — fall back to default message
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kane-reporte-${year}-${String(month).padStart(2, "0")}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Defer revoke so iOS Safari has a tick to start the download.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "No pudimos generar el reporte.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [year, month, currency, loading]);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      aria-label="Descargar reporte del mes en PDF"
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3",
        "text-[12px] font-semibold text-foreground",
        "transition-colors hover:bg-muted",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:opacity-60 disabled:cursor-not-allowed",
        className,
      )}
    >
      {loading ? (
        <Loader2 size={14} className="animate-spin" aria-hidden />
      ) : (
        <Download size={14} aria-hidden />
      )}
      {showLabel ? (
        <span className="hidden sm:inline">
          {loading ? "Generando…" : "Reporte del mes"}
        </span>
      ) : null}
    </button>
  );
}

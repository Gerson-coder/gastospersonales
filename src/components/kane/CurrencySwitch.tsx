/**
 * `<CurrencySwitch>` — PEN/USD toggle with two render variants.
 *
 *   variant="pill"    (default) — wide segmented control with both
 *                                 options visible side-by-side. Used in
 *                                 the dashboard header and any place
 *                                 with horizontal real estate to spare.
 *   variant="compact"            — small dropdown trigger ("S/ ⌄") that
 *                                 opens a 2-item menu on tap. Used in
 *                                 /capture where every horizontal pixel
 *                                 below the amount counts; the compact
 *                                 chip slips next to the amount instead
 *                                 of stealing a full row.
 *
 * Both variants read/write through `useActiveCurrency`, so flipping in
 * one place propagates everywhere via the kane-prefs storage event.
 */
"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";

import { useActiveCurrency } from "@/hooks/use-active-currency";
import { CURRENCY_LABEL } from "@/lib/money";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type CurrencySwitchVariant = "pill" | "compact";

export function CurrencySwitch({
  className,
  variant = "pill",
}: {
  className?: string;
  variant?: CurrencySwitchVariant;
}): React.ReactElement {
  const { currency, setCurrency } = useActiveCurrency();

  if (variant === "compact") {
    // base-ui Menu doesn't expose asChild; the Trigger renders its own
    // <button>. We pass our styling via className + aria-label and let
    // the primitive own the button element.
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Moneda activa: ${CURRENCY_LABEL[currency]}. Tocar para cambiar.`}
          className={cn(
            "inline-flex h-9 items-center gap-1 rounded-full border border-border bg-card px-2.5",
            "text-[13px] font-semibold tabular-nums text-foreground",
            "transition-colors hover:bg-muted",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          {currency === "PEN" ? "S/" : "$"}
          <ChevronDown size={12} aria-hidden className="text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[160px]">
          <CompactItem
            code="PEN"
            selected={currency === "PEN"}
            onSelect={() => setCurrency("PEN")}
          />
          <CompactItem
            code="USD"
            selected={currency === "USD"}
            onSelect={() => setCurrency("USD")}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // pill variant — original wide segmented control.
  return (
    <div
      role="radiogroup"
      aria-label="Moneda activa"
      className={cn(
        "flex items-center gap-0.5 rounded-full bg-muted p-0.5",
        className,
      )}
    >
      <CurrencyOption
        code="PEN"
        selected={currency === "PEN"}
        onClick={() => setCurrency("PEN")}
      />
      <CurrencyOption
        code="USD"
        selected={currency === "USD"}
        onClick={() => setCurrency("USD")}
      />
    </div>
  );
}

function CurrencyOption({
  code,
  selected,
  onClick,
}: {
  code: "PEN" | "USD";
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`Cambiar a ${CURRENCY_LABEL[code]}`}
      onClick={onClick}
      className={cn(
        "h-8 px-3 rounded-full text-[12px] font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "bg-card text-foreground shadow-[var(--shadow-xs)]"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {CURRENCY_LABEL[code]}
    </button>
  );
}

function CompactItem({
  code,
  selected,
  onSelect,
}: {
  code: "PEN" | "USD";
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      className="flex items-center gap-2"
    >
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold tabular-nums">
        {code === "PEN" ? "S/" : "$"}
      </span>
      <span className="flex-1 text-[13px]">{CURRENCY_LABEL[code]}</span>
      {selected ? (
        <Check size={14} className="text-primary" aria-hidden />
      ) : null}
    </DropdownMenuItem>
  );
}

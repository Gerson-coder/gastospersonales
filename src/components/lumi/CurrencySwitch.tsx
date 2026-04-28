/**
 * `<CurrencySwitch>` — small PEN/USD toggle pill.
 *
 * Reads/writes the active currency through `useActiveCurrency`, which
 * persists the value under the `lumi-prefs` localStorage key (shared with
 * /settings) and broadcasts changes to other tabs + same-tab consumers.
 *
 * Visual style mirrors the kind toggle in /capture and the action toggles
 * in `CategoryFormSheet` so it sits naturally in any header strip.
 *
 * NOT mounted yet — Wave 4 lands the actual page wiring.
 */
"use client";

import { useActiveCurrency } from "@/hooks/use-active-currency";
import { CURRENCY_LABEL } from "@/lib/money";
import { cn } from "@/lib/utils";

export function CurrencySwitch({
  className,
}: {
  className?: string;
}): React.ReactElement {
  const { currency, setCurrency } = useActiveCurrency();

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

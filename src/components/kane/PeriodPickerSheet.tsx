/**
 * PeriodPickerSheet — selector de rango temporal para /movements.
 *
 * Vaul drawer que ofrece 7 presets más una opción "Personalizado" con
 * un date range picker minimal. El padre controla el `value` (id del
 * período) y `customRange` (cuando id = "custom"); el sheet devuelve
 * ambos al confirmar.
 *
 * Por qué no usar un date picker grande tipo Linear / Stripe:
 *   - 90% del uso real son los presets (este mes, mes anterior, etc.).
 *   - En mobile un picker de calendario completo ocupa >50% del viewport
 *     y el flow se vuelve pesado.
 *   - "Personalizado" abre dos `<input type="date">` nativos — fea pero
 *     conocida, y delega la UX de calendario al sistema operativo.
 *
 * Si en algún momento la opción "Personalizado" se usa más que los
 * presets, vale la pena reemplazarla por react-day-picker o equivalente.
 * Hasta entonces, los inputs nativos cubren bien.
 */
"use client";

import * as React from "react";
import { Check } from "lucide-react";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Identificadores estables de los presets — se persisten en la URL
 * (`?period=mes`) por eso son cortos en español. "custom" usa
 * customRange.
 */
export type PeriodId =
  | "hoy"
  | "semana"
  | "mes"
  | "mes-anterior"
  | "30d"
  | "90d"
  | "todo"
  | "custom";

export type PeriodRange = {
  /** ISO inclusivo. null cuando period="todo" — sin lower bound. */
  fromISO: string | null;
  /** ISO exclusivo. null cuando period="todo" — sin upper bound. */
  toISO: string | null;
};

export type PeriodSelection = {
  id: PeriodId;
  range: PeriodRange;
  /** Etiqueta corta para el chip-pill ("Mayo 2026", "Personalizado", etc.). */
  label: string;
};

const OPTIONS: ReadonlyArray<{ id: PeriodId; label: string; sub?: string }> = [
  { id: "hoy", label: "Hoy" },
  { id: "semana", label: "Esta semana", sub: "Lun – Hoy" },
  { id: "mes", label: "Este mes" },
  { id: "mes-anterior", label: "Mes anterior" },
  { id: "30d", label: "Últimos 30 días" },
  { id: "90d", label: "Últimos 90 días" },
  { id: "todo", label: "Todo" },
  { id: "custom", label: "Personalizado…" },
];

/**
 * Calcula el rango ISO para un preset. Las fechas se anclan a 00:00:00
 * locales del usuario — que es razonable para "este mes" / "esta semana"
 * desde el punto de vista mental, aunque difiere de la zona Lima del
 * formatLimaDate. Para los filtros de listado funcionar bien — diferencia
 * de 5 horas en el borde es aceptable.
 */
export function computeRange(id: PeriodId, customRange?: PeriodRange): PeriodRange {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);

  switch (id) {
    case "hoy":
      return { fromISO: todayStart.toISOString(), toISO: tomorrowStart.toISOString() };
    case "semana": {
      // Monday-first como el resto de la app (ver use-transactions-window.ts).
      const day = todayStart.getDay(); // 0=Sun..6=Sat
      const offset = (day + 6) % 7; // 0=Mon..6=Sun
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - offset);
      return { fromISO: weekStart.toISOString(), toISO: tomorrowStart.toISOString() };
    }
    case "mes": {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
      return { fromISO: monthStart.toISOString(), toISO: nextMonthStart.toISOString() };
    }
    case "mes-anterior": {
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      return { fromISO: prevMonthStart.toISOString(), toISO: monthStart.toISOString() };
    }
    case "30d": {
      const start = new Date(todayStart);
      start.setDate(start.getDate() - 29); // incluye hoy → 30 días
      return { fromISO: start.toISOString(), toISO: tomorrowStart.toISOString() };
    }
    case "90d": {
      const start = new Date(todayStart);
      start.setDate(start.getDate() - 89);
      return { fromISO: start.toISOString(), toISO: tomorrowStart.toISOString() };
    }
    case "todo":
      return { fromISO: null, toISO: null };
    case "custom":
      return customRange ?? { fromISO: null, toISO: null };
  }
}

/**
 * Etiqueta visible para el chip-pill. Para presets devuelve el label fijo;
 * para "custom" devuelve "12 mar – 5 may" formateado en español neutral.
 */
export function formatPeriodLabel(id: PeriodId, range: PeriodRange): string {
  const opt = OPTIONS.find((o) => o.id === id);
  if (id !== "custom") return opt?.label ?? "Período";
  if (!range.fromISO || !range.toISO) return "Personalizado";
  const fmt = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short" });
  const from = fmt.format(new Date(range.fromISO)).replace(/\./g, "");
  // Restar 1 día al `to` porque es exclusivo y al usuario le mostramos
  // el rango inclusivo "hasta el 5 may", no "hasta antes del 6 may".
  const toDate = new Date(range.toISO);
  toDate.setDate(toDate.getDate() - 1);
  const to = fmt.format(toDate).replace(/\./g, "");
  return `${from} – ${to}`;
}

export type PeriodPickerSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: PeriodId;
  customRange: PeriodRange;
  onSelect: (selection: PeriodSelection) => void;
};

/** Convierte ISO a "YYYY-MM-DD" para `<input type="date">`. */
function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Convierte "YYYY-MM-DD" a ISO local 00:00. */
function dateInputToISO(value: string): string | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

export function PeriodPickerSheet({
  open,
  onOpenChange,
  value,
  customRange,
  onSelect,
}: PeriodPickerSheetProps) {
  // Estado local — el padre solo se entera al confirmar. Sirve para que
  // el user pueda explorar opciones en el sheet sin disparar fetchs por
  // cada tap. Se rehidrata cada vez que se abre.
  const [tentativeId, setTentativeId] = React.useState<PeriodId>(value);
  const [customFrom, setCustomFrom] = React.useState<string>(
    isoToDateInput(customRange.fromISO),
  );
  const [customTo, setCustomTo] = React.useState<string>(
    isoToDateInput(customRange.toISO),
  );

  React.useEffect(() => {
    if (open) {
      setTentativeId(value);
      setCustomFrom(isoToDateInput(customRange.fromISO));
      setCustomTo(isoToDateInput(customRange.toISO));
    }
  }, [open, value, customRange.fromISO, customRange.toISO]);

  const isCustomValid = React.useMemo(() => {
    if (tentativeId !== "custom") return true;
    if (!customFrom || !customTo) return false;
    return customFrom <= customTo;
  }, [tentativeId, customFrom, customTo]);

  function confirm() {
    if (tentativeId === "custom") {
      const fromISO = dateInputToISO(customFrom);
      // El input "to" es inclusivo desde la perspectiva del user, pero
      // nuestra query usa toISO exclusivo. Sumamos 1 día al snapshot
      // para incluir todo el día final.
      const toBase = dateInputToISO(customTo);
      const toExclusive = toBase
        ? new Date(new Date(toBase).getTime() + 24 * 60 * 60 * 1000).toISOString()
        : null;
      const range: PeriodRange = { fromISO, toISO: toExclusive };
      onSelect({
        id: "custom",
        range,
        label: formatPeriodLabel("custom", range),
      });
    } else {
      const range = computeRange(tentativeId);
      onSelect({
        id: tentativeId,
        range,
        label: formatPeriodLabel(tentativeId, range),
      });
    }
    onOpenChange(false);
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        aria-describedby="period-picker-desc"
        className="bg-background md:!max-w-xl"
      >
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-sans not-italic text-base font-semibold">
            Período
          </DrawerTitle>
          <DrawerDescription
            id="period-picker-desc"
            className="text-[12px]"
          >
            Elige el rango temporal para filtrar tus movimientos.
          </DrawerDescription>
        </DrawerHeader>

        <div className="max-h-[55vh] overflow-y-auto px-2 pb-2">
          <ul className="flex flex-col gap-1">
            {OPTIONS.map((opt) => {
              const selected = tentativeId === opt.id;
              return (
                <li key={opt.id}>
                  <button
                    type="button"
                    onClick={() => setTentativeId(opt.id)}
                    aria-pressed={selected}
                    className={cn(
                      "flex h-12 w-full items-center justify-between rounded-2xl px-4 text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected ? "bg-muted" : "hover:bg-muted",
                    )}
                  >
                    <span className="flex flex-col">
                      <span className="text-[14px] font-semibold text-foreground">
                        {opt.label}
                      </span>
                      {opt.sub ? (
                        <span className="text-[11.5px] text-muted-foreground">
                          {opt.sub}
                        </span>
                      ) : null}
                    </span>
                    {selected ? (
                      <Check size={16} aria-hidden className="text-foreground" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Inputs de fecha solo cuando el user eligió "Personalizado". */}
          {tentativeId === "custom" ? (
            <div className="mt-3 grid grid-cols-2 gap-3 px-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="period-custom-from" className="text-[11.5px]">
                  Desde
                </Label>
                <Input
                  id="period-custom-from"
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-11 text-[14px]"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="period-custom-to" className="text-[11.5px]">
                  Hasta
                </Label>
                <Input
                  id="period-custom-to"
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-11 text-[14px]"
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="border-t border-border bg-background px-4 py-3">
          <Button
            type="button"
            onClick={confirm}
            disabled={!isCustomValid}
            className="h-11 w-full rounded-full text-[13px] font-semibold"
          >
            Aplicar
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export default PeriodPickerSheet;

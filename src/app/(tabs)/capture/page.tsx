// TODO: replace inline money formatting with formatMoney from @/lib/money once Batch B lands.
// TODO: wire real save action to Supabase once the persistence layer is up — currently mock-only.
/**
 * Capture route — Lumi
 *
 * The 95% feature: register an expense in 3 taps.
 *   1. Type the amount on the keypad.
 *   2. Pick a category chip (or open the Drawer for the full list).
 *   3. Hit "Guardar gasto".
 *
 * Mobile-first; mounts inside the (tabs) route group so the bottom TabBar
 * sits below it. All copy in es-PE.
 *
 * Source of truth: Lumi UI-kit `CaptureScreen.jsx`. Reviewer fixes applied:
 *   - onPointerDown/Up/Cancel instead of mouse-only events.
 *   - Drawer (vaul) for both pickers — focus trap, role=dialog, ESC out of
 *     the box. No custom dialog primitives.
 *   - No window.LUMI_*, no localStorage in useState initializers.
 *   - "Now" timestamp is set in useEffect post-mount, not during render —
 *     avoids hydration mismatch.
 */

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Delete,
  UtensilsCrossed,
  Car,
  Home as HomeIcon,
  Heart,
  Film,
  Zap,
  GraduationCap,
  PiggyBank,
  Briefcase,
  Circle,
  Check,
  ChevronRight,
  Wallet,
  CreditCard,
  Landmark,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

// ─── Types ─────────────────────────────────────────────────────────────────
type Currency = "PEN" | "USD";
type Kind = "expense" | "income";

type CategoryId =
  | "food"
  | "transport"
  | "home"
  | "health"
  | "fun"
  | "utilities"
  | "edu"
  | "savings"
  | "work"
  | "other";

type Category = {
  id: CategoryId;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  // Default kind suggested by the category — "Trabajo" defaults to income.
  defaultKind: Kind;
};

type AccountId = "cash" | "card" | "bank";
type Account = {
  id: AccountId;
  label: string;
  kind: "cash" | "card" | "bank";
  currency: Currency;
  Icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
};

// ─── Mock data ────────────────────────────────────────────────────────────
const MOCK_CATEGORIES: Category[] = [
  { id: "food", label: "Comida", Icon: UtensilsCrossed, defaultKind: "expense" },
  { id: "transport", label: "Transporte", Icon: Car, defaultKind: "expense" },
  { id: "home", label: "Vivienda", Icon: HomeIcon, defaultKind: "expense" },
  { id: "health", label: "Salud", Icon: Heart, defaultKind: "expense" },
  { id: "fun", label: "Ocio", Icon: Film, defaultKind: "expense" },
  { id: "utilities", label: "Servicios", Icon: Zap, defaultKind: "expense" },
  { id: "edu", label: "Educación", Icon: GraduationCap, defaultKind: "expense" },
  { id: "savings", label: "Ahorro", Icon: PiggyBank, defaultKind: "expense" },
  { id: "work", label: "Trabajo", Icon: Briefcase, defaultKind: "income" },
  { id: "other", label: "Otros", Icon: Circle, defaultKind: "expense" },
];

const MOCK_ACCOUNTS: Account[] = [
  { id: "cash", label: "Efectivo", kind: "cash", currency: "PEN", Icon: Wallet },
  { id: "card", label: "Tarjeta", kind: "card", currency: "PEN", Icon: CreditCard },
  { id: "bank", label: "Banco", kind: "bank", currency: "USD", Icon: Landmark },
];

// MRU mock — first three categories shown inline above the keypad.
const MRU_CATEGORY_IDS: CategoryId[] = ["food", "transport", "fun"];

// ─── Money formatting ─────────────────────────────────────────────────────
// TODO: replace with formatMoney from @/lib/money once Batch B lands.
function formatMoney(amount: number, currency: Currency = "PEN"): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Parse the keypad-buffer string into a number.
 * Empty / lone "." / lone "0" → 0. Otherwise standard parseFloat.
 */
function parseAmount(buffer: string): number {
  if (!buffer || buffer === "." || buffer === "0") return 0;
  const n = Number.parseFloat(buffer);
  return Number.isFinite(n) ? n : 0;
}

/** Display string for the live amount — falls back to "0". */
function displayAmount(buffer: string, currency: Currency): string {
  const n = parseAmount(buffer);
  if (n === 0 && buffer === "") {
    // Show currency-formatted "0" as a placeholder.
    return formatMoney(0, currency);
  }
  // Mid-typing: show the raw buffer with the currency symbol so the decimal
  // point is visible while typing (Intl would silently swallow a trailing ".").
  if (buffer.endsWith(".") || /\.\d$/.test(buffer)) {
    const sym = currency === "PEN" ? "S/" : "$";
    return `${sym} ${buffer}`;
  }
  return formatMoney(n, currency);
}

// ─── Keypad ───────────────────────────────────────────────────────────────
type KeypadKey = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "0" | "." | "back";

const KEY_ROWS: KeypadKey[][] = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  [".", "0", "back"],
];

function KeypadButton({
  k,
  onPress,
}: {
  k: KeypadKey;
  onPress: (key: KeypadKey) => void;
}) {
  const [pressed, setPressed] = React.useState(false);

  const ariaLabel = React.useMemo(() => {
    if (k === "back") return "Borrar último dígito";
    if (k === ".") return "Coma decimal";
    return `Tecla ${k}`;
  }, [k]);

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={() => onPress(k)}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      className={cn(
        "flex h-16 items-center justify-center rounded-2xl border-0 text-2xl font-medium tabular-nums text-foreground",
        "transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "active:bg-muted",
        pressed ? "bg-muted" : "bg-transparent",
      )}
    >
      {k === "back" ? (
        <Delete size={22} aria-hidden="true" />
      ) : (
        <span aria-hidden="true">{k}</span>
      )}
    </button>
  );
}

function Keypad({ onPress }: { onPress: (key: KeypadKey) => void }) {
  return (
    <div
      className="grid grid-cols-3 gap-1 px-2"
      role="group"
      aria-label="Teclado numérico para ingresar el monto"
    >
      {KEY_ROWS.flat().map((k) => (
        <KeypadButton key={k} k={k} onPress={onPress} />
      ))}
    </div>
  );
}

// ─── Category chip (inline, MRU strip) ────────────────────────────────────
function CategoryChip({
  category,
  selected,
  onClick,
}: {
  category: Category;
  selected: boolean;
  onClick: () => void;
}) {
  const Icon = category.Icon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`Categoría ${category.label}${selected ? " (seleccionada)" : ""}`}
      className={cn(
        "inline-flex h-11 flex-shrink-0 items-center gap-2 rounded-full border pl-1.5 pr-3.5 text-[13px] font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        // Selected state: high-contrast neutral pill (foreground bg / background text).
        // Brand emerald is reserved for the Save CTA below — keep selection
        // visually loud without painting it green.
        selected
          ? "border-foreground bg-foreground text-background font-semibold"
          : "border-border bg-card text-foreground hover:bg-muted",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-full",
          selected
            ? "bg-background/20 text-current"
            : "bg-muted text-foreground",
        )}
      >
        <Icon size={16} />
      </span>
      {category.label}
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default function CapturePage() {
  const router = useRouter();

  // Buffer is the raw keypad string; "" means "nothing typed yet" (shows 0).
  const [amountBuffer, setAmountBuffer] = React.useState("");
  const [currency, setCurrency] = React.useState<Currency>("PEN");
  const [kind, setKind] = React.useState<Kind>("expense");
  const [categoryId, setCategoryId] = React.useState<CategoryId>("food");
  const [accountId, setAccountId] = React.useState<AccountId>("cash");
  const [note, setNote] = React.useState("");
  const [categoryDrawerOpen, setCategoryDrawerOpen] = React.useState(false);
  const [accountDrawerOpen, setAccountDrawerOpen] = React.useState(false);
  // Saved state — { ts } is stamped in handleSave (post-mount, not during
  // render) to keep SSR output stable.
  const [saved, setSaved] = React.useState<{ ts: number } | null>(null);

  const amount = parseAmount(amountBuffer);
  const ready = amount > 0;
  const display = displayAmount(amountBuffer, currency);

  const category = MOCK_CATEGORIES.find((c) => c.id === categoryId) ?? MOCK_CATEGORIES[0];
  const account = MOCK_ACCOUNTS.find((a) => a.id === accountId) ?? MOCK_ACCOUNTS[0];

  const mruCategories = React.useMemo(
    () =>
      MRU_CATEGORY_IDS.map((id) => MOCK_CATEGORIES.find((c) => c.id === id)).filter(
        (c): c is Category => Boolean(c),
      ),
    [],
  );

  const press = React.useCallback((k: KeypadKey) => {
    setAmountBuffer((s) => {
      if (k === "back") return s.slice(0, -1);
      if (k === ".") {
        if (s.includes(".")) return s;
        return s === "" ? "0." : s + ".";
      }
      // Cap at 9 chars — prevents absurd numbers and overflow.
      if (s.length >= 9) return s;
      // Prevent leading zeros like "007".
      if (s === "0") return k;
      // Cap to 2 decimals.
      const dot = s.indexOf(".");
      if (dot >= 0 && s.length - dot > 2) return s;
      return s + k;
    });
  }, []);

  const handleSave = React.useCallback(() => {
    if (!ready) return;
    // Stamp "now" post-interaction (NOT during render). This is the single
    // place we touch Date — keeps SSR output deterministic.
    const ts = Date.now();
    setSaved({ ts });
    // Reset form for the next entry.
    setAmountBuffer("");
    setNote("");
    setCategoryId("food");
    // Auto-clear the success banner after 4s so screen readers re-announce
    // a fresh save the next time the user taps.
    window.setTimeout(() => {
      setSaved((cur) => (cur && cur.ts === ts ? null : cur));
    }, 4000);
  }, [ready]);

  const handlePickCategory = React.useCallback(
    (id: CategoryId) => {
      setCategoryId(id);
      setCategoryDrawerOpen(false);
      const picked = MOCK_CATEGORIES.find((c) => c.id === id);
      if (picked && picked.defaultKind !== kind) {
        // Switching to "Trabajo" (income-by-default) flips the kind so the
        // user doesn't have to toggle manually. They can still flip back.
        setKind(picked.defaultKind);
      }
    },
    [kind],
  );

  const saveAriaLabel = !ready
    ? "Ingrese un monto primero"
    : `Guardar ${kind === "income" ? "ingreso" : "gasto"} de ${formatMoney(amount, currency)} en ${category.label}, cuenta ${account.label}`;

  return (
    <div className="relative flex min-h-dvh flex-col bg-background pb-32 text-foreground md:min-h-0 md:max-w-md md:mx-auto md:my-12 md:rounded-3xl md:border md:border-border md:bg-card md:shadow-card md:overflow-hidden md:pb-8">
      <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-4 pt-3">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Volver"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>

          {/* Kind toggle (gasto / ingreso) */}
          <div
            role="radiogroup"
            aria-label="Tipo de movimiento"
            className="flex h-9 items-center gap-0.5 rounded-full bg-muted p-0.5"
          >
            <button
              type="button"
              role="radio"
              aria-checked={kind === "expense"}
              onClick={() => setKind("expense")}
              className={cn(
                "rounded-full px-3.5 text-xs font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                kind === "expense"
                  ? "bg-card text-foreground shadow-[var(--shadow-xs)]"
                  : "text-muted-foreground",
              )}
            >
              Gasto
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={kind === "income"}
              onClick={() => setKind("income")}
              className={cn(
                "rounded-full px-3.5 text-xs font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                kind === "income"
                  ? "bg-card text-foreground shadow-[var(--shadow-xs)]"
                  : "text-muted-foreground",
              )}
            >
              Ingreso
            </button>
          </div>

          <button
            type="button"
            onClick={() => setCurrency((c) => (c === "PEN" ? "USD" : "PEN"))}
            aria-label={`Cambiar moneda (actualmente ${currency})`}
            aria-pressed={currency === "USD"}
            className="inline-flex h-11 min-w-11 items-center justify-center rounded-full border border-border bg-card px-3 text-[13px] font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {currency}
          </button>
        </header>

        {/* Amount display */}
        <section className="px-6 pt-6 text-center md:px-8 md:pt-8" aria-live="polite">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {kind === "income" ? "Cuánto entró" : "Cuánto gastaste"}
          </div>
          <div
            className={cn(
              "mt-2 font-display italic tabular-nums leading-none tracking-tight",
              "text-[44px] md:text-[56px]",
              amountBuffer === "" ? "text-muted-foreground" : "text-foreground",
            )}
            style={{ fontFeatureSettings: '"tnum","lnum"' }}
          >
            {display}
          </div>
        </section>

        {/* Saved banner — visually-hidden announcement + visible toast.
            Implemented as <output role="status" aria-live="polite"> per a11y
            spec; lives in the layout flow so it doesn't cover the FAB. */}
        <output
          role="status"
          aria-live="polite"
          className={cn(
            "mx-4 mt-4 transition-opacity duration-300",
            saved ? "opacity-100" : "pointer-events-none h-0 opacity-0",
          )}
        >
          {saved ? (
            <div className="flex items-center gap-3 rounded-2xl bg-foreground px-4 py-3 text-background shadow-[var(--shadow-float)]">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
              >
                <Check size={18} />
              </span>
              <span className="flex-1 text-[13px] font-semibold">Guardado</span>
            </div>
          ) : null}
        </output>

        {/* MRU category chips */}
        <section className="mt-4 px-4" aria-label="Categorías recientes">
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {mruCategories.map((c) => (
              <CategoryChip
                key={c.id}
                category={c}
                selected={categoryId === c.id}
                onClick={() => handlePickCategory(c.id)}
              />
            ))}
            <button
              type="button"
              onClick={() => setCategoryDrawerOpen(true)}
              aria-label="Ver todas las categorías"
              aria-haspopup="dialog"
              aria-expanded={categoryDrawerOpen}
              className="inline-flex h-11 flex-shrink-0 items-center rounded-full border border-dashed border-border bg-transparent px-3.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              + Más
            </button>
          </div>
        </section>

        {/* Account picker + note */}
        <section className="mt-3 space-y-3 px-4">
          <button
            type="button"
            onClick={() => setAccountDrawerOpen(true)}
            aria-label={`Cuenta ${account.label}, toca para cambiar`}
            aria-haspopup="dialog"
            aria-expanded={accountDrawerOpen}
            className="flex h-11 w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              aria-hidden="true"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-foreground"
            >
              <account.Icon size={14} />
            </span>
            <span className="flex-1 text-[13px] font-semibold">{account.label}</span>
            <span className="text-[11px] font-medium text-muted-foreground">
              {account.currency}
            </span>
            <ChevronRight size={16} aria-hidden="true" className="text-muted-foreground" />
          </button>

          <div>
            <Label
              htmlFor="capture-note"
              className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
            >
              Nota (opcional)
            </Label>
            <Input
              id="capture-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Cinépolis con Vale"
              maxLength={80}
              autoComplete="off"
              className="mt-1.5 h-11 rounded-2xl border-border bg-card text-[13px]"
            />
          </div>
        </section>

        {/* Hint */}
        <p className="px-4 pt-3 text-center text-[11px] text-muted-foreground">
          {ready ? "Toca Guardar o elige otra categoría" : "Escribe el monto"}
        </p>

        {/* Keypad */}
        <div className="mt-2 px-2">
          <Keypad onPress={press} />
        </div>

        {/* Save action */}
        <div className="mt-2 flex flex-col gap-2 px-4 pt-2">
          <Button
            type="button"
            onClick={handleSave}
            disabled={!ready}
            aria-label={saveAriaLabel}
            className={cn(
              "h-14 w-full rounded-full text-base font-bold transition-transform",
              "active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50",
            )}
            style={ready ? { boxShadow: "var(--shadow-fab)" } : undefined}
          >
            {kind === "income" ? "Guardar ingreso" : "Guardar gasto"}
          </Button>

          <button
            type="button"
            onClick={() => setCategoryDrawerOpen(true)}
            disabled={!ready}
            aria-haspopup="dialog"
            aria-expanded={categoryDrawerOpen}
            className={cn(
              "h-10 w-full rounded-full text-[13px] font-semibold text-muted-foreground transition-colors",
              "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            Más opciones
          </button>
        </div>
      </div>

      {/* Camera FAB — alt path (scan receipt). Sits above the TabBar. */}
      <button
        type="button"
        onClick={() => router.push("/receipt")}
        aria-label="Escanear ticket con la cámara"
        className="fixed bottom-[calc(96px+env(safe-area-inset-bottom))] right-[18px] z-20 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-[var(--shadow-card)] transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Camera size={20} aria-hidden="true" />
      </button>

      {/* Category drawer — full grid */}
      <Drawer open={categoryDrawerOpen} onOpenChange={setCategoryDrawerOpen}>
        <DrawerContent
          aria-describedby="capture-category-desc"
          className="bg-background"
        >
          <DrawerHeader>
            <DrawerTitle>Elige una categoría</DrawerTitle>
            <DrawerDescription id="capture-category-desc">
              Guardar {ready ? display : "el movimiento"} en una categoría.
            </DrawerDescription>
          </DrawerHeader>
          <div className="grid grid-cols-3 gap-2 px-4 pb-6">
            {MOCK_CATEGORIES.map((c) => {
              const Icon = c.Icon;
              const selected = categoryId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handlePickCategory(c.id)}
                  aria-pressed={selected}
                  className={cn(
                    "flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 text-center transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-foreground hover:bg-muted",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full",
                      selected
                        ? "bg-background/20 text-current"
                        : "bg-muted text-foreground",
                    )}
                  >
                    <Icon size={20} />
                  </span>
                  <span className="text-xs font-semibold leading-tight">
                    {c.label}
                  </span>
                </button>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Account drawer — list */}
      <Drawer open={accountDrawerOpen} onOpenChange={setAccountDrawerOpen}>
        <DrawerContent
          aria-describedby="capture-account-desc"
          className="bg-background"
        >
          <DrawerHeader>
            <DrawerTitle>Elige una cuenta</DrawerTitle>
            <DrawerDescription id="capture-account-desc">
              Cuenta o método de pago para este movimiento.
            </DrawerDescription>
          </DrawerHeader>
          <ul className="flex flex-col gap-1 px-2 pb-6">
            {MOCK_ACCOUNTS.map((a) => {
              const Icon = a.Icon;
              const selected = accountId === a.id;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountId(a.id);
                      setAccountDrawerOpen(false);
                    }}
                    aria-pressed={selected}
                    className={cn(
                      "flex h-14 w-full items-center gap-3 rounded-2xl px-3 text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected ? "bg-muted" : "hover:bg-muted",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground"
                    >
                      <Icon size={16} />
                    </span>
                    <span className="flex-1">
                      <span className="block text-[13px] font-semibold">{a.label}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {a.currency} · {a.kind === "cash" ? "efectivo" : a.kind === "card" ? "tarjeta" : "cuenta bancaria"}
                      </span>
                    </span>
                    {selected ? (
                      <Check size={16} aria-hidden="true" className="text-foreground" />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

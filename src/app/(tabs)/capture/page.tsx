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
  StickyNote,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { listAccounts, type Account as DataAccount } from "@/lib/data/accounts";
import {
  listCategories,
  type Category as DbCategory,
} from "@/lib/data/categories";
import { getCategoryIcon } from "@/lib/category-icons";
import { Skeleton } from "@/components/ui/skeleton";

// Demo-mode flag — when env vars are absent, fall back to the inline
// MOCK_ACCOUNTS rather than hitting Supabase. Mirrors the same gate used by
// `useSession` and `/login`.
const SUPABASE_ENABLED =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;

// ─── Types ─────────────────────────────────────────────────────────────────
type Currency = "PEN" | "USD";
type Kind = "expense" | "income";

// Category IDs are opaque strings — uuid in real mode, the mock keys in demo.
type CategoryId = string;

type Category = {
  id: CategoryId;
  label: string;
  Icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  // Default kind suggested by the category — income for things like "Trabajo".
  defaultKind: Kind;
};

/**
 * Map a DB category row → the local Category shape used by chips/drawer.
 * Resolves the kebab-case Lucide icon name to a real component, defaulting to
 * Circle when the row's icon is unknown or null.
 */
function fromDbCategory(c: DbCategory): Category {
  return {
    id: c.id,
    label: c.name,
    Icon: getCategoryIcon(c.icon),
    defaultKind: c.kind,
  };
}

// Account IDs are opaque strings — uuid in real mode, the mock keys in demo.
type AccountId = string;
type Account = {
  id: AccountId;
  label: string;
  kind: "cash" | "card" | "bank";
  currency: Currency;
  Icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
};

// Map an account kind to its icon. Used to "rehydrate" the lucide icon for
// rows that come from the data layer (which doesn't carry React components).
const ACCOUNT_KIND_ICON: Record<
  Account["kind"],
  React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>
> = {
  cash: Wallet,
  card: CreditCard,
  bank: Landmark,
};

function fromDataAccount(a: DataAccount): Account {
  return {
    id: a.id,
    label: a.label,
    kind: a.kind,
    currency: a.currency,
    Icon: ACCOUNT_KIND_ICON[a.kind],
  };
}

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

// MRU mock — first three categories shown inline above the keypad in demo
// mode. In real mode we default the strip to the first 3 expense categories
// alphabetically (see CapturePage). TODO: replace with real MRU based on
// transaction history once that data layer lands.
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
  // Categories — same demo-vs-live split as accounts. In live mode we start
  // with an empty list + skeleton chips; in demo we seed from the inline mocks
  // so the keypad screen renders immediately without env vars.
  const [categories, setCategories] = React.useState<Category[]>(
    SUPABASE_ENABLED ? [] : MOCK_CATEGORIES,
  );
  const [categoriesLoading, setCategoriesLoading] = React.useState<boolean>(
    SUPABASE_ENABLED,
  );
  const [categoryId, setCategoryId] = React.useState<CategoryId | null>(
    SUPABASE_ENABLED ? null : "food",
  );

  // Load real categories when Supabase is configured. Kept as a dedicated
  // effect (separate from accounts) to keep the demo branch trivial.
  React.useEffect(() => {
    if (!SUPABASE_ENABLED) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listCategories();
        if (cancelled) return;
        const mapped = rows.map(fromDbCategory);
        setCategories(mapped);
        // Default-select the first expense category alphabetically — same
        // ordering as the MRU strip below. Falls back to the first row of
        // any kind, then null.
        const firstExpense = mapped.find((c) => c.defaultKind === "expense");
        setCategoryId((prev) => prev ?? firstExpense?.id ?? mapped[0]?.id ?? null);
      } catch {
        // Soft-fail: empty list, picker shows "Sin categorías".
      } finally {
        if (!cancelled) setCategoriesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Account list — in demo mode we seed with the inline mocks so the picker
  // works without env vars; in real mode we fetch via the data layer in a
  // dedicated effect (kept separate from the categories effect to minimise
  // merge conflicts with the parallel categories-wiring change).
  const [accounts, setAccounts] = React.useState<Account[]>(
    SUPABASE_ENABLED ? [] : MOCK_ACCOUNTS,
  );
  const [accountsLoading, setAccountsLoading] = React.useState<boolean>(SUPABASE_ENABLED);
  // `null` until we know which account to default-select. The first effect
  // tick (or the inline mocks) seeds it to the first account in the list.
  const [accountId, setAccountId] = React.useState<AccountId | null>(
    SUPABASE_ENABLED ? null : MOCK_ACCOUNTS[0]?.id ?? null,
  );

  // Load real accounts when Supabase is configured. Separate effect from any
  // categories loader so two parallel agents don't fight over the same hook.
  React.useEffect(() => {
    if (!SUPABASE_ENABLED) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await listAccounts();
        if (cancelled) return;
        const mapped = list.map(fromDataAccount);
        setAccounts(mapped);
        // Default-select the first active account (post-fetch, never hardcoded).
        setAccountId((prev) => prev ?? mapped[0]?.id ?? null);
      } catch {
        // Soft-fail: keep accounts empty; the picker shows an empty state.
      } finally {
        if (!cancelled) setAccountsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const [note, setNote] = React.useState("");
  const [categoryDrawerOpen, setCategoryDrawerOpen] = React.useState(false);
  const [accountDrawerOpen, setAccountDrawerOpen] = React.useState(false);
  // Note drawer — opens on demand from the chip strip. `noteDraft` holds the
  // in-progress text so the user can cancel without committing.
  const [noteDrawerOpen, setNoteDrawerOpen] = React.useState(false);
  const [noteDraft, setNoteDraft] = React.useState("");
  // Saved state — { ts } is stamped in handleSave (post-mount, not during
  // render) to keep SSR output stable.
  const [saved, setSaved] = React.useState<{ ts: number } | null>(null);

  const amount = parseAmount(amountBuffer);
  const ready = amount > 0;
  const display = displayAmount(amountBuffer, currency);

  // `category` may be null briefly while we wait for the first fetch tick or
  // if the user has no categories at all. Downstream code coalesces.
  const category: Category | null =
    categories.find((c) => c.id === categoryId) ?? categories[0] ?? null;
  // `account` may be null briefly while we wait for the first fetch tick.
  // The picker chip shows a skeleton in that window; downstream consumers
  // (saveAriaLabel, save handler) coalesce to safe defaults.
  const account: Account | null =
    accounts.find((a) => a.id === accountId) ?? accounts[0] ?? null;

  // MRU strip. In demo mode we honour the original mock IDs ("food",
  // "transport", "fun") so the keypad screen looks unchanged. In live mode
  // we fall back to the first 3 expense categories alphabetically — proper
  // MRU based on transaction history is a TODO for after the data model
  // exposes it.
  const mruCategories = React.useMemo<Category[]>(() => {
    if (!SUPABASE_ENABLED) {
      return MRU_CATEGORY_IDS.map((id) =>
        categories.find((c) => c.id === id),
      ).filter((c): c is Category => Boolean(c));
    }
    return categories
      .filter((c) => c.defaultKind === "expense")
      .slice(0, 3);
  }, [categories]);

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
    // Reset form for the next entry. Drop back to the default category if we
    // can identify one — otherwise let the next category-fetch tick re-seed.
    setAmountBuffer("");
    setNote("");
    const firstExpense = categories.find((c) => c.defaultKind === "expense");
    setCategoryId(firstExpense?.id ?? categories[0]?.id ?? null);
    // After 1.4s show the user the success state, then route to /dashboard
    // where the new transaction will appear in the latest list.
    // TODO: when Supabase persistence lands (Batch C), the success banner
    // can stay where it is (on /capture) and we let realtime push the new
    // row into /dashboard's list.
    window.setTimeout(() => {
      router.push("/dashboard");
    }, 1400);
  }, [ready, router, categories]);

  const handlePickCategory = React.useCallback(
    (id: CategoryId) => {
      setCategoryId(id);
      setCategoryDrawerOpen(false);
      const picked = categories.find((c) => c.id === id);
      if (picked && picked.defaultKind !== kind) {
        // Switching to an income-by-default category (e.g. "Trabajo") flips
        // the kind so the user doesn't have to toggle manually. They can
        // still flip back manually.
        setKind(picked.defaultKind);
      }
    },
    [kind, categories],
  );

  const openNoteDrawer = React.useCallback(() => {
    // Prefill the draft with the saved note so editing feels natural.
    setNoteDraft(note);
    setNoteDrawerOpen(true);
  }, [note]);

  const handleSaveNote = React.useCallback(() => {
    const trimmed = noteDraft.trim();
    setNote(trimmed);
    setNoteDrawerOpen(false);
  }, [noteDraft]);

  const handleClearNote = React.useCallback((e: React.MouseEvent) => {
    // Stop propagation so we don't also open the drawer when the user taps
    // the small ✕ inside the note chip.
    e.stopPropagation();
    setNote("");
  }, []);

  const noteExcerpt = React.useMemo(() => {
    if (!note) return "";
    return note.length > 24 ? `${note.slice(0, 24)}…` : note;
  }, [note]);

  const saveAriaLabel = !ready
    ? "Ingrese un monto primero"
    : `Guardar ${kind === "income" ? "ingreso" : "gasto"} de ${formatMoney(amount, currency)}${category ? ` en ${category.label}` : ""}${account ? `, cuenta ${account.label}` : ""}`;

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

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrency((c) => (c === "PEN" ? "USD" : "PEN"))}
              aria-label={`Cambiar moneda (actualmente ${currency})`}
              aria-pressed={currency === "USD"}
              className="inline-flex h-11 min-w-11 items-center justify-center rounded-full border border-border bg-card px-3 text-[13px] font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {currency}
            </button>
            {/* Camera shortcut — relocated from a floating FAB so it stops
                covering the keypad. Routes to the receipt-scan flow. */}
            <button
              type="button"
              onClick={() => router.push("/receipt")}
              aria-label="Escanear ticket en su lugar"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Camera size={18} aria-hidden="true" />
            </button>
          </div>
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
            {categoriesLoading ? (
              // Skeleton chips — match the real chip height (h-11) and the
              // ~w-24 horizontal footprint of a 1-2 word label so the strip
              // doesn't reflow when data lands.
              [0, 1, 2].map((i) => (
                <Skeleton
                  key={i}
                  className="h-11 w-24 flex-shrink-0 rounded-full"
                />
              ))
            ) : (
              mruCategories.map((c) => (
                <CategoryChip
                  key={c.id}
                  category={c}
                  selected={categoryId === c.id}
                  onClick={() => handlePickCategory(c.id)}
                />
              ))
            )}
            <button
              type="button"
              onClick={() => setCategoryDrawerOpen(true)}
              disabled={categoriesLoading || categories.length === 0}
              aria-label="Ver todas las categorías"
              aria-haspopup="dialog"
              aria-expanded={categoryDrawerOpen}
              className="inline-flex h-11 flex-shrink-0 items-center rounded-full border border-dashed border-border bg-transparent px-3.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
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
            disabled={accountsLoading || accounts.length === 0}
            aria-label={
              account
                ? `Cuenta ${account.label}, toca para cambiar`
                : accountsLoading
                  ? "Cargando cuentas"
                  : "Sin cuentas disponibles"
            }
            aria-haspopup="dialog"
            aria-expanded={accountDrawerOpen}
            className="flex h-11 w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            {accountsLoading ? (
              <>
                <Skeleton className="h-7 w-7 flex-shrink-0 rounded-full" />
                <Skeleton className="h-3.5 flex-1 rounded" />
              </>
            ) : account ? (
              <>
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
              </>
            ) : (
              <span className="flex-1 text-[13px] font-medium text-muted-foreground">
                Sin cuentas — creá una en /cuentas
              </span>
            )}
          </button>

          {/* Note chip — empty: a small "+ Nota" affordance; filled: shows the
              excerpt with an inline ✕ to clear. Tapping the chip (anywhere
              outside the ✕) opens the note drawer. */}
          {note ? (
            <button
              type="button"
              onClick={openNoteDrawer}
              aria-label={`Editar nota: ${note}`}
              aria-haspopup="dialog"
              aria-expanded={noteDrawerOpen}
              className="flex h-11 w-full items-center gap-2 rounded-full border border-foreground bg-foreground pl-3 pr-1.5 text-left text-[13px] font-semibold text-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <StickyNote size={14} aria-hidden="true" className="flex-shrink-0" />
              <span className="flex-1 truncate">Nota: «{noteExcerpt}»</span>
              <span
                role="button"
                tabIndex={0}
                aria-label="Quitar nota"
                onClick={handleClearNote}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    setNote("");
                  }
                }}
                className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-background/15 text-background transition-colors hover:bg-background/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X size={14} aria-hidden="true" />
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={openNoteDrawer}
              aria-label="Agregar nota opcional"
              aria-haspopup="dialog"
              aria-expanded={noteDrawerOpen}
              className="inline-flex h-11 items-center gap-2 self-start rounded-full border border-dashed border-border bg-transparent px-3.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <StickyNote size={14} aria-hidden="true" />
              + Nota
            </button>
          )}
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

      {/* Note drawer — small modal sheet to add or edit the optional note.
          Lives outside the form flow so the textarea autoFocus only fires when
          the drawer opens. */}
      <Drawer
        open={noteDrawerOpen}
        onOpenChange={(open) => {
          setNoteDrawerOpen(open);
          if (!open) {
            // Discard the in-progress draft when the user closes the drawer
            // any way other than tapping Guardar.
            setNoteDraft(note);
          }
        }}
      >
        <DrawerContent
          aria-describedby="capture-note-desc"
          className="bg-background"
        >
          <DrawerHeader>
            <DrawerTitle>Agregar nota</DrawerTitle>
            <DrawerDescription id="capture-note-desc">
              Detalle opcional para recordar este movimiento.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-2">
            <Label htmlFor="capture-note-textarea" className="sr-only">
              Nota opcional
            </Label>
            <textarea
              id="capture-note-textarea"
              autoFocus
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Una nota opcional…"
              maxLength={200}
              rows={4}
              className="w-full resize-none rounded-2xl border border-border bg-card px-3 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="mt-1 text-right text-[11px] text-muted-foreground tabular-nums">
              {noteDraft.length}/200
            </div>
          </div>
          <DrawerFooter className="flex-col gap-2">
            <Button
              type="button"
              onClick={handleSaveNote}
              disabled={noteDraft.trim().length === 0}
              className="h-12 w-full rounded-full text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
            >
              Guardar
            </Button>
            <button
              type="button"
              onClick={() => setNoteDrawerOpen(false)}
              className="h-10 w-full rounded-full text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Cancelar
            </button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

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
            {categoriesLoading
              ? [0, 1, 2, 3, 4, 5].map((i) => (
                  <Skeleton
                    key={i}
                    className="min-h-[88px] rounded-2xl"
                  />
                ))
              : categories.length === 0
                ? (
                    <p className="col-span-3 py-6 text-center text-[13px] text-muted-foreground">
                      No tenés categorías todavía. Creá una en Ajustes.
                    </p>
                  )
                : categories.map((c) => {
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
            {accountsLoading
              ? [0, 1, 2].map((i) => (
                  <li key={i}>
                    <div className="flex h-14 w-full items-center gap-3 rounded-2xl px-3">
                      <Skeleton className="h-9 w-9 flex-shrink-0 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="block h-3.5 w-1/3 rounded" />
                        <Skeleton className="block h-3 w-1/4 rounded" />
                      </div>
                    </div>
                  </li>
                ))
              : accounts.map((a) => {
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

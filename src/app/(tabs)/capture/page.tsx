// TODO: replace inline money formatting with formatMoney from @/lib/money once Batch B lands.
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
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
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
  Loader2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { listAccounts, type Account as DataAccount } from "@/lib/data/accounts";
import {
  listCategories,
  type Category as DbCategory,
} from "@/lib/data/categories";
import {
  createTransaction,
  getTransactionById,
  updateTransaction,
  MAX_TRANSACTION_AMOUNT,
  type TransactionDraft,
} from "@/lib/data/transactions";
import { getCategoryIcon } from "@/lib/category-icons";
import { Skeleton } from "@/components/ui/skeleton";
import { MerchantPicker } from "@/components/lumi/MerchantPicker";
import { useOnline } from "@/hooks/use-online";
import { useSession } from "@/lib/use-session";

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

/**
 * Inverse of `parseAmount`: render a numeric amount back into the keypad
 * buffer shape. Used by edit-mode hydration so the keypad reflects the
 * existing transaction's amount as if the user had typed it. Round-trip
 * via `amount_minor` to dodge floating drift, then strip any trailing
 * ".00" so an integer like 25 shows as "25" (not "25.00") — matching the
 * shape `parseAmount`/`displayAmount` produced before save.
 */
function formatAmountToBuffer(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  const minor = Math.round(amount * 100);
  const major = Math.trunc(minor / 100);
  const cents = minor % 100;
  if (cents === 0) return String(major);
  return `${major}.${cents.toString().padStart(2, "0")}`;
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
// Top-level export wraps the real page in Suspense so `useSearchParams()`
// (used inside CapturePageInner to read `?edit=<id>`) doesn't bail static
// rendering. Next 15+/16 requires `useSearchParams()` to live under a
// Suspense ancestor during prerender — without it the build fails with
// "missing-suspense-with-csr-bailout". The fallback is a minimal shell
// that doesn't itself call useSearchParams, just a hydration placeholder.
export default function CapturePage() {
  return (
    <React.Suspense fallback={<CapturePageFallback />}>
      <CapturePageInner />
    </React.Suspense>
  );
}

// Minimal loading shell — matches the real page's outer chrome (full-height
// background, mobile-first centred column) so the swap-in feels stable.
// MUST NOT call useSearchParams or any other hook that bails static render.
function CapturePageFallback() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="relative flex min-h-dvh flex-col bg-background pb-32 text-foreground md:min-h-0 md:max-w-md md:mx-auto md:my-12 md:rounded-3xl md:border md:border-border md:bg-card md:shadow-card md:overflow-hidden md:pb-8"
    >
      <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col items-center justify-center gap-3 px-6 text-muted-foreground">
        <Loader2 size={20} aria-hidden="true" className="animate-spin" />
        <span className="text-[13px]">Cargando…</span>
      </div>
    </div>
  );
}

function CapturePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const { user } = useSession();
  const online = useOnline();

  // Submit state — true while we await the Supabase ACK. The form is read-only
  // during this window so the user can't double-submit.
  const [submitting, setSubmitting] = React.useState(false);
  // Edit-mode hydration flag — when `?edit=<id>` is present we block the form
  // until `getTransactionById` resolves, so we never render an empty keypad
  // with stale defaults that the user might accidentally save over the row.
  const [hydrating, setHydrating] = React.useState<boolean>(Boolean(editId));
  // When editing, preserve the original `occurred_at` so re-saving doesn't
  // shift the row's timestamp to "now". Captured during hydration; sent
  // verbatim in `updateTransaction`.
  const [editOriginalOccurredAt, setEditOriginalOccurredAt] = React.useState<
    string | null
  >(null);

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
  // Merchant selection — optional. Always reset to null when the category
  // changes (merchants are scoped per-category) and after a successful save
  // so the next capture starts clean. `null` is a valid value at insert
  // time — the `transactions.merchant_id` column is nullable.
  const [merchantId, setMerchantId] = React.useState<string | null>(null);

  // Edit-mode hydration: when `?edit=<id>` is in the URL we fetch the row
  // and seed every form field from it. If the row is gone (archived from
  // another device, or never owned by this user) we toast + redirect to
  // /movements per the spec scenario "Edit a row already archived elsewhere".
  React.useEffect(() => {
    if (!editId) return;
    if (!SUPABASE_ENABLED) {
      // No backend in demo mode; treat the edit param as a soft redirect so
      // the user lands somewhere sane instead of a half-loaded form.
      router.replace("/movements");
      return;
    }
    let cancelled = false;
    setHydrating(true);
    void (async () => {
      try {
        const tx = await getTransactionById(editId);
        if (cancelled) return;
        if (!tx) {
          toast.error("Este movimiento ya no existe.");
          router.replace("/movements");
          return;
        }
        setAmountBuffer(formatAmountToBuffer(tx.amount));
        setCurrency(tx.currency);
        setKind(tx.kind);
        setCategoryId(tx.categoryId);
        setAccountId(tx.accountId);
        setMerchantId(tx.merchantId);
        setNote(tx.note ?? "");
        setEditOriginalOccurredAt(tx.occurredAt);
      } catch (err) {
        if (cancelled) return;
        toast.error(
          err instanceof Error
            ? err.message
            : "No pudimos cargar el movimiento.",
        );
        router.replace("/movements");
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editId, router]);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = React.useState(false);
  const [accountDrawerOpen, setAccountDrawerOpen] = React.useState(false);
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
      const next = s === "0" ? k : s + k;
      // Cap to 2 decimals.
      const dot = s.indexOf(".");
      if (dot >= 0 && s.length - dot > 2) return s;
      // Spend cap — refuse keypresses that would push the amount past the
      // hard upper bound. Prevents the user from typing a value the data
      // layer is going to reject anyway. Silent ignore: no toast spam on
      // every digit, the displayed amount simply stops growing.
      const prospective = parseAmount(next);
      if (prospective > MAX_TRANSACTION_AMOUNT) return s;
      return next;
    });
  }, []);

  const handleSave = React.useCallback(async () => {
    if (!ready || submitting || hydrating) return;

    // Spend cap guard — belt-and-braces in case the keypad somehow let a
    // value through (paste, autocomplete, future scanner integration). The
    // data layer also enforces this; we mirror it here so the user gets a
    // clear toast instead of a generic write error.
    if (amount > MAX_TRANSACTION_AMOUNT) {
      toast.error(
        `El monto no puede superar ${MAX_TRANSACTION_AMOUNT.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
      );
      return;
    }

    // Demo mode (no Supabase): keep the legacy success-banner behaviour so
    // the UI is still demo-able without env vars. Reset + delayed nav.
    if (!SUPABASE_ENABLED) {
      const ts = Date.now();
      setSaved({ ts });
      setAmountBuffer("");
      setNote("");
      setMerchantId(null);
      const firstExpense = categories.find((c) => c.defaultKind === "expense");
      setCategoryId(firstExpense?.id ?? categories[0]?.id ?? null);
      window.setTimeout(() => {
        router.push("/dashboard");
      }, 1400);
      return;
    }

    if (!user) {
      toast.error("Necesitás iniciar sesión para registrar movimientos.");
      return;
    }
    if (!online) {
      // Offline guard — Save is also disabled in the UI; this is the
      // belt-and-braces backup.
      toast.error("Sin conexión — vas a poder guardar cuando vuelva la red.");
      return;
    }
    if (!categoryId || !accountId || amount <= 0) {
      toast.error("Completá monto, categoría y cuenta para guardar.");
      return;
    }

    const draft: TransactionDraft = {
      amount,
      currency,
      kind,
      categoryId,
      merchantId,
      accountId,
      note: note.trim() ? note.trim() : null,
      // In edit mode, preserve the original timestamp; in create mode let
      // the DB default `occurred_at` to `now()` server-side.
      ...(editId && editOriginalOccurredAt
        ? { occurredAt: editOriginalOccurredAt }
        : {}),
    };

    setSubmitting(true);
    try {
      if (editId) {
        await updateTransaction(editId, draft);
        toast.success("Movimiento actualizado.");
        router.push("/movements");
      } else {
        await createTransaction(draft);
        toast.success("Guardado.");
        router.push("/dashboard");
      }
      // Don't reset state on success: the page is unmounting via navigation.
      // Keeping `submitting=true` until unmount also blocks any double-tap.
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "No pudimos guardar el movimiento.",
      );
      setSubmitting(false);
    }
  }, [
    ready,
    submitting,
    hydrating,
    user,
    online,
    categoryId,
    accountId,
    amount,
    currency,
    kind,
    merchantId,
    note,
    editId,
    editOriginalOccurredAt,
    router,
    categories,
  ]);

  const handlePickCategory = React.useCallback(
    (id: CategoryId) => {
      setCategoryId(id);
      setCategoryDrawerOpen(false);
      // Merchants are scoped per-category — switching categories MUST clear
      // the previously-selected merchant. The MerchantPicker also bails out
      // visually when the category has no merchants, but the state reset is
      // what guarantees we never persist a cross-category id on save.
      setMerchantId(null);
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

          {/* Kind toggle (gasto / ingreso) — bigger pill on mobile so it
              reads as a primary control next to the amount; reverts to the
              tighter desktop sizing at md+ where the header has more chrome
              competing for visual weight. mx-auto keeps it visually anchored
              between the back button and the currency cluster on small
              screens. */}
          <div
            role="radiogroup"
            aria-label="Tipo de movimiento"
            className="mx-auto flex h-11 items-center gap-0.5 rounded-full bg-muted p-0.5 md:h-9"
          >
            <button
              type="button"
              role="radio"
              aria-checked={kind === "expense"}
              onClick={() => setKind("expense")}
              className={cn(
                "rounded-full px-4 text-sm font-semibold transition-colors md:px-3.5 md:text-xs",
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
                "rounded-full px-4 text-sm font-semibold transition-colors md:px-3.5 md:text-xs",
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
              "mt-2 font-semibold tabular-nums leading-none tracking-tight",
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

        {/* Offline banner — visible when the browser reports `offline`. The
            Save button is also disabled in that state; this just makes the
            "why is Save grey" visible to the user. */}
        {!online ? (
          <div
            role="status"
            aria-live="polite"
            className="mx-4 mt-3 rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
          >
            Sin conexión — vas a poder guardar cuando vuelva la red.
          </div>
        ) : null}

        {/* Hydrating overlay — when arriving via `?edit=<id>`, block the
            form behind a friendly spinner until the row is loaded. Avoids
            the "user types over the wrong amount before hydration lands"
            footgun. */}
        {hydrating ? (
          <div
            role="status"
            aria-live="polite"
            className="mx-4 mt-3 flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-3 text-[13px] text-muted-foreground"
          >
            <Loader2 size={16} aria-hidden="true" className="animate-spin" />
            <span>Cargando movimiento…</span>
          </div>
        ) : null}

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

        {/* Merchant picker — "¿Dónde? (opcional)". Renders nothing when
            there's no category context or the category has zero visible
            merchants, so the 3-tap happy path stays untouched. */}
        <MerchantPicker
          categoryId={categoryId}
          categoryName={category?.label ?? null}
          value={merchantId}
          onChange={setMerchantId}
        />

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

          {/* TODO(ux): note input se quitó de mobile. Reubicar — quizás en
              una expand-on-demand row inline. El state `note` y el
              `noteDrawer` siguen montados para que la hidratación de edit
              mode (que puede traer una nota guardada) no se rompa: el draft
              sigue persistiendo `note` en handleSave. */}
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
            disabled={!ready || submitting || hydrating || !online}
            aria-label={saveAriaLabel}
            aria-busy={submitting}
            className={cn(
              "h-14 w-full rounded-full text-base font-bold transition-transform",
              "active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50",
            )}
            style={
              ready && !submitting && !hydrating && online
                ? { boxShadow: "var(--shadow-fab)" }
                : undefined
            }
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 size={18} aria-hidden="true" className="animate-spin" />
                <span>Guardando…</span>
              </span>
            ) : editId ? (
              "Guardar cambios"
            ) : kind === "income" ? (
              "Guardar ingreso"
            ) : (
              "Guardar gasto"
            )}
          </Button>

          <button
            type="button"
            onClick={() => setCategoryDrawerOpen(true)}
            disabled={!ready || submitting || hydrating}
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

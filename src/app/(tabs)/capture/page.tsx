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
  ChevronDown,
  ChevronRight,
  Wallet,
  CreditCard,
  Landmark,
  Loader2,
  Pencil,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { CURRENCY_LABEL } from "@/lib/money";
import { CurrencySwitch } from "@/components/lumi/CurrencySwitch";
import { useActiveCurrency } from "@/hooks/use-active-currency";
import { formatLimaDate } from "@/lib/format-tx-date";
import { useActiveAccountId } from "@/hooks/use-active-account-id";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  accountDisplayLabel,
  listAccounts,
  ACCOUNT_UPSERTED_EVENT,
  type Account as DataAccount,
} from "@/lib/data/accounts";
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
import {
  checkExpenseBalance,
  BALANCE_GUARD_TITLE,
} from "@/lib/data/balances";
import { useAccountBalances } from "@/hooks/use-account-balances";
import { SavingOverlay } from "@/components/lumi/SavingOverlay";
import { ActionResultDrawer } from "@/components/lumi/ActionResultDrawer";
import { AccountBrandIcon } from "@/components/lumi/AccountBrandIcon";
import { accountChipBgClass } from "@/lib/account-brand-slug";
import { getCategoryIcon } from "@/lib/category-icons";
import { Skeleton } from "@/components/ui/skeleton";
import { MerchantPicker } from "@/components/lumi/MerchantPicker";
import { useOnline } from "@/hooks/use-online";
import { useSession } from "@/lib/use-session";
import { captureActionBus } from "@/lib/capture-action-bus";

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
  kind: "cash" | "card" | "bank" | "yape" | "plin";
  currency: Currency;
  /** Optional product subtype (sueldo / dólares / crédito…). Carried here
   * so the drawer + the picker chip can render `BCP · Sueldo`. */
  subtype: import("@/lib/data/accounts").AccountSubtype | null;
  Icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
};

// Income flow used to hide bank/Plin accounts under a curated allow-list,
// but a bank account is the natural target for a salary deposit — filtering
// it out broke the most common income capture in Peru. We now keep every
// active account visible on income, same as expense.

// Map an account kind to its icon. Used to "rehydrate" the lucide icon for
// rows that come from the data layer (which doesn't carry React components).
// Yape/Plin reuse Wallet so the picker chip stays visually consistent —
// the brand label below ("Yape"/"Plin") is what disambiguates.
const ACCOUNT_KIND_ICON: Record<
  Account["kind"],
  React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>
> = {
  cash: Wallet,
  card: CreditCard,
  bank: Landmark,
  yape: Wallet,
  plin: Wallet,
};

function fromDataAccount(a: DataAccount): Account {
  return {
    id: a.id,
    label: a.label,
    kind: a.kind,
    currency: a.currency,
    subtype: a.subtype,
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
  { id: "cash", label: "Efectivo", kind: "cash", currency: "PEN", subtype: null, Icon: Wallet },
  { id: "card", label: "Tarjeta", kind: "card", currency: "PEN", subtype: null, Icon: CreditCard },
  { id: "bank", label: "Banco",   kind: "bank", currency: "USD", subtype: null, Icon: Landmark },
];

// MRU mock — first three categories shown inline above the keypad in demo
// mode. In real mode we default the strip to the first 3 expense categories
// alphabetically (see CapturePage). TODO: replace with real MRU based on
// transaction history once that data layer lands.
const MRU_CATEGORY_IDS: CategoryId[] = ["food", "transport", "fun"];

// ─── Date helpers ─────────────────────────────────────────────────────────

/**
 * Today as YYYY-MM-DD in America/Lima time. The default for the new
 * tx-date chip on the capture screen so a Peruvian user always starts
 * on "today" regardless of where Vercel serves the page from.
 */
function todayLimaDate(): string {
  return formatLimaDate(new Date());
}

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
        "flex h-14 items-center justify-center rounded-2xl border-0 text-2xl font-medium tabular-nums text-foreground",
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
  // Currency is unified with the rest of the app via `useActiveCurrency`
  // (persisted in `lumi-prefs`). Edit-mode hydration calls `setCurrency` to
  // align the global preference with the loaded transaction.
  const { currency, setCurrency } = useActiveCurrency();
  // Seed the dashboard's account-card carousel with the account the user
  // chose here, so when we redirect to /dashboard after save the carousel
  // lands on that card. Same lumi-prefs JSON that useActiveCurrency uses;
  // useSyncExternalStore on the read side picks up our write synchronously.
  const { setActiveAccountId } = useActiveAccountId();
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
  // When the user picks a category from the "Ver todos" drawer that
  // ISN'T in the default visible trio (e.g. Salud / Ocio while in expense
  // mode), we pin it to the head of the chip strip so the chosen card is
  // visually anchored next to Comida / Transporte / etc. Cleared on kind
  // change because the visible trio depends on kind. Mirrors the same
  // pinning logic in MerchantPicker.
  const [pinnedCategoryId, setPinnedCategoryId] = React.useState<CategoryId | null>(null);

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
  // Per-account balances for the active currency. Hook handles refetch on
  // currency switch + a `reload()` for the inline-abono flow below. Demo
  // mode (no Supabase) skips fetching and resolves immediately so the
  // picker doesn't pin on a skeleton.
  const { balances, balancesLoaded, reload: reloadBalances } =
    useAccountBalances(currency, { skip: !SUPABASE_ENABLED });
  // Modal shown on the expense flow when the picked account either has no
  // saldo at all (`empty`) or has saldo but less than the typed amount
  // (`insufficient`). Same Drawer, two copies — keeps the dismiss UX
  // identical so the user always knows how to close.
  const [noBalanceOpen, setNoBalanceOpen] = React.useState(false);
  const [noBalanceReason, setNoBalanceReason] = React.useState<
    "empty" | "insufficient"
  >("empty");
  // Abono inline form inside the saldo modal. When the user hits "sin
  // saldo" mid-capture, they can recharge the account in place instead of
  // bouncing to a separate flow and losing the in-flight expense draft.
  // Mode flag toggles between the 3-button decision view and the amount-
  // input view; amount string mirrors the keypad-buffer shape so it
  // round-trips through parseAmount cleanly.
  const [abonoMode, setAbonoMode] = React.useState(false);
  const [abonoAmount, setAbonoAmount] = React.useState("");
  const [abonoSubmitting, setAbonoSubmitting] = React.useState(false);
  // Post-abono success drawer — replaces the green sonner toast with a
  // proper modal acknowledgement so the user clearly sees the saldo
  // landed before going back to the keypad.
  const [abonoSuccessOpen, setAbonoSuccessOpen] = React.useState(false);
  const [abonoSuccessAmount, setAbonoSuccessAmount] = React.useState(0);
  // When the user hits Save without a picked account, we open the account
  // drawer instead of saving. This flag rides through that round-trip so
  // the picker callback knows to fire handleSave automatically once the
  // user confirms. False after a normal manual open of the drawer.
  const [pendingSave, setPendingSave] = React.useState(false);
  // Currency-scoped account list — when the user is in USD, we hide PEN
  // accounts (and vice versa) so it's impossible to record a USD movement
  // against a soles account by accident. Drives both the picker drawer and
  // the currently-selected chip on the keypad screen.
  const availableAccounts = React.useMemo(
    () => accounts.filter((a) => a.currency === currency),
    [accounts, currency],
  );

  // Currency switch retargets the account: if a previously-selected one no
  // longer matches the active currency, drop it so the modal-on-save flow
  // forces a fresh pick. We never auto-select on currency change — the user
  // explicitly chose "no defaults" to prevent silent mistakes.
  React.useEffect(() => {
    if (!accountId) return;
    if (accounts.length === 0) return;
    const current = accounts.find((a) => a.id === accountId);
    if (current && current.currency === currency) return;
    setAccountId(null);
  }, [currency, accounts, accountId]);

  // Load real accounts when Supabase is configured. Refetched on the
  // `account:upserted` event AND on visibility / focus / pageshow so a
  // freshly-created account in /accounts shows up here without forcing
  // the user to reload — same pattern as /dashboard's account list.
  // Default-select is intentionally OFF: forcing the user to pick on
  // every save (via the modal-on-check flow) prevents silent mistakes
  // (people recording against the wrong account when alphabetical
  // defaulting kicked in).
  React.useEffect(() => {
    if (!SUPABASE_ENABLED) return;
    let cancelled = false;
    const reloadAccounts = async () => {
      try {
        const list = await listAccounts();
        if (cancelled) return;
        const mapped = list.map(fromDataAccount);
        setAccounts(mapped);
      } catch {
        // Soft-fail: keep accounts empty; the picker shows an empty state.
      } finally {
        if (!cancelled) setAccountsLoading(false);
      }
    };
    void reloadAccounts();

    const handler = () => {
      void reloadAccounts();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void reloadAccounts();
    };
    globalThis.addEventListener(ACCOUNT_UPSERTED_EVENT, handler);
    globalThis.addEventListener("focus", handler);
    globalThis.addEventListener("pageshow", handler);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      globalThis.removeEventListener(ACCOUNT_UPSERTED_EVENT, handler);
      globalThis.removeEventListener("focus", handler);
      globalThis.removeEventListener("pageshow", handler);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  const [note, setNote] = React.useState("");
  // The note input expands inline below the amount when the user taps
  // the "Agregar nota" pill. Auto-expands when there's already content
  // (edit-mode hydration) so the user sees the existing text.
  const [noteOpen, setNoteOpen] = React.useState(false);

  // Merchant selection — optional. Always reset to null when the category
  // changes (merchants are scoped per-category) and after a successful save
  // so the next capture starts clean. `null` is a valid value at insert
  // time — the `transactions.merchant_id` column is nullable.
  const [merchantId, setMerchantId] = React.useState<string | null>(null);

  // Tx date — currently always "today" since the picker chip was
  // removed per UX feedback. Kept as state (not a constant) so the
  // existing save path still passes it through, and so we can
  // resurface the date picker later without re-plumbing.
  const [txDate, setTxDate] = React.useState<string>(() =>
    todayLimaDate(),
  );

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
        // Edit-mode: open the note input so the existing text is visible
        // without forcing the user to tap the pill first.
        if (tx.note && tx.note.trim().length > 0) setNoteOpen(true);
        setTxDate(tx.occurredAt.slice(0, 10));
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
  }, [editId, router, setCurrency]);
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

  // ── Selected account + projected balance ───────────────────────────────
  // Drives the inline account chip + saldo warning. When the user has
  // no account picked yet, the chip becomes a "Elige una cuenta" CTA.
  const selectedAccount: Account | null =
    accounts.find((a) => a.id === accountId) ?? null;
  const currentBalance: number | null =
    accountId && balancesLoaded ? (balances[accountId] ?? 0) : null;
  const projectedBalance: number | null =
    currentBalance === null
      ? null
      : kind === "expense"
        ? currentBalance - amount
        : currentBalance + amount;
  // Saldo overdraft is handled by a HARD BLOCK at Save time (the
  // 'Saldo insuficiente' Drawer further down). No inline derivations
  // needed at the page level for the previous soft-warning chip.
  // When the user toggles between expense and income, the merchant picker
  // and the category column must reconcile:
  //   - income has no merchant (you receive money, you don't pay anyone),
  //   - the category column should always match the active kind so we don't
  //     save a Comida-tagged income (which would then surface restaurants
  //     from the merchant catalogue if the user toggles back to expense).
  // Account filtering is intentionally NOT applied — bank accounts are the
  // most common income target and removing them broke the salary flow.
  React.useEffect(() => {
    if (kind === "income") {
      if (merchantId !== null) setMerchantId(null);
      const incomeCategories = categories.filter(
        (c) => c.defaultKind === "income",
      );
      const currentMatches = categories.find(
        (c) => c.id === categoryId && c.defaultKind === "income",
      );
      if (!currentMatches) {
        setCategoryId(incomeCategories[0]?.id ?? null);
      }
    } else {
      const currentIsIncome = categories.find(
        (c) => c.id === categoryId && c.defaultKind === "income",
      );
      if (currentIsIncome) {
        const firstExpense = categories.find(
          (c) => c.defaultKind === "expense",
        );
        setCategoryId(firstExpense?.id ?? null);
      }
    }
    // We only react to kind / categories changes; the *Id reads inside the
    // body are intentional reconcile inputs and converge in a single pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, categories]);

  // `account` may be null briefly while we wait for the first fetch tick.
  // The picker chip shows a skeleton in that window; downstream consumers
  // (saveAriaLabel, save handler) coalesce to safe defaults.
  const account: Account | null =
    availableAccounts.find((a) => a.id === accountId) ??
    availableAccounts[0] ??
    null;

  // MRU strip — kind-aware ordering.
  //
  // EXPENSE: pin Comida → Transporte → Salud at the front (the canonical
  // primary trio), then the user's MRU minus duplicates and minus "Ahorro"
  // (a savings bucket that should NOT appear on the expense capture flow,
  // even while it's still seeded as kind=expense — migration 00010 flips it
  // to income, but we filter explicitly so the UX is right today).
  // INCOME: simply filter to income-kind categories so "Trabajo" (and
  // "Ahorro" once 00010 is applied) surface naturally.
  //
  // Demo mode keeps its legacy mock-driven strip for backward compat.
  const PRIMARY_EXPENSE_NAMES = React.useMemo(
    () => ["Comida", "Transporte", "Salud"],
    [],
  );
  const mruCategories = React.useMemo<Category[]>(() => {
    // Build the default trio first, then pin a recently-picked category
    // at the head if the user reached for one outside the trio. Same
    // pattern as MerchantPicker's `visible` memo.
    const buildDefault = (): Category[] => {
      if (!SUPABASE_ENABLED) {
        const ids =
          kind === "income"
            ? categories.filter((c) => c.defaultKind === "income").map((c) => c.id)
            : MRU_CATEGORY_IDS;
        return ids
          .map((id) => categories.find((c) => c.id === id))
          .filter((c): c is Category => Boolean(c));
      }
      if (kind === "income") {
        return categories.filter((c) => c.defaultKind === "income");
      }
      const primary = PRIMARY_EXPENSE_NAMES.map((name) =>
        categories.find(
          (c) => c.label === name && c.defaultKind === "expense",
        ),
      ).filter((c): c is Category => Boolean(c));
      const primaryIds = new Set(primary.map((c) => c.id));
      const rest = categories.filter(
        (c) =>
          !primaryIds.has(c.id) &&
          c.defaultKind === "expense" &&
          c.label !== "Ahorro",
      );
      return [...primary, ...rest];
    };

    const defaults = buildDefault();
    const head: Category[] = [];
    const seen = new Set<CategoryId>();
    if (
      pinnedCategoryId &&
      !defaults.slice(0, 3).some((c) => c.id === pinnedCategoryId)
    ) {
      const pinned = categories.find((c) => c.id === pinnedCategoryId);
      if (pinned) {
        head.push(pinned);
        seen.add(pinned.id);
      }
    }
    for (const c of defaults) {
      if (head.length >= 3) break;
      if (seen.has(c.id)) continue;
      head.push(c);
      seen.add(c.id);
    }
    return head;
  }, [categories, kind, PRIMARY_EXPENSE_NAMES, pinnedCategoryId]);

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

    // Category is mandatory — defense-in-depth in case the FAB is somehow
    // triggered while categoryId is null (the bus also blocks this via the
    // `ready` flag, but we mirror it here so the user gets a clear toast
    // instead of silently saving into "ninguna categoría").
    if (!categoryId) {
      toast.error("Elige una categoría antes de guardar.");
      return;
    }

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
      setNoteOpen(false);
      setTxDate(todayLimaDate());
      setMerchantId(null);
      const firstExpense = categories.find((c) => c.defaultKind === "expense");
      setCategoryId(firstExpense?.id ?? categories[0]?.id ?? null);
      // Seed the carousel even in demo mode so the same UX guarantees hold:
      // tap an account → save → land on that card.
      if (accountId) setActiveAccountId(accountId);
      window.setTimeout(() => {
        router.push("/dashboard");
      }, 1400);
      return;
    }

    if (!user) {
      toast.error("Necesitas iniciar sesión para registrar movimientos.");
      return;
    }
    if (!online) {
      // Offline guard — Save is also disabled in the UI; this is the
      // belt-and-braces backup.
      toast.error("Sin conexión — podrás guardar cuando vuelva la red.");
      return;
    }
    if (amount <= 0 || !categoryId) {
      toast.error("Completa monto y categoría para guardar.");
      return;
    }
    // No account picked yet — open the account drawer instead of saving.
    // The pendingSave flag tells the picker callback to fire handleSave
    // automatically once the user confirms a choice.
    if (!accountId) {
      setPendingSave(true);
      setAccountDrawerOpen(true);
      return;
    }
    // Saldo guard — hard block on overdraft. Shared with /receipt via
    // `checkExpenseBalance`. The user explicitly asked for a modal on
    // Save instead of an inline warning that could be ignored (the
    // previous soft-warning approach silently saved over-balance txs
    // and turned the dashboard's saldo red).
    const balanceCheck = checkExpenseBalance({
      kind,
      amount,
      accountId,
      balances,
      balancesLoaded,
    });
    if (!balanceCheck.ok) {
      setPendingSave(false);
      setNoBalanceReason(balanceCheck.reason);
      setNoBalanceOpen(true);
      return;
    }

    // Date logic for the new tx-date chip:
    //   - Edit mode keeps the original timestamp untouched (so editing a
    //     forgotten field doesn't bump the row to "now").
    //   - Create mode + txDate === today: omit occurredAt → DB default
    //     `now()` wins (full precision, matches wall clock).
    //   - Create mode + txDate !== today: send a noon-Lima timestamp on
    //     the chosen date. The user is back-filling a past expense; the
    //     hour doesn't matter, the day does.
    const customDate = !editId && txDate !== todayLimaDate();
    const customOccurredAtIso = customDate
      ? `${txDate}T17:00:00.000Z` // 17:00 UTC = 12:00 Lima (UTC-5)
      : null;

    const draft: TransactionDraft = {
      amount,
      currency,
      kind,
      categoryId,
      merchantId,
      accountId,
      note: note.trim() ? note.trim() : null,
      ...(editId && editOriginalOccurredAt
        ? { occurredAt: editOriginalOccurredAt }
        : customOccurredAtIso
          ? { occurredAt: customOccurredAtIso }
          : {}),
    };

    setSubmitting(true);
    try {
      if (editId) {
        await updateTransaction(editId, draft);
        // Seed the active account so /movements (and any later /dashboard
        // visit) reflects the most recently touched account. Both create
        // and update flows write the same key for consistency.
        setActiveAccountId(accountId);
        router.push("/movements");
      } else {
        await createTransaction(draft);
        // Persist the just-used account id BEFORE the redirect. The
        // dashboard's carousel reads via useSyncExternalStore so this
        // write is visible on its very first render — no flash of the
        // previous active card. Was the source of bug #X: "I capture from
        // BBVA but the dashboard opens on Yape."
        setActiveAccountId(accountId);
        // `router.refresh()` invalidates the App Router cache so the
        // dashboard's server boundary re-runs. Combined with the
        // `tx:upserted` listener mounted in /dashboard, this collapses
        // the user-perceived stale-numbers window to zero.
        router.refresh();
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
    balances,
    balancesLoaded,
    currency,
    kind,
    merchantId,
    note,
    editId,
    editOriginalOccurredAt,
    txDate,
    router,
    categories,
    setActiveAccountId,
  ]);

  // Auto-save bridge — when the user hits Save without an account picked
  // we open the picker drawer and set pendingSave. This effect waits for
  // accountId to flip from null to a real id, then fires handleSave so the
  // user's intent (one tap on the check) carries through without a second
  // tap. We clear the flag BEFORE calling handleSave to short-circuit any
  // re-entry if handleSave's own guards (saldo, etc.) bounce.
  React.useEffect(() => {
    if (!pendingSave || !accountId) return;
    setPendingSave(false);
    void handleSave();
  }, [pendingSave, accountId, handleSave]);

  // FAB-as-save bridge — while /capture is mounted, the bottom-nav center
  // button (rendered in the (tabs) layout) takes over save responsibility:
  // it shows a ✓ icon and calls handleSave(). We register both the handler
  // and a `ready` flag mirroring the EXACT disabled rules the legacy
  // "Guardar gasto" button used (`!ready || submitting || hydrating || !online`),
  // so the FAB visually matches the same enabled/disabled state.
  React.useEffect(() => {
    // Category is MANDATORY — a transaction with no category lands in
    // "ninguna categoría" which breaks reporting. Force the user to pick
    // before the FAB ✓ becomes active.
    const ready =
      !submitting && !hydrating && online && amount > 0 && categoryId !== null;
    captureActionBus.setSaveHandler(() => {
      handleSave();
    }, ready);
    return () => {
      // Clear on unmount/navigation so the FAB on other tabs doesn't keep
      // a stale closure pointing at an unmounted handler.
      captureActionBus.setSaveHandler(null, false);
    };
  }, [handleSave, submitting, hydrating, online, amount, categoryId]);

  const handlePickCategory = React.useCallback(
    (id: CategoryId) => {
      setCategoryId(id);
      setCategoryDrawerOpen(false);
      // Pin the picked category to the head of the visible strip when it
      // wasn't already there. Same UX as MerchantPicker — the chosen
      // badge is anchored next to the default trio so the user sees their
      // pick land in the row instead of just "Ver todos" highlighted.
      const isAlreadyVisible = mruCategories.some((c) => c.id === id);
      if (!isAlreadyVisible) setPinnedCategoryId(id);
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
    [kind, categories, mruCategories],
  );

  // Kind toggles between expense / income — the visible category trio
  // depends on kind, so a category pinned in one mode might not even
  // belong to the other. Cleanest reset is to drop the pin on every
  // kind change and let the user re-pin if they reach for an extra.
  React.useEffect(() => {
    setPinnedCategoryId(null);
  }, [kind]);

  const saveAriaLabel = !ready
    ? "Ingrese un monto primero"
    : `Guardar ${kind === "income" ? "ingreso" : "gasto"} de ${formatMoney(amount, currency)}${category ? ` en ${category.label}` : ""}${account ? `, cuenta ${accountDisplayLabel(account)}` : ""}`;

  // Inline-abono confirm. Records an income transaction against the same
  // account the saldo modal was triggered for, refreshes the balances map
  // so the saldo guard re-evaluates against the new state, and closes the
  // modal so the user is back on the keypad with their original expense
  // draft intact. category_id stays null — an "abono manual" is closer to
  // a deposit/recharge than a real income source, so we don't force it
  // into Trabajo or Ahorro by default. The user can re-categorise from
  // /movements if they want.
  const handleAbono = React.useCallback(async () => {
    if (!accountId) return;
    const n = parseAmount(abonoAmount);
    if (n <= 0) {
      toast.error("Ingresa un monto válido para abonar.");
      return;
    }
    if (n > MAX_TRANSACTION_AMOUNT) {
      toast.error("El monto excede el máximo permitido.");
      return;
    }
    setAbonoSubmitting(true);
    try {
      await createTransaction({
        amount: n,
        currency,
        kind: "income",
        categoryId: null,
        merchantId: null,
        accountId,
        note: "Abono manual",
      });
      // Refresh the balances map so the saldo guard now sees the new
      // total and the picker rows reflect it. Best-effort — if it fails
      // the next legitimate fetch will catch up. (Hook swallows errors.)
      await reloadBalances();
      // Replace the old green sonner toast with a proper modal — the
      // user explicitly asked for the new acknowledgement pattern. We
      // close the saldo modal first so the success drawer doesn't stack
      // on top of it, capture the amount we just confirmed for the
      // success body, then open the result drawer.
      setAbonoMode(false);
      setAbonoAmount("");
      setNoBalanceOpen(false);
      setAbonoSuccessAmount(n);
      setAbonoSuccessOpen(true);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "No pudimos registrar el abono.",
      );
    } finally {
      setAbonoSubmitting(false);
    }
  }, [accountId, abonoAmount, currency, reloadBalances]);

  // Reset abono state every time the saldo modal closes — opening it again
  // for a different account/amount should always start at the 3-button
  // decision view, not at a half-typed abono input. Also clear pendingSave
  // so closing this modal can never retroactively auto-fire handleSave —
  // the user dismissed, that's the answer.
  function handleNoBalanceOpenChange(next: boolean) {
    setNoBalanceOpen(next);
    if (!next) {
      setAbonoMode(false);
      setAbonoAmount("");
      setAbonoSubmitting(false);
      setPendingSave(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col bg-background pb-32 text-foreground md:min-h-0 md:max-w-md md:mx-auto md:my-12 md:rounded-3xl md:border md:border-border md:bg-card md:shadow-card md:overflow-hidden md:pb-8">
      <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col">
        {/* Header — back + camera flank a centered kind-toggle TITLE.
            The kind toggle replaces the old "Cuánto gastaste/entró" eyebrow
            (now removed) so the very first thing the user sees is the
            primary mode switch, occupying the title slot. */}
        <header className="flex items-center justify-between px-4 pt-3">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Volver"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>

          {/* Kind toggle — promoted to the title slot. Bigger pill, more
              presence; this is the page's headline. */}
          <div
            role="radiogroup"
            aria-label="Tipo de movimiento"
            className="mx-auto inline-flex h-12 items-center gap-0.5 rounded-full bg-muted p-1"
          >
            <button
              type="button"
              role="radio"
              aria-checked={kind === "expense"}
              onClick={() => setKind("expense")}
              className={cn(
                "inline-flex h-10 min-w-[110px] items-center justify-center rounded-full text-base font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                kind === "expense"
                  ? "bg-red-500/15 text-red-700 shadow-[var(--shadow-xs)] dark:bg-red-500/25 dark:text-red-200"
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
                "inline-flex h-10 min-w-[110px] items-center justify-center rounded-full text-base font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                kind === "income"
                  ? "bg-emerald-500/15 text-emerald-700 shadow-[var(--shadow-xs)] dark:bg-emerald-500/25 dark:text-emerald-200"
                  : "text-muted-foreground",
              )}
            >
              Ingreso
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Camera shortcut — routes to the receipt-scan flow. The PEN/USD
                pill that used to live next to it has moved below the amount
                (see CurrencySwitch slot) per the new title-as-toggle layout. */}
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

        {/* Amount display — eyebrow ("Cuánto gastaste / entró") removed; the
            kind toggle in the header now plays the title role. The compact
            currency chip floats absolutely to the left of the amount so the
            digits stay visually centred regardless of which currency is
            active (S/ vs $ have different glyph widths — using a flex row
            would shift the amount sideways on every toggle). */}
        <section
          className="relative px-6 pt-6 text-center md:px-8 md:pt-6"
          aria-live="polite"
        >
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 md:pl-8">
            <span className="pointer-events-auto">
              <CurrencySwitch variant="compact" />
            </span>
          </div>
          <div
            className={cn(
              "font-semibold tabular-nums leading-none tracking-tight",
              "text-[44px] md:text-[56px]",
              amountBuffer === "" ? "text-muted-foreground" : "text-foreground",
            )}
            style={{ fontFeatureSettings: '"tnum","lnum"' }}
          >
            {display}
          </div>
        </section>

        {/* ── Inline meta strip ─────────────────────────────────────────
            Replaces the old "Cuenta" card + "Hoy 11:45 BBVA" info bar
            with three compact controls right under the amount:
              1. "Agregar nota" pill that expands inline to a textarea
              2. Account chip with projected-balance chip beside it
              3. Date chip ("Hoy ⌄") tappable to a date picker drawer
              4. Saldo warning chip (only when overspending)
            The Yape-style layout puts the account front-and-center
            without competing with the amount. */}
        <div className="mx-4 mt-3 flex flex-col gap-2 md:mx-8">
          {/* Note pill / inline expander */}
          {noteOpen ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 240))}
                onBlur={() => {
                  if (note.trim().length === 0) setNoteOpen(false);
                }}
                placeholder="Escribe una nota corta…"
                rows={2}
                autoFocus
                maxLength={240}
                aria-label="Nota"
                className="w-full resize-none border-0 bg-transparent p-0 text-[14px] leading-snug text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
              />
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="tabular-nums">{note.length}/240</span>
                <button
                  type="button"
                  onClick={() => {
                    setNote("");
                    setNoteOpen(false);
                  }}
                  className="font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                  Quitar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              className="inline-flex items-center justify-center gap-1.5 self-center rounded-full border border-border bg-card px-3.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Pencil size={12} aria-hidden />
              {note.length > 0 ? note : "Agregar nota"}
            </button>
          )}

          {/* Account chip — inline, with projected balance hint. Tapping
              opens the existing accountDrawer (full picker). */}
          <button
            type="button"
            onClick={() => setAccountDrawerOpen(true)}
            className={cn(
              "flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2",
              "transition-colors hover:bg-muted",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            aria-label={
              selectedAccount
                ? `Cambiar cuenta. Actual: ${selectedAccount.label}`
                : "Elige una cuenta"
            }
          >
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
            >
              <Wallet size={15} />
            </span>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-[10px] font-medium uppercase leading-none tracking-wider text-muted-foreground">
                Cuenta
              </p>
              <p className="mt-0.5 truncate text-[13px] font-semibold leading-tight text-foreground">
                {selectedAccount ? selectedAccount.label : "Elige una cuenta"}
              </p>
            </div>
            {/* "Te queda" hint — only when the projection is strictly
                positive. Showing "S/ 0.00" or a clamped zero on overdraft
                misled users into thinking they had nothing left when in
                fact the typed amount overdrew the balance. The modal
                that fires on Save handles the overdraft case explicitly. */}
            {projectedBalance !== null && projectedBalance > 0 ? (
              <div className="flex shrink-0 flex-col items-end">
                <span className="text-[10px] font-medium uppercase leading-none tracking-wider text-muted-foreground">
                  Te queda
                </span>
                <span className="mt-0.5 text-[12px] font-bold leading-none tabular-nums text-foreground">
                  {formatMoney(projectedBalance, currency)}
                </span>
              </div>
            ) : null}
            <ChevronRight
              size={14}
              className="shrink-0 text-muted-foreground"
              aria-hidden
            />
          </button>

          {/* Date chip removed per user request — backfilling past
              dates was a low-frequency need. The state + helpers stay
              wired so we can resurface it from /settings or via a
              long-press shortcut later without touching this surface. */}

          {/* Inline saldo warning removed per user request. The hard
              block on Save handles the overdraft case via the existing
              "Saldo insuficiente" modal — same UX guarantee as before
              the soft-warning experiment. */}

          {/* Categoría card — moved INTO the meta strip so it shares
              the same `gap-2` rhythm as Cuenta. Tighter visual stack
              that lets more keypad rows breathe below. Hidden on
              income (the income flow auto-selects the first income
              category). */}
          {kind === "expense" && (
            <button
              type="button"
              onClick={() => setCategoryDrawerOpen(true)}
              disabled={categoriesLoading || categories.length === 0}
              aria-label={
                category
                  ? `Cambiar categoría. Actual: ${category.label}`
                  : "Elige una categoría"
              }
              aria-haspopup="dialog"
              aria-expanded={categoryDrawerOpen}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2",
                "transition-colors hover:bg-muted",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
              >
                {category?.Icon ? (
                  <category.Icon size={15} aria-hidden />
                ) : (
                  <Circle size={15} aria-hidden />
                )}
              </span>
              <div className="min-w-0 flex-1 text-left">
                <p className="text-[10px] font-medium uppercase leading-none tracking-wider text-muted-foreground">
                  Categoría
                </p>
                <p className="mt-0.5 truncate text-[13px] font-semibold leading-tight text-foreground">
                  {categoriesLoading
                    ? "Cargando…"
                    : (category?.label ?? "Elige una categoría")}
                </p>
              </div>
              <ChevronRight
                size={14}
                className="shrink-0 text-muted-foreground"
                aria-hidden
              />
            </button>
          )}
        </div>

        {/* Merchant picker — subido arriba (estaba debajo de los banners
            de offline / hydrating, lejos del contexto de la categoria).
            Aca queda pegado a Categoria, donde semanticamente vive
            ("comercio dentro de esta categoria"). Hidden en income — los
            ingresos no tienen comercio (recibis plata, no le pagas a
            nadie). El componente devuelve null cuando no hay categoria
            elegida o la categoria no tiene comercios visibles, asi que
            el 3-tap happy path del flow de captura no se afecta. */}
        {kind === "expense" && (
          <MerchantPicker
            categoryId={categoryId}
            categoryName={category?.label ?? null}
            value={merchantId}
            onChange={setMerchantId}
          />
        )}

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
            Sin conexión — podrás guardar cuando vuelva la red.
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

        {/* Categoría card moved up into the meta strip above so it
            shares the same gap-2 rhythm as the Cuenta card.
            MerchantPicker tambien se subio — ahora vive directamente
            debajo del meta strip, pegado a Categoria. */}

        {/* Inline account picker removed by design — saving now opens the
            account drawer when none is selected ("modal-on-check" flow).
            Forcing the explicit pick on every fresh entry stops users from
            silently saving against the alphabetically-first account. The
            chosen account is shown only inside the drawer. The merchant
            empty-state link to /accounts is gone too: the drawer's empty
            state covers that path. */}

        {/* Keypad — the in-page hint ("Toca Guardar o elige otra categoría")
            was removed; the bottom-nav save-FAB chevron below is the only
            wayfinding cue now. */}
        <div className="mt-3 px-2">
          <Keypad onPress={press} />
        </div>

        {/* Save is driven by the bottom-nav center FAB (✓ when on /capture)
            on mobile. Desktop has no TabBar (md:hidden), so we render a
            visible primary "Guardar" button below the keypad to make the
            action obvious. Both surfaces ultimately call handleSave with
            the same ready rules. */}
        <p className="sr-only" aria-live="polite">
          {saveAriaLabel}
        </p>

        {/* Desktop save button — md+ only. Mirrors the FAB ready rules so
            both UIs feel synchronised (e.g. amount typed without a category
            picked keeps both disabled). */}
        <div className="mt-5 hidden px-4 md:block">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={
              !ready || submitting || hydrating || !online || !categoryId
            }
            aria-label={saveAriaLabel}
            className={cn(
              "inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-[14px] font-semibold text-primary-foreground transition-colors",
              "shadow-[var(--shadow-card)] hover:bg-primary/90 active:bg-primary/80",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-primary",
            )}
          >
            {submitting ? (
              <Loader2
                size={16}
                aria-hidden="true"
                className="animate-spin"
              />
            ) : (
              <Check size={16} aria-hidden="true" />
            )}
            <span>
              {submitting
                ? "Guardando…"
                : `Guardar ${kind === "income" ? "ingreso" : "gasto"}`}
            </span>
          </button>
        </div>

        {/* Save hint — wayfinding for the mobile flow: with the in-page
            "Guardar gasto" button gone on touch, point the user to the
            central ✓ FAB in the bottom TabBar. Mobile-only because the
            desktop button above already carries the canonical action. */}
        <div
          aria-hidden="true"
          className="mt-6 flex flex-col items-center gap-1 text-muted-foreground md:hidden"
        >
          <span className="text-[12px] font-medium">Guardar</span>
          <ChevronDown
            className="h-5 w-5 animate-bounce [animation-duration:1.6s]"
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Saving veil — fixed full-viewport overlay (matches accounts /
          categories / settings UX). Replaces the inline absolute overlay +
          the green "Guardado." sonner toast that used to fire on success. */}
      <SavingOverlay open={submitting} />

      {/* Date drawer removed alongside the date chip. txDate state stays
          (always = today) so the save path keeps working. */}

      {/* Saldo guard — fires when picking an empty account on the expense
          flow, or when Save is hit against one. Short message, single
          dismiss action. */}
      <Drawer open={noBalanceOpen} onOpenChange={handleNoBalanceOpenChange}>
        <DrawerContent
          aria-describedby="capture-no-balance-desc"
          className="bg-background"
        >
          <DrawerHeader>
            <DrawerTitle>
              {BALANCE_GUARD_TITLE[noBalanceReason]}
            </DrawerTitle>
            <DrawerDescription id="capture-no-balance-desc">
              {noBalanceReason === "empty"
                ? "Esta cuenta no tiene saldo para realizar esta operación."
                : "El monto del gasto supera el saldo de esta cuenta."}
              {accountId && balancesLoaded ? (
                <span className="mt-1 block text-foreground">
                  Saldo actual:{" "}
                  <span className="font-semibold tabular-nums">
                    {formatMoney(balances[accountId] ?? 0, currency)}
                  </span>
                </span>
              ) : null}
            </DrawerDescription>
          </DrawerHeader>
          {abonoMode ? (
            <div className="flex flex-col gap-3 px-4 pb-6">
              <label className="block">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                  ¿Cuánto quieres abonar?
                </span>
                <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5 focus-within:ring-2 focus-within:ring-ring">
                  <span className="text-[14px] font-medium text-muted-foreground">
                    {currency === "USD" ? "$" : "S/"}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    value={abonoAmount}
                    onChange={(e) => {
                      // Accept digits + a single decimal separator. Strip
                      // anything else so paste of "S/ 100,50" still works.
                      const raw = e.target.value.replace(/[^0-9.,]/g, "");
                      // Normalise comma → dot for parseFloat downstream.
                      setAbonoAmount(raw.replace(",", "."));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void handleAbono();
                      }
                    }}
                    placeholder="0.00"
                    aria-label="Monto a abonar"
                    className="flex-1 bg-transparent text-[16px] font-semibold tabular-nums outline-none placeholder:text-muted-foreground/50"
                    style={{ fontFeatureSettings: '"tnum","lnum"' }}
                  />
                </div>
              </label>
              {/* Quick-amount chips. Round numbers most users land on for a
                  manual recharge — they tap-and-confirm in two clicks. */}
              <div className="flex flex-wrap gap-2">
                {(currency === "USD"
                  ? ["20", "50", "100", "200"]
                  : ["50", "100", "200", "500"]
                ).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setAbonoAmount(preset)}
                    className="inline-flex h-8 items-center justify-center rounded-full border border-border bg-card px-3 text-[12px] font-semibold tabular-nums text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {currency === "USD" ? "$" : "S/"} {preset}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => void handleAbono()}
                disabled={abonoSubmitting || parseAmount(abonoAmount) <= 0}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-foreground text-[14px] font-semibold text-background transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                {abonoSubmitting ? (
                  <>
                    <Loader2 size={14} aria-hidden="true" className="animate-spin" />
                    Registrando…
                  </>
                ) : (
                  <>
                    Confirmar abono
                    {parseAmount(abonoAmount) > 0
                      ? ` · ${formatMoney(parseAmount(abonoAmount), currency)}`
                      : ""}
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAbonoMode(false);
                  setAbonoAmount("");
                }}
                disabled={abonoSubmitting}
                className="inline-flex h-9 w-full items-center justify-center rounded-xl text-[13px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                Volver
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 px-4 pb-6">
              <button
                type="button"
                onClick={() => {
                  // Just open the picker. NO setPendingSave here — auto-
                  // saving after the user picks a new account was the cause
                  // of the "tap Cambiar cuenta → expense fires silently"
                  // bug. The user lands back on the keypad with the new
                  // account selected and saldo visible; they tap Save when
                  // ready, fully in control.
                  setNoBalanceOpen(false);
                  setAccountDrawerOpen(true);
                }}
                className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-foreground text-[14px] font-semibold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Cambiar cuenta
              </button>
              <button
                type="button"
                onClick={() => {
                  // Defensive: clear pendingSave so dismissing the abono
                  // form (Volver / close) can't auto-fire the original
                  // expense save. Abono is its own intent — the user is
                  // recharging the account, not committing to the original
                  // expense yet.
                  setPendingSave(false);
                  // Pre-fill the abono input with the missing amount when
                  // the modal fired in "insufficient" mode — that's the
                  // exact gap the user needs to cover to make their
                  // expense go through. "empty" mode leaves it blank.
                  if (noBalanceReason === "insufficient" && accountId) {
                    const current = balances[accountId] ?? 0;
                    const gap = Math.max(0, amount - current);
                    if (gap > 0) {
                      setAbonoAmount(gap.toFixed(2));
                    }
                  }
                  setAbonoMode(true);
                }}
                className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-foreground bg-background text-[14px] font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Abonar a esta cuenta
              </button>
              <button
                type="button"
                onClick={() => setNoBalanceOpen(false)}
                className="inline-flex h-9 w-full items-center justify-center rounded-xl text-[13px] font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Cerrar
              </button>
            </div>
          )}
        </DrawerContent>
      </Drawer>

      {/* Abono success — replaces the previous green sonner toast.
          Mounts as a sibling to the saldo modal so it renders cleanly
          above the now-closed saldo drawer with the success state. */}
      <ActionResultDrawer
        open={abonoSuccessOpen}
        onOpenChange={setAbonoSuccessOpen}
        title="Abono registrado"
        description={
          <>
            Sumamos{" "}
            <span className="font-semibold tabular-nums text-foreground">
              {formatMoney(abonoSuccessAmount, currency)}
            </span>{" "}
            a tu cuenta. Ya puedes continuar con tu gasto.
          </>
        }
        closeLabel="Continuar"
        tone="success"
      />

      {/* Category drawer — full grid */}
      <Drawer open={categoryDrawerOpen} onOpenChange={setCategoryDrawerOpen}>
        <DrawerContent
          aria-describedby="capture-category-desc"
          className="bg-background"
        >
          <DrawerHeader>
            {/* Override DrawerTitle's default `font-heading` (italic
                Instrument Serif from the design tokens) — the capture
                surface is sans-only so the picker title doesn't read
                like a different app. */}
            <DrawerTitle className="font-sans not-italic text-base font-semibold">
              Elige una categoría
            </DrawerTitle>
            <DrawerDescription id="capture-category-desc">
              Guardar {ready ? display : "el movimiento"} en una categoría.
            </DrawerDescription>
          </DrawerHeader>
          {/* Scrollable: drawer alto fijo con header arriba + grid largo abajo.
              Sin max-h + overflow las filas extra (>9 categorias) quedaban
              cortadas debajo del viewport del drawer. overscroll-contain
              evita que el scroll inercial de iOS propague al backdrop. */}
          <div className="grid max-h-[65vh] grid-cols-3 gap-2 overflow-y-auto overscroll-contain px-4 pb-6">
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
                      No tienes categorías todavía. Crea una en Ajustes.
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
            <DrawerTitle className="font-sans not-italic text-base font-semibold">
              Elige una cuenta
            </DrawerTitle>
            <DrawerDescription id="capture-account-desc">
              Cuenta o método de pago para este movimiento.
            </DrawerDescription>
          </DrawerHeader>
          <ul className="flex max-h-[65vh] flex-col gap-1 overflow-y-auto overscroll-contain px-2 pb-6">
            {accountsLoading
              ? [0, 1, 2].map((i) => (
                  <li key={i}>
                    <div className="flex h-16 w-full items-center gap-3 rounded-2xl px-3">
                      <Skeleton className="h-9 w-9 flex-shrink-0 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="block h-3.5 w-1/3 rounded" />
                        <Skeleton className="block h-3 w-1/4 rounded" />
                      </div>
                      <div className="ml-2 space-y-1.5 text-right">
                        <Skeleton className="block h-3.5 w-16 rounded" />
                        <Skeleton className="block h-3 w-10 rounded" />
                      </div>
                    </div>
                  </li>
                ))
              : availableAccounts.length === 0
                ? (
                    <li className="py-6 text-center text-[13px] text-muted-foreground">
                      No tienes cuentas en {CURRENCY_LABEL[currency]}. Crea una en Ajustes.
                    </li>
                  )
                : availableAccounts.map((a) => {
                  const Icon = a.Icon;
                  const selected = accountId === a.id;
                  const balance = balances[a.id] ?? 0;
                  const balanceTone =
                    !balancesLoaded
                      ? "text-muted-foreground"
                      : balance > 0
                        ? "text-foreground"
                        : balance < 0
                          ? "text-destructive"
                          : "text-muted-foreground";
                  // Account-kind subtitle. Yape/Plin used to fall through to
                  // "cuenta bancaria" — bug. Each rail now has its own label
                  // so the user can't confuse a Yape balance with a savings
                  // account on a quick scan.
                  const kindLabel =
                    a.kind === "cash"
                      ? "Efectivo"
                      : a.kind === "card"
                        ? "Tarjeta"
                        : a.kind === "yape"
                          ? "Yape"
                          : a.kind === "plin"
                            ? "Plin"
                            : "Cuenta bancaria";
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setAccountId(a.id);
                          setAccountDrawerOpen(false);
                          // No inline saldo guard here. Two saldo guards
                          // racing on the same selection event was the cause
                          // of the "modal fires for an account that has saldo
                          // → tap Cambiar cuenta → auto-save fires silently"
                          // bug. handleSave (reached via pendingSave or via a
                          // manual Save tap) is the single source of truth
                          // for the saldo guard now. Per-row saldo is already
                          // visible in the picker so the user picks with
                          // full information — the popup was a holdover from
                          // the pre-saldo-column picker.
                        }}
                        aria-pressed={selected}
                        aria-label={`${accountDisplayLabel(a)}, ${kindLabel}, saldo ${formatMoney(balance, a.currency)}`}
                        className={cn(
                          "flex h-16 w-full items-center gap-3 rounded-2xl px-3 text-left transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected ? "bg-muted ring-1 ring-foreground/15" : "hover:bg-muted",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-foreground",
                            accountChipBgClass(a.label),
                          )}
                        >
                          <AccountBrandIcon
                            label={a.label}
                            fallback={<Icon size={16} />}
                            size={20}
                          />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold">
                            {accountDisplayLabel(a)}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {kindLabel}
                          </span>
                        </span>
                        <span className="ml-2 flex flex-col items-end">
                          <span className="flex items-center gap-1">
                            {selected ? (
                              <Check
                                size={12}
                                aria-hidden="true"
                                strokeWidth={2.5}
                                className="text-foreground"
                              />
                            ) : null}
                            {balancesLoaded ? (
                              <span
                                className={cn(
                                  "text-[13px] font-semibold tabular-nums whitespace-nowrap",
                                  balanceTone,
                                )}
                                style={{ fontFeatureSettings: '"tnum","lnum"' }}
                              >
                                {formatMoney(balance, a.currency)}
                              </span>
                            ) : (
                              <Skeleton className="h-3.5 w-16 rounded" />
                            )}
                          </span>
                          <span className="mt-0.5 text-[10px] uppercase tracking-[0.05em] text-muted-foreground/80">
                            {balancesLoaded && balance <= 0 ? "sin saldo" : "saldo"}
                          </span>
                        </span>
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

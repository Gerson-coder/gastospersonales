/**
 * Accounts route — Kane
 *
 * Focused payment-accounts screen. Wired to Supabase `accounts` via the
 * `@/lib/data/accounts` data layer (Batch C — accounts CRUD). When Supabase
 * env vars are missing we keep the original mock list so the app stays
 * usable in demo mode.
 *
 * Balances are intentionally omitted from this screen until the transactions
 * table wiring lands — the DB has no `balance` column; balances are derived.
 * The previous "Saldo total" card is replaced with a friendly placeholder.
 *
 * Mobile-first, desktop max-w-3xl centered. Settings is one tap away via the
 * gear icon in the header.
 */

"use client";

import * as React from "react";
import nextDynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Banknote,
  CreditCard,
  Landmark,
  Wallet,
  ChevronRight,
  Plus,
  Trash2,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AppHeader } from "@/components/kane/AppHeader";
import { SavingOverlay } from "@/components/kane/SavingOverlay";
import { AccountBrandIcon } from "@/components/kane/AccountBrandIcon";
import { accountChipBgClass } from "@/lib/account-brand-slug";

// Lazy-load AccountWizardSheet — pesa ~857 lineas + dependencias del
// AccountCard preview, y solo se necesita al tocar "Agregar cuenta".
// ssr:false porque el componente es interactivo y vive detras de un
// click; no se renderiza en el primer paint nunca.
const AccountWizardSheet = nextDynamic(
  () => import("@/components/kane/AccountWizardSheet"),
  { ssr: false },
);
import {
  ACCOUNT_SUBTYPE_LABEL,
  ACCOUNT_SUBTYPE_OPTIONS,
  accountDisplayLabel,
  archiveAccount,
  createAccount,
  MAX_ACTIVE_ACCOUNTS,
  listAccounts,
  updateAccount,
  type Account,
  type AccountKind,
  type AccountSubtype,
  type Currency,
} from "@/lib/data/accounts";
import { CURRENCY_LABEL, formatMoney } from "@/lib/money";
import { useActiveCurrency } from "@/hooks/use-active-currency";
import { useAccountBalances } from "@/hooks/use-account-balances";
import { TX_UPSERTED_EVENT } from "@/lib/data/transactions";

// ─── Demo mode flag ───────────────────────────────────────────────────────
// Mirrors `useSession` and `/login`: when env vars are absent we skip the
// data-layer entirely and surface the original mocks so the app stays
// browseable.
const SUPABASE_ENABLED =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;

// ─── Constants ────────────────────────────────────────────────────────────
// Demo-mode mock list. Same shape as `Account` from the data layer.
const MOCK_ACCOUNTS: Account[] = [
  { id: "a1", label: "Efectivo",  currency: "PEN", kind: "cash", subtype: null     },
  { id: "a2", label: "BCP",       currency: "PEN", kind: "bank", subtype: "sueldo" },
  { id: "a3", label: "Interbank", currency: "PEN", kind: "card", subtype: null     },
  { id: "a4", label: "BCP",       currency: "USD", kind: "bank", subtype: "dolares"},
];

const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  bank: "Banco",
  yape: "Yape",
  plin: "Plin",
};

// Icons are kept on the LIST view (fast recognition) but removed from the
// form's type chips per UX feedback. Yape/Plin reuse a wallet-ish icon so
// the list still has a visual anchor.
const ACCOUNT_KIND_ICON: Record<
  AccountKind,
  React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>
> = {
  cash: Banknote,
  card: CreditCard,
  bank: Landmark,
  yape: Wallet,
  plin: Wallet,
};

// ACCOUNT_TINT removed — chip backgrounds are now keyed by brand label
// via `accountChipBgClass`, not by `account.kind`. Kind-based colors made
// every bank look identical (same green) and broke the brand-cutout SVGs
// (Interbank). The new helper returns a neutral theme-aware bg for most
// accounts and only keeps a colored chip for brands whose SVG needs one.

// Yape / Plin live in BRAND_PRESETS (below); credit / debit cards are
// always issued by a bank, so a separate "Tarjeta" kind ended up being
// redundant with "Banco". The kind picker now offers only the two
// distinct surfaces — cash on hand vs a bank/issuer account. The DB
// schema still accepts `card` so legacy rows render unchanged.
const KIND_OPTIONS: AccountKind[] = ["cash", "bank"];

// Account name char cap. Subido a 20 (era 12) por feedback del user —
// nombres como "Caja Huancayo" (13), "Mibanco Crédito" (15) y
// similares no cabian en 12. Las superficies que rendean labels
// (/accounts row, /dashboard chip, AccountCard) ya tienen truncate
// para no romper layout en mobile angosto.
const LABEL_MAX_LENGTH = 20;

// Account names that are auto-locked when the corresponding kind is picked.
// Mirrored in the DB as plain text — defensive trim/match in handleSubmit.
const LOCKED_KIND_NAMES: Partial<Record<AccountKind, string>> = {
  yape: "Yape",
  plin: "Plin",
};
const CURRENCY_OPTIONS: Currency[] = ["PEN", "USD"];

// Curated brand suggestions for first-time account setup. The three banks
// cover the bulk of Peruvian retail; Yape and Plin are the wallet brands
// that previously lived in the kind picker. Picking a preset auto-fills
// both kind + label so the user only has to confirm currency. Bank presets
// pre-fill a starter label the user can extend ("BCP" → "BCP Soles");
// wallet presets keep the name locked (yape/plin paths still flow through
// LOCKED_KIND_NAMES so the input stays read-only).
type BrandPreset = {
  id: string;
  label: string;
  kind: AccountKind;
};
const BRAND_PRESETS: BrandPreset[] = [
  { id: "bcp",       label: "BCP",       kind: "bank" },
  { id: "interbank", label: "Interbank", kind: "bank" },
  { id: "bbva",      label: "BBVA",      kind: "bank" },
  { id: "yape",      label: "Yape",      kind: "yape" },
  { id: "plin",      label: "Plin",      kind: "plin" },
];

// ─── Page ──────────────────────────────────────────────────────────────────
// Top-level export wraps the real page in Suspense so `useSearchParams()`
// (used inside AccountsPageInner to read `?create=1`) doesn't bail static
// rendering. Next 15+/16 requires `useSearchParams()` to live under a
// Suspense ancestor during prerender — without it the build fails with
// "missing-suspense-with-csr-bailout". Same pattern as /capture.
export default function AccountsPage() {
  return (
    <React.Suspense fallback={<AccountsPageFallback />}>
      <AccountsPageInner />
    </React.Suspense>
  );
}

// Minimal loading shell — matches the real page's outer chrome so the
// swap-in feels stable. MUST NOT call useSearchParams or any other hook
// that bails static render.
function AccountsPageFallback() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="relative min-h-dvh bg-background pb-32 text-foreground"
    >
      <div className="mx-auto w-full max-w-[720px] space-y-6 px-5 pt-6 md:max-w-5xl md:space-y-10 md:px-10 md:pt-10">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </main>
  );
}

function AccountsPageInner() {
  const [accounts, setAccounts] = React.useState<Account[]>(
    SUPABASE_ENABLED ? [] : MOCK_ACCOUNTS,
  );
  const [loading, setLoading] = React.useState<boolean>(SUPABASE_ENABLED);
  const [editing, setEditing] = React.useState<Account | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);

  // Saldo total — sumamos los balances (major units) de todas las cuentas
  // de la moneda activa. `getAccountBalances` ya filtra por currency a
  // nivel de query, asi que solo nos queda agregar. PEN y USD se muestran
  // por separado siguiendo la moneda activa del header (consistente con
  // /dashboard, /movements e /insights).
  const { currency: activeCurrency } = useActiveCurrency();
  const {
    balances,
    balancesLoaded,
    reload: reloadBalances,
  } = useAccountBalances(activeCurrency, { skip: !SUPABASE_ENABLED });
  // Refrescar saldos cuando una transaccion se crea/edita/archiva en otra
  // pantalla (capture, dashboard) — el hook por si solo solo refetcha al
  // cambiar de moneda. Sin esto el saldo total se quedaria desactualizado
  // hasta el siguiente toggle de PEN/USD.
  React.useEffect(() => {
    if (!SUPABASE_ENABLED) return;
    const handler = () => {
      void reloadBalances();
    };
    window.addEventListener(TX_UPSERTED_EVENT, handler);
    return () => window.removeEventListener(TX_UPSERTED_EVENT, handler);
  }, [reloadBalances]);

  const totalBalance = React.useMemo(() => {
    // Solo cuentas en la moneda activa — sumar PEN + USD seria invalido.
    const ids = new Set(
      accounts.filter((a) => a.currency === activeCurrency).map((a) => a.id),
    );
    let total = 0;
    for (const id of ids) total += balances[id] ?? 0;
    return total;
  }, [accounts, balances, activeCurrency]);

  const hasAccountsInCurrency = accounts.some(
    (a) => a.currency === activeCurrency,
  );

  // Deep-link from /dashboard's empty state: when a brand-new user (zero
  // accounts since migration 00024) or a one-account user lands on the
  // dashboard, the empty card primary CTA sends them here with
  // `?create=1` so they go straight to creating their main wallet/bank
  // instead of having to find the Agregar button. We open the create
  // drawer once on mount, then strip the query so a refresh doesn't
  // reopen it indefinitely.
  const router = useRouter();
  const searchParams = useSearchParams();
  const createParamConsumed = React.useRef(false);
  React.useEffect(() => {
    if (createParamConsumed.current) return;
    if (searchParams.get("create") !== "1") return;
    if (!SUPABASE_ENABLED) return;
    createParamConsumed.current = true;
    setCreateOpen(true);
    // Drop the param from the URL bar so reload / share doesn't loop.
    router.replace("/accounts", { scroll: false });
  }, [searchParams, router]);

  const reload = React.useCallback(async () => {
    if (!SUPABASE_ENABLED) return;
    try {
      const list = await listAccounts();
      setAccounts(list);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No pudimos cargar tus cuentas.";
      toast.error("Error al cargar cuentas", { description: msg });
    }
  }, []);

  React.useEffect(() => {
    if (!SUPABASE_ENABLED) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await listAccounts();
        if (!cancelled) setAccounts(list);
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : "No pudimos cargar tus cuentas.";
        toast.error("Error al cargar cuentas", { description: msg });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleEditAccount(acc: Account) {
    if (!SUPABASE_ENABLED) {
      toast("Próximamente", {
        description: `La edición de "${acc.label}" llega cuando conectes Supabase.`,
      });
      return;
    }
    setEditing(acc);
  }

  function handleAddAccount() {
    if (!SUPABASE_ENABLED) {
      toast("Próximamente", {
        description: "Agregar cuentas llega cuando conectes Supabase.",
      });
      return;
    }
    setCreateOpen(true);
  }

  // Show the diversification hint only when the user has exactly one
  // account. Two or more = they've already set things up. The copy below
  // adapts to whether the lone account is cash (suggest a bank/tarjeta)
  // or a bank/wallet (suggest cash for everyday gastos sin tarjeta).
  const showDiversifyHint = !loading && accounts.length === 1;
  const diversifyHintText =
    accounts.length === 1 && accounts[0].kind === "cash"
      ? "Te conviene tener al menos una tarjeta o banco también."
      : "Te conviene tener una cuenta de efectivo para los gastos del día a día.";

  return (
    <main className="relative min-h-dvh bg-background pb-32 text-foreground">
      <div className="mx-auto w-full max-w-[720px] space-y-6 px-5 pt-6 md:max-w-5xl md:space-y-10 md:px-10 md:pt-10">
        {/* Page heading */}
        <AppHeader
          eyebrow="Tu dinero"
          title="Cuentas"
          titleStyle="page"
          className="px-0 pt-0"
        />

        {/* Desktop: balance card on the left rail, accounts grid on the right.
            Mobile: stacked vertically (default). */}
        <div className="md:grid md:grid-cols-[260px_1fr] md:items-start md:gap-8">

        {/* Saldo total — suma de los balances de todas las cuentas en la
            moneda activa. Mostramos el monto en major units a traves de
            `formatMoney(...*100)` (la helper espera minor units). Mientras
            balancesLoaded sea false dejamos un skeleton para no parpadear
            con un "S/ 0.00" engañoso. Cuando el usuario aun no tiene
            cuentas en la moneda activa mantenemos el hint original. */}
        <section aria-labelledby="accounts-balances" className="mt-2 md:mt-0">
          <h2
            id="accounts-balances"
            className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
          >
            Saldo total
          </h2>
          <Card className="rounded-2xl border-border p-5">
            {loading || (SUPABASE_ENABLED && !balancesLoaded) ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
            ) : !hasAccountsInCurrency ? (
              <p className="text-sm text-muted-foreground">
                No tienes cuentas en {CURRENCY_LABEL[activeCurrency]} todavía.
              </p>
            ) : (
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={cn(
                    "tabular-nums font-semibold tracking-tight",
                    totalBalance < 0 ? "text-destructive" : "text-foreground",
                  )}
                  style={{ fontSize: "clamp(1.5rem, 7vw, 2rem)" }}
                  aria-live="polite"
                >
                  {formatMoney(totalBalance * 100, activeCurrency)}
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                  {CURRENCY_LABEL[activeCurrency]}
                </span>
              </div>
            )}
          </Card>
        </section>

        {/* Accounts list */}
        <section aria-labelledby="accounts-list" className="mt-8 md:mt-0">
          <h2
            id="accounts-list"
            className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
          >
            Tus cuentas
          </h2>
          {/* Mobile: single card with divided rows. Desktop: borderless grid of card tiles. */}
          <Card className="overflow-hidden rounded-2xl border-border p-0 md:border-0 md:bg-transparent md:shadow-none">
            {loading ? (
              <AccountsSkeleton />
            ) : accounts.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Todavía no tienes cuentas. Toca <span className="font-semibold">Agregar cuenta</span> para crear una.
              </div>
            ) : (
              <ul className="divide-y divide-border md:grid md:grid-cols-2 md:divide-y-0 md:gap-3 lg:grid-cols-3" role="list">
                {accounts.map((account) => {
                  const KindIcon = ACCOUNT_KIND_ICON[account.kind];
                  return (
                    <li key={account.id} className="md:rounded-2xl md:border md:border-border md:bg-card md:overflow-hidden">
                      <button
                        type="button"
                        onClick={() => handleEditAccount(account)}
                        aria-label={`Editar ${account.label}`}
                        className={cn(
                          "flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                          "hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                          "md:min-h-[80px] md:px-5 md:py-4",
                        )}
                      >
                        <div
                          aria-hidden="true"
                          className={cn(
                            "flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl text-foreground",
                            "md:h-12 md:w-12 md:rounded-2xl",
                            // Neutral theme-aware chip for every brand;
                            // Interbank keeps a colored bg because its
                            // SVG is a green-with-white-cutouts wordmark
                            // that disappears on a white chip. See
                            // accountChipBgClass for the rule.
                            accountChipBgClass(account.label),
                          )}
                        >
                          <AccountBrandIcon
                            label={account.label}
                            fallback={<KindIcon size={18} aria-hidden />}
                            size={22}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px] font-semibold">
                            {accountDisplayLabel(account)}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {CURRENCY_LABEL[account.currency]} · {ACCOUNT_KIND_LABEL[account.kind]}
                          </div>
                        </div>
                        <ChevronRight
                          size={16}
                          aria-hidden="true"
                          className="ml-2 flex-shrink-0 text-muted-foreground"
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Diversification hint — only when there's exactly one account.
              Calm, dismiss-by-action: tap "Agregar otra" to open create. */}
          {showDiversifyHint ? (
            <div className="mt-3 rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-3.5">
              <p className="text-[13px] leading-snug text-foreground">
                {diversifyHintText}
              </p>
              <button
                type="button"
                onClick={handleAddAccount}
                className="mt-1.5 inline-flex min-h-9 items-center text-[12px] font-semibold text-foreground underline decoration-foreground/40 underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                Agregar otra cuenta
              </button>
            </div>
          ) : null}
        </section>

        </div>{/* end md:grid two-col */}

        {/* Add account — disabled when the user hits the 10-account ceiling.
            The DB-level guard in createAccount is still the source of truth;
            this just stops the unfriendly toast experience for users at cap. */}
        <div className="mt-6 md:mt-8">
          <Button
            type="button"
            onClick={handleAddAccount}
            aria-label="Agregar cuenta"
            disabled={accounts.length >= MAX_ACTIVE_ACCOUNTS}
            className="h-12 w-full rounded-xl text-[14px] font-semibold md:w-auto md:min-w-[200px]"
          >
            <Plus size={16} aria-hidden="true" />
            <span className="ml-1">Agregar cuenta</span>
          </Button>
          {accounts.length >= MAX_ACTIVE_ACCOUNTS && (
            <p className="mt-2 text-[12px] text-muted-foreground md:max-w-xs">
              Llegaste al máximo de {MAX_ACTIVE_ACCOUNTS} cuentas. Archiva una para crear otra.
            </p>
          )}
        </div>
      </div>

      {/* Create sheet — flujo nuevo con preview live + plantillas.
          Edit sigue usando AccountFormSheet (abajo) para no tocar lo
          que ya funciona — esa surface tiene archivar y otra logica
          que el wizard no necesita. */}
      <AccountWizardSheet
        open={createOpen}
        existingAccounts={accounts}
        onOpenChange={setCreateOpen}
        reload={reload}
      />

      {/* Edit sheet — only mounted when a row is selected so the form state
          resets cleanly between rows (the sheet's draft state is keyed off
          mount, not the open prop). */}
      {editing ? (
        <AccountFormSheet
          mode="edit"
          account={editing}
          existingAccounts={accounts}
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onOptimisticClose={() => setEditing(null)}
          reload={reload}
        />
      ) : null}
    </main>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────
function AccountsSkeleton() {
  // Three shimmer rows mirroring the real account row layout (icon tile +
  // 2-line text + chevron placeholder).
  const widths = ["w-28", "w-36", "w-24"];
  return (
    <ul
      className="divide-y divide-border md:grid md:grid-cols-2 md:divide-y-0 md:gap-3 lg:grid-cols-3"
      role="list"
      aria-busy="true"
      aria-label="Cargando cuentas"
    >
      {widths.map((w, i) => (
        <li key={i} className="md:rounded-2xl md:border md:border-border md:bg-card md:overflow-hidden">
          <div className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 md:min-h-[80px] md:px-5 md:py-4">
            <Skeleton className="h-10 w-10 flex-shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className={cn("h-3.5 rounded", w)} />
              <Skeleton className="h-2.5 w-16 rounded" />
            </div>
            <Skeleton className="h-3 w-3 rounded" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Form sheet ────────────────────────────────────────────────────────────
type AccountFormSheetProps = {
  mode: "create" | "edit";
  open: boolean;
  account?: Account | null;
  /** All currently-active accounts. Used to dedupe brand presets — if the
   * user already has a "Yape" account, the Yape preset is disabled in
   * the next create flow. Bank brands stay enabled because subtypes can
   * differentiate multiple accounts at the same institution. */
  existingAccounts: Account[];
  onOpenChange: (open: boolean) => void;
  /** Close the sheet from the parent (used by the optimistic submit path). */
  onOptimisticClose: () => void;
  /** Refresh the parent list after a successful or failed write. */
  reload: () => Promise<void>;
};

function AccountFormSheet({
  mode,
  open,
  account,
  existingAccounts,
  onOpenChange,
  onOptimisticClose,
  reload,
}: AccountFormSheetProps) {
  const [label, setLabel] = React.useState("");
  const [kind, setKind] = React.useState<AccountKind>("cash");
  const [currency, setCurrency] = React.useState<Currency>("PEN");
  // Optional product type within an institution. Only meaningful for
  // bank accounts; cash / Yape / Plin keep this null.
  const [subtype, setSubtype] = React.useState<AccountSubtype | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [overlayLabel, setOverlayLabel] = React.useState<string>("Guardando…");
  // Validation only surfaces after the user touches Save once.
  const [showError, setShowError] = React.useState(false);
  // Inline archive confirm — opens a small "¿Archivar?" row in-place.
  const [archiveArmed, setArchiveArmed] = React.useState(false);
  // Modal shown when the user tries to save a duplicate (label, kind,
  // subtype, currency). Replaces the legacy sonner toast — keeps the
  // feedback inside the same Drawer-style modal language as the rest of
  // the app (Sin saldo / Saldo insuficiente).
  const [dupOpen, setDupOpen] = React.useState(false);
  // When non-null, the label is locked to a brand preset (BCP / Interbank /
  // BBVA / Yape / Plin) and the input becomes read-only. Cleared whenever
  // the user manually changes the kind picker — that signals "I want to
  // type my own name". Yape / Plin still flow through LOCKED_KIND_NAMES
  // because the lock survives even if the user re-toggles the kind.
  const [lockedBrand, setLockedBrand] = React.useState<string | null>(null);
  const labelRef = React.useRef<HTMLInputElement | null>(null);

  // Re-seed form values whenever the sheet opens (or the target account
  // changes). Reset transient validation/confirm state too, so a previous
  // abort doesn't pre-arm the next session — covers swipe/escape close as
  // well as the explicit Cancelar button.
  React.useEffect(() => {
    if (!open) return;
    if (mode === "edit" && account) {
      const locked = LOCKED_KIND_NAMES[account.kind];
      setLabel(locked ?? account.label);
      setKind(account.kind);
      setCurrency(account.currency);
      setSubtype(account.subtype);
      // On hydrate, if the saved label exactly matches one of the brand
      // presets, treat it as locked so the input stays read-only and the
      // user has to actively switch kind to free it.
      const matchingPreset = BRAND_PRESETS.find(
        (p) => p.kind === account.kind && p.label === (locked ?? account.label),
      );
      setLockedBrand(matchingPreset ? matchingPreset.label : null);
    } else {
      setLabel("");
      setKind("cash");
      setCurrency("PEN");
      setSubtype(null);
      setLockedBrand(null);
    }
    setShowError(false);
    setArchiveArmed(false);
    const id = window.requestAnimationFrame(() => {
      labelRef.current?.focus();
      if (mode === "edit" && account && !LOCKED_KIND_NAMES[account.kind]) {
        labelRef.current?.select();
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, mode, account]);

  const trimmed = label.trim();
  const labelInvalid = trimmed.length === 0;
  // The name is locked when:
  //   - the kind itself locks to a brand (Yape / Plin), OR
  //   - the user picked a brand preset and hasn't reset it via the kind
  //     picker. This is the "BCP / Interbank / BBVA" path the user asked
  //     for: brand badges fix the name so two accounts under the same
  //     bank don't drift into "BCP Soles" vs "BCP soles" via free typing.
  const lockedKindName = LOCKED_KIND_NAMES[kind];
  const lockedName = lockedKindName ?? lockedBrand ?? undefined;
  const nameLocked = lockedName !== undefined;
  const labelMax = LABEL_MAX_LENGTH;
  const labelRemaining = labelMax - label.length;
  const showLabelCounter = !nameLocked && labelRemaining <= 5;

  // Switch kind. Yape/Plin auto-lock the name to the brand. Switching to a
  // free-typed kind clears any active brand lock — that's the explicit
  // "I want to type my own name" gesture.
  function handleKindChange(next: AccountKind) {
    if (submitting) return;
    setKind(next);
    setLockedBrand(null);
    const nextLocked = LOCKED_KIND_NAMES[next];
    if (nextLocked !== undefined) {
      setLabel(nextLocked);
      setShowError(false);
    } else if (label === "Yape" || label === "Plin") {
      setLabel("");
    } else if (
      BRAND_PRESETS.some((p) => p.kind === "bank" && p.label === label)
    ) {
      // Coming from a bank brand preset — clear the locked label so the
      // user starts with a blank slate when switching to cash, etc.
      setLabel("");
    }
    // Subtype is bank-only. Leaving the bank kind clears it.
    if (next !== "bank") setSubtype(null);
    // Yape / Plin are PEN-only in Peru. Force the currency back so a
    // user who set USD before flipping the kind doesn't end up with a
    // dollar Yape account that the brand never supports.
    if (next === "yape" || next === "plin") setCurrency("PEN");
  }

  // One-tap brand preset: auto-fills kind + label and locks the input.
  // Both bank brands (BCP / Interbank / BBVA) and wallet brands (Yape /
  // Plin) lock the name now — the user wanted predefined brands to be
  // immutable so two accounts under the same issuer can't drift in spelling.
  function handlePresetPick(preset: BrandPreset) {
    if (submitting) return;
    setKind(preset.kind);
    setLabel(preset.label);
    setLockedBrand(preset.label);
    setShowError(false);
    // Wallet brands don't have product subtypes (Yape is just Yape) and
    // are PEN-only — force both back so picking the preset is a clean
    // slate regardless of what the previous draft was.
    if (preset.kind !== "bank") {
      setSubtype(null);
      setCurrency("PEN");
    }
  }

  // Brand preset is "used" when the user already has an active account
  // matching this preset's identity IN THE ACTIVE CURRENCY. The currency
  // gate is what lets a user with a PEN Yape still tap the Yape badge
  // after switching to USD: the same brand in a different currency is a
  // legitimate new account, not a duplicate. Only when both PEN and USD
  // versions of the same tuple exist does the badge get disabled in both
  // currency views.
  //   - Wallet brands (Yape / Plin): one row per (brand, currency) caps it.
  //   - Bank brands (BCP / Interbank / BBVA): per (label, subtype, currency).
  // Edit mode never disables the preset that currently matches the row
  // we're editing — the user has to be able to keep the existing brand.
  function isPresetUsed(preset: BrandPreset): boolean {
    if (mode === "edit" && account) {
      const matchesCurrent =
        preset.kind === account.kind && preset.label === account.label;
      if (matchesCurrent) return false;
    }
    if (preset.kind === "bank") {
      return existingAccounts.some(
        (a) =>
          a.kind === "bank" &&
          a.label === preset.label &&
          a.subtype === subtype &&
          a.currency === currency,
      );
    }
    return existingAccounts.some(
      (a) => a.kind === preset.kind && a.currency === currency,
    );
  }

  // Auto-pick USD when the user picks "dolares" subtype (most users keep
  // a USD-only cuenta dólares — the toggle is a small ergonomic win that
  // saves a step). They can still flip back to PEN manually after.
  function handleSubtypeChange(next: AccountSubtype | null) {
    if (submitting) return;
    setSubtype(next);
    if (next === "dolares" && currency === "PEN") {
      setCurrency("USD");
    }
  }

  // Determine which brand preset is "active" given the current form state.
  // For wallet presets (yape / plin) we just match the kind. For bank
  // presets we additionally require the trimmed label to start with the
  // brand name so a custom "Banco de la Nación" doesn't accidentally
  // light up "BCP".
  function isPresetActive(preset: BrandPreset): boolean {
    if (kind !== preset.kind) return false;
    if (preset.kind === "yape" || preset.kind === "plin") return true;
    return label.trim().toLowerCase().startsWith(preset.label.toLowerCase());
  }

  // Optimistic close pattern: dismiss the sheet BEFORE the round-trip so the
  // UX feels instant. We surface a toast on either path and reload to
  // reconcile any drift. Archive does NOT short-circuit close — destructive
  // ops keep the user in context until confirmed.
  async function handleSubmit() {
    if (submitting) return;
    if (labelInvalid) {
      setShowError(true);
      labelRef.current?.focus();
      return;
    }
    // Defense-in-depth: if kind is locked, force the canonical brand name
    // even if state somehow drifted.
    const finalLabel = lockedName ?? trimmed;
    const action = mode;
    const targetId = account?.id;
    // Subtype is only meaningful for bank accounts; the same coercion runs
    // again below for the actual write, but we need it here to dedupe
    // against existing rows correctly (a "card" with subtype="corriente"
    // would otherwise look like a different tuple than the bank version
    // even though the DB will store NULL).
    const dupSubtype = kind === "bank" ? subtype : null;
    // Duplicate guard — same (label, kind, subtype, currency) tuple is
    // forbidden. Editing the same row excludes itself from the check so
    // re-saving without changes still works.
    const norm = (s: string) => s.trim().toLowerCase();
    const isDuplicate = existingAccounts.some(
      (a) =>
        (action === "create" || a.id !== targetId) &&
        norm(a.label) === norm(finalLabel) &&
        a.kind === kind &&
        a.subtype === dupSubtype &&
        a.currency === currency,
    );
    if (isDuplicate) {
      setDupOpen(true);
      return;
    }
    onOptimisticClose();
    setOverlayLabel(action === "create" ? "Creando cuenta…" : "Actualizando…");
    setSubmitting(true);
    // Subtype is only meaningful for bank accounts; force null elsewhere
    // even if state somehow drifted (e.g. user picked "Dólares" for a
    // bank, then switched to "Cash" — handleKindChange already clears it,
    // but defense-in-depth keeps the DB tidy).
    const finalSubtype = kind === "bank" ? subtype : null;
    try {
      if (action === "create") {
        await createAccount({
          label: finalLabel,
          kind,
          currency,
          subtype: finalSubtype,
        });
      } else if (targetId) {
        await updateAccount(targetId, {
          label: finalLabel,
          kind,
          currency,
          subtype: finalSubtype,
        });
      }
      await reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No pudimos guardar la cuenta.";
      toast.error("No se pudo guardar", { description: msg });
      await reload();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchiveClick() {
    if (!account || submitting) return;
    if (!archiveArmed) {
      setArchiveArmed(true);
      return;
    }
    setOverlayLabel("Archivando…");
    setSubmitting(true);
    try {
      await archiveAccount(account.id);
      onOpenChange(false);
      await reload();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No pudimos archivar la cuenta.";
      toast.error("No se puede archivar", { description: msg });
    } finally {
      setSubmitting(false);
    }
  }

  const title = mode === "create" ? "Nueva cuenta" : "Editar cuenta";
  const description =
    mode === "create"
      ? "Asigna un nombre, tipo y moneda."
      : "Actualiza nombre, tipo o moneda. También puedes archivarla.";

  const errorId = "account-label-error";

  return (
    <>
    <SavingOverlay open={submitting} label={overlayLabel} />
    <Sheet
      open={open}
      onOpenChange={(next) => {
        // Block close while submitting so an in-flight archive can finish.
        if (submitting && !next) return;
        onOpenChange(next);
      }}
    >
      <SheetContent
        side="bottom"
        aria-labelledby="account-form-title"
        className="rounded-t-3xl px-5 pb-6 pt-2 md:max-w-md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
          aria-busy={submitting}
        >
          <SheetHeader className="px-0">
            <SheetTitle
              id="account-form-title"
              className="font-sans not-italic font-semibold"
            >
              {title}
            </SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>

          <div className="mt-2 flex flex-col gap-4 px-0 pb-2">
            {/* Brand suggestions — one-tap presets that fill kind + label.
                Sit above the Nombre field so first-time users land on a
                familiar label instead of a blank input. The pill turns
                solid when the current draft matches its definition. */}
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-semibold">
                Sugerencias
              </legend>
              <div
                role="group"
                aria-label="Sugerencias de marca"
                className="flex flex-wrap gap-2"
              >
                {BRAND_PRESETS.map((preset) => {
                  const active = isPresetActive(preset);
                  const used = isPresetUsed(preset);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handlePresetPick(preset)}
                      disabled={submitting || used}
                      aria-pressed={active}
                      title={used ? "Ya tienes una cuenta con esta marca" : undefined}
                      className={cn(
                        "inline-flex h-9 items-center rounded-full border px-3 text-[12.5px] font-semibold transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-card text-foreground hover:bg-muted",
                        used && "cursor-not-allowed opacity-40 line-through",
                      )}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <Label
                  htmlFor="account-label"
                  className="block text-[13px] font-semibold"
                >
                  Nombre
                </Label>
                {showLabelCounter ? (
                  <span
                    aria-live="polite"
                    className={cn(
                      "text-[11px] tabular-nums",
                      labelRemaining < 0
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {labelRemaining}
                  </span>
                ) : null}
              </div>
              <Input
                id="account-label"
                ref={labelRef}
                value={label}
                onChange={(e) => {
                  if (nameLocked) return;
                  setLabel(e.target.value);
                  if (showError && e.target.value.trim().length > 0) {
                    setShowError(false);
                  }
                }}
                onBlur={() => {
                  if (labelInvalid && !nameLocked) setShowError(true);
                }}
                placeholder={
                  nameLocked
                    ? lockedName
                    : "Ej. Efectivo, Banco familia, Visa Mamá…"
                }
                maxLength={LABEL_MAX_LENGTH}
                autoComplete="off"
                disabled={submitting || nameLocked}
                readOnly={nameLocked}
                aria-readonly={nameLocked || undefined}
                aria-invalid={showError && labelInvalid}
                aria-describedby={
                  showError && labelInvalid
                    ? errorId
                    : nameLocked
                      ? "account-label-locked"
                      : undefined
                }
                className={cn(
                  "h-11 text-[15px]",
                  nameLocked && "opacity-70 cursor-not-allowed",
                  showError && labelInvalid && "border-destructive focus-visible:ring-destructive",
                )}
              />
              {nameLocked ? (
                <span
                  id="account-label-locked"
                  className="mt-1.5 block text-[11px] text-muted-foreground"
                >
                  El nombre se asigna automáticamente para {lockedName}.
                </span>
              ) : null}
              {showError && labelInvalid ? (
                <span
                  id={errorId}
                  role="alert"
                  className="mt-1.5 block text-[12px] font-medium text-destructive"
                >
                  Necesita un nombre para guardarla.
                </span>
              ) : null}
            </div>

            <fieldset>
              <legend className="mb-1.5 text-[13px] font-semibold">Tipo</legend>
              {/* Text-only chips per UX feedback (icons removed to keep the
                  picker calm on small screens). Three options now that
                  Yape / Plin live as brand presets — fits one row on every
                  viewport. */}
              <RadioGroup
                value={kind}
                onValueChange={(v) => handleKindChange(v as AccountKind)}
                className="grid grid-cols-2 gap-2"
              >
                {KIND_OPTIONS.map((k) => {
                  const selected = kind === k;
                  const inputId = `account-kind-${k}`;
                  return (
                    <label
                      key={k}
                      htmlFor={inputId}
                      className={cn(
                        "flex cursor-pointer items-center justify-center rounded-xl border px-3 py-2.5 text-[13px] transition-colors",
                        "focus-within:ring-2 focus-within:ring-ring",
                        selected
                          ? "border-foreground bg-muted text-foreground"
                          : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <RadioGroupItem
                        id={inputId}
                        value={k}
                        className="sr-only"
                        disabled={submitting}
                      />
                      <span className="truncate font-semibold">
                        {ACCOUNT_KIND_LABEL[k]}
                      </span>
                    </label>
                  );
                })}
              </RadioGroup>
            </fieldset>

            {/* Subtype picker — only for bank accounts. Lets the user
                differentiate multiple products under the same institution
                (BCP cuenta sueldo + BCP cuenta dólares + BCP tarjeta de
                crédito). "Sin tipo" stores null; picking "Dólares" also
                flips currency to USD as a small ergonomic shortcut. */}
            {kind === "bank" && (
              <fieldset>
                <legend className="mb-1.5 text-[13px] font-semibold">
                  Tipo de cuenta
                </legend>
                <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
                  Útil cuando tienes varias cuentas en el mismo banco.
                </p>
                <div
                  role="group"
                  aria-label="Tipo de cuenta dentro del banco"
                  className="flex flex-wrap gap-2"
                >
                  <button
                    type="button"
                    onClick={() => handleSubtypeChange(null)}
                    disabled={submitting}
                    aria-pressed={subtype === null}
                    className={cn(
                      "inline-flex h-9 items-center rounded-full border px-3 text-[12.5px] font-semibold transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      subtype === null
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    Sin tipo
                  </button>
                  {ACCOUNT_SUBTYPE_OPTIONS.map((opt) => {
                    const active = subtype === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => handleSubtypeChange(opt)}
                        disabled={submitting}
                        aria-pressed={active}
                        className={cn(
                          "inline-flex h-9 items-center rounded-full border px-3 text-[12.5px] font-semibold transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-card text-foreground hover:bg-muted",
                        )}
                      >
                        {ACCOUNT_SUBTYPE_LABEL[opt]}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <fieldset>
              <legend className="mb-1.5 text-[13px] font-semibold">
                Moneda
              </legend>
              <RadioGroup
                value={currency}
                onValueChange={(v) => setCurrency(v as Currency)}
                className="grid grid-cols-2 gap-2"
              >
                {CURRENCY_OPTIONS.map((c) => {
                  const selected = currency === c;
                  const inputId = `account-currency-${c}`;
                  // Yape and Plin only operate in PEN — disable USD so
                  // a user can't create a USD wallet that the brand
                  // never supports.
                  const walletPenOnly =
                    (kind === "yape" || kind === "plin") && c === "USD";
                  return (
                    <label
                      key={c}
                      htmlFor={inputId}
                      className={cn(
                        "flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors",
                        "focus-within:ring-2 focus-within:ring-ring",
                        selected
                          ? "border-foreground bg-muted text-foreground"
                          : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                        walletPenOnly &&
                          "cursor-not-allowed opacity-40 line-through hover:bg-card hover:text-muted-foreground",
                      )}
                      title={
                        walletPenOnly
                          ? "Yape y Plin solo trabajan en soles"
                          : undefined
                      }
                    >
                      <RadioGroupItem
                        id={inputId}
                        value={c}
                        className="sr-only"
                        disabled={submitting || walletPenOnly}
                      />
                      {CURRENCY_LABEL[c]}
                    </label>
                  );
                })}
              </RadioGroup>
            </fieldset>

            {/* Inline archive confirm — keeps the destructive action calm
                and reversible without stacking sheets. */}
            {mode === "edit" && account && archiveArmed ? (
              <div
                role="alert"
                className="flex flex-col gap-2 rounded-2xl border border-destructive/30 bg-[var(--color-destructive-soft)] px-3.5 py-3 text-[13px] text-foreground"
              >
                <p className="font-semibold leading-snug">
                  ¿Archivar esta cuenta?
                </p>
                <p className="text-[12px] leading-snug text-muted-foreground">
                  La ocultamos de las listas. Tus movimientos pasados la
                  conservan.
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
                    onClick={() => void handleArchiveClick()}
                    disabled={submitting}
                    className="min-h-9 flex-1"
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={14} aria-hidden className="animate-spin" />
                        <span className="ml-1.5">Archivando…</span>
                      </>
                    ) : (
                      "Archivar"
                    )}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <SheetFooter className="px-0 flex-col-reverse gap-2 md:flex-row md:justify-end">
            {mode === "edit" && account && !archiveArmed ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleArchiveClick()}
                disabled={submitting}
                className="min-h-11 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 size={14} aria-hidden="true" className="mr-1.5" />
                Archivar
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="min-h-11"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting} className="min-h-11">
              {submitting ? (
                <>
                  <Loader2 size={14} aria-hidden className="animate-spin" />
                  <span className="ml-1.5">Guardando…</span>
                </>
              ) : mode === "create" ? (
                "Crear cuenta"
              ) : (
                "Guardar cambios"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
    {/* Duplicate-account modal — pops over the Sheet when the user tries
        to save the same (label, kind, subtype, currency) tuple twice. */}
    <Drawer open={dupOpen} onOpenChange={setDupOpen}>
      <DrawerContent
        aria-describedby="account-dup-desc"
        className="bg-background"
      >
        <DrawerHeader>
          <DrawerTitle>Cuenta duplicada</DrawerTitle>
          <DrawerDescription id="account-dup-desc">
            Ya tienes una cuenta con esos mismos datos. Cambia el nombre,
            el tipo o la moneda para continuar.
          </DrawerDescription>
        </DrawerHeader>
        <div className="px-4 pb-6">
          <button
            type="button"
            onClick={() => setDupOpen(false)}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-foreground text-[14px] font-semibold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Entendido
          </button>
        </div>
      </DrawerContent>
    </Drawer>
    </>
  );
}

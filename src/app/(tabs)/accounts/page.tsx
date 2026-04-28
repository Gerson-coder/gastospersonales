/**
 * Accounts route — Lumi
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
import { AppHeader } from "@/components/lumi/AppHeader";
import {
  ACCOUNT_SUBTYPE_LABEL,
  ACCOUNT_SUBTYPE_OPTIONS,
  accountDisplayLabel,
  archiveAccount,
  createAccount,
  listAccounts,
  updateAccount,
  type Account,
  type AccountKind,
  type AccountSubtype,
  type Currency,
} from "@/lib/data/accounts";
import { CURRENCY_LABEL } from "@/lib/money";

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
  { id: "a1", label: "Efectivo", currency: "PEN", kind: "cash" },
  { id: "a2", label: "BCP Soles", currency: "PEN", kind: "bank" },
  { id: "a3", label: "Visa BBVA", currency: "PEN", kind: "card" },
  { id: "a4", label: "BCP Dólares", currency: "USD", kind: "bank" },
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

const ACCOUNT_TINT: Record<AccountKind, string> = {
  cash: "bg-[oklch(0.92_0.04_70)] text-[oklch(0.45_0.10_70)]",
  card: "bg-[oklch(0.92_0.03_220)] text-[oklch(0.45_0.10_220)]",
  bank: "bg-[oklch(0.92_0.03_140)] text-[oklch(0.45_0.10_140)]",
  // Yape brand purple, Plin brand teal — both at the calm soft-tint level
  // used by the rest of the kinds so the row rhythm stays consistent.
  yape: "bg-[oklch(0.92_0.05_310)] text-[oklch(0.45_0.16_310)]",
  plin: "bg-[oklch(0.92_0.05_185)] text-[oklch(0.45_0.12_185)]",
};

// Yape / Plin live in BRAND_PRESETS (below); credit / debit cards are
// always issued by a bank, so a separate "Tarjeta" kind ended up being
// redundant with "Banco". The kind picker now offers only the two
// distinct surfaces — cash on hand vs a bank/issuer account. The DB
// schema still accepts `card` so legacy rows render unchanged.
const KIND_OPTIONS: AccountKind[] = ["cash", "bank"];

// Account name char cap. 20 covers legitimate names ("BCP Ahorros",
// "Visa Interbank") and stops longer strings from overflowing the
// row in /accounts and the chip in /dashboard on narrow phones.
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
export default function AccountsPage() {
  const [accounts, setAccounts] = React.useState<Account[]>(
    SUPABASE_ENABLED ? [] : MOCK_ACCOUNTS,
  );
  const [loading, setLoading] = React.useState<boolean>(SUPABASE_ENABLED);
  const [editing, setEditing] = React.useState<Account | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);

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

  // Show the diversification hint only when the user has exactly one account
  // (the auto-seeded Efectivo). Two or more = they've already set things up.
  const showDiversifyHint = !loading && accounts.length === 1;

  return (
    <main className="relative min-h-dvh bg-background pb-32 text-foreground">
      <div className="mx-auto w-full max-w-[720px] space-y-6 px-5 pt-6 md:max-w-3xl md:space-y-10 md:px-8 md:pt-10">
        {/* Page heading */}
        <AppHeader
          eyebrow="Tu dinero"
          title="Cuentas"
          titleStyle="page"
          className="px-0 pt-0"
        />

        {/* Balances placeholder — the previous "Saldo total" lived here. The
            DB has no balance column; balances will be derived from
            `transactions` once that wiring lands. Until then, a calm hint. */}
        <section aria-labelledby="accounts-balances-placeholder" className="mt-2">
          <h2
            id="accounts-balances-placeholder"
            className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
          >
            Saldo total
          </h2>
          <Card className="rounded-2xl border-dashed border-border p-5 text-sm text-muted-foreground">
            Tus saldos aparecen acá cuando registres movimientos.
          </Card>
        </section>

        {/* Accounts list */}
        <section aria-labelledby="accounts-list" className="mt-8">
          <h2
            id="accounts-list"
            className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
          >
            Tus cuentas
          </h2>
          <Card className="overflow-hidden rounded-2xl border-border p-0">
            {loading ? (
              <AccountsSkeleton />
            ) : accounts.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                Todavía no tienes cuentas. Toca <span className="font-semibold">Agregar cuenta</span> para crear una.
              </div>
            ) : (
              <ul className="divide-y divide-border" role="list">
                {accounts.map((account) => {
                  const KindIcon = ACCOUNT_KIND_ICON[account.kind];
                  return (
                    <li key={account.id}>
                      <button
                        type="button"
                        onClick={() => handleEditAccount(account)}
                        aria-label={`Editar ${account.label}`}
                        className={cn(
                          "flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                          "hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                        )}
                      >
                        <div
                          aria-hidden="true"
                          className={cn(
                            "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl",
                            ACCOUNT_TINT[account.kind],
                          )}
                        >
                          <KindIcon size={18} aria-hidden />
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
                Te conviene tener al menos una tarjeta o banco también.
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

        {/* Add account */}
        <div className="mt-6">
          <Button
            type="button"
            onClick={handleAddAccount}
            aria-label="Agregar cuenta"
            className="h-12 w-full rounded-xl text-[14px] font-semibold md:max-w-xs"
          >
            <Plus size={16} aria-hidden="true" />
            <span className="ml-1">Agregar cuenta</span>
          </Button>
        </div>
      </div>

      {/* Create sheet */}
      <AccountFormSheet
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        onOptimisticClose={() => setCreateOpen(false)}
        reload={reload}
      />

      {/* Edit sheet — only mounted when a row is selected so the form state
          resets cleanly between rows (the sheet's draft state is keyed off
          mount, not the open prop). */}
      {editing ? (
        <AccountFormSheet
          mode="edit"
          account={editing}
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
      className="divide-y divide-border"
      role="list"
      aria-busy="true"
      aria-label="Cargando cuentas"
    >
      {widths.map((w, i) => (
        <li key={i}>
          <div className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3">
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
  // Validation only surfaces after the user touches Save once.
  const [showError, setShowError] = React.useState(false);
  // Inline archive confirm — opens a small "¿Archivar?" row in-place.
  const [archiveArmed, setArchiveArmed] = React.useState(false);
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
    // Wallet brands don't have product subtypes (Yape is just Yape).
    if (preset.kind !== "bank") setSubtype(null);
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
    onOptimisticClose();
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
        toast.success("Cuenta creada");
      } else if (targetId) {
        await updateAccount(targetId, {
          label: finalLabel,
          kind,
          currency,
          subtype: finalSubtype,
        });
        toast.success("Cuenta actualizada");
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
    setSubmitting(true);
    try {
      await archiveAccount(account.id);
      toast.success("Cuenta archivada");
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
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handlePresetPick(preset)}
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
                      )}
                    >
                      <RadioGroupItem
                        id={inputId}
                        value={c}
                        className="sr-only"
                        disabled={submitting}
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
  );
}

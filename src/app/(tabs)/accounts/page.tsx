// TODO: wire to Supabase accounts table once Batch C lands. CRUD operations land in a later change.
/**
 * Accounts route — Lumi
 *
 * Focused payment-accounts screen. The previous "/accounts" page held the full
 * settings panel; that lives now under "/settings". Users reach Settings via
 * the gear icon in the top-right header here.
 *
 * Mobile-first, desktop max-w-3xl centered. All data is mocked until Batch C
 * (Supabase) lands.
 */

"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Banknote,
  CreditCard,
  Landmark,
  ChevronRight,
  Plus,
  Settings as SettingsIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────
type Currency = "PEN" | "USD";
type AccountKind = "cash" | "card" | "bank";

type Account = {
  id: string;
  label: string;
  currency: Currency;
  kind: AccountKind;
  balance: number;
};

// ─── Constants ────────────────────────────────────────────────────────────
// Mock data — same shape that Supabase will hand us in Batch C.
const MOCK_ACCOUNTS: Account[] = [
  { id: "a1", label: "Efectivo", currency: "PEN", kind: "cash", balance: 320.5 },
  { id: "a2", label: "BCP Soles", currency: "PEN", kind: "bank", balance: 4820.75 },
  { id: "a3", label: "Visa BBVA", currency: "PEN", kind: "card", balance: -640.2 },
  { id: "a4", label: "BCP Dólares", currency: "USD", kind: "bank", balance: 1250 },
];

const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  bank: "Banco",
};

const ACCOUNT_KIND_ICON: Record<
  AccountKind,
  React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>
> = {
  cash: Banknote,
  card: CreditCard,
  bank: Landmark,
};

/**
 * Warm-neutral tints for account icons. Mirrors the Dashboard/Movements
 * `CATEGORY_TINT` palette technique (subtle oklch washes) but keeps the
 * accounts screen visually calmer than the rainbow categories list.
 */
const ACCOUNT_TINT: Record<AccountKind, string> = {
  cash: "bg-[oklch(0.92_0.04_70)] text-[oklch(0.45_0.10_70)]",
  card: "bg-[oklch(0.92_0.03_220)] text-[oklch(0.45_0.10_220)]",
  bank: "bg-[oklch(0.92_0.03_140)] text-[oklch(0.45_0.10_140)]",
};

// ─── Helpers ──────────────────────────────────────────────────────────────
function formatBalance(amount: number, currency: Currency): string {
  const symbol = currency === "PEN" ? "S/" : "$";
  const formatted = new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  const sign = amount < 0 ? "-" : "";
  return `${sign}${symbol} ${formatted}`;
}

/**
 * Sum balances per currency. Mixing PEN + USD into a single number is wrong,
 * so we surface them side-by-side. When Supabase lands we'll convert via the
 * user's preferred currency, but for now keep them honest and separate.
 */
function totalsByCurrency(accounts: Account[]): Record<Currency, number> {
  return accounts.reduce(
    (acc, a) => {
      acc[a.currency] += a.balance;
      return acc;
    },
    { PEN: 0, USD: 0 } as Record<Currency, number>,
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default function AccountsPage() {
  const totals = React.useMemo(() => totalsByCurrency(MOCK_ACCOUNTS), []);

  function handleEditAccount(label: string) {
    toast("Próximamente", {
      description: `La edición de "${label}" llega en la próxima fase.`,
    });
  }

  function handleAddAccount() {
    toast("Próximamente", {
      description: "Agregar cuentas llega en la próxima fase.",
    });
  }

  return (
    <main className="relative min-h-dvh bg-background pb-32 text-foreground">
      <div className="mx-auto w-full max-w-[720px] space-y-6 px-5 pt-6 md:max-w-3xl md:space-y-10 md:px-8 md:pt-10">
        {/* Page heading */}
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Tu dinero
            </p>
            <h1 className="mt-1 text-2xl font-bold md:text-3xl">Cuentas</h1>
          </div>
          <Link
            href="/settings"
            aria-label="Abrir ajustes"
            className={cn(
              "inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground",
              "transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
            )}
          >
            <SettingsIcon size={18} aria-hidden="true" />
          </Link>
        </header>

        {/* Totals summary */}
        <section aria-labelledby="accounts-total" className="mt-2">
          <h2
            id="accounts-total"
            className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
          >
            Saldo total
          </h2>
          <Card className="rounded-2xl border-border p-5">
            <div className="grid gap-4 md:grid-cols-2 md:gap-6">
              <TotalRow label="Soles" amount={totals.PEN} currency="PEN" />
              <Separator className="md:hidden" />
              <TotalRow label="Dólares" amount={totals.USD} currency="USD" />
            </div>
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
            <ul className="divide-y divide-border" role="list">
              {MOCK_ACCOUNTS.map((account) => {
                const KindIcon = ACCOUNT_KIND_ICON[account.kind];
                return (
                  <li key={account.id}>
                    <div className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3">
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
                          {account.label}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {ACCOUNT_KIND_LABEL[account.kind]} · {account.currency}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <span
                          className={cn(
                            "text-[14px] font-semibold tabular-nums",
                            account.balance < 0 && "text-destructive",
                          )}
                        >
                          {formatBalance(account.balance, account.currency)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          // Destinations don't exist yet; surface the placeholder.
                          e.preventDefault();
                          handleEditAccount(account.label);
                        }}
                        aria-label={`Editar ${account.label}`}
                        className={cn(
                          "ml-2 inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-muted-foreground",
                          "transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:outline-none",
                        )}
                      >
                        <ChevronRight size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
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
    </main>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────
function TotalRow({
  label,
  amount,
  currency,
}: {
  label: string;
  amount: number;
  currency: Currency;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 md:flex-col md:items-start md:gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "text-xl font-bold tabular-nums md:text-2xl",
          amount < 0 && "text-destructive",
        )}
      >
        {formatBalance(amount, currency)}
      </span>
    </div>
  );
}

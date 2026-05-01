/**
 * AccountCardCarousel — swipeable list of AccountCard, one slide per account.
 *
 * Why Embla:
 *   - Native momentum + snap on touch (matches the user's mental model from
 *     iOS Wallet / Stripe Apps).
 *   - Respects `prefers-reduced-motion` automatically.
 *   - Accessible by default — slides have `role="group"` and `aria-roledescription`.
 *
 * Composition:
 *   - The carousel renders the FULL variant of AccountCard.
 *   - Active index is mirrored to `lumi-prefs.activeAccountId` so the next
 *     mount lands on the same account the user was last looking at.
 *   - "Cambiar cuenta" opens AccountSwitcherDrawer with mini cards. Tapping
 *     a mini card calls `scrollTo(index)` and closes the drawer.
 *
 * Edge cases handled:
 *   - Single account: hide pagination dots + the switcher button (still
 *     renders the card, no carrousel UX overhead).
 *   - Active account deleted: localStorage value points at a stale id; we
 *     fall through to index 0 silently and overwrite the persisted value
 *     on the next snap.
 *   - Loading: parent passes `loading` and we render a skeleton at the
 *     same aspect ratio so the page doesn't reflow.
 */

"use client";

import * as React from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ArrowLeftRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Account } from "@/lib/data/accounts";
import { getAccountCardStyle, getAccountBankSlug } from "@/lib/account-card-theme";
import { AccountCard } from "@/components/lumi/AccountCard";
import { AccountSwitcherDrawer } from "@/components/lumi/AccountSwitcherDrawer";
import {
  type AccountStats,
  getStatsFor,
} from "@/hooks/use-account-stats";
import { ACCOUNT_SUBTYPE_LABEL } from "@/lib/data/accounts";

// Persisted under `lumi-prefs.activeAccountId` to share the same JSON object
// the rest of the app (currency, theme) parks under. Same read-merge-write
// pattern as `useActiveCurrency`.
const STORAGE_KEY = "lumi-prefs";
const PREF_FIELD = "activeAccountId";

export type AccountCardCarouselProps = {
  accounts: Account[];
  stats: Map<string, AccountStats>;
  /**
   * Active currency from `useActiveCurrency()`. Passed in (instead of read
   * from the hook directly here) so the carousel re-renders synchronously
   * with the rest of the dashboard when the user flips PEN/USD.
   */
  currency: "PEN" | "USD";
  loading?: boolean;
  className?: string;
  /**
   * Fires whenever the active account changes (initial mount + every snap).
   * The dashboard uses this to scope its other widgets (insight banner,
   * Gastos/Ingresos cards, recent tx) to the same account the user is
   * currently viewing in the card. Coalesced — fires once per settle, not
   * per pixel of swipe.
   */
  onActiveAccountChange?: (accountId: string) => void;
};

// ─── localStorage helpers ─────────────────────────────────────────────────
function readPrefs(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

function readActiveId(): string | null {
  const value = readPrefs()[PREF_FIELD];
  return typeof value === "string" ? value : null;
}

function writeActiveId(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const prefs = readPrefs();
    if (prefs[PREF_FIELD] === id) return; // no-op write keeps storage cheap
    const updated = { ...prefs, [PREF_FIELD]: id };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Quota / private-mode — best-effort; in-memory state still drives the UI.
  }
}

// ─── Component ────────────────────────────────────────────────────────────
export function AccountCardCarousel({
  accounts,
  stats,
  currency,
  loading = false,
  className,
  onActiveAccountChange,
}: AccountCardCarouselProps) {
  // Determine the initial slide from localStorage, falling back to 0 when the
  // persisted id is stale (account deleted) or absent.
  const initialIndex = React.useMemo(() => {
    const saved = readActiveId();
    if (!saved) return 0;
    const idx = accounts.findIndex((a) => a.id === saved);
    return idx >= 0 ? idx : 0;
  }, [accounts]);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "center",
    containScroll: "trimSnaps",
    loop: false,
    startIndex: initialIndex,
  });

  const [activeIndex, setActiveIndex] = React.useState(initialIndex);
  const [hideAmounts, setHideAmounts] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Keep activeIndex in sync with embla. Persist to localStorage on every
  // settled snap so a refresh comes back to the same card. Emit the parent
  // callback on the same edge so the dashboard's other widgets re-scope.
  // The latest callback ref keeps the effect deps minimal — we don't want
  // re-attaching the listener every time the parent passes a fresh closure.
  const onActiveAccountChangeRef = React.useRef(onActiveAccountChange);
  React.useEffect(() => {
    onActiveAccountChangeRef.current = onActiveAccountChange;
  }, [onActiveAccountChange]);

  React.useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => {
      const idx = emblaApi.selectedScrollSnap();
      setActiveIndex(idx);
      const acct = accounts[idx];
      if (acct) {
        writeActiveId(acct.id);
        onActiveAccountChangeRef.current?.(acct.id);
      }
    };
    emblaApi.on("select", onSelect);
    onSelect(); // run once for initial mount

    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, accounts]);

  // If the accounts array shrinks below the active index (last account
  // deleted), nudge embla to a valid slot.
  React.useEffect(() => {
    if (!emblaApi) return;
    if (activeIndex >= accounts.length && accounts.length > 0) {
      emblaApi.scrollTo(accounts.length - 1, true);
    }
  }, [emblaApi, accounts.length, activeIndex]);

  const handleSelectAccount = React.useCallback(
    (idx: number) => {
      emblaApi?.scrollTo(idx);
      setDrawerOpen(false);
    },
    [emblaApi],
  );

  // ── Loading state ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={cn("px-4", className)}>
        <div className="aspect-[1.586] w-full animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  // ── Empty state ─────────────────────────────────────────────────────────
  // Caller should already check `accounts.length > 0` before mounting us; we
  // render nothing here as a safety net.
  if (accounts.length === 0) return null;

  // ── Single-account: no swipe, no dots, no switcher ──────────────────────
  const isSingle = accounts.length === 1;

  return (
    <div
      className={cn("flex flex-col gap-3", className)}
      role="region"
      aria-roledescription="carousel"
      aria-label="Tus cuentas"
    >
      {/* Carousel viewport. Embla wants the overflow:hidden on the parent
          and a flex row on the container. Slides flex-shrink-0 so they
          honor their width. */}
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex touch-pan-y">
          {accounts.map((account, idx) => {
            const s = getStatsFor(stats, account.id);
            const subtypeLabel = account.subtype
              ? ACCOUNT_SUBTYPE_LABEL[account.subtype]
              : null;
            return (
              <div
                key={account.id}
                className="min-w-0 flex-[0_0_88%] pl-4 pr-2 first:pl-4 last:pr-4"
                role="group"
                aria-roledescription="slide"
                aria-label={`Cuenta ${account.label}, ${idx + 1} de ${accounts.length}`}
              >
                <AccountCard
                  bankSlug={getAccountBankSlug(account)}
                  bankLabel={account.label}
                  subtypeLabel={subtypeLabel}
                  currency={currency}
                  saldoActual={s.saldoActual}
                  gastadoMes={s.gastadoMes}
                  deltaPctVsPrevMonth={s.deltaPctVsPrevMonth}
                  hideAmounts={hideAmounts}
                  onToggleHide={() => setHideAmounts((h) => !h)}
                  variant="full"
                  className="w-full"
                  // Pass the per-account theme as inline style — the card
                  // reads --card-bg-from / --card-bg-to / --card-accent.
                  style={getAccountCardStyle(account)}
                  // Replay the shine on each snap so swipes feel alive.
                  data-shine={idx === activeIndex ? "true" : undefined}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Pagination dots — hidden when there's only one account. */}
      {!isSingle && (
        <div
          className="flex justify-center gap-1.5"
          role="tablist"
          aria-label="Navegación de cuentas"
        >
          {accounts.map((account, idx) => {
            const isActive = idx === activeIndex;
            return (
              <button
                key={account.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-current={isActive ? "true" : undefined}
                aria-label={`Ir a cuenta ${account.label}`}
                onClick={() => emblaApi?.scrollTo(idx)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  isActive
                    ? "w-6 bg-foreground"
                    : "w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/70",
                )}
              />
            );
          })}
        </div>
      )}

      {/* "Cambiar cuenta" button — opens the switcher drawer. */}
      {!isSingle && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full bg-card px-5 py-2.5",
              "text-[14px] font-semibold text-primary",
              "ring-1 ring-border shadow-sm",
              "transition-colors hover:bg-muted",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            )}
          >
            <ArrowLeftRight size={16} aria-hidden />
            Cambiar cuenta
          </button>
        </div>
      )}

      <AccountSwitcherDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        accounts={accounts}
        stats={stats}
        currency={currency}
        activeIndex={activeIndex}
        onSelectAccount={handleSelectAccount}
        hideAmounts={hideAmounts}
      />
    </div>
  );
}

export default AccountCardCarousel;

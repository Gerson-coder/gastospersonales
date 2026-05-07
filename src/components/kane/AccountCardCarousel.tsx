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
 *   - Active index is mirrored to `kane-prefs.activeAccountId` so the next
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
import { AccountCard } from "@/components/kane/AccountCard";
import { AccountSwitcherDrawer } from "@/components/kane/AccountSwitcherDrawer";
import { useActiveAccountId } from "@/hooks/use-active-account-id";
import { useHideBalances } from "@/hooks/use-hide-balances";
import { ACCOUNT_SUBTYPE_LABEL } from "@/lib/data/accounts";

export type AccountCardCarouselProps = {
  accounts: Account[];
  /**
   * All-time saldo per accountId (major units, currency-scoped). Single
   * source of truth shared with /accounts via `useAccountBalances` so the
   * card on the dashboard NEVER drifts from the modal de cuentas. Absence
   * of an id => treat as 0.
   */
  balances: Record<string, number>;
  /**
   * Counterpart names indexados por accountId — el "otro" en una cuenta
   * compartida (partner si soy owner, owner si soy partner). Cargado en
   * el dashboard via listAccountCounterparts. Una cuenta compartida sin
   * entry aca todavia muestra el badge "Compartida" pero sin nombre.
   */
  partnerNames?: Record<string, string>;
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

// ─── Component ────────────────────────────────────────────────────────────
export function AccountCardCarousel({
  accounts,
  balances,
  partnerNames,
  currency,
  loading = false,
  className,
  onActiveAccountChange,
}: AccountCardCarouselProps) {
  // Active account id is owned by the kane-prefs hook so external writers
  // (e.g. /capture finishing a save) can drive the carousel's position
  // declaratively. The hook reads from localStorage via useSyncExternalStore,
  // so a write in /capture before `router.push("/dashboard")` already shows
  // up here on the very next render.
  const { activeAccountId, setActiveAccountId } = useActiveAccountId();

  // Resolve the initial embla index from the persisted account id. Falls
  // back to 0 when the saved id is stale (account deleted) or absent.
  // Note: embla's `startIndex` is a boot-time prop; recomputing this value
  // after mount is harmless dead work, but we keep `activeAccountId` in
  // deps so eslint stays happy and a stale closure can never sneak in.
  // External changes after mount drive the carousel via `scrollTo` below.
  const initialIndex = React.useMemo(() => {
    if (!activeAccountId) return 0;
    const idx = accounts.findIndex((a) => a.id === activeAccountId);
    return idx >= 0 ? idx : 0;
  }, [accounts, activeAccountId]);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "center",
    containScroll: "trimSnaps",
    loop: false,
    startIndex: initialIndex,
  });

  const [activeIndex, setActiveIndex] = React.useState(initialIndex);
  // Toggle "ocultar saldos" persistido en kane-prefs.hideBalances. Antes
  // era useState local; al navegar fuera del dashboard y volver, el
  // carousel se desmontaba y arrancaba en visible — el user reportaba
  // que su preferencia se reseteaba sola.
  const { hideBalances: hideAmounts, toggleHideBalances } = useHideBalances();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Latest callback ref — keeps the embla `select` effect's deps minimal so
  // we don't re-attach the listener every time the parent passes a new
  // closure for `onActiveAccountChange`.
  const onActiveAccountChangeRef = React.useRef(onActiveAccountChange);
  React.useEffect(() => {
    onActiveAccountChangeRef.current = onActiveAccountChange;
  }, [onActiveAccountChange]);

  // Carousel → store. Whenever the user swipes (or scrollTo lands), persist
  // the new active id and notify the dashboard so it re-scopes the other
  // widgets. This is the WRITE side of the bidirectional sync.
  React.useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => {
      const idx = emblaApi.selectedScrollSnap();
      setActiveIndex(idx);
      const acct = accounts[idx];
      if (acct) {
        setActiveAccountId(acct.id);
        onActiveAccountChangeRef.current?.(acct.id);
      }
    };
    emblaApi.on("select", onSelect);
    onSelect(); // run once for initial mount so consumers see the boot state

    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, accounts, setActiveAccountId]);

  // Store → carousel. Whenever activeAccountId changes via an EXTERNAL
  // writer (e.g. /capture wrote it before redirecting; another tab updated
  // it; storage event fired), align embla to that index. The equality
  // check on `selectedScrollSnap` makes this a no-op when the change came
  // from our own onSelect handler above — kills the loop risk.
  React.useEffect(() => {
    if (!emblaApi) return;
    if (!activeAccountId) return;
    const targetIdx = accounts.findIndex((a) => a.id === activeAccountId);
    if (targetIdx < 0) return;
    if (emblaApi.selectedScrollSnap() === targetIdx) return;
    // `false` = animated scrollTo so the transition stays smooth even when
    // the user lands on /dashboard from /capture. The user's eye follows
    // the snap, which sells the connection: "I just spent on BBVA → here's
    // the BBVA card sliding in."
    emblaApi.scrollTo(targetIdx, false);
  }, [emblaApi, accounts, activeAccountId]);

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
            const saldo = balances[account.id] ?? 0;
            const subtypeLabel = account.subtype
              ? ACCOUNT_SUBTYPE_LABEL[account.subtype]
              : null;
            const isActive = idx === activeIndex;
            return (
              <div
                key={account.id}
                // Full-width slides — no peek of adjacent cards. The user
                // explicitly asked for clean single-card focus, with the
                // pagination dots + Cambiar cuenta CTA carrying the "there
                // are more cards" affordance instead of an edge peek.
                className="min-w-0 flex-[0_0_100%] px-4"
                role="group"
                aria-roledescription="slide"
                aria-label={`Cuenta ${account.label}, ${idx + 1} de ${accounts.length}`}
              >
                <AccountCard
                  bankSlug={getAccountBankSlug(account)}
                  bankLabel={account.label}
                  subtypeLabel={subtypeLabel}
                  currency={currency}
                  saldoActual={saldo}
                  hideAmounts={hideAmounts}
                  onToggleHide={toggleHideBalances}
                  variant="full"
                  sharedWithPartner={account.sharedWithPartner}
                  partnerName={partnerNames?.[account.id] ?? null}
                  // Subtle scale-pulse on the active card — kicks in on snap
                  // via the `kane-account-card--snap` modifier toggled by
                  // `data-active`. Inactive cards stay at scale 1 so when
                  // they enter the viewport they don't bounce.
                  className={cn(
                    "w-full",
                    isActive && "kane-account-card--snap",
                  )}
                  style={getAccountCardStyle(account)}
                  data-shine={isActive ? "true" : undefined}
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
        balances={balances}
        partnerNames={partnerNames}
        currency={currency}
        activeIndex={activeIndex}
        onSelectAccount={handleSelectAccount}
        hideAmounts={hideAmounts}
      />
    </div>
  );
}

export default AccountCardCarousel;

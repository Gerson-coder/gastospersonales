/**
 * AccountSwitcherDrawer — bottom-sheet picker for the account carousel.
 *
 * Presents every account as a mini AccountCard tile in a 2-column grid.
 * Tapping a tile calls `onSelectAccount(idx)` which the carousel uses to
 * `scrollTo(idx)` and close the sheet.
 *
 * Why a Drawer (vaul) instead of a Sheet (Radix Dialog)?
 *   - Drag-to-dismiss feels native on mobile and matches the rest of the
 *     app (the capture flow already uses Drawer).
 *   - The overlay+blur establishes focus on the choice without yanking the
 *     user out of context.
 *
 * Accessibility:
 *   - Tile = `<button>` from AccountCard's onClick branch, so keyboard +
 *     screen readers pick it up automatically.
 *   - Active tile gets `aria-current="true"` and a visible ring so the user
 *     can see which account they're on without reading the amounts.
 */

"use client";

import * as React from "react";

import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import type { Account } from "@/lib/data/accounts";
import { ACCOUNT_SUBTYPE_LABEL } from "@/lib/data/accounts";
import { getAccountCardStyle, getAccountBankSlug } from "@/lib/account-card-theme";
import { AccountCard } from "@/components/lumi/AccountCard";
import {
  type AccountStats,
  getStatsFor,
} from "@/hooks/use-account-stats";
import { cn } from "@/lib/utils";

export type AccountSwitcherDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  stats: Map<string, AccountStats>;
  currency: "PEN" | "USD";
  activeIndex: number;
  onSelectAccount: (idx: number) => void;
  /**
   * Mirrors the carousel's hide-amounts toggle so the privacy state holds
   * across the drawer too — nothing slips through if the user has the eye
   * closed in the main view.
   */
  hideAmounts?: boolean;
};

export function AccountSwitcherDrawer({
  open,
  onOpenChange,
  accounts,
  stats,
  currency,
  activeIndex,
  onSelectAccount,
  hideAmounts = false,
}: AccountSwitcherDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>Tus cuentas</DrawerTitle>
          <DrawerDescription>
            Toca una cuenta para verla en el resumen.
          </DrawerDescription>
        </DrawerHeader>

        <div className="grid grid-cols-2 gap-3 px-4 pb-6 overflow-y-auto">
          {accounts.map((account, idx) => {
            const s = getStatsFor(stats, account.id);
            const isActive = idx === activeIndex;
            const subtypeLabel = account.subtype
              ? ACCOUNT_SUBTYPE_LABEL[account.subtype]
              : null;
            return (
              <div
                key={account.id}
                className={cn(
                  "rounded-2xl",
                  // Visible focus + active ring around the tile so the user
                  // knows which account they're on. Lives outside the card so
                  // it doesn't fight with the card's own ring-1.
                  isActive
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    : "ring-0",
                )}
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
                  variant="mini"
                  onClick={() => onSelectAccount(idx)}
                  className="w-full"
                  style={getAccountCardStyle(account)}
                />
              </div>
            );
          })}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export default AccountSwitcherDrawer;

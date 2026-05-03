/**
 * Saldo guard — single source of truth for the "no se puede sobregirar"
 * rule that both /capture and /receipt enforce before persisting an
 * expense.
 *
 * Why a separate module: the rule was duplicated inline in two pages
 * (and the bug that motivated this — the OCR flow not enforcing it —
 * was caused by exactly that drift). Centralising means a future change
 * (e.g. allow overdraft for a specific account type) lands in one place.
 *
 * Pure logic only — no React, no Supabase. The fetching side lives in
 * `useAccountBalances` (`src/hooks/use-account-balances.ts`), which
 * wraps `getAccountBalances` from `transactions.ts`.
 */

export type BalanceGuardReason = "empty" | "insufficient";

export type BalanceCheckResult =
  | { ok: true }
  | { ok: false; reason: BalanceGuardReason; balance: number };

/**
 * Shared copy for the saldo-blocking modal title. Both /capture and
 * /receipt render the same wording so the user recognises the pattern
 * regardless of entry point. Descriptions diverge on purpose (capture
 * has an inline-abono flow, receipt sends to /accounts) so they stay
 * per-page.
 */
export const BALANCE_GUARD_TITLE: Record<BalanceGuardReason, string> = {
  empty: "Sin saldo",
  insufficient: "Saldo insuficiente",
};

type CheckInput = {
  /** Income flows always pass — they don't reduce balance. */
  kind: "expense" | "income";
  /** Major-unit amount (soles/dollars), as it appears in the form. */
  amount: number;
  /** Currently picked account. `null` => guard skipped (caller has its
   *  own "Elige una cuenta" path). */
  accountId: string | null;
  /** Major-unit balance per account, keyed by account id. Absence = 0. */
  balances: Record<string, number>;
  /** False until the first `getAccountBalances` resolves. While loading
   *  we let the save go through — the network ACK + a fresh fetch on
   *  the next render will catch any genuine overdraft, and blocking on
   *  loading state would penalise users with a slow connection on the
   *  happy path. */
  balancesLoaded: boolean;
};

/**
 * Decide whether an expense can persist against the picked account.
 *
 * Three skip cases (return `{ ok: true }`):
 *   - kind is income (saldo doesn't apply)
 *   - balancesLoaded is false (don't block the user on a fetch)
 *   - accountId is null (caller handles "Elige una cuenta" elsewhere)
 *
 * Two block cases:
 *   - balance <= 0 → `empty`  ("Sin saldo")
 *   - balance < amount → `insufficient`  ("Saldo insuficiente")
 *
 * Caller renders the appropriate UI from the discriminated union.
 */
export function checkExpenseBalance(input: CheckInput): BalanceCheckResult {
  if (input.kind !== "expense") return { ok: true };
  if (!input.balancesLoaded) return { ok: true };
  if (!input.accountId) return { ok: true };

  const balance = input.balances[input.accountId] ?? 0;
  if (balance <= 0) return { ok: false, reason: "empty", balance };
  if (balance < input.amount) {
    return { ok: false, reason: "insufficient", balance };
  }
  return { ok: true };
}

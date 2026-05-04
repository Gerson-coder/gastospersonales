/**
 * `useAccountBalances` — keep a per-account saldo map in sync with the
 * active currency.
 *
 * Wrapper around `getAccountBalances` (in `src/lib/data/transactions.ts`)
 * that:
 *   - refetches on currency switch (so the guard always sees the right pool),
 *   - exposes a manual `reload()` for callers that mutate balances
 *     side-band (e.g. the inline-abono drawer in /capture),
 *   - supports a `skip` flag for demo-mode where Supabase is disabled
 *     and there's nothing to fetch.
 *
 * Soft-fail on fetch error: leaves the balances map empty + flips
 * `balancesLoaded` to true so the guard doesn't pin the UI on a network
 * blip. The save path's `createTransaction` will surface the real error
 * if the user tries to overdraft anyway.
 */

"use client";

import * as React from "react";

import {
  TX_UPSERTED_EVENT,
  getAccountBalances,
  type Currency,
} from "@/lib/data/transactions";

type Options = {
  /** When true, skip fetching (demo mode / Supabase not configured).
   *  `balancesLoaded` flips to true immediately so the guard treats the
   *  empty map as "no positive balances" and the picker UI stops
   *  spinning on a skeleton that will never resolve. */
  skip?: boolean;
};

type Result = {
  balances: Record<string, number>;
  balancesLoaded: boolean;
  /** Manual refetch — caller awaits it after a side-band mutation
   *  (abono inline) so the guard sees the new total without waiting
   *  for a currency switch. */
  reload: () => Promise<void>;
};

export function useAccountBalances(
  currency: Currency,
  options?: Options,
): Result {
  const skip = options?.skip ?? false;
  const [balances, setBalances] = React.useState<Record<string, number>>({});
  const [balancesLoaded, setBalancesLoaded] = React.useState(false);

  // Track mounted state across the async boundary so a late-resolving
  // fetch doesn't `setState` after unmount (React 19 logs a warning).
  // Ref lives across the effect cleanups and the manual `reload` call.
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const reload = React.useCallback(async () => {
    if (skip) return;
    try {
      const map = await getAccountBalances(currency);
      if (mountedRef.current) setBalances(map);
    } catch {
      // Soft-fail — guard simply won't trigger; save flow still validates.
    } finally {
      if (mountedRef.current) setBalancesLoaded(true);
    }
  }, [currency, skip]);

  React.useEffect(() => {
    if (skip) {
      setBalancesLoaded(true);
      return;
    }
    setBalancesLoaded(false);
    void reload();
  }, [reload, skip]);

  // Refetch on tx:upserted — el dashboard / accounts / capture
  // dispararon este evento al crear/editar/archivar una transacción.
  // Sin esto el saldo del picker quedaba PRE-INSERT después de
  // capturar un gasto OCR (la tarjeta y los CTAs "registrar gasto"
  // mostraban el monto viejo) hasta que el user navegara a otra ruta
  // y volviera. Mismo patrón que /dashboard y /movements.
  React.useEffect(() => {
    if (skip) return;
    const handler = () => {
      void reload();
    };
    globalThis.addEventListener(TX_UPSERTED_EVENT, handler);
    return () => {
      globalThis.removeEventListener(TX_UPSERTED_EVENT, handler);
    };
  }, [reload, skip]);

  return { balances, balancesLoaded, reload };
}

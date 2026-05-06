/**
 * `useTransactionsRealtime` — wraps `subscribeToTableRlsOnly("transactions", …)`
 * with a debounced "something changed, refetch please" callback.
 *
 * Mounted by `/dashboard` only. Other tabs (`/movements`, `/insights`) refetch
 * on mount instead — Supabase Pro caps realtime at 200 concurrent connections,
 * so we keep the surface area minimal (see design `Architecture Decisions #4`).
 *
 * Backpressure: 5 events arriving inside a 100ms burst collapse to ONE refetch
 * after the 250ms debounce window (see spec `Realtime sync · Backpressure`).
 *
 * El callback se lee via ref para que el caller pueda pasar una closure
 * inline (`() => refetch()`) sin re-subscribirse cada render.
 *
 * En Fase 4 (cuenta compartida) cambiamos de subscribeToUserTable
 * (filter `user_id=eq.${userId}`) a subscribeToTableRlsOnly. Sin filter
 * por columna, la RLS extendida nos trae los events del partner sobre
 * cuentas compartidas — sin esto, el partner no veria los cambios del
 * otro en tiempo real.
 *
 * Si el caller quiere distinguir "cambio mio" vs "cambio del partner"
 * (e.g. para mostrar toasts), pasar onPartnerEvent — recibe los rows
 * cuyo user_id !== auth.uid().
 */
"use client";

import { useEffect, useRef } from "react";

import { subscribeToTableRlsOnly } from "@/lib/supabase/realtime";
import { useSession } from "@/lib/use-session";
import type { Database } from "@/lib/supabase/types";

type TxRow = Database["public"]["Tables"]["transactions"]["Row"];

export type TransactionEventPayload = {
  event: "INSERT" | "UPDATE" | "DELETE";
  /** Fila resultante (null en DELETE). */
  new: TxRow | null;
  /** Fila previa (null en INSERT). */
  old: TxRow | null;
};

export type UseTransactionsRealtimeOpts = {
  /** Gate the subscription — pass `false` from non-dashboard contexts. */
  enabled: boolean;
  /** Fired (debounced) on any INSERT / UPDATE / DELETE visible al user. */
  onEvent: () => void;
  /**
   * Fired (NO debounced) cuando el event vino de OTRO user — i.e. el
   * partner movio algo en una cuenta compartida. Recibe el payload
   * crudo asi el caller puede generar toasts contextuales.
   */
  onPartnerEvent?: (payload: TransactionEventPayload) => void;
  /** Defaults to 250ms per design / spec. */
  debounceMs?: number;
};

export function useTransactionsRealtime({
  enabled,
  onEvent,
  onPartnerEvent,
  debounceMs = 250,
}: UseTransactionsRealtimeOpts): void {
  const { user } = useSession();

  // Stable refs para que subscribe no churn cuando onEvent /
  // onPartnerEvent cambian de identity entre renders.
  const onEventRef = useRef(onEvent);
  const onPartnerEventRef = useRef(onPartnerEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);
  useEffect(() => {
    onPartnerEventRef.current = onPartnerEvent;
  }, [onPartnerEvent]);

  useEffect(() => {
    if (!enabled || !user?.id) return;

    let timeout: ReturnType<typeof setTimeout> | null = null;
    const debouncedFire = () => {
      if (timeout !== null) clearTimeout(timeout);
      timeout = setTimeout(() => {
        timeout = null;
        onEventRef.current();
      }, debounceMs);
    };

    // RLS-only subscribe: nos trae mis events + events del partner
    // sobre cuentas compartidas. Sin esto, el filter por user_id
    // dejaria afuera los del partner.
    const channel = subscribeToTableRlsOnly(
      "transactions",
      user.id,
      (change) => {
        debouncedFire();

        // Fast-path para el caso "evento del partner" — solo si el
        // caller lo pidio. Comparamos el user_id del row contra el
        // current auth.uid() para discriminar.
        if (onPartnerEventRef.current) {
          const row = change.new ?? change.old;
          if (row && row.user_id !== user.id) {
            onPartnerEventRef.current({
              event: change.event,
              new: change.new as TxRow | null,
              old: change.old as TxRow | null,
            });
          }
        }
      },
    );

    return () => {
      if (timeout !== null) clearTimeout(timeout);
      void channel.unsubscribe();
    };
  }, [enabled, user?.id, debounceMs]);
}

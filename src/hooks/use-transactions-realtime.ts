/**
 * `useTransactionsRealtime` — wraps `subscribeToUserTable("transactions", …)`
 * with a debounced "something changed, refetch please" callback.
 *
 * Mounted by `/dashboard` only. Other tabs (`/movements`, `/insights`) refetch
 * on mount instead — Supabase Pro caps realtime at 200 concurrent connections,
 * so we keep the surface area minimal (see design `Architecture Decisions #4`).
 *
 * Backpressure: 5 events arriving inside a 100ms burst collapse to ONE refetch
 * after the 250ms debounce window (see spec `Realtime sync · Backpressure`).
 *
 * The callback is read through a ref so callers can pass an inline closure
 * (`() => refetch()`) without re-subscribing on every render.
 */
"use client";

import { useEffect, useRef } from "react";

import { subscribeToUserTable } from "@/lib/supabase/realtime";
import { useSession } from "@/lib/use-session";

export type UseTransactionsRealtimeOpts = {
  /** Gate the subscription — pass `false` from non-dashboard contexts. */
  enabled: boolean;
  /** Fired (debounced) on any INSERT / UPDATE / DELETE for the user. */
  onEvent: () => void;
  /** Defaults to 250ms per design / spec. */
  debounceMs?: number;
};

export function useTransactionsRealtime({
  enabled,
  onEvent,
  debounceMs = 250,
}: UseTransactionsRealtimeOpts): void {
  const { user } = useSession();

  // Stable ref so subscribe doesn't churn when `onEvent` identity changes
  // between renders (consumers will typically pass `() => refetch()`).
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

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

    // `subscribeToUserTable` returns a `RealtimeChannel`; cleanup goes through
    // `.unsubscribe()`. We don't care about the payload contents here — any
    // change is a cue to refetch the visible window.
    const channel = subscribeToUserTable("transactions", user.id, () => {
      debouncedFire();
    });

    return () => {
      if (timeout !== null) clearTimeout(timeout);
      void channel.unsubscribe();
    };
  }, [enabled, user?.id, debounceMs]);
}

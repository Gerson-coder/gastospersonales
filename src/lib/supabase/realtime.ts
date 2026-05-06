"use client";

import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from "@supabase/supabase-js";
import { createClient } from "./client";
import type { Database } from "./types";

type PublicTables = keyof Database["public"]["Tables"];
type RowOf<T extends PublicTables> = Database["public"]["Tables"][T]["Row"];

type ChangePayload<T extends PublicTables> = {
  event: "INSERT" | "UPDATE" | "DELETE";
  new: RowOf<T> | null;
  old: RowOf<T> | null;
};

/**
 * Subscribe to realtime changes on a table for the current user.
 *
 * Caller MUST unsubscribe on cleanup (e.g. in useEffect's return).
 *
 * Example:
 *   useEffect(() => {
 *     const channel = subscribeToUserTable("transactions", userId, (change) => {
 *       if (change.event === "INSERT") setRows(r => [change.new, ...r]);
 *     });
 *     return () => { channel.unsubscribe(); };
 *   }, [userId]);
 *
 * NOTE: only mount on screens that need realtime — Supabase Pro is capped
 * at 200 concurrent connections. Per the design, only /dashboard
 * subscribes. Other screens read on mount or via revalidate.
 */
export function subscribeToUserTable<T extends PublicTables>(
  table: T,
  userId: string,
  onChange: (payload: ChangePayload<T>) => void,
): RealtimeChannel {
  const supabase = createClient();
  const channel = supabase
    .channel(`user-${userId}-${table as string}`)
    .on<RowOf<T> & Record<string, unknown>>(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: table as string,
        filter: `user_id=eq.${userId}`,
      },
      (payload: RealtimePostgresChangesPayload<RowOf<T> & Record<string, unknown>>) => {
        // Supabase emits empty objects ({}) for `old` on INSERT and `new` on
        // DELETE. Normalize to null so callers get a clean discriminated shape.
        const isEmpty = (v: unknown): boolean =>
          typeof v === "object" && v !== null && Object.keys(v).length === 0;
        onChange({
          event: payload.eventType,
          new: isEmpty(payload.new) ? null : (payload.new as RowOf<T>),
          old: isEmpty(payload.old) ? null : (payload.old as RowOf<T>),
        });
      },
    )
    .subscribe();
  return channel;
}

/**
 * Subscribe to realtime changes on a table SIN filter de user_id —
 * la RLS del table decide que rows el subscriber recibe. Util para
 * tablas como `transactions` que tras 00027 tienen RLS extendida
 * (mis rows + rows en cuentas compartidas) y un filter por user_id
 * dejaria afuera los events del partner.
 *
 * Tradeoff vs subscribeToUserTable:
 *   + cubre cuentas compartidas (no se necesita conocer las cuentas
 *     antes de subscribirse).
 *   - el server evalua RLS por cada event en lugar de filtrar por
 *     columna — mas costoso si hay mucha actividad. OK para un app
 *     de finanzas personal en Pro plan.
 *
 * Lo usamos solo en /dashboard para transactions; otros tables (e.g.
 * accounts events) siguen usando el filter por user_id.
 */
export function subscribeToTableRlsOnly<T extends PublicTables>(
  table: T,
  channelKey: string,
  onChange: (payload: ChangePayload<T>) => void,
): RealtimeChannel {
  const supabase = createClient();
  const channel = supabase
    .channel(`rls-${channelKey}-${table as string}`)
    .on<RowOf<T> & Record<string, unknown>>(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: table as string,
        // Sin filter — RLS hace el job.
      },
      (payload: RealtimePostgresChangesPayload<RowOf<T> & Record<string, unknown>>) => {
        const isEmpty = (v: unknown): boolean =>
          typeof v === "object" && v !== null && Object.keys(v).length === 0;
        onChange({
          event: payload.eventType,
          new: isEmpty(payload.new) ? null : (payload.new as RowOf<T>),
          old: isEmpty(payload.old) ? null : (payload.old as RowOf<T>),
        });
      },
    )
    .subscribe();
  return channel;
}

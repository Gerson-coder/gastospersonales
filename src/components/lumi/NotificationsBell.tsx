/**
 * NotificationsBell — Bell-icon dropdown that surfaces derived
 * activity for the current user. No DB table backs this yet — the
 * list is composed in-browser from the same `useTransactionsWindow`
 * hook the dashboard uses, so we don't pay an extra round-trip.
 *
 * Three signal types right now (more can be plugged in incrementally):
 *   1. New movement(s) in the last 24h.
 *   2. Big single charge (≥ 25% of monthly average expense).
 *   3. Income received in the last 7 days.
 *
 * Read-state lives in localStorage under `lumi-notifs-read-at` so a
 * notification dismissed in one session stays read in the next. No
 * per-notification id tracking — we just stamp "I read up to T" and
 * any signal older than T renders without the unread indicator.
 */
"use client";

import * as React from "react";
import { Bell, ChevronRight, Sparkles, TrendingDown, TrendingUp } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTransactionsWindow } from "@/hooks/use-transactions-window";
import { useActiveCurrency } from "@/hooks/use-active-currency";
import { CURRENCY_LABEL, formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

const READ_KEY = "lumi-notifs-read-at";

type NotifIcon = React.ComponentType<{
  size?: number;
  className?: string;
  "aria-hidden"?: boolean;
}>;

type Notif = {
  id: string;
  title: string;
  body: string;
  // ISO timestamp of the most recent event represented by this notif.
  // Used for the read-state cutoff comparison.
  at: string;
  tone: "positive" | "warning" | "neutral";
  Icon: NotifIcon;
};

function readReadAt(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(READ_KEY);
  } catch {
    return null;
  }
}

function writeReadAt(iso: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(READ_KEY, iso);
  } catch {
    // quota / private mode — fail silent
  }
}

function relativeLabel(iso: string, now: Date): string {
  const at = new Date(iso);
  const diffMs = now.getTime() - at.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "Hace un momento";
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `Hace ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD === 1) return "Ayer";
  if (diffD < 7) return `Hace ${diffD} días`;
  return at.toLocaleDateString("es-PE", { day: "numeric", month: "short" });
}

export function NotificationsBell({ className }: { className?: string }) {
  const { currency, hydrated: currencyHydrated } = useActiveCurrency();
  const win = useTransactionsWindow({
    months: 2,
    currency,
    accountId: null,
  });

  const [readAt, setReadAt] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    setReadAt(readReadAt());
  }, []);

  // Compose a tiny set of derived notifications from the loaded rows.
  // Pure projection — no async, no side effects.
  const notifications = React.useMemo<Notif[]>(() => {
    if (!currencyHydrated) return [];
    const list: Notif[] = [];
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60_000);

    const recent = win.rows.filter((r) => new Date(r.occurredAt) >= dayAgo);
    if (recent.length > 0) {
      const last = recent[0];
      list.push({
        id: "recent-activity",
        title:
          recent.length === 1
            ? "Nuevo movimiento"
            : `${recent.length} movimientos hoy`,
        body:
          recent.length === 1
            ? `${last.kind === "expense" ? "Gasto" : "Ingreso"} de ${formatMoney(Math.round(last.amount * 100), currency)}${last.merchantName ? ` en ${last.merchantName}` : ""}.`
            : "Revisa tus últimas transacciones del día.",
        at: last.occurredAt,
        tone: last.kind === "expense" ? "warning" : "positive",
        Icon: last.kind === "expense" ? TrendingDown : TrendingUp,
      });
    }

    // Income received this week — celebrate once.
    const incomeWeek = win.rows.filter(
      (r) => r.kind === "income" && new Date(r.occurredAt) >= weekAgo,
    );
    if (incomeWeek.length > 0) {
      const totalIncome = incomeWeek.reduce((s, r) => s + r.amount, 0);
      list.push({
        id: "income-week",
        title: "Llegó dinero esta semana",
        body: `Recibiste ${formatMoney(Math.round(totalIncome * 100), currency)} en ${incomeWeek.length} ${incomeWeek.length === 1 ? "ingreso" : "ingresos"}.`,
        at: incomeWeek[0].occurredAt,
        tone: "positive",
        Icon: Sparkles,
      });
    }

    // Big single charge — over 25% of the monthly average expense.
    const monthlyAvg =
      win.monthTotals.length > 0
        ? win.monthTotals.reduce((s, b) => s + b.spent, 0) /
          win.monthTotals.length
        : 0;
    const threshold = Math.max(monthlyAvg * 0.25, 0);
    const bigCharges = win.rows.filter(
      (r) => r.kind === "expense" && r.amount >= threshold && threshold > 0,
    );
    if (bigCharges.length > 0) {
      const top = bigCharges[0];
      list.push({
        id: "big-charge",
        title: "Cargo grande detectado",
        body: `${formatMoney(Math.round(top.amount * 100), currency)}${top.merchantName ? ` en ${top.merchantName}` : ""} — más del 25% de tu promedio mensual.`,
        at: top.occurredAt,
        tone: "warning",
        Icon: TrendingDown,
      });
    }

    // Sort: most recent event first.
    return list.sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [win.rows, win.monthTotals, currency, currencyHydrated]);

  const unreadCount = React.useMemo(() => {
    if (!readAt) return notifications.length;
    return notifications.filter((n) => n.at > readAt).length;
  }, [notifications, readAt]);

  function markAllRead() {
    const stamp = new Date().toISOString();
    setReadAt(stamp);
    writeReadAt(stamp);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // Mark as read when the user opens the dropdown — they've now seen
    // them, that's the same contract as the bell badge in any inbox app.
    if (next && unreadCount > 0) markAllRead();
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger
        aria-label={
          unreadCount > 0
            ? `Notificaciones, ${unreadCount} sin leer`
            : "Notificaciones"
        }
        className={cn(
          "relative inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <Bell size={18} aria-hidden="true" />
        {unreadCount > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 inline-flex min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-[16px] text-primary-foreground"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[320px] p-0"
      >
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <span className="text-[13px] font-semibold text-foreground">
            Notificaciones
          </span>
          <span className="text-[11px] text-muted-foreground">
            {CURRENCY_LABEL[currency]}
          </span>
        </div>
        {win.loading && notifications.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">
            Cargando…
          </div>
        ) : notifications.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">
            <Bell
              size={20}
              className="mx-auto mb-2 text-muted-foreground/60"
              aria-hidden="true"
            />
            <p>Estás al día. Vuelve después de registrar movimientos.</p>
          </div>
        ) : (
          <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
            {notifications.map((n) => {
              const isUnread = !readAt || n.at > readAt;
              const tileClass =
                n.tone === "positive"
                  ? "bg-[var(--color-success)]/15 text-[var(--color-success)]"
                  : n.tone === "warning"
                    ? "bg-[var(--color-warning)]/20 text-[var(--color-warning-foreground)]"
                    : "bg-primary/10 text-primary";
              return (
                <li key={n.id}>
                  <div className="flex items-start gap-3 px-3 py-3">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full",
                        tileClass,
                      )}
                    >
                      <n.Icon size={15} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span
                          className={cn(
                            "truncate text-[13px] font-semibold text-foreground",
                            isUnread && "before:mr-1.5 before:inline-block before:h-1.5 before:w-1.5 before:rounded-full before:bg-primary before:content-['']",
                          )}
                        >
                          {n.title}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
                        {n.body}
                      </p>
                      <p className="mt-1 text-[10.5px] text-muted-foreground/70">
                        {relativeLabel(n.at, new Date())}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="border-t border-border px-3 py-2 text-right">
          <a
            href="/movements"
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:text-primary/80"
          >
            Ver todos los movimientos
            <ChevronRight size={13} aria-hidden="true" />
          </a>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default NotificationsBell;

/**
 * Movements route — Kane
 *
 * Mobile-first list of every transaction, grouped by day with sticky day
 * headers. Scales to a centered max-w-3xl column at md+ so the list doesn't
 * stretch on desktop.
 *
 * Source of truth: Kane UI-kit `MovementsScreen` (TabScreens.jsx, lines 4-86).
 *
 * Wave 5 wires this page to Supabase:
 *   - `listTransactionsByCurrency` for cursor-paginated reads (50/page).
 *   - Long-press / right-click on a row opens `TransactionActionSheet` with
 *     Editar / Eliminar.
 *   - Editar → `/capture?edit=<id>` (form rehydrates).
 *   - Eliminar → `archiveTransaction` with optimistic local removal +
 *     5-second Sonner undo toast that calls `unarchiveTransaction`.
 *   - Refetches on mount + on currency change. No realtime channel here —
 *     realtime lives only on /dashboard (per design decision #4).
 *   - Search and chip filters now compose over the live `rows` array.
 */

"use client";

import * as React from "react";
import nextDynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Search,
  Plus,
  UtensilsCrossed,
  Car,
  ShoppingCart,
  Heart,
  Film,
  Zap,
  Home as HomeIcon,
  GraduationCap,
  Briefcase,
  Circle,
  ArrowLeft,
  X,
  Loader2,
  AlertCircle,
  Landmark,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { AccountBrandIcon } from "@/components/kane/AccountBrandIcon";
import { accountChipBgClass } from "@/lib/account-brand-slug";
import { formatTxDate } from "@/lib/format-tx-date";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppHeader } from "@/components/kane/AppHeader";
// Lazy-load: ambos drawers solo se montan tras una interaccion del
// user (long-press abre el ActionSheet, tap abre el DetailDrawer).
// Sacarlos del initial chunk reduce el JS que se parsea al entrar a
// /movements. ssr:false porque viven detras de state local.
const TransactionActionSheet = nextDynamic(
  () => import("@/components/kane/TransactionActionSheet"),
  { ssr: false },
);
const TransactionDetailDrawer = nextDynamic(
  () => import("@/components/kane/TransactionDetailDrawer"),
  { ssr: false },
);
import { useActiveCurrency } from "@/hooks/use-active-currency";
import {
  archiveTransaction,
  listTransactionsByCurrency,
  unarchiveTransaction,
  TX_UPSERTED_EVENT,
  type ListCursor,
  type TransactionView,
} from "@/lib/data/transactions";
import type { Currency } from "@/lib/supabase/types";

// --- Types ----------------------------------------------------------------
type Filter = "todo" | "gastos" | "ingresos";

// Local categorization that maps a category NAME (from the joined
// `categories.name` column) to a stable Kane category bucket so we can keep
// the existing icon + tint palette without round-tripping a DB-backed
// `icon` field. `other` is the fallback for unknown names.
type CategoryBucket =
  | "food"
  | "transport"
  | "market"
  | "health"
  | "fun"
  | "utilities"
  | "home"
  | "edu"
  | "work"
  | "other";

// --- Category map ---------------------------------------------------------
const CATEGORY_ICONS: Record<
  CategoryBucket,
  React.ComponentType<{ className?: string; size?: number }>
> = {
  food: UtensilsCrossed,
  transport: Car,
  market: ShoppingCart,
  health: Heart,
  fun: Film,
  utilities: Zap,
  home: HomeIcon,
  edu: GraduationCap,
  work: Briefcase,
  other: Circle,
};

// --- Unified category tint palette ----------------------------------------
// Subtle tints (high lightness, low chroma) so the list reads as a coherent
// taxonomy instead of an arcoíris. Mirrors the Dashboard polish palette.
const CATEGORY_TINT: Record<CategoryBucket, { bg: string; text: string }> = {
  food: {
    bg: "bg-[oklch(0.92_0.04_30)]",
    text: "text-[oklch(0.45_0.10_30)]",
  },
  transport: {
    bg: "bg-[oklch(0.92_0.03_220)]",
    text: "text-[oklch(0.45_0.10_220)]",
  },
  market: {
    bg: "bg-[oklch(0.92_0.04_280)]",
    text: "text-[oklch(0.45_0.10_280)]",
  },
  health: {
    bg: "bg-[oklch(0.92_0.04_10)]",
    text: "text-[oklch(0.50_0.12_10)]",
  },
  fun: {
    bg: "bg-[oklch(0.92_0.04_310)]",
    text: "text-[oklch(0.45_0.10_310)]",
  },
  utilities: {
    bg: "bg-[oklch(0.92_0.04_70)]",
    text: "text-[oklch(0.45_0.10_70)]",
  },
  home: {
    bg: "bg-[oklch(0.92_0.04_70)]",
    text: "text-[oklch(0.45_0.10_70)]",
  },
  edu: {
    bg: "bg-[oklch(0.92_0.03_180)]",
    text: "text-[oklch(0.45_0.10_180)]",
  },
  work: {
    bg: "bg-[oklch(0.92_0.03_140)]",
    text: "text-[oklch(0.45_0.10_140)]",
  },
  other: {
    bg: "bg-[oklch(0.92_0_95)]",
    text: "text-[oklch(0.45_0_95)]",
  },
};

/**
 * Best-effort name → bucket inference. Real data ships category names like
 * "Comida", "Transporte", etc.; we lowercase + match keywords. Unknown names
 * fall through to `other` which still renders cleanly.
 */
function bucketFromName(name: string | null): CategoryBucket {
  if (!name) return "other";
  const n = name.toLowerCase();
  if (n.includes("comida") || n.includes("food") || n.includes("café")) return "food";
  if (n.includes("transp")) return "transport";
  if (n.includes("merc") || n.includes("super")) return "market";
  if (n.includes("salud") || n.includes("health") || n.includes("farma")) return "health";
  if (n.includes("ocio") || n.includes("entretenimiento") || n.includes("fun")) return "fun";
  if (n.includes("servicio") || n.includes("util")) return "utilities";
  if (n.includes("vivienda") || n.includes("hogar") || n.includes("home") || n.includes("alquil")) return "home";
  if (n.includes("educ") || n.includes("edu")) return "edu";
  if (n.includes("trabajo") || n.includes("work") || n.includes("sueldo") || n.includes("ingreso")) return "work";
  return "other";
}

// Shared min-width for any money column (transaction prices + day net) so
// every value lands on the same right edge regardless of digit count.
const MONEY_COL_MIN_WIDTH = "108px";

// --- Money formatting -----------------------------------------------------
function formatMoney(amount: number, currency: Currency = "PEN"): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

// --- Date helpers ---------------------------------------------------------
/** Returns a YYYY-MM-DD key from an ISO timestamp. */
function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/** Build a Date at local midnight from a YYYY-MM-DD key. */
function dayDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Format a day-key as the visible group header.
 * Uses real `new Date()` now that data is live.
 */
function dayLabel(key: string): string {
  const d = dayDate(key);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  if (diffDays <= 0) return "Hoy";
  if (diffDays === 1) return "Ayer";
  return new Intl.DateTimeFormat("es-PE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
    .format(d)
    .replace(/\./g, "");
}

// --- Group by day (preserves dataset order; assumes data is sorted) -------
type DayGroup = {
  key: string;
  label: string;
  items: TransactionView[];
  /** Net for the day in the active currency. Sum already filtered by currency. */
  net: number;
};

function groupByDay(txns: TransactionView[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const t of txns) {
    const key = dayKey(t.occurredAt);
    let g = map.get(key);
    if (!g) {
      g = { key, label: dayLabel(key), items: [], net: 0 };
      map.set(key, g);
    }
    g.items.push(t);
    g.net += t.kind === "income" ? t.amount : -t.amount;
  }
  return Array.from(map.values()).sort((a, b) => (a.key < b.key ? 1 : -1));
}

// --- Long-press hook -----------------------------------------------------
/**
 * useLongPress — pointer-based long-press detector that works on touch and
 * mouse. Cancels the timer if:
 *   - the pointer moves more than `movementThreshold` px (scroll intent),
 *   - the pointer is released before `delayMs`,
 *   - the pointer leaves the element.
 *
 * Right-click on desktop also triggers the action via `onContextMenu`,
 * giving keyboard-less mouse users an obvious affordance without a separate
 * "..." button (the spec calls for one for keyboard a11y; we'll add it in a
 * follow-up — for now Editar/Eliminar remain reachable via long-press +
 * right-click).
 */
function useLongPress(
  onLongPress: () => void,
  opts: { delayMs?: number; movementThreshold?: number; onTap?: () => void } = {},
) {
  const { delayMs = 500, movementThreshold = 8, onTap } = opts;
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPos = React.useRef<{ x: number; y: number } | null>(null);
  const triggered = React.useRef(false);

  const start = React.useCallback(
    (x: number, y: number) => {
      triggered.current = false;
      startPos.current = { x, y };
      timer.current = setTimeout(() => {
        timer.current = null;
        triggered.current = true;
        onLongPress();
      }, delayMs);
    },
    [onLongPress, delayMs],
  );

  const cancel = React.useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    startPos.current = null;
  }, []);

  const move = React.useCallback(
    (x: number, y: number) => {
      if (!startPos.current) return;
      const dx = x - startPos.current.x;
      const dy = y - startPos.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > movementThreshold) cancel();
    },
    [cancel, movementThreshold],
  );

  // Quick pointer-up (timer still pending, no movement past threshold) is
  // treated as a tap. We fire it INSTEAD of cancel-and-do-nothing so the
  // row can open a detail drawer on press without colliding with the
  // long-press-opens-action-sheet contract. Long-press already nulls
  // `timer.current` from inside its setTimeout, so by the time pointerup
  // arrives after a fired long-press, the tap branch is skipped.
  const handlePointerUp = React.useCallback(() => {
    const wasTap = timer.current !== null && !triggered.current;
    cancel();
    if (wasTap && onTap) onTap();
  }, [cancel, onTap]);

  return {
    onPointerDown: (e: React.PointerEvent) => start(e.clientX, e.clientY),
    onPointerMove: (e: React.PointerEvent) => move(e.clientX, e.clientY),
    onPointerUp: handlePointerUp,
    onPointerCancel: cancel,
    onPointerLeave: cancel,
    // Right-click → same menu as long-press. Prevent the native context menu.
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      onLongPress();
    },
  };
}

// --- Transaction row ------------------------------------------------------
function TransactionRow({
  t,
  onLongPress,
  onTap,
}: {
  t: TransactionView;
  onLongPress: () => void;
  onTap: () => void;
}) {
  const bucket = bucketFromName(t.categoryName);
  const Icon = CATEGORY_ICONS[bucket];
  const tint = CATEGORY_TINT[bucket];

  const isIncome = t.kind === "income";
  const signed = isIncome ? t.amount : -t.amount;
  const sign = signed < 0 ? "– " : isIncome ? "+ " : "";
  const moneyText = `${sign}${formatMoney(Math.abs(signed), t.currency)}`;

  // Title language matches /dashboard rows:
  //   - Income: account name leads (the deposit's "where", more useful
  //     than the dim "Ahorro" category).
  //   - Expense: merchant > category fallback.
  // Subtitle is the friendly relative date so the user always sees WHEN.
  const merchantOrCategory =
    t.merchantName ?? (t.categoryName ? t.categoryName : "Sin nombre");
  const titleText = isIncome
    ? (t.accountName ?? merchantOrCategory)
    : merchantOrCategory;
  const subtitle = formatTxDate(t.occurredAt);

  const ariaLabel = `${titleText}, ${moneyText}, ${subtitle}`;

  const longPressHandlers = useLongPress(onLongPress, { onTap });

  return (
    <article
      aria-label={ariaLabel}
      className="flex min-h-14 select-none items-center gap-3.5 px-4 py-3.5 touch-manipulation"
      style={{ WebkitTouchCallout: "none" }}
      {...longPressHandlers}
    >
      {isIncome && t.accountName ? (
        // Income rows lead with the account NAME — the icon should be the
        // account's brand logo (BCP, Interbank, Yape, Plin...) rather
        // than a generic category icon. Falls back to Landmark when the
        // label has no registered brand. Same chip-bg rule as /accounts:
        // Interbank keeps a colored bg because its SVG depends on it.
        <span
          aria-hidden="true"
          className={cn(
            "flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-foreground",
            accountChipBgClass(t.accountName),
          )}
        >
          <AccountBrandIcon
            label={t.accountName}
            fallback={<Landmark size={16} />}
          />
        </span>
      ) : t.merchantLogoSlug ? (
        <span
          aria-hidden="true"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVGs in /public */}
          <img
            src={`/logos/merchants/${t.merchantLogoSlug}.svg`}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="h-full w-full object-contain"
          />
        </span>
      ) : (
        <div
          aria-hidden="true"
          className={cn(
            "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full",
            tint.bg,
            tint.text,
          )}
        >
          <Icon size={18} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold leading-tight text-foreground">
          {titleText}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {subtitle}
        </div>
      </div>
      <span
        className={cn(
          "ml-auto shrink-0 text-right whitespace-nowrap",
          "font-semibold tabular-nums leading-none tracking-tight text-base",
          isIncome
            ? "text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]"
            : "text-destructive",
        )}
        style={{
          fontFeatureSettings: '"tnum","lnum"',
          minWidth: MONEY_COL_MIN_WIDTH,
        }}
      >
        {moneyText}
      </span>
    </article>
  );
}

// --- Filter chips ---------------------------------------------------------
const FILTERS: ReadonlyArray<{ id: Filter; label: string }> = [
  { id: "todo", label: "Todo" },
  { id: "gastos", label: "Gastos" },
  { id: "ingresos", label: "Ingresos" },
];

function FilterChips({
  value,
  onChange,
}: {
  value: Filter;
  onChange: (next: Filter) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Filtrar movimientos" className="flex gap-2">
      {FILTERS.map((f) => {
        const selected = f.id === value;
        return (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(f.id)}
            className={cn(
              "inline-flex h-11 items-center justify-center rounded-full border px-4 text-[13px] font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              selected
                ? "border-foreground bg-foreground text-background shadow-sm"
                : "border-border bg-transparent text-foreground hover:bg-muted",
            )}
          >
            {f.label}
          </button>
        );
      })}
    </div>
  );
}

// --- Page -----------------------------------------------------------------
export default function MovementsPage() {
  return (
    <React.Suspense fallback={null}>
      <MovementsContent />
    </React.Suspense>
  );
}

function MovementsContent() {
  const router = useRouter();
  const { currency } = useActiveCurrency();
  const params = useSearchParams();

  const initialFilter: Filter = (() => {
    const f = params?.get("filter");
    if (f === "gastos") return "gastos";
    if (f === "ingresos") return "ingresos";
    return "todo";
  })();
  const [filter, setFilter] = React.useState<Filter>(initialFilter);

  const [isSearching, setIsSearching] = React.useState(false);
  const [query, setQuery] = React.useState("");

  // Live data state.
  const [rows, setRows] = React.useState<TransactionView[]>([]);
  const [nextCursor, setNextCursor] = React.useState<ListCursor | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  // Action sheet target — null when closed. Long-press / right-click.
  const [actionSheetTx, setActionSheetTx] =
    React.useState<TransactionView | null>(null);
  // Detail drawer target — null when closed. Tap on a row.
  const [detailTx, setDetailTx] =
    React.useState<TransactionView | null>(null);

  // Bumping `reloadKey` forces the initial-fetch effect to re-run (used by
  // the error state's "Reintentar" button).
  const [reloadKey, setReloadKey] = React.useState(0);

  // Initial fetch on mount and on currency change. `cancelled` flag guards
  // against state updates after unmount or after a newer fetch superseded
  // this one (currency flipped mid-flight).
  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // 20 rows on the first paint instead of 50 — cuts the initial
        // joined-payload size by 60% and the user only sees the top of
        // the list anyway. `loadMore()` keeps 50 to make scrolling cheap
        // once the page is interactive.
        const result = await listTransactionsByCurrency({ currency, limit: 20 });
        if (cancelled) return;
        setRows(result.rows);
        setNextCursor(result.nextCursor);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error("Error desconocido"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [currency, reloadKey]);

  // Live-update bridge — /movements does NOT subscribe a Supabase
  // realtime channel (por diseño: realtime vive solo en /dashboard
  // para no romper el connection budget). Sin este listener, volver
  // de /capture después de editar mostraba valores viejos.
  //
  // Diseño revisado tras "se siente lento al navegar" del user.
  // Antes escuchabamos focus + pageshow + visibilitychange + el
  // evento — eso hacia que cada navegacion gatillara 2-3 fetchs en
  // serie a Supabase (focus → fetch → visibilitychange → fetch).
  // Ahora:
  //   - Solo TX_UPSERTED_EVENT (cambios reales) y visibilitychange
  //     (volver al tab tras un rato). focus y pageshow se quitan
  //     porque eran disparos redundantes en la misma navegacion.
  //   - Coalesce window de 1s via lastRefetchAtRef: dos eventos
  //     consecutivos dentro de 1s colapsan a un solo fetch. Esto
  //     ataca el caso "TX_UPSERTED_EVENT + visibilitychange casi
  //     simultaneos" que pasaba al volver de /capture y aplastaba
  //     dos queries identicas.
  React.useEffect(() => {
    let cancelled = false;
    let lastRefetchAt = 0;
    const COALESCE_MS = 1000;
    async function refresh() {
      const now = Date.now();
      if (now - lastRefetchAt < COALESCE_MS) return;
      lastRefetchAt = now;
      try {
        const result = await listTransactionsByCurrency({ currency, limit: 20 });
        if (cancelled) return;
        setRows((prev) => {
          const byId = new Map(prev.map((r) => [r.id, r]));
          for (const r of result.rows) byId.set(r.id, r);
          const merged = Array.from(byId.values());
          merged.sort(
            (a, b) =>
              b.occurredAt.localeCompare(a.occurredAt) ||
              b.id.localeCompare(a.id),
          );
          return merged;
        });
      } catch {
        // Soft-fail — el siguiente mount fetch / reload manual cubre.
      }
    }
    const handler = () => {
      void refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    globalThis.addEventListener(TX_UPSERTED_EVENT, handler);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      globalThis.removeEventListener(TX_UPSERTED_EVENT, handler);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [currency]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await listTransactionsByCurrency({
        currency,
        cursor: nextCursor,
        limit: 50,
      });
      setRows((prev) => [...prev, ...result.rows]);
      setNextCursor(result.nextCursor);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos cargar más.");
    } finally {
      setLoadingMore(false);
    }
  }

  // Edit flow — same single source of truth for both the long-press
  // action sheet and the detail drawer. /capture?edit=<id> handles
  // rehydration + full validation, so we don't duplicate edit UI here.
  function editTx(tx: TransactionView) {
    router.push(`/capture?edit=${tx.id}`);
  }

  /**
   * Optimistic archive with undo.
   *
   * Race notes:
   *   - We remove the row from local state BEFORE the network call so the
   *     list responds instantly. If the server rejects, we re-insert it in
   *     the original sort order `(occurredAt DESC, id DESC)` so it lands in
   *     the same slot.
   *   - The undo callback calls `unarchiveTransaction` and then re-inserts
   *     the row using the same comparator. We don't refetch — keeping it
   *     local is faster and avoids surprising scroll jumps. If realtime
   *     (only on /dashboard) hadn't already removed it elsewhere, the row
   *     is back as if nothing happened.
   *   - Because /movements does NOT subscribe to realtime, we don't have to
   *     guard against a concurrent insert event arriving for the same id.
   *
   * Shared by long-press (action sheet) and tap (detail drawer) — both
   * surfaces need identical archive semantics.
   */
  async function archiveTx(tx: TransactionView) {
    // Optimistic local removal.
    setRows((prev) => prev.filter((r) => r.id !== tx.id));

    try {
      await archiveTransaction(tx.id);
      toast("Movimiento archivado", {
        action: {
          label: "Deshacer",
          onClick: async () => {
            try {
              await unarchiveTransaction(tx.id);
              setRows((prev) => {
                // Avoid duplicate insertion if realtime/another path already
                // restored the row.
                if (prev.some((r) => r.id === tx.id)) return prev;
                const next = [...prev, tx];
                next.sort(
                  (a, b) =>
                    b.occurredAt.localeCompare(a.occurredAt) ||
                    b.id.localeCompare(a.id),
                );
                return next;
              });
              toast.success("Restaurado.");
            } catch (undoErr) {
              toast.error(
                undoErr instanceof Error
                  ? undoErr.message
                  : "No pudimos restaurar el movimiento.",
              );
            }
          },
        },
        duration: 5000,
      });
    } catch (err) {
      // Restore on failure — server rejected the archive.
      setRows((prev) => {
        if (prev.some((r) => r.id === tx.id)) return prev;
        const next = [...prev, tx];
        next.sort(
          (a, b) =>
            b.occurredAt.localeCompare(a.occurredAt) ||
            b.id.localeCompare(a.id),
        );
        return next;
      });
      toast.error(err instanceof Error ? err.message : "No pudimos archivar.");
    }
  }

  // Action-sheet adapters — the sheet's onEdit / onArchive props are
  // arg-less, so we read from actionSheetTx + close the sheet here.
  function handleEdit() {
    if (!actionSheetTx) return;
    const tx = actionSheetTx;
    setActionSheetTx(null);
    editTx(tx);
  }
  async function handleArchive() {
    if (!actionSheetTx) return;
    const tx = actionSheetTx;
    setActionSheetTx(null);
    await archiveTx(tx);
  }

  // Filter chain composes the chip filter with the free-text search.
  const filtered = React.useMemo(() => {
    let list: TransactionView[] = rows.filter((t) =>
      filter === "todo"
        ? true
        : filter === "gastos"
          ? t.kind === "expense"
          : t.kind === "income",
    );

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((t) => {
        if (t.merchantName && t.merchantName.toLowerCase().includes(q)) return true;
        if (t.categoryName && t.categoryName.toLowerCase().includes(q)) return true;
        const amountStr = t.amount.toFixed(2);
        if (amountStr.includes(q)) return true;
        return false;
      });
    }

    return list;
  }, [rows, filter, query]);

  const groups = React.useMemo(() => groupByDay(filtered), [filtered]);

  const closeSearch = React.useCallback(() => {
    setIsSearching(false);
    setQuery("");
  }, []);

  const trimmedQuery = query.trim();
  const hasActiveQuery = trimmedQuery.length > 0;
  const noResults = hasActiveQuery && groups.length === 0;
  const isEmpty =
    !loading && !error && rows.length === 0 && !hasActiveQuery;

  // Eyebrow shows current month + year.
  const eyebrow = React.useMemo(() => {
    const now = new Date();
    return new Intl.DateTimeFormat("es-PE", { month: "long", year: "numeric" })
      .format(now)
      .replace(/\./g, "");
  }, []);

  return (
    <div className="relative min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl md:px-8 md:py-8">
        {/* Header — swaps between AppHeader (idle) and an inline search input. */}
        {isSearching ? (
          <header className="flex min-h-[64px] items-center gap-2 px-5 pt-3 transition-all duration-200 md:px-0 md:pt-0">
            <button
              type="button"
              onClick={closeSearch}
              aria-label="Cerrar búsqueda"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-foreground transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
            <div className="relative flex-1">
              <Search
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                inputMode="search"
                autoComplete="off"
                autoFocus
                aria-label="Buscar movimientos"
                placeholder="Buscar por nombre, categoría o monto"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") closeSearch();
                }}
                className="h-11 rounded-full border-border bg-muted pl-9 pr-10 text-[14px]"
              />
              {query.length > 0 && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Borrar búsqueda"
                  className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          </header>
        ) : (
          <AppHeader
            eyebrow={eyebrow}
            title="Movimientos"
            titleStyle="display"
            actionsBefore={
              <button
                type="button"
                onClick={() => setIsSearching(true)}
                aria-label="Buscar movimientos"
                aria-expanded={false}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted text-foreground transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Search size={16} aria-hidden="true" />
              </button>
            }
          />
        )}

        {/* Filter chips */}
        <div className="px-4 pb-3 pt-4 md:px-0 md:pt-6">
          <FilterChips value={filter} onChange={setFilter} />
        </div>

        {/* Content states: loading / error / empty / no-results / list */}
        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <ErrorState onRetry={() => setReloadKey((k) => k + 1)} />
        ) : isEmpty ? (
          <EmptyState currency={currency} />
        ) : noResults ? (
          <NoSearchResults query={trimmedQuery} />
        ) : (
          <div className="px-4 pb-8 md:px-0">
            {groups.map((g) => (
              <DayGroupSection
                key={g.key}
                group={g}
                currency={currency}
                onLongPress={(tx) => setActionSheetTx(tx)}
                onTap={(tx) => setDetailTx(tx)}
              />
            ))}

            {/* Pagination — disabled when no more pages or while loading. */}
            <div className="mt-6 flex flex-col items-center gap-2">
              {nextCursor ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="h-11 rounded-full px-5 text-[13px] font-semibold"
                  aria-label="Cargar más movimientos"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 size={14} aria-hidden className="animate-spin" />
                      <span className="ml-1.5">Cargando…</span>
                    </>
                  ) : (
                    "Cargar más"
                  )}
                </Button>
              ) : rows.length > 0 ? (
                <p className="text-[12px] text-muted-foreground">
                  No hay más movimientos.
                </p>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Action sheet — long-press / right-click on any row. */}
      {actionSheetTx ? (
        <TransactionActionSheet
          open={actionSheetTx !== null}
          onOpenChange={(open) => {
            if (!open) setActionSheetTx(null);
          }}
          transactionId={actionSheetTx.id}
          merchantName={actionSheetTx.merchantName}
          categoryName={actionSheetTx.categoryName}
          amount={actionSheetTx.amount}
          currency={actionSheetTx.currency}
          onEdit={handleEdit}
          onArchive={handleArchive}
        />
      ) : null}

      {/* Detail drawer — short tap on any row. Editar y Eliminar
          comparten el flujo del action sheet (mismas helpers) para que
          el comportamiento sea uniforme entre tap y long-press. */}
      <TransactionDetailDrawer
        open={detailTx !== null}
        onOpenChange={(open) => {
          if (!open) setDetailTx(null);
        }}
        transaction={detailTx}
        onEdit={(tx) => {
          setDetailTx(null);
          editTx(tx);
        }}
        onArchive={(tx) => {
          setDetailTx(null);
          void archiveTx(tx);
        }}
      />
    </div>
  );
}

// --- Loading skeleton -----------------------------------------------------
function LoadingSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Cargando movimientos"
      className="px-4 pb-8 md:px-0"
    >
      <Card className="overflow-hidden rounded-2xl border-border p-0">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn(
              "flex min-h-14 items-center gap-3.5 px-4 py-3.5",
              i ? "border-t border-border" : "",
            )}
          >
            <div className="h-10 w-10 flex-shrink-0 animate-pulse rounded-full bg-muted" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-3.5 w-2/5 animate-pulse rounded bg-muted" />
              <div className="h-2.5 w-1/4 animate-pulse rounded bg-muted/70" />
            </div>
            <div
              className="h-4 animate-pulse rounded bg-muted"
              style={{ width: MONEY_COL_MIN_WIDTH }}
            />
          </div>
        ))}
      </Card>
    </div>
  );
}

// --- Error state ----------------------------------------------------------
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="mx-auto flex flex-col items-center gap-4 px-6 py-16 text-center md:py-20"
    >
      <div
        aria-hidden="true"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-destructive-soft)] text-destructive"
      >
        <AlertCircle size={20} />
      </div>
      <div>
        <h2 className="text-base font-semibold text-foreground">
          No pudimos cargar tus movimientos.
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Revisa tu conexión y vuelve a intentarlo.
        </p>
      </div>
      <Button
        type="button"
        onClick={onRetry}
        variant="outline"
        className="h-11 rounded-full px-5 text-[13px] font-semibold"
      >
        Reintentar
      </Button>
    </div>
  );
}

// --- No search results ----------------------------------------------------
function NoSearchResults({ query }: { query: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-auto flex flex-col items-center gap-3 px-6 py-16 text-center md:py-20"
    >
      <div
        aria-hidden="true"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <Search size={20} />
      </div>
      <div>
        <h2 className="text-base font-semibold text-foreground">
          Sin resultados para «{query}»
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Prueba con otra palabra.
        </p>
      </div>
    </div>
  );
}

// --- Day group section ----------------------------------------------------
function DayGroupSection({
  group,
  currency,
  onLongPress,
  onTap,
}: {
  group: DayGroup;
  currency: Currency;
  onLongPress: (tx: TransactionView) => void;
  onTap: (tx: TransactionView) => void;
}) {
  const netSign = group.net < 0 ? "– " : "+ ";
  const netText = `${netSign}${formatMoney(Math.abs(group.net), currency)}`;
  return (
    <section className="mt-5 first:mt-0">
      <h2 className="sticky top-0 z-10 -mx-4 flex items-baseline justify-between border-b border-border/40 bg-background/95 px-5 py-2.5 shadow-[0_4px_12px_-8px_rgba(0,0,0,0.18)] backdrop-blur-md supports-[backdrop-filter]:bg-background/75 md:-mx-0 md:px-1">
        <span className="text-[13px] font-semibold tracking-tight text-foreground">
          {group.label}
        </span>
        <span
          className={cn(
            "shrink-0 text-right tabular-nums text-[11px] font-medium",
            group.net < 0
              ? "text-muted-foreground"
              : "text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]",
          )}
          style={{
            fontFeatureSettings: '"tnum","lnum"',
            minWidth: MONEY_COL_MIN_WIDTH,
          }}
          aria-label={`Neto del día ${netText}`}
        >
          {netText}
        </span>
      </h2>

      <Card className="overflow-hidden rounded-2xl border-border p-0">
        {group.items.map((t, i) => (
          <div key={t.id} className={i ? "border-t border-border" : ""}>
            <TransactionRow
              t={t}
              onLongPress={() => onLongPress(t)}
              onTap={() => onTap(t)}
            />
          </div>
        ))}
      </Card>
    </section>
  );
}

// --- Empty state ----------------------------------------------------------
function EmptyState({ currency }: { currency: Currency }) {
  return (
    <div className="mx-auto flex flex-col items-center gap-4 px-6 py-16 text-center md:py-24">
      <div
        aria-hidden="true"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)]"
      >
        <Plus size={22} />
      </div>
      <div>
        <h2 className="text-lg font-bold">
          Todavía no tienes movimientos en {currency}.
        </h2>
        <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">
          Cuando registres tu primer gasto o ingreso, aparecerá aquí agrupado
          por día.
        </p>
      </div>
      <Link
        href="/capture"
        aria-label="Registrar primer movimiento"
        className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Registrar primero
      </Link>
    </div>
  );
}

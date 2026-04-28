/**
 * Budgets route — Lumi
 *
 * Monthly budgets manager. The user picks an expense category and sets a
 * monthly limit (in PEN or USD); the page shows progress bars based on the
 * actual spend this month from real Supabase transactions.
 *
 * Persistence is intentionally local — `localStorage["lumi-budgets"]` — so we
 * don't need a DB migration. The aggregation reads non-archived transactions
 * for the current month + active currency via the centralized data layer
 * (`listTransactionsWindow`) and only consumes the public `TransactionView`
 * shape (no `amount_minor` access outside `transactions.ts`).
 *
 * Demo mode (no Supabase env): we render the localStorage budgets but hide
 * the spend column with a sign-in hint, so the screen stays usable for
 * browsing.
 */
"use client";

import * as React from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { AppHeader } from "@/components/lumi/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { listCategories, type Category } from "@/lib/data/categories";
import { listTransactionsWindow, type TransactionView } from "@/lib/data/transactions";
import {
  DEFAULT_CATEGORY_ICON,
  getCategoryIcon,
  type LucideIconLike,
} from "@/lib/category-icons";
import { formatMoney, CURRENCY_LABEL } from "@/lib/money";
import { useActiveCurrency } from "@/hooks/use-active-currency";
import { cn } from "@/lib/utils";
import type { Currency } from "@/lib/supabase/types";

// ─── Demo mode flag ───────────────────────────────────────────────────────
const SUPABASE_ENABLED =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;

// ─── Storage ──────────────────────────────────────────────────────────────
const STORAGE_KEY = "lumi-budgets";

type Budget = {
  id: string;
  categoryId: string;
  limitMinor: number;
  currency: Currency;
  createdAt: string;
};

function isBudget(value: unknown): value is Budget {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.categoryId === "string" &&
    typeof v.limitMinor === "number" &&
    Number.isFinite(v.limitMinor) &&
    (v.currency === "PEN" || v.currency === "USD") &&
    typeof v.createdAt === "string"
  );
}

function readBudgets(): Budget[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isBudget);
  } catch {
    return [];
  }
}

function writeBudgets(list: Budget[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Quota exceeded or storage disabled — UI keeps in-memory value.
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function startOfMonthISO(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0).toISOString();
}

function formatMonthLabel(): string {
  const label = new Date().toLocaleDateString("es-PE", {
    month: "long",
    year: "numeric",
  });
  // Capitalize first letter, replace separator " de " with " · " for the
  // eyebrow style used elsewhere in the app.
  const cap = label.charAt(0).toUpperCase() + label.slice(1);
  return cap.replace(" de ", " · ");
}

// Parse a user-typed amount (allows "12.50" or "12,50") to a major number.
// Returns NaN on parse failure so the form can flag it.
function parseAmount(input: string): number {
  if (!input) return NaN;
  const cleaned = input.replace(/[^\d,.-]/g, "").trim();
  const normalized = cleaned.replace(",", ".");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : NaN;
}

function makeId(): string {
  // crypto.randomUUID is widely available; fall back to a timestamp-based id
  // when running in a constrained runtime.
  try {
    return crypto.randomUUID();
  } catch {
    return `b_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default function BudgetsPage() {
  const { currency, hydrated } = useActiveCurrency();

  const [budgets, setBudgets] = React.useState<Budget[]>([]);
  const [budgetsLoaded, setBudgetsLoaded] = React.useState(false);

  const [categories, setCategories] = React.useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = React.useState<boolean>(SUPABASE_ENABLED);
  const [categoriesAuthError, setCategoriesAuthError] = React.useState(false);

  const [transactions, setTransactions] = React.useState<TransactionView[]>([]);
  const [transactionsLoading, setTransactionsLoading] = React.useState<boolean>(SUPABASE_ENABLED);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Budget | null>(null);

  // Hydrate budgets from localStorage on mount (SSR-safe).
  React.useEffect(() => {
    setBudgets(readBudgets());
    setBudgetsLoaded(true);
  }, []);

  // Load categories.
  React.useEffect(() => {
    if (!SUPABASE_ENABLED) {
      setCategoriesLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await listCategories();
        if (!cancelled) setCategories(list);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "";
        if (/iniciar sesi[oó]n/i.test(msg)) {
          setCategoriesAuthError(true);
        } else {
          toast.error("Error al cargar categorías", { description: msg });
        }
      } finally {
        if (!cancelled) setCategoriesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load this month's transactions for the active currency.
  React.useEffect(() => {
    if (!SUPABASE_ENABLED) {
      setTransactionsLoading(false);
      return;
    }
    if (!hydrated) return;
    let cancelled = false;
    setTransactionsLoading(true);
    void (async () => {
      try {
        const rows = await listTransactionsWindow({
          currency,
          fromISO: startOfMonthISO(),
        });
        if (!cancelled) setTransactions(rows);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "";
        if (!/iniciar sesi[oó]n/i.test(msg)) {
          toast.error("Error al cargar movimientos", { description: msg });
        }
      } finally {
        if (!cancelled) setTransactionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currency, hydrated]);

  // Build a categoryId → spent (minor) map for the active currency.
  // We use the public `TransactionView` shape: `amount` is in major units, so
  // we multiply back to minor here to compare against `limitMinor`. This keeps
  // the centralized mapper rule intact (no `amount_minor` outside transactions.ts).
  const totalsByCategory = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transactions) {
      if (t.kind !== "expense") continue;
      if (!t.categoryId) continue;
      const minor = Math.round(t.amount * 100);
      map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + minor);
    }
    return map;
  }, [transactions]);

  const expenseCategories = React.useMemo(
    () => categories.filter((c) => c.kind === "expense"),
    [categories],
  );

  const categoryById = React.useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  // Filter visible budgets by the active currency.
  const visibleBudgets = React.useMemo(
    () => budgets.filter((b) => b.currency === currency),
    [budgets, currency],
  );

  function persist(next: Budget[]) {
    setBudgets(next);
    writeBudgets(next);
  }

  function handleCreate(input: { categoryId: string; limitMinor: number; currency: Currency }) {
    const next: Budget = {
      id: makeId(),
      categoryId: input.categoryId,
      limitMinor: input.limitMinor,
      currency: input.currency,
      createdAt: new Date().toISOString(),
    };
    persist([next, ...budgets]);
  }

  function handleUpdate(id: string, patch: { categoryId: string; limitMinor: number; currency: Currency }) {
    const next = budgets.map((b) =>
      b.id === id
        ? { ...b, categoryId: patch.categoryId, limitMinor: patch.limitMinor, currency: patch.currency }
        : b,
    );
    persist(next);
  }

  function handleDelete(id: string) {
    persist(budgets.filter((b) => b.id !== id));
  }

  const showSpend = SUPABASE_ENABLED && !categoriesAuthError;
  const aggregatesLoading = showSpend && (categoriesLoading || transactionsLoading);
  const showEmptyState = budgetsLoaded && visibleBudgets.length === 0;

  return (
    <main className="relative min-h-dvh bg-background pb-32 text-foreground">
      <div className="mx-auto w-full max-w-[720px] space-y-6 px-5 pt-6 md:max-w-3xl md:space-y-10 md:px-8 md:pt-10">
        <AppHeader
          eyebrow="Tu dinero"
          title="Presupuestos"
          titleStyle="page"
          className="px-0 pt-0"
        />

        <section aria-labelledby="budgets-month">
          <h2
            id="budgets-month"
            className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
          >
            {formatMonthLabel()}
          </h2>

          {!budgetsLoaded ? (
            <Card className="overflow-hidden rounded-2xl border-border p-0">
              <BudgetsSkeleton />
            </Card>
          ) : showEmptyState ? (
            <Card className="rounded-2xl border-dashed border-border p-5 text-sm">
              <p className="text-muted-foreground">
                No tienes presupuestos. Define un límite mensual por categoría
                para no pasarte.
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => setCreateOpen(true)}
                className="mt-3 h-9 rounded-lg"
              >
                <Plus size={14} aria-hidden="true" />
                <span className="ml-1">Crear primer presupuesto</span>
              </Button>
            </Card>
          ) : (
            <Card className="overflow-hidden rounded-2xl border-border p-0">
              <ul className="divide-y divide-border" role="list">
                {visibleBudgets.map((b) => {
                  const cat = categoryById.get(b.categoryId);
                  const Icon: LucideIconLike = cat
                    ? getCategoryIcon(cat.icon ?? DEFAULT_CATEGORY_ICON)
                    : getCategoryIcon(DEFAULT_CATEGORY_ICON);
                  const name = cat?.name ?? "Categoría eliminada";
                  const spentMinor = totalsByCategory.get(b.categoryId) ?? 0;
                  const percent =
                    b.limitMinor > 0
                      ? Math.round((spentMinor / b.limitMinor) * 100)
                      : 0;
                  const barColor =
                    percent > 100
                      ? "bg-destructive"
                      : percent >= 80
                        ? "bg-[var(--color-warning)]"
                        : "bg-primary";
                  const textColor =
                    percent > 100
                      ? "text-destructive"
                      : percent >= 80
                        ? "text-[var(--color-warning)]"
                        : "text-muted-foreground";

                  return (
                    <li key={b.id}>
                      <button
                        type="button"
                        onClick={() => setEditing(b)}
                        aria-label={`Editar presupuesto de ${name}`}
                        className={cn(
                          "flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors",
                          "hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            aria-hidden="true"
                            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
                          >
                            <Icon size={18} aria-hidden />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[14px] font-semibold">
                              {name}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {showSpend ? (
                                aggregatesLoading ? (
                                  <span className="opacity-70">
                                    Calculando… de {formatMoney(b.limitMinor, b.currency)}
                                  </span>
                                ) : (
                                  <>
                                    {formatMoney(spentMinor, b.currency)} de{" "}
                                    {formatMoney(b.limitMinor, b.currency)}
                                  </>
                                )
                              ) : (
                                <>— de {formatMoney(b.limitMinor, b.currency)}</>
                              )}
                            </div>
                          </div>
                          {showSpend ? (
                            <span
                              className={cn(
                                "ml-2 flex-shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums",
                                textColor,
                              )}
                            >
                              {percent}%
                            </span>
                          ) : null}
                          <Pencil
                            size={14}
                            aria-hidden="true"
                            className="ml-2 flex-shrink-0 text-muted-foreground"
                          />
                        </div>
                        <div
                          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                          aria-hidden="true"
                        >
                          <div
                            className={cn("h-full rounded-full transition-all", barColor)}
                            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
                          />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {!showSpend && budgetsLoaded && visibleBudgets.length > 0 ? (
            <p className="mt-3 px-1 text-[12px] text-muted-foreground">
              Inicia sesión para ver tu progreso.
            </p>
          ) : null}
        </section>

        <div className="mt-2">
          <Button
            type="button"
            onClick={() => setCreateOpen(true)}
            aria-label="Agregar presupuesto"
            className="h-12 w-full rounded-xl text-[14px] font-semibold md:max-w-xs"
          >
            <Plus size={16} aria-hidden="true" />
            <span className="ml-1">Agregar presupuesto</span>
          </Button>
        </div>
      </div>

      <BudgetFormSheet
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        onOptimisticClose={() => setCreateOpen(false)}
        categories={expenseCategories}
        categoriesLoading={categoriesLoading}
        defaultCurrency={currency}
        onSubmit={handleCreate}
      />

      {editing ? (
        <BudgetFormSheet
          mode="edit"
          budget={editing}
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onOptimisticClose={() => setEditing(null)}
          categories={expenseCategories}
          categoriesLoading={categoriesLoading}
          defaultCurrency={currency}
          onSubmit={(input) => handleUpdate(editing.id, input)}
          onDelete={() => handleDelete(editing.id)}
        />
      ) : null}
    </main>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────
function BudgetsSkeleton() {
  const widths = ["w-28", "w-36", "w-24"];
  return (
    <ul
      className="divide-y divide-border"
      role="list"
      aria-busy="true"
      aria-label="Cargando presupuestos"
    >
      {widths.map((w, i) => (
        <li key={i}>
          <div className="flex flex-col gap-2 px-4 py-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 flex-shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className={cn("h-3.5 rounded", w)} />
                <Skeleton className="h-2.5 w-24 rounded" />
              </div>
              <Skeleton className="h-4 w-10 rounded-full" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Form sheet ───────────────────────────────────────────────────────────
type BudgetFormSheetProps = {
  mode: "create" | "edit";
  open: boolean;
  budget?: Budget | null;
  onOpenChange: (open: boolean) => void;
  onOptimisticClose: () => void;
  categories: Category[];
  categoriesLoading: boolean;
  defaultCurrency: Currency;
  onSubmit: (input: { categoryId: string; limitMinor: number; currency: Currency }) => void;
  onDelete?: () => void;
};

function BudgetFormSheet({
  mode,
  open,
  budget,
  onOpenChange,
  onOptimisticClose,
  categories,
  categoriesLoading,
  defaultCurrency,
  onSubmit,
  onDelete,
}: BudgetFormSheetProps) {
  const [categoryId, setCategoryId] = React.useState<string>("");
  const [amount, setAmount] = React.useState<string>("");
  const [currency, setCurrency] = React.useState<Currency>(defaultCurrency);
  const [showError, setShowError] = React.useState(false);
  const [deleteArmed, setDeleteArmed] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (mode === "edit" && budget) {
      setCategoryId(budget.categoryId);
      setAmount((budget.limitMinor / 100).toFixed(2));
      setCurrency(budget.currency);
    } else {
      setCategoryId("");
      setAmount("");
      setCurrency(defaultCurrency);
    }
    setShowError(false);
    setDeleteArmed(false);
  }, [open, mode, budget, defaultCurrency]);

  const parsed = parseAmount(amount);
  const amountInvalid = !Number.isFinite(parsed) || parsed <= 0;
  const categoryInvalid = !categoryId;
  const formInvalid = amountInvalid || categoryInvalid;

  function handleSubmit() {
    if (formInvalid) {
      setShowError(true);
      return;
    }
    const limitMinor = Math.round(parsed * 100);
    onOptimisticClose();
    onSubmit({ categoryId, limitMinor, currency });
  }

  function handleDeleteClick() {
    if (!onDelete) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    onOptimisticClose();
    onDelete();
  }

  const title = mode === "create" ? "Nuevo presupuesto" : "Editar presupuesto";
  const description =
    mode === "create"
      ? "Elige una categoría de gastos y define un límite mensual."
      : "Actualiza la categoría, el límite o la moneda. También puedes eliminarlo.";

  const errorIdAmount = "budget-amount-error";
  const errorIdCategory = "budget-category-error";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        aria-labelledby="budget-form-title"
        className="rounded-t-3xl px-5 pb-6 pt-2 md:max-w-md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <SheetHeader className="px-0">
            <SheetTitle
              id="budget-form-title"
              className="font-sans not-italic font-semibold"
            >
              {title}
            </SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>

          <div className="mt-2 flex flex-col gap-4 px-0 pb-2">
            <div>
              <Label className="mb-1.5 block text-[13px] font-semibold">
                Categoría
              </Label>
              {categoriesLoading ? (
                <div className="flex flex-wrap gap-2">
                  <Skeleton className="h-9 w-28 rounded-xl" />
                  <Skeleton className="h-9 w-24 rounded-xl" />
                  <Skeleton className="h-9 w-32 rounded-xl" />
                </div>
              ) : categories.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  Aún no tienes categorías de gastos. Crea una desde Categorías.
                </p>
              ) : (
                <div
                  className="max-h-44 overflow-y-auto rounded-xl border border-border bg-card p-2"
                  role="listbox"
                  aria-label="Categorías de gastos"
                >
                  <div className="flex flex-wrap gap-2">
                    {categories.map((c) => {
                      const Icon = getCategoryIcon(c.icon ?? DEFAULT_CATEGORY_ICON);
                      const selected = categoryId === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => {
                            setCategoryId(c.id);
                            if (showError) setShowError(false);
                          }}
                          className={cn(
                            "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px] transition-colors",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            selected
                              ? "border-foreground bg-muted text-foreground"
                              : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          <span
                            aria-hidden="true"
                            className={cn(
                              "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md",
                              selected
                                ? "bg-primary/15 text-primary"
                                : "bg-primary/10 text-primary",
                            )}
                          >
                            <Icon size={12} aria-hidden />
                          </span>
                          <span className="truncate font-semibold">{c.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {showError && categoryInvalid ? (
                <span
                  id={errorIdCategory}
                  role="alert"
                  className="mt-1.5 block text-[12px] font-medium text-destructive"
                >
                  Elige una categoría.
                </span>
              ) : null}
            </div>

            <div>
              <Label
                htmlFor="budget-amount"
                className="mb-1.5 block text-[13px] font-semibold"
              >
                Límite mensual
              </Label>
              <Input
                id="budget-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  if (showError && parseAmount(e.target.value) > 0) {
                    setShowError(false);
                  }
                }}
                placeholder="0.00"
                autoComplete="off"
                aria-invalid={showError && amountInvalid}
                aria-describedby={showError && amountInvalid ? errorIdAmount : undefined}
                className={cn(
                  "h-11 text-[15px] tabular-nums",
                  showError && amountInvalid &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
              {showError && amountInvalid ? (
                <span
                  id={errorIdAmount}
                  role="alert"
                  className="mt-1.5 block text-[12px] font-medium text-destructive"
                >
                  Ingresa un monto mayor a cero.
                </span>
              ) : null}
            </div>

            <fieldset>
              <legend className="mb-1.5 text-[13px] font-semibold">Moneda</legend>
              <div className="grid grid-cols-2 gap-2">
                {(["PEN", "USD"] as const).map((c) => {
                  const selected = currency === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCurrency(c)}
                      aria-pressed={selected}
                      className={cn(
                        "flex items-center justify-center rounded-xl border px-3 py-2.5 text-[13px] font-semibold transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected
                          ? "border-foreground bg-muted text-foreground"
                          : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {CURRENCY_LABEL[c]}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {mode === "edit" && budget && deleteArmed ? (
              <div
                role="alert"
                className="flex flex-col gap-2 rounded-2xl border border-destructive/30 bg-[var(--color-destructive-soft)] px-3.5 py-3 text-[13px] text-foreground"
              >
                <p className="font-semibold leading-snug">
                  ¿Eliminar este presupuesto?
                </p>
                <p className="text-[12px] leading-snug text-muted-foreground">
                  Lo quitamos de la lista. Tus movimientos no se modifican.
                </p>
                <div className="mt-1 flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteArmed(false)}
                    className="min-h-9 flex-1"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteClick}
                    className="min-h-9 flex-1"
                  >
                    Eliminar
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <SheetFooter className="px-0 flex-col-reverse gap-2 md:flex-row md:justify-end">
            {mode === "edit" && onDelete && !deleteArmed ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleDeleteClick}
                className="min-h-11 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 size={14} aria-hidden="true" className="mr-1.5" />
                Eliminar presupuesto
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="min-h-11"
            >
              Cancelar
            </Button>
            <Button type="submit" className="min-h-11">
              {mode === "create" ? "Crear presupuesto" : "Guardar cambios"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

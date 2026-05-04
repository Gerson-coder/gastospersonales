/**
 * Goals route — Kane
 *
 * Personal savings-goals manager. The user defines a goal (name, target,
 * optional deadline, current progress) and tracks progress with manual
 * contributions or withdrawals. Persisted in Supabase (table `goals`,
 * RLS-scoped); see migration 00023_budgets_goals.sql.
 *
 * Mobile-first, calm and motivating tone, mirrors the rest of Kane.
 */
"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  Target,
  Plane,
  Home,
  Car,
  GraduationCap,
  Heart,
  Gift,
  PiggyBank,
  Sparkles,
  Pencil,
} from "lucide-react";

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
import { cn } from "@/lib/utils";
import { AppHeader } from "@/components/kane/AppHeader";
import {
  formatMoney,
  parseMoneyToMinor,
  CURRENCY_LABEL,
  type Currency,
} from "@/lib/money";
import { useActiveCurrency } from "@/hooks/use-active-currency";
import {
  archiveGoal,
  contributeGoal,
  createGoal,
  listGoals,
  updateGoal,
  type Goal,
  type GoalIcon,
} from "@/lib/data/goals";

// ─── Demo mode flag ───────────────────────────────────────────────────────
const SUPABASE_ENABLED =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;

const NAME_MAX_LENGTH = 32;

type IconChoice = {
  slug: GoalIcon;
  label: string;
  Icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
};

const ICON_CHOICES: IconChoice[] = [
  { slug: "target", label: "Meta", Icon: Target },
  { slug: "plane", label: "Viaje", Icon: Plane },
  { slug: "home", label: "Hogar", Icon: Home },
  { slug: "car", label: "Auto", Icon: Car },
  { slug: "graduation-cap", label: "Estudios", Icon: GraduationCap },
  { slug: "heart", label: "Salud", Icon: Heart },
  { slug: "gift", label: "Regalo", Icon: Gift },
  { slug: "piggy-bank", label: "Ahorro", Icon: PiggyBank },
  { slug: "sparkles", label: "Sueño", Icon: Sparkles },
];

function getIconComponent(slug: GoalIcon) {
  const found = ICON_CHOICES.find((c) => c.slug === slug);
  return found ? found.Icon : Target;
}

// ─── Date helpers ─────────────────────────────────────────────────────────
function formatDeadline(deadlineISO: string | null, now: Date): string {
  if (!deadlineISO) return "Sin fecha límite";
  const target = new Date(deadlineISO);
  if (Number.isNaN(target.getTime())) return "Sin fecha límite";

  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfTarget = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
  );
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round(
    (startOfTarget.getTime() - startOfToday.getTime()) / msPerDay,
  );

  if (diffDays < 0) return "Fecha cumplida";
  if (diffDays === 0) return "Vence hoy";
  if (diffDays === 1) return "Vence mañana";
  if (diffDays <= 60) return `Faltan ${diffDays} días`;
  return `Vence el ${target.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
  })}`;
}

// ─── Page ─────────────────────────────────────────────────────────────────
export default function GoalsPage() {
  const { currency } = useActiveCurrency();
  const [allGoals, setAllGoals] = React.useState<Goal[]>([]);
  const [loaded, setLoaded] = React.useState(!SUPABASE_ENABLED);
  const [authError, setAuthError] = React.useState(false);
  const [editing, setEditing] = React.useState<Goal | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [contributionTarget, setContributionTarget] =
    React.useState<Goal | null>(null);

  // Pull from Supabase on mount.
  React.useEffect(() => {
    if (!SUPABASE_ENABLED) {
      setLoaded(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await listGoals();
        if (!cancelled) setAllGoals(list);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "";
        if (/iniciar sesi[oó]n/i.test(msg)) {
          setAuthError(true);
        } else {
          toast.error("Error al cargar metas", { description: msg });
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Visible list — scoped to active currency.
  const goals = React.useMemo(
    () => allGoals.filter((g) => g.currency === currency),
    [allGoals, currency],
  );

  const totals = React.useMemo(() => {
    const current = goals.reduce((acc, g) => acc + g.current_minor, 0);
    const target = goals.reduce((acc, g) => acc + g.target_minor, 0);
    return { current, target, count: goals.length };
  }, [goals]);

  const handleCreate = React.useCallback(
    async (draft: {
      name: string;
      targetMinor: number;
      currency: Currency;
      deadlineISO: string | null;
      icon: GoalIcon;
    }) => {
      try {
        const created = await createGoal(draft);
        setAllGoals((prev) => [created, ...prev]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "No pudimos crear la meta.";
        toast.error("Error al crear meta", { description: msg });
      }
    },
    [],
  );

  const handleUpdate = React.useCallback(
    async (
      id: string,
      patch: {
        name: string;
        targetMinor: number;
        currency: Currency;
        deadlineISO: string | null;
        icon: GoalIcon;
      },
    ) => {
      try {
        const updated = await updateGoal(id, patch);
        setAllGoals((prev) => prev.map((g) => (g.id === id ? updated : g)));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "No pudimos actualizar la meta.";
        toast.error("Error al actualizar meta", { description: msg });
      }
    },
    [],
  );

  const handleDelete = React.useCallback(async (id: string) => {
    const previous = allGoals;
    setAllGoals((prev) => prev.filter((g) => g.id !== id));
    try {
      await archiveGoal(id);
    } catch (err) {
      setAllGoals(previous);
      const msg = err instanceof Error ? err.message : "No pudimos eliminar la meta.";
      toast.error("Error al eliminar meta", { description: msg });
    }
  }, [allGoals]);

  const handleContribution = React.useCallback(
    async (id: string, deltaMinor: number, mode: "add" | "subtract") => {
      try {
        const updated = await contributeGoal(id, deltaMinor, mode);
        setAllGoals((prev) => prev.map((g) => (g.id === id ? updated : g)));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "No pudimos registrar el aporte.";
        toast.error("Error al registrar aporte", { description: msg });
      }
    },
    [],
  );

  const showSummary = loaded && !authError && goals.length > 0;
  const showEmpty = loaded && goals.length === 0;

  return (
    <main className="relative min-h-dvh bg-background pb-32 text-foreground">
      <div className="mx-auto w-full max-w-[720px] space-y-6 px-5 pt-6 md:max-w-6xl md:space-y-10 md:px-8 md:pt-10">
        <div className="md:flex md:items-end md:justify-between">
          <AppHeader
            eyebrow="Tus sueños"
            title="Metas"
            titleStyle="page"
            className="px-0 pt-0"
          />
          {loaded && !showEmpty && !authError ? (
            <div className="hidden md:block">
              <Button
                type="button"
                onClick={() => setCreateOpen(true)}
                aria-label="Agregar meta"
                className="h-10 rounded-xl text-[13px] font-semibold"
              >
                <Plus size={14} aria-hidden="true" />
                <span className="ml-1">Agregar meta</span>
              </Button>
            </div>
          ) : null}
        </div>

        {/* Skeleton while loading */}
        {!loaded ? (
          <section aria-label="Cargando metas">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <Card key={i} className="rounded-2xl border-border p-4">
                  <div className="flex items-start gap-3">
                    <Skeleton className="h-10 w-10 flex-shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-32 rounded" />
                      <Skeleton className="h-2.5 w-24 rounded" />
                    </div>
                  </div>
                  <Skeleton className="mt-3 h-2 w-full rounded-full" />
                </Card>
              ))}
            </div>
          </section>
        ) : null}

        {/* Summary card — only when at least one goal exists in this currency. */}
        {showSummary ? (
          <section aria-labelledby="goals-summary">
            <Card className="rounded-2xl border-border bg-gradient-to-br from-primary/10 to-card p-5">
              <h2
                id="goals-summary"
                className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
              >
                Tu progreso total
              </h2>
              <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">
                {formatMoney(totals.current, currency)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground tabular-nums">
                de {formatMoney(totals.target, currency)} en {totals.count}{" "}
                {totals.count === 1 ? "meta" : "metas"}
              </p>
            </Card>
          </section>
        ) : null}

        {/* Goals list */}
        {loaded ? (
          <section aria-labelledby="goals-list">
            <h2
              id="goals-list"
              className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
            >
              Tus metas
            </h2>

            {showEmpty ? (
              <Card className="rounded-2xl border-dashed border-border p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {authError
                    ? "Inicia sesión para ver y crear tus metas."
                    : "Define una meta y haz crecer tus ahorros poco a poco."}
                </p>
                {!authError ? (
                  <Button
                    type="button"
                    onClick={() => setCreateOpen(true)}
                    className="mt-4 h-10 rounded-xl px-4 text-[13px] font-semibold"
                  >
                    <Plus size={14} aria-hidden="true" />
                    <span className="ml-1">Crear primera meta</span>
                  </Button>
                ) : null}
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
                {goals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    onEdit={() => setEditing(goal)}
                    onContribute={() => setContributionTarget(goal)}
                  />
                ))}
              </div>
            )}
          </section>
        ) : null}

        {/* Add goal — mobile only (desktop CTA is in the header row) */}
        {loaded && !showEmpty && !authError ? (
          <div className="mt-6 md:hidden">
            <Button
              type="button"
              onClick={() => setCreateOpen(true)}
              aria-label="Agregar meta"
              className="h-12 w-full rounded-xl text-[14px] font-semibold"
            >
              <Plus size={16} aria-hidden="true" />
              <span className="ml-1">Agregar meta</span>
            </Button>
          </div>
        ) : null}
      </div>

      {/* Create sheet */}
      <GoalFormSheet
        mode="create"
        open={createOpen}
        defaultCurrency={currency}
        onOpenChange={setCreateOpen}
        onSubmit={(draft) => {
          void handleCreate(draft);
          setCreateOpen(false);
        }}
      />

      {/* Edit sheet — only mounted when a goal is selected so form state
          resets cleanly between rows. */}
      {editing ? (
        <GoalFormSheet
          mode="edit"
          goal={editing}
          open={true}
          defaultCurrency={currency}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onSubmit={(draft) => {
            void handleUpdate(editing.id, draft);
            setEditing(null);
          }}
          onDelete={() => {
            void handleDelete(editing.id);
            setEditing(null);
          }}
        />
      ) : null}

      {/* Contribution sheet */}
      {contributionTarget ? (
        <ContributionSheet
          goal={contributionTarget}
          open={true}
          onOpenChange={(open) => {
            if (!open) setContributionTarget(null);
          }}
          onSubmit={(deltaMinor, mode) => {
            void handleContribution(contributionTarget.id, deltaMinor, mode);
            setContributionTarget(null);
          }}
        />
      ) : null}
    </main>
  );
}

// ─── Goal card ────────────────────────────────────────────────────────────
type GoalCardProps = {
  goal: Goal;
  onEdit: () => void;
  onContribute: () => void;
};

function GoalCard({ goal, onEdit, onContribute }: GoalCardProps) {
  const Icon = getIconComponent(goal.icon);
  const percent =
    goal.target_minor > 0
      ? Math.round((goal.current_minor / goal.target_minor) * 100)
      : 0;
  const complete = percent >= 100;
  const barWidth = Math.min(100, Math.max(0, percent));

  // Re-render the deadline label when the day rolls over. Cheap: mounting
  // a single tick listener per card is fine at the goal-list scale.
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);
  const deadlineLabel = formatDeadline(goal.deadline, now);
  const deadlinePast = deadlineLabel === "Fecha cumplida";

  return (
    <Card className="rounded-2xl border-border p-4">
      <div className="flex items-start gap-3">
        <div
          aria-hidden="true"
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <Icon size={18} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 truncate text-[14px] font-semibold">
              {goal.name}
            </p>
            <span className="flex-shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary tabular-nums">
              {percent}%
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            {formatMoney(goal.current_minor, goal.currency)} de{" "}
            {formatMoney(goal.target_minor, goal.currency)}
          </p>
        </div>
      </div>

      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progreso de ${goal.name}`}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            complete ? "bg-[var(--color-success)]" : "bg-primary",
          )}
          style={{ width: `${barWidth}%` }}
        />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span
          className={cn(
            "text-[12px] text-muted-foreground",
            deadlinePast && "italic",
          )}
        >
          {deadlineLabel}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onContribute}
            className="inline-flex h-8 items-center rounded-full bg-primary/10 px-3 text-[12px] font-semibold text-primary hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Aporte
          </button>
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Editar ${goal.name}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Pencil size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </Card>
  );
}

// ─── Goal form sheet (create / edit) ──────────────────────────────────────
type GoalFormSheetCreateProps = {
  mode: "create";
  open: boolean;
  defaultCurrency: Currency;
  onOpenChange: (open: boolean) => void;
  onSubmit: (draft: {
    name: string;
    targetMinor: number;
    currency: Currency;
    deadlineISO: string | null;
    icon: GoalIcon;
  }) => void;
};

type GoalFormSheetEditProps = {
  mode: "edit";
  goal: Goal;
  open: boolean;
  defaultCurrency: Currency;
  onOpenChange: (open: boolean) => void;
  onSubmit: (draft: {
    name: string;
    targetMinor: number;
    currency: Currency;
    deadlineISO: string | null;
    icon: GoalIcon;
  }) => void;
  onDelete: () => void;
};

type GoalFormSheetProps = GoalFormSheetCreateProps | GoalFormSheetEditProps;

function GoalFormSheet(props: GoalFormSheetProps) {
  const isEdit = props.mode === "edit";
  const initialGoal = isEdit ? props.goal : null;

  const [name, setName] = React.useState("");
  const [targetInput, setTargetInput] = React.useState("");
  const [currency, setCurrency] = React.useState<Currency>(
    props.defaultCurrency,
  );
  const [deadline, setDeadline] = React.useState<string>("");
  const [icon, setIcon] = React.useState<GoalIcon>("target");
  const [showError, setShowError] = React.useState(false);
  const [deleteArmed, setDeleteArmed] = React.useState(false);
  const nameRef = React.useRef<HTMLInputElement | null>(null);

  // Re-seed when the sheet opens.
  React.useEffect(() => {
    if (!props.open) return;
    if (isEdit && initialGoal) {
      setName(initialGoal.name);
      setTargetInput((initialGoal.target_minor / 100).toFixed(2));
      setCurrency(initialGoal.currency);
      setDeadline(initialGoal.deadline ?? "");
      setIcon(initialGoal.icon);
    } else {
      setName("");
      setTargetInput("");
      setCurrency(props.defaultCurrency);
      setDeadline("");
      setIcon("target");
    }
    setShowError(false);
    setDeleteArmed(false);
    const id = window.requestAnimationFrame(() => {
      nameRef.current?.focus();
      if (isEdit) nameRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [props.open, isEdit, initialGoal, props.defaultCurrency]);

  const trimmed = name.trim();
  const targetMinor = Number(parseMoneyToMinor(targetInput));
  const currentMinor = isEdit && initialGoal ? initialGoal.current_minor : 0;

  const nameInvalid = trimmed.length === 0;
  const targetInvalid = targetMinor <= 0;
  const targetBelowCurrent = isEdit && targetMinor < currentMinor;

  const errorMessage = (() => {
    if (nameInvalid) return "Asigna un nombre a tu meta.";
    if (targetInvalid) return "Ingresa un monto mayor a 0.";
    if (targetBelowCurrent)
      return "El monto objetivo debe ser mayor o igual a lo ya guardado.";
    return null;
  })();

  function handleSubmit() {
    if (errorMessage) {
      setShowError(true);
      if (nameInvalid) nameRef.current?.focus();
      return;
    }
    props.onSubmit({
      name: trimmed,
      targetMinor,
      currency,
      deadlineISO: deadline ? deadline : null,
      icon,
    });
  }

  function handleDeleteClick() {
    if (!isEdit) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    props.onDelete();
  }

  const title = isEdit ? "Editar meta" : "Nueva meta";
  const description = isEdit
    ? "Actualiza el nombre, monto, fecha o ícono. También puedes eliminarla."
    : "Define un nombre, un monto objetivo y, si quieres, una fecha límite.";

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="bottom"
        aria-labelledby="goal-form-title"
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
              id="goal-form-title"
              className="font-sans not-italic font-semibold"
            >
              {title}
            </SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>

          <div className="mt-2 flex flex-col gap-4 px-0 pb-2">
            {/* Name */}
            <div>
              <Label
                htmlFor="goal-name"
                className="mb-1.5 block text-[13px] font-semibold"
              >
                Nombre
              </Label>
              <Input
                id="goal-name"
                ref={nameRef}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (showError && e.target.value.trim().length > 0) {
                    setShowError(false);
                  }
                }}
                placeholder="Ej. Viaje a Cusco, Laptop nueva…"
                maxLength={NAME_MAX_LENGTH}
                autoComplete="off"
                aria-invalid={showError && nameInvalid}
                className={cn(
                  "h-11 text-[15px]",
                  showError &&
                    nameInvalid &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
            </div>

            {/* Target */}
            <div>
              <Label
                htmlFor="goal-target"
                className="mb-1.5 block text-[13px] font-semibold"
              >
                Monto objetivo
              </Label>
              <Input
                id="goal-target"
                value={targetInput}
                onChange={(e) => {
                  setTargetInput(e.target.value);
                  if (showError) setShowError(false);
                }}
                inputMode="decimal"
                placeholder="0.00"
                autoComplete="off"
                aria-invalid={
                  showError && (targetInvalid || targetBelowCurrent)
                }
                className={cn(
                  "h-11 text-[15px] tabular-nums",
                  showError &&
                    (targetInvalid || targetBelowCurrent) &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
              {isEdit ? (
                <p className="mt-1.5 text-[11px] text-muted-foreground tabular-nums">
                  Progreso actual:{" "}
                  {formatMoney(currentMinor, currency)}
                </p>
              ) : null}
            </div>

            {/* Currency */}
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-semibold">
                Moneda
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {(["PEN", "USD"] as Currency[]).map((c) => {
                  const selected = currency === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCurrency(c)}
                      className={cn(
                        "flex h-11 items-center justify-center rounded-xl border px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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

            {/* Deadline */}
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <Label
                  htmlFor="goal-deadline"
                  className="block text-[13px] font-semibold"
                >
                  Fecha límite
                  <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                    (opcional)
                  </span>
                </Label>
                {deadline ? (
                  <button
                    type="button"
                    onClick={() => setDeadline("")}
                    className="text-[12px] font-semibold text-muted-foreground underline decoration-muted-foreground/40 underline-offset-4 hover:text-foreground hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                  >
                    Quitar fecha
                  </button>
                ) : null}
              </div>
              <Input
                id="goal-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="h-11 text-[15px]"
              />
            </div>

            {/* Icon picker */}
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-semibold">
                Ícono
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {ICON_CHOICES.map((choice) => {
                  const selected = icon === choice.slug;
                  const Icon = choice.Icon;
                  return (
                    <button
                      key={choice.slug}
                      type="button"
                      onClick={() => setIcon(choice.slug)}
                      aria-label={choice.label}
                      aria-pressed={selected}
                      className={cn(
                        "flex h-12 items-center justify-center rounded-full text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted/80",
                      )}
                    >
                      <Icon size={18} aria-hidden />
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {showError && errorMessage ? (
              <p
                role="alert"
                className="mt-1 text-xs text-destructive"
              >
                {errorMessage}
              </p>
            ) : null}

            {/* Delete confirm */}
            {isEdit && deleteArmed ? (
              <div
                role="alert"
                className="flex flex-col gap-2 rounded-2xl border border-destructive/30 bg-[var(--color-destructive-soft)] px-3.5 py-3 text-[13px] text-foreground"
              >
                <p className="font-semibold leading-snug">
                  ¿Eliminar esta meta?
                </p>
                <p className="text-[12px] leading-snug text-muted-foreground">
                  Se borrará junto con tu progreso. No se puede deshacer.
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
            {isEdit && !deleteArmed ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleDeleteClick}
                className="min-h-11 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 size={14} aria-hidden="true" className="mr-1.5" />
                Eliminar meta
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={() => props.onOpenChange(false)}
              className="min-h-11"
            >
              Cancelar
            </Button>
            <Button type="submit" className="min-h-11">
              {isEdit ? "Guardar cambios" : "Crear meta"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ─── Contribution sheet ───────────────────────────────────────────────────
type ContributionSheetProps = {
  goal: Goal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (deltaMinor: number, mode: "add" | "subtract") => void;
};

function ContributionSheet({
  goal,
  open,
  onOpenChange,
  onSubmit,
}: ContributionSheetProps) {
  const [amountInput, setAmountInput] = React.useState("");
  const [mode, setMode] = React.useState<"add" | "subtract">("add");
  const [showError, setShowError] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setAmountInput("");
    setMode("add");
    setShowError(false);
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  const deltaMinor = Number(parseMoneyToMinor(amountInput));
  const invalid = deltaMinor <= 0;

  function handleSubmit() {
    if (invalid) {
      setShowError(true);
      inputRef.current?.focus();
      return;
    }
    onSubmit(deltaMinor, mode);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        aria-labelledby="goal-contribution-title"
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
              id="goal-contribution-title"
              className="font-sans not-italic font-semibold"
            >
              Sumar a {goal.name}
            </SheetTitle>
            <SheetDescription>
              Registra cuánto pones o sacas de esta meta.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-2 flex flex-col gap-4 px-0 pb-2">
            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: "add" as const, label: "Aporte" },
                { value: "subtract" as const, label: "Retiro" },
              ]).map((opt) => {
                const selected = mode === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMode(opt.value)}
                    className={cn(
                      "flex h-11 items-center justify-center rounded-xl border px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "border-foreground bg-muted text-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {/* Amount */}
            <div>
              <Label
                htmlFor="contribution-amount"
                className="mb-1.5 block text-[13px] font-semibold"
              >
                Monto
              </Label>
              <Input
                id="contribution-amount"
                ref={inputRef}
                value={amountInput}
                onChange={(e) => {
                  setAmountInput(e.target.value);
                  if (showError) setShowError(false);
                }}
                inputMode="decimal"
                placeholder="0.00"
                autoComplete="off"
                aria-invalid={showError && invalid}
                className={cn(
                  "h-11 text-[15px] tabular-nums",
                  showError &&
                    invalid &&
                    "border-destructive focus-visible:ring-destructive",
                )}
              />
              <p className="mt-1.5 text-[12px] text-muted-foreground tabular-nums">
                Tienes guardado {formatMoney(goal.current_minor, goal.currency)}{" "}
                de {formatMoney(goal.target_minor, goal.currency)}
              </p>
              {showError && invalid ? (
                <p role="alert" className="mt-1 text-xs text-destructive">
                  Ingresa un monto mayor a 0.
                </p>
              ) : null}
            </div>
          </div>

          <SheetFooter className="px-0 flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="min-h-11"
            >
              Cancelar
            </Button>
            <Button type="submit" className="min-h-11">
              {mode === "add" ? "Registrar aporte" : "Registrar retiro"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

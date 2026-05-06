/**
 * Commitments route — Kane
 *
 * Lista de compromisos financieros del user (recibos, alquileres,
 * prestamos, cuotas). Mismo patron de layout que /budgets y /goals:
 * mobile-first, max-w-3xl al centro en desktop, cards rounded-2xl.
 *
 * PR1 — solo CRUD basico:
 *   - Crear / editar / archivar via CommitmentFormSheet.
 *   - "Marcar como pagado" cambia status (sin crear transaccion aun).
 *   - Lista agrupada por status derivado (Vencido / Pronto / Mas
 *     adelante / Completado).
 *
 * PR2 — markCompleted abrira /capture precargado para crear la tx.
 * PR3 — push notifications via Web Push.
 */
"use client";

import * as React from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronUp,
  HandCoins,
  HandHeart,
  Loader2,
  Plus,
} from "lucide-react";
import { toast } from "sonner";

import { AppHeader } from "@/components/kane/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CommitmentFormSheet } from "@/components/kane/CommitmentFormSheet";
import {
  archiveCommitment,
  COMMITMENT_UPSERTED_EVENT,
  createCommitment,
  deriveStatus,
  KIND_LABEL,
  listCommitments,
  markCompleted,
  RECURRENCE_LABEL,
  unarchiveCommitment,
  updateCommitment,
  type CommitmentDerivedStatus,
  type CommitmentDraft,
  type CommitmentKind,
  type CommitmentView,
} from "@/lib/data/commitments";
import { cn } from "@/lib/utils";

const TNUM_STYLE: React.CSSProperties = {
  fontFeatureSettings: '"tnum","lnum"',
};

const KIND_ICON: Record<
  CommitmentKind,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  payment: ArrowUpFromLine,
  income: ArrowDownToLine,
  lent: HandHeart,
  borrowed: HandCoins,
};

const KIND_TINT: Record<CommitmentKind, { bg: string; text: string }> = {
  payment: {
    bg: "bg-[oklch(0.94_0.04_30)] dark:bg-[oklch(0.30_0.05_30)]",
    text: "text-[oklch(0.50_0.16_30)] dark:text-[oklch(0.85_0.14_30)]",
  },
  income: {
    bg: "bg-[oklch(0.94_0.04_162)] dark:bg-[oklch(0.30_0.05_162)]",
    text: "text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]",
  },
  lent: {
    bg: "bg-[oklch(0.94_0.04_270)] dark:bg-[oklch(0.30_0.05_270)]",
    text: "text-[oklch(0.45_0.14_270)] dark:text-[oklch(0.85_0.12_270)]",
  },
  borrowed: {
    bg: "bg-[oklch(0.94_0.04_70)] dark:bg-[oklch(0.30_0.05_70)]",
    text: "text-[oklch(0.50_0.14_70)] dark:text-[oklch(0.85_0.12_70)]",
  },
};

const DERIVED_STATUS_LABEL: Record<CommitmentDerivedStatus, string> = {
  overdue: "Vencido",
  "due-soon": "Pronto",
  upcoming: "Más adelante",
  completed: "Completado",
  cancelled: "Cancelado",
};

function formatAmount(amount: number, currency: "PEN" | "USD"): string {
  const symbol = currency === "USD" ? "$" : "S/";
  const formatted = new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  return `${symbol} ${formatted}`;
}

/** "12 may" / "Hoy" / "Mañana" / "Hace 3 días" */
function formatRelativeDue(dueDate: string): string {
  const [y, m, d] = dueDate.split("-").map(Number);
  const due = new Date(y, m - 1, d);
  const today = new Date();
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffMs = due.getTime() - todayMid.getTime();
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  if (days === -1) return "Ayer";
  if (days < 0) return `Hace ${Math.abs(days)} días`;
  if (days < 7) return `En ${days} días`;
  // Fecha absoluta para mas lejano.
  return new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short" })
    .format(due)
    .replace(/\./g, "");
}

// ─── Page ─────────────────────────────────────────────────────────────

export default function CommitmentsPage(): React.ReactElement {
  const [items, setItems] = React.useState<CommitmentView[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  // Form sheet state.
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CommitmentView | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // Mostrar/ocultar la seccion de completados (collapsed por default
  // — son ruido visual cuando hay muchos).
  const [showCompleted, setShowCompleted] = React.useState(false);

  // Initial load + cross-tab refresh via COMMITMENT_UPSERTED_EVENT.
  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const rows = await listCommitments();
        if (!cancelled) setItems(rows);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error("Error desconocido"));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();

    const handler = () => void load();
    globalThis.addEventListener(COMMITMENT_UPSERTED_EVENT, handler);
    return () => {
      cancelled = true;
      globalThis.removeEventListener(COMMITMENT_UPSERTED_EVENT, handler);
    };
  }, []);

  // Bucketing por status derivado para la lista.
  const buckets = React.useMemo(() => {
    const overdue: CommitmentView[] = [];
    const dueSoon: CommitmentView[] = [];
    const upcoming: CommitmentView[] = [];
    const completed: CommitmentView[] = [];

    for (const c of items) {
      const status = deriveStatus(c);
      if (status === "overdue") overdue.push(c);
      else if (status === "due-soon") dueSoon.push(c);
      else if (status === "upcoming") upcoming.push(c);
      else if (status === "completed") completed.push(c);
      // cancelled se oculta por ahora — el user puede des-archivar
      // restaurando si necesitan.
    }
    return { overdue, dueSoon, upcoming, completed };
  }, [items]);

  const totalActive =
    buckets.overdue.length + buckets.dueSoon.length + buckets.upcoming.length;

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(c: CommitmentView) {
    setEditing(c);
    setFormOpen(true);
  }

  async function handleSubmit(draft: CommitmentDraft) {
    setSubmitting(true);
    try {
      if (editing) {
        await updateCommitment(editing.id, draft);
        toast.success("Compromiso actualizado.");
      } else {
        await createCommitment(draft);
        toast.success("Compromiso creado.");
      }
      setFormOpen(false);
      setEditing(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No pudimos guardar el compromiso.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMarkCompleted(c: CommitmentView) {
    try {
      await markCompleted(c.id);
      toast.success(
        c.recurrence === "none"
          ? "Marcado como completado."
          : `Marcado. Próxima fecha actualizada.`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No pudimos marcar el compromiso.",
      );
    }
  }

  async function handleArchive(c: CommitmentView) {
    try {
      await archiveCommitment(c.id);
      toast("Compromiso archivado", {
        action: {
          label: "Deshacer",
          onClick: async () => {
            try {
              await unarchiveCommitment(c.id);
              toast.success("Restaurado.");
            } catch (undoErr) {
              toast.error(
                undoErr instanceof Error
                  ? undoErr.message
                  : "No pudimos restaurar.",
              );
            }
          },
        },
        duration: 5000,
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No pudimos archivar.",
      );
    }
  }

  return (
    <div className="relative min-h-dvh bg-background pb-32 text-foreground">
      <div className="mx-auto w-full max-w-3xl md:max-w-4xl md:px-8 md:py-8">
        <AppHeader
          eyebrow="Tu dinero"
          title="Compromisos"
          titleStyle="display"
          actionsBefore={
            <button
              type="button"
              onClick={openCreate}
              aria-label="Crear compromiso"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted text-foreground transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus size={16} aria-hidden />
            </button>
          }
        />

        {/* Subtitulo informativo */}
        <p className="px-5 pt-2 text-[13px] text-muted-foreground md:px-0">
          Pagos, cobros y préstamos por venir. {totalActive > 0 ? `${totalActive} pendiente${totalActive === 1 ? "" : "s"}.` : null}
        </p>

        <div className="px-4 pt-5 md:px-0">
          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState onRetry={() => window.location.reload()} />
          ) : items.length === 0 ? (
            <EmptyState onCreate={openCreate} />
          ) : (
            <div className="space-y-5">
              {buckets.overdue.length > 0 ? (
                <BucketSection
                  title="Vencidos"
                  subtitle="Pasaron la fecha y siguen pendientes"
                  tone="overdue"
                  items={buckets.overdue}
                  onTap={openEdit}
                  onMarkCompleted={handleMarkCompleted}
                  onArchive={handleArchive}
                />
              ) : null}
              {buckets.dueSoon.length > 0 ? (
                <BucketSection
                  title="Pronto"
                  subtitle="Vencen en los próximos días"
                  tone="due-soon"
                  items={buckets.dueSoon}
                  onTap={openEdit}
                  onMarkCompleted={handleMarkCompleted}
                  onArchive={handleArchive}
                />
              ) : null}
              {buckets.upcoming.length > 0 ? (
                <BucketSection
                  title="Más adelante"
                  subtitle="Aún hay tiempo"
                  tone="upcoming"
                  items={buckets.upcoming}
                  onTap={openEdit}
                  onMarkCompleted={handleMarkCompleted}
                  onArchive={handleArchive}
                />
              ) : null}
              {buckets.completed.length > 0 ? (
                <section>
                  <button
                    type="button"
                    onClick={() => setShowCompleted((v) => !v)}
                    className="flex w-full items-center justify-between text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                    aria-expanded={showCompleted}
                  >
                    <h2 className="text-[14px] font-bold text-foreground">
                      Completados
                      <span className="ml-2 text-[12px] font-normal text-muted-foreground">
                        {buckets.completed.length}
                      </span>
                    </h2>
                    {showCompleted ? (
                      <ChevronUp size={16} aria-hidden className="text-muted-foreground" />
                    ) : (
                      <ChevronDown size={16} aria-hidden className="text-muted-foreground" />
                    )}
                  </button>
                  {showCompleted ? (
                    <div className="mt-3">
                      <CommitmentList
                        items={buckets.completed}
                        onTap={openEdit}
                        onMarkCompleted={handleMarkCompleted}
                        onArchive={handleArchive}
                        muted
                      />
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* FAB mobile — desktop usa el boton plus en el header. */}
      <button
        type="button"
        onClick={openCreate}
        aria-label="Crear compromiso"
        className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
      >
        <Plus size={24} aria-hidden strokeWidth={2.5} />
      </button>

      {/* Form sheet — create + edit en el mismo componente. Renderizo
          dos elementos separados (no spread) para que el discriminated
          union infiera el shape correcto sin casts. */}
      {editing ? (
        <CommitmentFormSheet
          mode="edit"
          initial={editing}
          open={formOpen}
          onOpenChange={(open) => {
            setFormOpen(open);
            if (!open) setEditing(null);
          }}
          submitting={submitting}
          onSubmit={handleSubmit}
        />
      ) : (
        <CommitmentFormSheet
          mode="create"
          defaultKind="payment"
          open={formOpen}
          onOpenChange={(open) => {
            setFormOpen(open);
            if (!open) setEditing(null);
          }}
          submitting={submitting}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

// ─── Section components ────────────────────────────────────────────────

type BucketTone = "overdue" | "due-soon" | "upcoming";

function BucketSection({
  title,
  subtitle,
  tone,
  items,
  onTap,
  onMarkCompleted,
  onArchive,
}: {
  title: string;
  subtitle: string;
  tone: BucketTone;
  items: CommitmentView[];
  onTap: (c: CommitmentView) => void;
  onMarkCompleted: (c: CommitmentView) => void;
  onArchive: (c: CommitmentView) => void;
}) {
  const dotClass =
    tone === "overdue"
      ? "bg-destructive"
      : tone === "due-soon"
        ? "bg-amber-500"
        : "bg-emerald-500";
  return (
    <section>
      <header className="mb-3 flex items-center gap-2">
        <span aria-hidden className={cn("h-2 w-2 rounded-full", dotClass)} />
        <h2 className="text-[14px] font-bold text-foreground">
          {title}
          <span className="ml-2 text-[12px] font-normal text-muted-foreground">
            {items.length}
          </span>
        </h2>
        <span className="text-[11.5px] text-muted-foreground">· {subtitle}</span>
      </header>
      <CommitmentList
        items={items}
        onTap={onTap}
        onMarkCompleted={onMarkCompleted}
        onArchive={onArchive}
      />
    </section>
  );
}

function CommitmentList({
  items,
  onTap,
  onMarkCompleted,
  onArchive,
  muted,
}: {
  items: CommitmentView[];
  onTap: (c: CommitmentView) => void;
  onMarkCompleted: (c: CommitmentView) => void;
  onArchive: (c: CommitmentView) => void;
  muted?: boolean;
}) {
  return (
    <Card className="overflow-hidden rounded-2xl border-border p-0">
      <ul className="divide-y divide-border">
        {items.map((c) => (
          <li key={c.id}>
            <CommitmentRow
              c={c}
              onTap={() => onTap(c)}
              onMarkCompleted={() => onMarkCompleted(c)}
              onArchive={() => onArchive(c)}
              muted={muted}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CommitmentRow({
  c,
  onTap,
  onMarkCompleted,
  onArchive,
  muted,
}: {
  c: CommitmentView;
  onTap: () => void;
  onMarkCompleted: () => void;
  onArchive: () => void;
  muted?: boolean;
}) {
  const Icon = KIND_ICON[c.kind];
  const tint = KIND_TINT[c.kind];
  const status = deriveStatus(c);
  const completed = status === "completed";

  // Subtitle compone tipo + fecha relativa + recurrencia (cuando aplica)
  const parts: string[] = [KIND_LABEL[c.kind]];
  if (c.recurrence !== "none") parts.push(RECURRENCE_LABEL[c.recurrence]);
  const subtitle = parts.join(" · ");

  return (
    <div
      className={cn(
        "flex select-none items-center gap-3 px-4 py-3.5 touch-manipulation",
        muted ? "opacity-70" : null,
      )}
      style={{ WebkitTouchCallout: "none" }}
    >
      <span
        aria-hidden
        className={cn(
          "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full",
          tint.bg,
          tint.text,
        )}
      >
        <Icon size={18} />
      </span>

      <button
        type="button"
        onClick={onTap}
        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        <div className="truncate text-[14.5px] font-semibold leading-tight text-foreground">
          {c.title}
        </div>
        <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
          {subtitle}
        </div>
        <div
          className={cn(
            "mt-0.5 truncate text-[11.5px]",
            status === "overdue"
              ? "text-destructive font-semibold"
              : status === "due-soon"
                ? "text-amber-600 dark:text-amber-400 font-semibold"
                : "text-muted-foreground",
          )}
        >
          {formatRelativeDue(c.dueDate)}
          {c.counterparty ? ` · ${c.counterparty}` : null}
        </div>
      </button>

      <div className="flex flex-col items-end gap-1">
        <span
          className={cn(
            "text-[14px] font-bold tabular-nums whitespace-nowrap",
            c.kind === "income" || c.kind === "lent"
              ? "text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]"
              : "text-foreground",
          )}
          style={TNUM_STYLE}
        >
          {formatAmount(c.amount, c.currency)}
        </span>
        {!completed ? (
          <button
            type="button"
            onClick={onMarkCompleted}
            aria-label="Marcar como completado"
            className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10.5px] font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Check size={11} aria-hidden />
            Pagado
          </button>
        ) : (
          <button
            type="button"
            onClick={onArchive}
            aria-label="Archivar"
            className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Archivar
          </button>
        )}
      </div>
    </div>
  );
}

// ─── States ──────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <Card className="rounded-2xl border-border p-0">
      <div className="flex items-center justify-center py-10 text-[13px] text-muted-foreground">
        <Loader2 size={16} aria-hidden className="mr-2 animate-spin" />
        Cargando…
      </div>
    </Card>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="rounded-2xl border-border p-6 text-center">
      <AlertCircle
        size={28}
        aria-hidden
        className="mx-auto mb-2 text-destructive"
      />
      <p className="text-[13px] text-muted-foreground">
        No pudimos cargar tus compromisos.
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={onRetry}
        className="mt-3 h-10 rounded-full"
      >
        Reintentar
      </Button>
    </Card>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <Card className="rounded-2xl border-border p-8 text-center">
      <span
        aria-hidden
        className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-foreground"
      >
        <CalendarClock size={22} />
      </span>
      <h2 className="text-[15px] font-bold text-foreground">
        No tienes compromisos aún
      </h2>
      <p className="mx-auto mt-1.5 max-w-[420px] text-[13px] text-muted-foreground">
        Registra recibos, cobros o préstamos para no olvidarte. Te avisamos
        antes de la fecha.
      </p>
      <Button
        type="button"
        onClick={onCreate}
        className="mt-4 h-11 rounded-full px-5 text-[13px] font-semibold"
      >
        <Plus size={16} aria-hidden className="mr-1.5" />
        Crear el primero
      </Button>
    </Card>
  );
}

/**
 * Templates route — Kane
 *
 * CRUD completo de templates de gastos/ingresos frecuentes. Mismo
 * patron de layout que /commitments y /budgets: mobile-first, max-w-3xl
 * al centro en desktop, cards rounded-2xl con divider entre filas.
 *
 * Funcionalidad:
 *   - Listar templates activos ordenados por uso descendente.
 *   - Crear / editar via TemplateFormSheet.
 *   - Archivar (soft delete) con undo de 5s.
 *   - ActionResultDrawer para confirmacion de creacion/edicion.
 */
"use client";

import * as React from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { ActionResultDrawer } from "@/components/kane/ActionResultDrawer";
import { AppHeader } from "@/components/kane/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MerchantAvatar } from "@/components/kane/MerchantAvatar";
import { TemplateFormSheet } from "@/components/kane/TemplateFormSheet";
import {
  archiveTemplate,
  createTemplate,
  listTemplates,
  TEMPLATE_UPSERTED_EVENT,
  unarchiveTemplate,
  updateTemplate,
  type TemplateDraft,
  type TemplateView,
} from "@/lib/data/templates";
import { cn } from "@/lib/utils";

const TNUM_STYLE: React.CSSProperties = {
  fontFeatureSettings: '"tnum","lnum"',
};

function formatAmount(amount: number, currency: "PEN" | "USD"): string {
  const symbol = currency === "USD" ? "$" : "S/";
  const formatted = new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  return `${symbol} ${formatted}`;
}

function relativeLastUsed(iso: string | null): string | null {
  if (!iso) return null;
  const last = new Date(iso);
  const diffMs = Date.now() - last.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 1) return "Usado hoy";
  if (days === 1) return "Usado ayer";
  if (days < 7) return `Usado hace ${days} días`;
  if (days < 30) return `Usado hace ${Math.floor(days / 7)} sem`;
  return `Usado hace ${Math.floor(days / 30)} meses`;
}

export default function TemplatesPage(): React.ReactElement {
  const [items, setItems] = React.useState<TemplateView[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TemplateView | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const [successOpen, setSuccessOpen] = React.useState(false);
  const [successTitle, setSuccessTitle] = React.useState<string>("");
  const [successDescription, setSuccessDescription] = React.useState<
    string | null
  >(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const rows = await listTemplates();
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
    window.addEventListener(TEMPLATE_UPSERTED_EVENT, handler);
    return () => {
      cancelled = true;
      window.removeEventListener(TEMPLATE_UPSERTED_EVENT, handler);
    };
  }, []);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(t: TemplateView) {
    setEditing(t);
    setFormOpen(true);
  }

  async function handleSubmit(draft: TemplateDraft) {
    setSubmitting(true);
    try {
      const isUpdate = editing !== null;
      if (editing) {
        await updateTemplate(editing.id, draft);
      } else {
        await createTemplate(draft);
      }
      setFormOpen(false);
      setEditing(null);
      setSuccessTitle(isUpdate ? "Template actualizado" : "Template creado");
      setSuccessDescription(
        isUpdate
          ? "Los cambios ya quedaron guardados."
          : `${draft.title} ya está disponible en el dashboard.`,
      );
      setSuccessOpen(true);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No pudimos guardar el template.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive(t: TemplateView) {
    try {
      await archiveTemplate(t.id);
      toast("Template archivado", {
        action: {
          label: "Deshacer",
          onClick: async () => {
            try {
              await unarchiveTemplate(t.id);
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
      toast.error(err instanceof Error ? err.message : "No pudimos archivar.");
    }
  }

  return (
    <div className="relative min-h-dvh bg-background pb-32 text-foreground">
      <div className="mx-auto w-full max-w-3xl md:max-w-4xl md:px-8 md:py-8">
        <AppHeader
          eyebrow="Tu dinero"
          title="Templates"
          titleStyle="display"
          actionsBefore={
            <button
              type="button"
              onClick={openCreate}
              aria-label="Crear template"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted text-foreground transition-colors hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Plus size={16} aria-hidden />
            </button>
          }
        />

        <p className="px-5 pt-2 text-[13px] text-muted-foreground md:px-0">
          Gastos e ingresos frecuentes que registras con un solo tap desde el
          dashboard.
        </p>

        <div className="px-4 pt-5 md:px-0">
          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState onRetry={() => window.location.reload()} />
          ) : items.length === 0 ? (
            <EmptyState onCreate={openCreate} />
          ) : (
            <Card className="overflow-hidden rounded-2xl border-border p-0">
              <ul className="divide-y divide-border">
                {items.map((t) => (
                  <li key={t.id}>
                    <TemplateRow
                      template={t}
                      onTap={() => openEdit(t)}
                      onArchive={() => void handleArchive(t)}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {editing ? (
        <TemplateFormSheet
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
        <TemplateFormSheet
          mode="create"
          open={formOpen}
          onOpenChange={(open) => {
            setFormOpen(open);
            if (!open) setEditing(null);
          }}
          submitting={submitting}
          onSubmit={handleSubmit}
        />
      )}

      <ActionResultDrawer
        open={successOpen}
        onOpenChange={setSuccessOpen}
        title={successTitle}
        description={successDescription}
        tone="success"
      />
    </div>
  );
}

function TemplateRow({
  template,
  onTap,
  onArchive,
}: {
  template: TemplateView;
  onTap: () => void;
  onArchive: () => void;
}) {
  const KindIcon = template.kind === "income" ? ArrowDownToLine : ArrowUpFromLine;
  const lastUsed = relativeLastUsed(template.lastUsedAt);

  // Subtitle compone categoria + cuenta + comercio.
  const parts: string[] = [];
  if (template.categoryName) parts.push(template.categoryName);
  if (template.accountName) parts.push(template.accountName);
  const subtitle = parts.join(" · ");

  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      {template.merchantLogoSlug || template.merchantName ? (
        <MerchantAvatar
          name={template.merchantName ?? template.title}
          logoSlug={template.merchantLogoSlug}
          size="lg"
        />
      ) : (
        <span
          aria-hidden
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[13px] font-bold"
        >
          {template.title.trim().charAt(0).toUpperCase() || "?"}
        </span>
      )}

      <button
        type="button"
        onClick={onTap}
        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        <div className="flex items-center gap-1.5">
          <KindIcon
            size={11}
            aria-hidden
            className={cn(
              "flex-shrink-0",
              template.kind === "income"
                ? "text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]"
                : "text-muted-foreground",
            )}
          />
          <span className="truncate text-[14.5px] font-semibold leading-tight text-foreground">
            {template.title}
          </span>
        </div>
        {subtitle ? (
          <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
            {subtitle}
          </div>
        ) : null}
        <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
          {template.usageCount > 0
            ? `${template.usageCount} ${template.usageCount === 1 ? "uso" : "usos"}`
            : "Sin usos"}
          {lastUsed ? ` · ${lastUsed}` : null}
        </div>
      </button>

      <div className="flex flex-col items-end gap-1.5">
        <span
          className={cn(
            "text-[14px] font-bold tabular-nums whitespace-nowrap",
            template.kind === "income"
              ? "text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]"
              : "text-foreground",
          )}
          style={TNUM_STYLE}
        >
          {formatAmount(template.amount, template.currency)}
        </span>
        <button
          type="button"
          onClick={onArchive}
          aria-label="Archivar template"
          className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Trash2 size={10} aria-hidden />
          Archivar
        </button>
      </div>
    </div>
  );
}

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
        No pudimos cargar tus templates.
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
        <Zap size={22} />
      </span>
      <h2 className="text-[15px] font-bold text-foreground">
        No tienes templates aún
      </h2>
      <p className="mx-auto mt-1.5 max-w-[420px] text-[13px] text-muted-foreground">
        Guarda los gastos que repites (café, taxi, almuerzo) y regístralos con
        un solo tap desde el dashboard.
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

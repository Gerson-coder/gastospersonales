/**
 * TemplatesQuickRow — fila horizontal de chips en el dashboard para
 * disparar gastos/ingresos frecuentes con un solo tap.
 *
 * Tap = se crea la transaccion con los datos del template + se
 * incrementa usage_count para que ese template aparezca arriba la
 * proxima vez. Sin formularios, sin confirmaciones — el confirm es el
 * toast post-creacion con accion "Deshacer".
 *
 * Se monta en el dashboard mobile y desktop. Render null cuando no
 * hay templates activos para no cargar espacio visual.
 *
 * El listener de TEMPLATE_UPSERTED_EVENT cubre cambios desde otra
 * ruta (/templates) y desde el propio quick row (incrementTemplateUsage
 * emite el mismo evento).
 */
"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpFromLine, Settings2, Zap } from "lucide-react";
import { toast } from "sonner";

import { MerchantAvatar } from "@/components/kane/MerchantAvatar";
import {
  archiveTransaction,
  createTransaction,
  emitTxUpserted,
  unarchiveTransaction,
} from "@/lib/data/transactions";
import {
  incrementTemplateUsage,
  listTemplates,
  templateToTransactionDraft,
  TEMPLATE_UPSERTED_EVENT,
  type TemplateView,
} from "@/lib/data/templates";
import { cn } from "@/lib/utils";

function formatAmount(amount: number, currency: "PEN" | "USD"): string {
  const symbol = currency === "USD" ? "$" : "S/";
  const formatted = new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  return `${symbol} ${formatted}`;
}

const MAX_VISIBLE = 5;

export function TemplatesQuickRow() {
  const [items, setItems] = React.useState<TemplateView[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const rows = await listTemplates();
        if (!cancelled) setItems(rows);
      } catch {
        if (!cancelled) setItems([]);
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

  async function handleUseTemplate(t: TemplateView) {
    if (pendingId) return;
    const draft = templateToTransactionDraft(t);
    if (!draft) {
      toast.error("Asigna una cuenta al template antes de usarlo.");
      return;
    }
    setPendingId(t.id);
    try {
      const tx = await createTransaction(draft);
      // Bump async — no bloquea la UI ni el toast.
      void incrementTemplateUsage(t.id);
      // Reemite por si el listener del dashboard ya estaba montado
      // pero perdió el primer evento.
      emitTxUpserted();
      toast.success(t.kind === "income" ? "Ingreso registrado" : "Gasto registrado", {
        description: `${t.title} · ${formatAmount(t.amount, t.currency)}`,
        action: {
          label: "Deshacer",
          onClick: async () => {
            try {
              await archiveTransaction(tx.id);
              // unarchiveTransaction restauraria, pero el flujo natural
              // del undo es archivar lo recien creado. Sin embargo el
              // user tappeo "Deshacer" buscando borrar — usamos
              // archive (la fila desaparece del feed). Si quiere
              // recuperar puede restaurar desde /movements.
              toast("Movimiento descartado", {
                action: {
                  label: "Restaurar",
                  onClick: async () => {
                    try {
                      await unarchiveTransaction(tx.id);
                      toast.success("Movimiento restaurado.");
                    } catch (err) {
                      toast.error(
                        err instanceof Error
                          ? err.message
                          : "No pudimos restaurar.",
                      );
                    }
                  },
                },
                duration: 5000,
              });
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "No pudimos deshacer.",
              );
            }
          },
        },
        duration: 5000,
      });
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "No pudimos registrar el movimiento.",
      );
    } finally {
      setPendingId(null);
    }
  }

  if (loading || items.length === 0) {
    return null;
  }

  const visible = items.slice(0, MAX_VISIBLE);

  return (
    <section aria-labelledby="templates-quickrow-title">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap
            size={14}
            aria-hidden
            className="text-muted-foreground"
          />
          <span
            id="templates-quickrow-title"
            className="text-[15px] font-bold text-foreground"
          >
            Templates
          </span>
        </div>
        <Link
          href="/templates"
          className="inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
        >
          <Settings2 size={13} aria-hidden />
          Gestionar
        </Link>
      </div>
      <div
        role="list"
        className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {visible.map((t) => (
          <TemplateChip
            key={t.id}
            template={t}
            disabled={pendingId !== null}
            pending={pendingId === t.id}
            onUse={() => void handleUseTemplate(t)}
          />
        ))}
      </div>
    </section>
  );
}

function TemplateChip({
  template,
  disabled,
  pending,
  onUse,
}: {
  template: TemplateView;
  disabled: boolean;
  pending: boolean;
  onUse: () => void;
}) {
  const KindIcon = template.kind === "income" ? ArrowDownToLine : ArrowUpFromLine;

  return (
    <button
      type="button"
      role="listitem"
      onClick={onUse}
      disabled={disabled}
      aria-label={`Registrar ${template.title} ${formatAmount(template.amount, template.currency)}`}
      className={cn(
        "group flex min-w-[160px] max-w-[220px] flex-shrink-0 items-center gap-2.5 rounded-2xl border border-border bg-card px-3 py-2.5 text-left transition-all",
        "hover:border-foreground/30 hover:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:opacity-60 disabled:cursor-not-allowed",
        pending ? "scale-[0.98]" : null,
      )}
    >
      {template.merchantLogoSlug || template.merchantName ? (
        <MerchantAvatar
          name={template.merchantName ?? template.title}
          logoSlug={template.merchantLogoSlug}
          size="md"
        />
      ) : (
        <span
          aria-hidden
          className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[12px] font-bold"
        >
          {template.title.trim().charAt(0).toUpperCase() || "?"}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
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
          <span className="truncate text-[12.5px] font-semibold text-foreground">
            {template.title}
          </span>
        </span>
        <span className="block truncate text-[11.5px] tabular-nums text-muted-foreground">
          {formatAmount(template.amount, template.currency)}
        </span>
      </span>
    </button>
  );
}

export default TemplatesQuickRow;

/**
 * MerchantPicker — "¿Dónde? (opcional)" section under the category chips.
 *
 * Shows up to 3 MRU merchants for the currently-selected category as
 * compact chips, plus a "Ver más" affordance that opens
 * {@link MerchantsDrawer}. Mirrors the visual language of the category
 * chip strip in `capture/page.tsx` so the section feels native to the
 * capture page.
 *
 * Behavior:
 *   - When `categoryId` is null, the component renders `null` — we never
 *     contaminate the capture flow with a section that has no context.
 *   - When MRU returns nothing AND the category has zero visible
 *     merchants, the component also renders `null` (e.g. a brand-new
 *     category where the user hasn't seeded anything yet). The drawer
 *     entry would otherwise dead-end on an empty list.
 *   - When MRU is empty but the category does have merchants, we still
 *     render the section with just the "Ver más" affordance so the user
 *     can drill in.
 *   - Tapping the currently-selected chip toggles it off (sends `null`
 *     up).
 *
 * Parent contract (documented here, not enforced):
 *   - When the user changes category, the parent SHOULD call
 *     `onChange(null)` because merchants are scoped to a category — keeping
 *     a stale id around would break the spec scenario "Category change
 *     clears selection".
 */
"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";

import {
  listMerchantsByCategory,
  listMRUMerchants,
  type Merchant,
} from "@/lib/data/merchants";
import { MerchantAvatar } from "@/components/lumi/MerchantAvatar";
import { MerchantsDrawer } from "@/components/lumi/MerchantsDrawer";
import { cn } from "@/lib/utils";

export type MerchantPickerProps = {
  /** null when the user hasn't selected a category yet. */
  categoryId: string | null;
  /** Pretty name for the drawer header. null mirrors `categoryId === null`. */
  categoryName: string | null;
  /** Currently-selected merchant id (or null). */
  value: string | null;
  /** Toggle handler. Pass `null` to deselect. */
  onChange: (merchantId: string | null) => void;
};

const MRU_LIMIT = 3;

export function MerchantPicker({
  categoryId,
  categoryName,
  value,
  onChange,
}: MerchantPickerProps) {
  const [mru, setMru] = React.useState<Merchant[]>([]);
  // We hydrate the total-count probe alongside the MRU fetch so we can
  // decide whether to render at all. Storing the boolean (not the full
  // list) keeps the component lightweight.
  const [hasAny, setHasAny] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Re-fetch MRU + total presence whenever the parent category changes.
  // Both calls degrade gracefully (the data layer catches missing-table /
  // missing-function errors and returns []), so a thrown error here is
  // genuinely unexpected and we still render null.
  React.useEffect(() => {
    if (!categoryId) {
      setMru([]);
      setHasAny(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [mruRows, allRows] = await Promise.all([
          listMRUMerchants(categoryId, MRU_LIMIT),
          listMerchantsByCategory(categoryId),
        ]);
        if (cancelled) return;
        setMru(mruRows);
        setHasAny(allRows.length > 0);
      } catch {
        // Soft-fail — the section will simply not render. The data layer
        // already logs once on first failure.
        if (cancelled) return;
        setMru([]);
        setHasAny(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  // Bail out when there's no category context, when the category has zero
  // visible merchants, or while we're still on the first hydration tick
  // (avoids a flash of an empty section before data lands).
  if (!categoryId || !categoryName) return null;
  if (loading) return null;
  if (!hasAny) return null;

  const handleChipClick = (id: string) => {
    // Toggle: tapping the selected chip clears the selection.
    onChange(value === id ? null : id);
  };

  return (
    <>
      <section
        className="mt-3 px-4"
        aria-label="Comercio (opcional)"
      >
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[13px] font-semibold text-foreground">
            ¿Dónde? <span className="text-muted-foreground">(opcional)</span>
          </span>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver más
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {mru.map((m) => {
            const selected = value === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => handleChipClick(m.id)}
                aria-pressed={selected}
                aria-label={`Comercio ${m.name}${selected ? " (seleccionado)" : ""}`}
                className={cn(
                  "inline-flex h-9 flex-shrink-0 items-center gap-2 rounded-full border pl-1 pr-3 text-[12px] font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-foreground bg-foreground text-background font-semibold"
                    : "border-border bg-card text-foreground hover:bg-muted",
                )}
              >
                <MerchantAvatar
                  name={m.name}
                  logoSlug={m.logo_slug}
                  size="sm"
                  className={cn(
                    selected && "ring-1 ring-background/20",
                  )}
                />
                <span className="truncate max-w-[7.5rem]">{m.name}</span>
              </button>
            );
          })}
          {/* "Ver más" inline pill mirrors the "+ Más" affordance on the
              category strip — keeps the visual rhythm consistent when MRU
              is short. */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Ver todos los comercios"
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            className="inline-flex h-9 flex-shrink-0 items-center rounded-full border border-dashed border-border bg-transparent px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Ver más
          </button>
        </div>
      </section>

      <MerchantsDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        categoryId={categoryId}
        categoryName={categoryName}
        selectedMerchantId={value}
        onSelect={onChange}
      />
    </>
  );
}

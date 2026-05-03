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
import { Plus } from "lucide-react";

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
  // Full merchant list for the active category, kept around so we can
  // resolve a "pinned" merchant id (one the user picked from the drawer
  // that isn't in the MRU strip) back to a Merchant object for rendering.
  const [all, setAll] = React.useState<Merchant[]>([]);
  // The most recent merchant the user picked from the drawer that wasn't
  // in the MRU. Prepended to the visible strip so the chosen badge is
  // visually anchored next to KFC / Norky's / etc. Cleared when the
  // category changes (different list, different relevance).
  const [pinnedId, setPinnedId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Re-fetch MRU + the full list whenever the parent category changes.
  // Both calls degrade gracefully (the data layer catches missing-table /
  // missing-function errors and returns []), so a thrown error here is
  // genuinely unexpected and we still render null.
  React.useEffect(() => {
    if (!categoryId) {
      setMru([]);
      setAll([]);
      setPinnedId(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setPinnedId(null);
    void (async () => {
      try {
        const [mruRows, allRows] = await Promise.all([
          listMRUMerchants(categoryId, MRU_LIMIT),
          listMerchantsByCategory(categoryId),
        ]);
        if (cancelled) return;
        setMru(mruRows);
        setAll(allRows);
      } catch {
        // Soft-fail — the section will simply not render. The data layer
        // already logs once on first failure.
        if (cancelled) return;
        setMru([]);
        setAll([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [categoryId]);

  const hasAny = all.length > 0;

  // Visible strip = pinned (if outside MRU) + MRU, deduped by id, capped
  // at MRU_LIMIT. The pinned merchant lands at index 0 so the user sees
  // their pick land in the visible row immediately after closing the
  // drawer; the existing top-MRU chips slide right by one and the last
  // gets dropped if the cap is exceeded.
  const visible = React.useMemo<Merchant[]>(() => {
    const head: Merchant[] = [];
    const seen = new Set<string>();
    if (pinnedId && !mru.slice(0, MRU_LIMIT).some((m) => m.id === pinnedId)) {
      const pinned = all.find((m) => m.id === pinnedId);
      if (pinned) {
        head.push(pinned);
        seen.add(pinned.id);
      }
    }
    for (const m of mru) {
      if (head.length >= MRU_LIMIT) break;
      if (seen.has(m.id)) continue;
      head.push(m);
      seen.add(m.id);
    }
    return head;
  }, [pinnedId, mru, all]);

  // Selection callback wrapper — drives both `onChange` (parent state)
  // and the pinning logic. When the picked id isn't already visible in
  // the strip, we mark it as pinned so it appears in the next render.
  const handleSelect = React.useCallback(
    (id: string | null) => {
      onChange(id);
      if (id === null) return;
      if (visible.some((m) => m.id === id)) return;
      setPinnedId(id);
    },
    [onChange, visible],
  );

  // Bail out when there's no category context, when the category has zero
  // visible merchants, or while we're still on the first hydration tick
  // (avoids a flash of an empty section before data lands).
  if (!categoryId || !categoryName) return null;
  if (loading) return null;
  if (!hasAny) return null;

  const handleChipClick = (id: string) => {
    // Toggle: tapping the selected chip clears the selection.
    handleSelect(value === id ? null : id);
  };

  return (
    <>
      {/* Header verbose ("Restaurantes (opcional)" / "Universidades
          (opcional)" / etc.) removido por feedback del user: los chips
          de abajo ya muestran logos + nombres, el header agregaba ruido
          sin info. El aria-label de la section sigue dando contexto a
          screen readers. */}
      <section
        className="mt-3 px-4"
        aria-label="Comercio (opcional)"
      >
        <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visible.map((m) => {
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
          {/* "Más" pill — afordancia para abrir el drawer completo
              cuando los 3 MRU no alcanzan. Reemplaza al ex-link "Ver
              todos" que vivia en una segunda fila junto al header
              eliminado: poniendolo inline al final del strip ahorra
              una row vertical y mantiene el lenguaje de chips uniforme.
              Tambien cubre el edge case de "MRU vacio pero la categoria
              tiene comercios" — antes el strip quedaba vacio y solo se
              veia el link, ahora siempre hay al menos esta pill. */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            aria-label="Ver todos los comercios"
            className="inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-full border border-dashed border-border bg-transparent px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus size={14} aria-hidden="true" />
            Más
          </button>
        </div>
      </section>

      <MerchantsDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        categoryId={categoryId}
        categoryName={categoryName}
        selectedMerchantId={value}
        onSelect={handleSelect}
      />
    </>
  );
}

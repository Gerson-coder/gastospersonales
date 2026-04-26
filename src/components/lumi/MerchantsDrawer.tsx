/**
 * MerchantsDrawer — full list of merchants in a category, with search +
 * inline create.
 *
 * Mirrors the visual language of the existing category Drawer in
 * `capture/page.tsx` (vaul, bottom-sheet, `bg-background`, rounded list
 * rows). Behavior:
 *
 *   - Lazy-loads the merchant list when `open` flips to true so the parent
 *     pays the network cost only when the drawer is actually used.
 *   - Client-side filter on `search`, case-insensitive and diacritic-
 *     insensitive (matches the `name.normalize("NFD")` trick used by
 *     `getMerchantAvatar` so search behaves like the avatar generator).
 *   - "+ Crear nuevo comercio" persists at the bottom and opens the
 *     {@link MerchantFormSheet} in `create` mode. On successful save the
 *     new merchant is auto-selected, optimistically prepended to the
 *     visible list, the form sheet closes, and the drawer closes.
 *   - Empty state for categories with zero visible merchants — a single
 *     centered CTA rather than an awkward empty list.
 *
 * Owns its own submit/loading/error state via toasts. Calls
 * {@link createMerchant} directly — the parent only needs to react to
 * `onSelect`.
 */
"use client";

import * as React from "react";
import { Check, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { MerchantAvatar } from "@/components/lumi/MerchantAvatar";
import { MerchantFormSheet } from "@/components/lumi/MerchantFormSheet";
import {
  createMerchant,
  listMerchantsByCategory,
  type Merchant,
} from "@/lib/data/merchants";
import { cn } from "@/lib/utils";

export type MerchantsDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  categoryName: string;
  selectedMerchantId: string | null;
  onSelect: (merchantId: string | null) => void;
};

/**
 * Strip diacritics + lowercase. Keeps "Inkafarma" matching "ínkafárma" so
 * the search input feels forgiving on mobile.
 */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export function MerchantsDrawer({
  open,
  onOpenChange,
  categoryId,
  categoryName,
  selectedMerchantId,
  onSelect,
}: MerchantsDrawerProps) {
  const [merchants, setMerchants] = React.useState<Merchant[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [search, setSearch] = React.useState("");
  // Inline create flow — owns the form sheet open/submit state so the
  // drawer parent doesn't have to know about it.
  const [formOpen, setFormOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // Hydrate the list on open + reset transient state. Re-runs when the
  // category changes mid-session (rare but cheap).
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setSearch("");
    setFormOpen(false);
    setSubmitting(false);
    void (async () => {
      try {
        const rows = await listMerchantsByCategory(categoryId);
        if (cancelled) return;
        setMerchants(rows);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : "No pudimos cargar los comercios.";
        toast.error(message);
        setMerchants([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, categoryId]);

  // Filter is purely derived — keep the source list intact so closing
  // and re-opening with a different search reflects the latest data.
  const filtered = React.useMemo(() => {
    const needle = normalize(search);
    if (!needle) return merchants;
    return merchants.filter((m) => normalize(m.name).includes(needle));
  }, [merchants, search]);

  const handleSelect = React.useCallback(
    (id: string) => {
      onSelect(id);
      onOpenChange(false);
    },
    [onSelect, onOpenChange],
  );

  const handleCreate = React.useCallback(
    async ({ name }: { name: string }) => {
      setSubmitting(true);
      try {
        const created = await createMerchant({
          name,
          categoryId,
        });
        // Optimistic prepend so the new row is visible if the user reopens
        // without a re-fetch. We dedupe by id in case of any race.
        setMerchants((prev) => {
          const seen = prev.some((m) => m.id === created.id);
          return seen ? prev : [created, ...prev];
        });
        toast.success(`Listo: «${created.name}» agregado.`);
        setFormOpen(false);
        // Auto-select + close the drawer — saves the user a third tap.
        onSelect(created.id);
        onOpenChange(false);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "No pudimos crear el comercio.";
        toast.error(message);
      } finally {
        setSubmitting(false);
      }
    },
    [categoryId, onOpenChange, onSelect],
  );

  const isEmpty = !loading && merchants.length === 0;

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          aria-describedby="merchants-drawer-desc"
          className="bg-background"
        >
          <DrawerHeader>
            <DrawerTitle>Comercios de {categoryName}</DrawerTitle>
            <DrawerDescription id="merchants-drawer-desc">
              Elige dónde ocurrió este movimiento o crea uno nuevo.
            </DrawerDescription>
          </DrawerHeader>

          {/* Search — hidden when the category is genuinely empty so we
              don't tease a feature that has no data behind it. */}
          {!isEmpty ? (
            <div className="px-4 pb-2">
              <Label htmlFor="merchants-drawer-search" className="sr-only">
                Buscar comercio
              </Label>
              <div className="relative">
                <Search
                  size={16}
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="merchants-drawer-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar comercio…"
                  autoComplete="off"
                  className="h-11 pl-9 text-[15px]"
                />
              </div>
            </div>
          ) : null}

          <div className="max-h-[50vh] overflow-y-auto px-2">
            {loading ? (
              <ul className="flex flex-col gap-1 px-0 pb-2">
                {[0, 1, 2].map((i) => (
                  <li
                    key={i}
                    className="flex h-12 items-center gap-3 rounded-2xl px-3"
                  >
                    <span className="h-8 w-8 flex-shrink-0 animate-pulse rounded-full bg-muted" />
                    <span className="h-3.5 flex-1 animate-pulse rounded bg-muted" />
                  </li>
                ))}
              </ul>
            ) : isEmpty ? (
              <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
                <p className="text-[13px] leading-snug text-muted-foreground">
                  Todavía no hay comercios en esta categoría. Crea el primero.
                </p>
                <Button
                  type="button"
                  onClick={() => setFormOpen(true)}
                  className="min-h-11 rounded-full"
                >
                  <Plus size={16} aria-hidden className="mr-1.5" />
                  Crear comercio
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
                No encontramos comercios con «{search.trim()}».
              </p>
            ) : (
              <ul className="flex flex-col gap-1 pb-2">
                {filtered.map((m) => {
                  const selected = selectedMerchantId === m.id;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(m.id)}
                        aria-pressed={selected}
                        className={cn(
                          "flex h-12 w-full items-center gap-3 rounded-2xl px-3 text-left transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected ? "bg-muted" : "hover:bg-muted",
                        )}
                      >
                        <MerchantAvatar
                          name={m.name}
                          logoSlug={m.logo_slug}
                          size="md"
                        />
                        <span className="flex-1 truncate text-[13px] font-semibold">
                          {m.name}
                        </span>
                        {selected ? (
                          <Check
                            size={16}
                            aria-hidden="true"
                            className="text-foreground"
                          />
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Persistent create CTA — hidden when the empty-state already
              shows a centered Crear button to avoid two equivalent
              entries. */}
          {!isEmpty ? (
            <div className="border-t border-border bg-background px-4 py-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormOpen(true)}
                disabled={submitting}
                className="h-11 w-full rounded-full text-[13px] font-semibold"
              >
                {submitting ? (
                  <>
                    <Loader2
                      size={14}
                      aria-hidden
                      className="mr-1.5 animate-spin"
                    />
                    Creando…
                  </>
                ) : (
                  <>
                    <Plus size={16} aria-hidden className="mr-1.5" />
                    Crear nuevo comercio
                  </>
                )}
              </Button>
            </div>
          ) : null}
        </DrawerContent>
      </Drawer>

      {/* Inline create sheet — stacks above the drawer. Sheet (Base UI
          Dialog) and Drawer (vaul) live in separate portals and play
          nicely together. */}
      <MerchantFormSheet
        mode="create"
        open={formOpen}
        onOpenChange={setFormOpen}
        submitting={submitting}
        categoryId={categoryId}
        categoryName={categoryName}
        onSubmit={handleCreate}
      />
    </>
  );
}

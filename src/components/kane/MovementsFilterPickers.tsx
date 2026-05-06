/**
 * MovementsFilterPickers — drawers para los selectores de categoría y
 * cuenta del filtro de /movements.
 *
 * Dos sheets gemelos, single-select, con opción "Todas" siempre arriba.
 * Cargan la lista al abrir (lazy) — el padre no paga el round-trip si
 * el user nunca toca el filtro. Reusan los avatares ya disponibles
 * (AccountBrandIcon, getMerchantAvatar) para que la lista coincida
 * visualmente con el resto de la app.
 *
 * Por qué un solo archivo en vez de dos:
 *   - Comparten 80% de la estructura (drawer header + lista + footer
 *     vacío). Mantenerlos vecinos hace fácil mantener la simetría
 *     visual cuando uno cambia.
 *   - Solo se importan desde /movements; no hay riesgo de que un caller
 *     remoto tire de uno y arrastre el otro innecesariamente.
 */
"use client";

import * as React from "react";
import { Check, Landmark } from "lucide-react";
import { toast } from "sonner";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  NestedDrawer,
} from "@/components/ui/drawer";
import { listCategories, type Category } from "@/lib/data/categories";
import { listAccounts, type Account, accountDisplayLabel } from "@/lib/data/accounts";
import { AccountBrandIcon } from "@/components/kane/AccountBrandIcon";
import { accountChipBgClass } from "@/lib/account-brand-slug";
import { cn } from "@/lib/utils";

// ─── Categoría ─────────────────────────────────────────────────────────

export type CategoryFilterPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null → "Todas". */
  value: string | null;
  onSelect: (categoryId: string | null, name: string | null) => void;
  /**
   * Cuando true, usa Drawer.NestedRoot en lugar de Drawer.Root.
   * Necesario cuando este picker se abre dentro de otro drawer
   * (ej: el form sheet de compromisos) — sin nested, vaul cierra
   * ambos drawers al seleccionar una opcion.
   */
  nested?: boolean;
};

export function CategoryFilterPicker({
  open,
  onOpenChange,
  value,
  onSelect,
  nested = false,
}: CategoryFilterPickerProps) {
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const rows = await listCategories();
        if (cancelled) return;
        // Solo categorías de gasto + "ambas". /movements muestra ambos
        // tipos pero los users tienden a filtrar por categoría de
        // gasto (que es donde nace el desglose). Dejamos pasar income
        // para no romper el caso "filtrar todos los pagos a 'Sueldo'".
        setCategories(rows);
      } catch (err) {
        if (cancelled) return;
        toast.error(
          err instanceof Error
            ? err.message
            : "No pudimos cargar las categorías.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  function pick(categoryId: string | null, name: string | null) {
    onSelect(categoryId, name);
    onOpenChange(false);
  }

  // Switch dinamico Root vs NestedRoot. NestedRoot avisa al padre
  // que no debe auto-dismiss cuando este se cierra.
  const Root = nested ? NestedDrawer : Drawer;

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        aria-describedby="category-filter-desc"
        className="bg-background md:!max-w-xl"
      >
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-sans not-italic text-base font-semibold">
            Filtrar por categoría
          </DrawerTitle>
          <DrawerDescription
            id="category-filter-desc"
            className="text-[12px]"
          >
            Elige una categoría o muestra todas.
          </DrawerDescription>
        </DrawerHeader>

        <div className="max-h-[55vh] overflow-y-auto px-2 pb-3">
          <ul className="flex flex-col gap-1">
            <li>
              <FilterRow
                selected={value === null}
                onClick={() => pick(null, null)}
                primary="Todas"
                secondary={`${categories.length} categorías`}
              />
            </li>
            {loading
              ? [0, 1, 2].map((i) => (
                  <li
                    key={`skel-${i}`}
                    className="flex h-12 items-center gap-3 rounded-2xl px-3"
                  >
                    <span className="h-3.5 flex-1 animate-pulse rounded bg-muted" />
                  </li>
                ))
              : categories.map((c) => (
                  <li key={c.id}>
                    <FilterRow
                      selected={value === c.id}
                      onClick={() => pick(c.id, c.name)}
                      primary={c.name}
                      secondary={c.kind === "income" ? "Ingreso" : "Gasto"}
                      colorDot={c.color ?? null}
                    />
                  </li>
                ))}
          </ul>
        </div>
      </DrawerContent>
    </Root>
  );
}

// ─── Cuenta ────────────────────────────────────────────────────────────

export type AccountFilterPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null → "Todas". */
  value: string | null;
  onSelect: (accountId: string | null, label: string | null) => void;
  /** Igual que CategoryFilterPicker — true cuando se abre dentro de otro drawer. */
  nested?: boolean;
};

export function AccountFilterPicker({
  open,
  onOpenChange,
  value,
  onSelect,
  nested = false,
}: AccountFilterPickerProps) {
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const rows = await listAccounts();
        if (cancelled) return;
        setAccounts(rows);
      } catch (err) {
        if (cancelled) return;
        toast.error(
          err instanceof Error
            ? err.message
            : "No pudimos cargar las cuentas.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  function pick(accountId: string | null, label: string | null) {
    onSelect(accountId, label);
    onOpenChange(false);
  }

  const Root = nested ? NestedDrawer : Drawer;

  return (
    <Root open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        aria-describedby="account-filter-desc"
        className="bg-background md:!max-w-xl"
      >
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-sans not-italic text-base font-semibold">
            Filtrar por cuenta
          </DrawerTitle>
          <DrawerDescription
            id="account-filter-desc"
            className="text-[12px]"
          >
            Elige una cuenta o muestra todas.
          </DrawerDescription>
        </DrawerHeader>

        <div className="max-h-[55vh] overflow-y-auto px-2 pb-3">
          <ul className="flex flex-col gap-1">
            <li>
              <FilterRow
                selected={value === null}
                onClick={() => pick(null, null)}
                primary="Todas"
                secondary={`${accounts.length} cuentas`}
              />
            </li>
            {loading
              ? [0, 1].map((i) => (
                  <li
                    key={`skel-${i}`}
                    className="flex h-12 items-center gap-3 rounded-2xl px-3"
                  >
                    <span className="h-3.5 flex-1 animate-pulse rounded bg-muted" />
                  </li>
                ))
              : accounts.map((a) => {
                  const display = accountDisplayLabel(a);
                  return (
                    <li key={a.id}>
                      <FilterRow
                        selected={value === a.id}
                        onClick={() => pick(a.id, display)}
                        primary={display}
                        secondary={a.currency === "USD" ? "Dólares" : "Soles"}
                        avatar={
                          <span
                            aria-hidden
                            className={cn(
                              "flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-foreground",
                              accountChipBgClass(a.label),
                            )}
                          >
                            <AccountBrandIcon
                              label={a.label}
                              fallback={<Landmark size={14} />}
                            />
                          </span>
                        }
                      />
                    </li>
                  );
                })}
          </ul>
        </div>
      </DrawerContent>
    </Root>
  );
}

// ─── Helper compartido ─────────────────────────────────────────────────

type FilterRowProps = {
  selected: boolean;
  onClick: () => void;
  primary: string;
  secondary?: string;
  /** Hex / oklch / etc. — pinta un dot al inicio del row. */
  colorDot?: string | null;
  /** Sustituye el dot — usado por la lista de cuentas para mostrar
   *  el AccountBrandIcon. */
  avatar?: React.ReactNode;
};

function FilterRow({
  selected,
  onClick,
  primary,
  secondary,
  colorDot,
  avatar,
}: FilterRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex h-12 w-full items-center gap-3 rounded-2xl px-3 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "bg-muted" : "hover:bg-muted",
      )}
    >
      {avatar
        ? avatar
        : colorDot
          ? (
              <span
                aria-hidden
                className="h-3 w-3 flex-shrink-0 rounded-full ring-2 ring-card"
                style={{ backgroundColor: colorDot }}
              />
            )
          : (
              <span aria-hidden className="h-3 w-3 flex-shrink-0" />
            )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold text-foreground">
          {primary}
        </span>
        {secondary ? (
          <span className="block truncate text-[11.5px] text-muted-foreground">
            {secondary}
          </span>
        ) : null}
      </span>
      {selected ? (
        <Check size={16} aria-hidden className="text-foreground shrink-0" />
      ) : null}
    </button>
  );
}

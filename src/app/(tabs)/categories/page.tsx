/**
 * Categories route — Kane
 *
 * Lists the user's own categories alongside the system seed catalogue, split
 * by kind (gasto / ingreso). Users can create, edit and archive their own
 * rows; system rows open the read-only info card. All form logic lives in
 * `CategoryFormSheet` — this page is just composition + data wiring.
 *
 * Mobile-first, desktop max-w-3xl centered. When Supabase env vars are
 * missing we fall back to a small mock list so the page stays browseable in
 * demo mode.
 */

"use client";

import * as React from "react";
import { toast } from "sonner";
import { ChevronRight, Lock, Plus } from "lucide-react";

import { AppHeader } from "@/components/kane/AppHeader";
import { CategoryFormSheet } from "@/components/kane/CategoryFormSheet";
import { SavingOverlay } from "@/components/kane/SavingOverlay";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import {
  archiveCategory,
  createCategory,
  listCategories,
  updateCategory,
  type Category,
  type CategoryDraft,
  type CategoryPatch,
} from "@/lib/data/categories";
import {
  DEFAULT_CATEGORY_ICON,
  getCategoryIcon,
} from "@/lib/category-icons";
import type { CategoryKind } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

// ─── Demo mode flag ───────────────────────────────────────────────────────
// Mirrors the rest of the app: when env vars are absent we skip the data
// layer entirely and surface a small mock list so the screen stays usable.
const SUPABASE_ENABLED =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;

// ─── Mocks (demo mode only) ───────────────────────────────────────────────
const MOCK_CATEGORIES: Category[] = [
  {
    id: "u1",
    user_id: "demo-user",
    name: "Mascotas",
    kind: "expense",
    color: null,
    icon: "heart",
    archived_at: null,
    created_at: "",
    updated_at: "",
  },
  {
    id: "u2",
    user_id: "demo-user",
    name: "Suscripciones",
    kind: "expense",
    color: null,
    icon: "plug",
    archived_at: null,
    created_at: "",
    updated_at: "",
  },
  {
    id: "u3",
    user_id: "demo-user",
    name: "Freelance",
    kind: "income",
    color: null,
    icon: "briefcase",
    archived_at: null,
    created_at: "",
    updated_at: "",
  },
  {
    id: "s1",
    user_id: null,
    name: "Comida",
    kind: "expense",
    color: null,
    icon: "utensils-crossed",
    archived_at: null,
    created_at: "",
    updated_at: "",
  },
  {
    id: "s2",
    user_id: null,
    name: "Transporte",
    kind: "expense",
    color: null,
    icon: "car",
    archived_at: null,
    created_at: "",
    updated_at: "",
  },
  {
    id: "s3",
    user_id: null,
    name: "Hogar",
    kind: "expense",
    color: null,
    icon: "home",
    archived_at: null,
    created_at: "",
    updated_at: "",
  },
  {
    id: "s4",
    user_id: null,
    name: "Salario",
    kind: "income",
    color: null,
    icon: "piggy-bank",
    archived_at: null,
    created_at: "",
    updated_at: "",
  },
];

// ─── Page ──────────────────────────────────────────────────────────────────
export default function CategoriesPage() {
  const [categories, setCategories] = React.useState<Category[]>(
    SUPABASE_ENABLED ? [] : MOCK_CATEGORIES,
  );
  const [loading, setLoading] = React.useState<boolean>(SUPABASE_ENABLED);
  const [activeKind, setActiveKind] = React.useState<CategoryKind>("expense");
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Category | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [overlayLabel, setOverlayLabel] = React.useState<string>("Guardando…");
  // Modal shown when create/update fails because the category name is
  // already taken (UNIQUE_VIOLATION 23505). Replaces the legacy sonner
  // toast — same Drawer modal language as Cuenta duplicada / Sin saldo.
  const [dupCategoryOpen, setDupCategoryOpen] = React.useState(false);

  const reload = React.useCallback(async () => {
    if (!SUPABASE_ENABLED) return;
    try {
      const list = await listCategories();
      setCategories(list);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "No pudimos cargar las categorías.";
      toast.error("Error al cargar categorías", { description: msg });
    }
  }, []);

  React.useEffect(() => {
    if (!SUPABASE_ENABLED) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const list = await listCategories();
        if (!cancelled) setCategories(list);
      } catch (err) {
        if (cancelled) return;
        const msg =
          err instanceof Error
            ? err.message
            : "No pudimos cargar las categorías.";
        toast.error("Error al cargar categorías", { description: msg });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Split by ownership and filter by the currently active kind tab.
  const userCategories = React.useMemo(
    () =>
      categories.filter(
        (c) => c.user_id !== null && c.kind === activeKind,
      ),
    [categories, activeKind],
  );
  const systemCategories = React.useMemo(
    () =>
      categories.filter(
        (c) => c.user_id === null && c.kind === activeKind,
      ),
    [categories, activeKind],
  );

  function handleAdd() {
    if (!SUPABASE_ENABLED) {
      toast.info("Inicia sesión para guardar categorías.");
      return;
    }
    setCreateOpen(true);
  }

  function handleRowClick(cat: Category) {
    setEditing(cat);
  }

  async function handleCreateSubmit(draft: {
    name: string;
    kind: CategoryKind;
    icon: string;
  }) {
    if (!SUPABASE_ENABLED) {
      toast.info("Inicia sesión para guardar categorías.");
      setCreateOpen(false);
      return;
    }
    const payload: CategoryDraft = {
      name: draft.name,
      kind: draft.kind,
      icon: draft.icon,
    };
    setOverlayLabel("Creando categoría…");
    setSubmitting(true);
    setCreateOpen(false);
    try {
      await createCategory(payload);
      // Switch the tab to the kind we just created so the row is visible.
      setActiveKind(draft.kind);
      await reload();
      // Scroll back to the top so the freshly-created category is in view —
      // without this the page stays anchored at the bottom Add button and
      // the user has to scroll up to see what they just added.
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "No pudimos crear la categoría.";
      // UNIQUE_VIOLATION surfaces as this exact string from the data layer
      // (see categories.ts) — show the dup modal instead of the legacy
      // toast so the feedback matches Cuenta duplicada / Sin saldo.
      if (msg === "Ya tienes una categoría con ese nombre.") {
        setDupCategoryOpen(true);
      } else {
        toast.error("No se pudo crear", { description: msg });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEditSubmit(patch: { name: string; icon: string }) {
    if (!editing) return;
    if (!SUPABASE_ENABLED) {
      toast.info("Inicia sesión para guardar categorías.");
      setEditing(null);
      return;
    }
    const update: CategoryPatch = { name: patch.name, icon: patch.icon };
    const targetId = editing.id;
    setOverlayLabel("Actualizando…");
    setSubmitting(true);
    setEditing(null);
    try {
      await updateCategory(targetId, update);
      await reload();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "No pudimos actualizar la categoría.";
      if (msg === "Ya tienes una categoría con ese nombre.") {
        setDupCategoryOpen(true);
      } else {
        toast.error("No se pudo actualizar", { description: msg });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive() {
    if (!editing) return;
    if (!SUPABASE_ENABLED) {
      toast.info("Inicia sesión para guardar categorías.");
      setEditing(null);
      return;
    }
    const targetId = editing.id;
    setOverlayLabel("Archivando…");
    setSubmitting(true);
    setEditing(null);
    try {
      await archiveCategory(targetId);
      await reload();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "No pudimos archivar la categoría.";
      toast.error("No se pudo archivar", { description: msg });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-dvh bg-background pb-32 text-foreground">
      <SavingOverlay open={submitting} label={overlayLabel} />
      <div className="mx-auto w-full max-w-[720px] space-y-6 px-5 pt-6 md:max-w-6xl md:space-y-10 md:px-8 md:pt-10">
        {/* Page heading */}
        <div className="md:flex md:items-end md:justify-between">
          <AppHeader
            eyebrow="Tu dinero"
            title="Categorías"
            titleStyle="page"
            className="px-0 pt-0"
          />
          <div className="hidden md:block">
            <Button
              type="button"
              onClick={handleAdd}
              aria-label="Agregar categoría"
              className="h-10 rounded-xl text-[13px] font-semibold"
            >
              <Plus size={14} aria-hidden="true" />
              <span className="ml-1">Agregar categoría</span>
            </Button>
          </div>
        </div>

        {/* Kind toggle — pill segmented control. Filters the lists below. */}
        <section aria-label="Filtrar por tipo">
          <div
            role="tablist"
            aria-label="Tipo de categoría"
            className="flex w-full gap-2"
          >
            <KindPill
              label="Gastos"
              selected={activeKind === "expense"}
              onClick={() => setActiveKind("expense")}
            />
            <KindPill
              label="Ingresos"
              selected={activeKind === "income"}
              onClick={() => setActiveKind("income")}
            />
          </div>
        </section>

        {/* User + System categories — single column on mobile, two columns on desktop */}
        <div className="md:grid md:grid-cols-2 md:gap-6 lg:grid-cols-2">
          {/* User categories */}
          <section aria-labelledby="user-categories-heading">
            <h2
              id="user-categories-heading"
              className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
            >
              Tus categorías
            </h2>
            {loading ? (
              <Card className="overflow-hidden rounded-2xl border-border p-0">
                <CategoriesSkeleton />
              </Card>
            ) : userCategories.length === 0 ? (
              <Card className="rounded-2xl border-dashed border-border p-5 text-sm text-muted-foreground">
                <p className="mb-3 text-center">
                  Aún no tienes categorías propias.
                </p>
                <Button
                  type="button"
                  onClick={handleAdd}
                  aria-label="Agregar categoría"
                  className="h-10 w-full rounded-xl text-[13px] font-semibold"
                >
                  <Plus size={14} aria-hidden="true" />
                  <span className="ml-1">Agregar categoría</span>
                </Button>
              </Card>
            ) : (
              <Card className="overflow-hidden rounded-2xl border-border p-0">
                <ul className="divide-y divide-border" role="list">
                  {userCategories.map((cat) => (
                    <CategoryRow
                      key={cat.id}
                      category={cat}
                      onClick={() => handleRowClick(cat)}
                    />
                  ))}
                </ul>
              </Card>
            )}
          </section>

          {/* System categories */}
          <section aria-labelledby="system-categories-heading">
            <h2
              id="system-categories-heading"
              className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground md:mt-0 mt-6"
            >
              Predeterminadas
            </h2>
            {loading ? (
              <Card className="overflow-hidden rounded-2xl border-border p-0">
                <CategoriesSkeleton />
              </Card>
            ) : systemCategories.length === 0 ? (
              <Card className="rounded-2xl border-dashed border-border p-5 text-sm text-muted-foreground">
                No hay categorías predeterminadas para este tipo.
              </Card>
            ) : (
              <Card className="overflow-hidden rounded-2xl border-border p-0">
                <ul className="divide-y divide-border" role="list">
                  {systemCategories.map((cat) => (
                    <CategoryRow
                      key={cat.id}
                      category={cat}
                      onClick={() => handleRowClick(cat)}
                      locked
                    />
                  ))}
                </ul>
              </Card>
            )}
          </section>
        </div>

        {/* Add category — mobile only (desktop CTA is in the header row) */}
        <div className="mt-6 md:hidden">
          <Button
            type="button"
            onClick={handleAdd}
            aria-label="Agregar categoría"
            className="h-12 w-full rounded-xl text-[14px] font-semibold"
          >
            <Plus size={16} aria-hidden="true" />
            <span className="ml-1">Agregar categoría</span>
          </Button>
        </div>
      </div>

      {/* Create sheet — always mounted, controlled by createOpen. */}
      <CategoryFormSheet
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
        submitting={submitting}
        onSubmit={handleCreateSubmit}
      />

      {/* Edit sheet — only mounted when a row is selected so internal state
          resets cleanly between selections. */}
      {editing ? (
        <CategoryFormSheet
          mode="edit"
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          submitting={submitting}
          readOnly={editing.user_id === null}
          initial={{
            name: editing.name,
            icon: editing.icon ?? DEFAULT_CATEGORY_ICON,
            kind: editing.kind,
          }}
          onSubmit={handleEditSubmit}
          onArchive={handleArchive}
        />
      ) : null}

      {/* Duplicate-category modal — pops over the form sheet when the
          UNIQUE_VIOLATION error bubbles up from create/update. Replaces
          the legacy 'No se pudo crear · Ya tienes una categoría…' toast. */}
      <Drawer open={dupCategoryOpen} onOpenChange={setDupCategoryOpen}>
        <DrawerContent
          aria-describedby="category-dup-desc"
          className="bg-background"
        >
          <DrawerHeader>
            <DrawerTitle>Categoría duplicada</DrawerTitle>
            <DrawerDescription id="category-dup-desc">
              Ya tienes una categoría con ese nombre. Elige uno distinto
              para continuar.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6">
            <button
              type="button"
              onClick={() => setDupCategoryOpen(false)}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-foreground text-[14px] font-semibold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Entendido
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </main>
  );
}

// ─── Kind pill ────────────────────────────────────────────────────────────
function KindPill({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "h-10 flex-1 rounded-full px-4 text-[13px] font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/80",
      )}
    >
      {label}
    </button>
  );
}

// ─── Category row ────────────────────────────────────────────────────────
function CategoryRow({
  category,
  onClick,
  locked = false,
}: {
  category: Category;
  onClick: () => void;
  locked?: boolean;
}) {
  const Icon = getCategoryIcon(category.icon ?? DEFAULT_CATEGORY_ICON);
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-label={
          locked
            ? `Ver categoría del sistema ${category.name}`
            : `Editar ${category.name}`
        }
        className={cn(
          "flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left transition-colors",
          "hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
          locked && "cursor-default",
        )}
      >
        <span
          aria-hidden="true"
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
        >
          <Icon size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold">
              {category.name}
            </span>
            {locked ? (
              <Lock
                size={12}
                aria-hidden="true"
                className="flex-shrink-0 text-muted-foreground"
              />
            ) : null}
          </div>
        </div>
        {locked ? null : (
          <ChevronRight
            size={16}
            aria-hidden="true"
            className="ml-2 flex-shrink-0 text-muted-foreground"
          />
        )}
      </button>
    </li>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────
function CategoriesSkeleton() {
  // Three shimmer rows mirroring the real row layout (icon tile + 1-line
  // text + chevron placeholder).
  const widths = ["w-28", "w-36", "w-24"];
  return (
    <ul
      className="divide-y divide-border"
      role="list"
      aria-busy="true"
      aria-label="Cargando categorías"
    >
      {widths.map((w, i) => (
        <li key={i}>
          <div className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3">
            <Skeleton className="h-10 w-10 flex-shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
              <Skeleton className={cn("h-3.5 rounded", w)} />
            </div>
            <Skeleton className="h-3 w-3 rounded" />
          </div>
        </li>
      ))}
    </ul>
  );
}

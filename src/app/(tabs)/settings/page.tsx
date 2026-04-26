// TODO: wire categories to Supabase once Batch C lands.
/**
 * Settings route — Lumi
 *
 * Mobile-first settings screen. All persisted prefs live in localStorage under
 * the key `lumi-prefs`. Reading localStorage during render is unsafe under SSR
 * (Next.js renders this on the server before hydration), so the page mounts
 * with DEFAULT_PREFS and hydrates from storage in a post-mount effect.
 *
 * Reachable via the gear icon in the top-right of `/accounts`. The TabBar's
 * "Cuentas" entry still points to `/accounts` — Settings is intentionally
 * one tap away rather than competing for tab real estate.
 */

"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronRight,
  Tag,
  Plus,
  Utensils,
  Car,
  ShoppingCart,
  Heart,
  Film,
  Zap,
  GraduationCap,
  Briefcase,
  Circle,
  PiggyBank,
  LogOut,
  Info,
  Globe,
  Clock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CategoryFormSheet } from "@/components/lumi/CategoryFormSheet";
import {
  archiveCategory,
  createCategory,
  listCategories,
  type Category as DbCategory,
  updateCategory,
} from "@/lib/data/categories";
import { getCategoryIcon } from "@/lib/category-icons";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { useSession } from "@/lib/use-session";
import { useUserName } from "@/lib/use-user-name";
import { cn } from "@/lib/utils";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

// Same runtime feature flag as /login: do we have a real Supabase project
// configured? Next inlines NEXT_PUBLIC_* at build time, so this is a literal
// in the browser bundle.
const SUPABASE_ENABLED =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;

// ─── Types ────────────────────────────────────────────────────────────────
type Currency = "PEN" | "USD";
type ThemeChoice = "system" | "light" | "dark";

type Prefs = {
  currency: Currency;
  theme: ThemeChoice;
};

type CategoryId =
  | "food"
  | "transport"
  | "market"
  | "health"
  | "fun"
  | "utilities"
  | "education"
  | "savings"
  | "work"
  | "other";

type Category = {
  id: CategoryId;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
};

// ─── Constants ────────────────────────────────────────────────────────────
const PREFS_KEY = "lumi-prefs";
const DEFAULT_PREFS: Prefs = {
  currency: "PEN",
  theme: "system",
};

// Hardcoded for now; package.json import would couple build to a server module.
const APP_VERSION = "0.1.0";

const MOCK_CATEGORIES: Category[] = [
  { id: "food", label: "Comida", icon: Utensils },
  { id: "transport", label: "Transporte", icon: Car },
  { id: "market", label: "Mercado", icon: ShoppingCart },
  { id: "health", label: "Salud", icon: Heart },
  { id: "fun", label: "Entretenimiento", icon: Film },
  { id: "utilities", label: "Servicios", icon: Zap },
  { id: "education", label: "Educación", icon: GraduationCap },
  { id: "savings", label: "Ahorros", icon: PiggyBank },
  { id: "work", label: "Trabajo", icon: Briefcase },
  { id: "other", label: "Otros", icon: Circle },
];

/**
 * Mirror of the Dashboard `CATEGORY_TINT` palette so category chips/rows look
 * identical wherever they appear. If Dashboard's palette changes, update both.
 */
const CATEGORY_TINT: Record<CategoryId, string> = {
  food: "bg-[oklch(0.92_0.04_30)] text-[oklch(0.45_0.10_30)]",
  transport: "bg-[oklch(0.92_0.03_220)] text-[oklch(0.45_0.10_220)]",
  market: "bg-[oklch(0.92_0.04_280)] text-[oklch(0.45_0.10_280)]",
  health: "bg-[oklch(0.92_0.04_10)] text-[oklch(0.50_0.12_10)]",
  fun: "bg-[oklch(0.92_0.04_310)] text-[oklch(0.45_0.10_310)]",
  utilities: "bg-[oklch(0.92_0.04_70)] text-[oklch(0.45_0.10_70)]",
  education: "bg-[oklch(0.92_0.03_180)] text-[oklch(0.45_0.10_180)]",
  savings: "bg-[oklch(0.92_0.04_162)] text-[oklch(0.45_0.10_162)]",
  work: "bg-[oklch(0.92_0.03_140)] text-[oklch(0.45_0.10_140)]",
  other: "bg-[oklch(0.92_0_95)] text-[oklch(0.45_0_95)]",
};

// ─── Page ──────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const router = useRouter();
  const session = useSession();
  const { clearName } = useUserName();

  const [prefs, setPrefs] = React.useState<Prefs>(DEFAULT_PREFS);
  const [hydrated, setHydrated] = React.useState(false);

  // Sheet state
  const [signOutOpen, setSignOutOpen] = React.useState(false);

  // Refs for focus management on open
  const signOutConfirmRef = React.useRef<HTMLButtonElement | null>(null);

  // next-themes returns sane defaults outside a provider, so calling this at
  // the top level is safe even if RootLayout has not mounted ThemeProvider yet.
  // We also pull `resolvedTheme` so the "Sistema" microcopy can disclose what
  // the OS actually resolved to (avoids "I picked Sistema but it's still dark"
  // confusion when the user's OS is in dark mode).
  const { setTheme, resolvedTheme } = useTheme();
  const [themeMounted, setThemeMounted] = React.useState(false);
  React.useEffect(() => {
    setThemeMounted(true);
  }, []);

  // Hydrate prefs from localStorage AFTER mount — never during SSR.
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Prefs>;
        setPrefs((p) => ({ ...p, ...parsed }));
      }
    } catch {
      // Corrupted JSON or quota error — ignore and stay on defaults.
    }
    setHydrated(true);
  }, []);

  // Persist prefs whenever they change AFTER hydration. Skipping pre-hydration
  // writes prevents the default values from clobbering whatever was on disk.
  React.useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Quota exceeded or storage disabled — nothing actionable here.
    }
  }, [prefs, hydrated]);

  // When the profile row arrives from Supabase, prefer its currency over the
  // localStorage cache. localStorage is just a fast-paint hint; the DB is the
  // source of truth once we have a session. Theme stays device-local on
  // purpose — it is a per-device preference, not a per-user one.
  React.useEffect(() => {
    if (!hydrated) return;
    if (!SUPABASE_ENABLED) return;
    const dbCurrency = session.profile?.default_currency;
    if (dbCurrency && (dbCurrency === "PEN" || dbCurrency === "USD")) {
      setPrefs((p) => (p.currency === dbCurrency ? p : { ...p, currency: dbCurrency }));
    }
  }, [hydrated, session.profile?.default_currency]);

  // When sign-out sheet opens, focus the destructive button so keyboard users
  // land on the most prominent action. Base UI's Dialog manages the focus trap;
  // we just steer the initial focus target.
  React.useEffect(() => {
    if (!signOutOpen) return;
    const id = window.requestAnimationFrame(() => {
      signOutConfirmRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [signOutOpen]);

  function handleCurrencyChange(value: string) {
    if (value !== "PEN" && value !== "USD") return;
    // Optimistic local update — the currency enum is 1 byte, so we flip the
    // UI immediately and only roll back if the round-trip actually fails.
    // Capture the prior value BEFORE mutating so the rollback path has it.
    const prev = prefs.currency;
    if (prev === value) return;
    setPrefs((p) => ({ ...p, currency: value }));
    if (SUPABASE_ENABLED && session.user) {
      const userId = session.user.id;
      void (async () => {
        try {
          const supabase = createSupabaseClient();
          const patch: ProfileUpdate = { default_currency: value };
          const { error } = await supabase
            .from("profiles")
            .update(patch)
            .eq("id", userId);
          if (error) {
            // Roll back so the radio reflects what's actually in the DB.
            setPrefs((p) => ({ ...p, currency: prev }));
            toast.error("No se pudo guardar la moneda", {
              description: "Reintentá en un momento.",
            });
            return;
          }
          toast.success("Moneda actualizada");
        } catch {
          setPrefs((p) => ({ ...p, currency: prev }));
          toast.error("No se pudo guardar la moneda", {
            description: "Reintentá en un momento.",
          });
        }
      })();
    } else {
      // Demo mode: still confirm so the radio change feels acknowledged.
      toast.success("Moneda actualizada");
    }
  }

  function handleThemeChange(value: string) {
    if (value === "system" || value === "light" || value === "dark") {
      setPrefs((p) => ({ ...p, theme: value }));
      // No-op outside a ThemeProvider; harmless.
      setTheme(value);
    }
  }

  async function handleConfirmSignOut() {
    // Best-effort: tear down the Supabase session if envs are wired. If the
    // call fails (network, expired token) we still want the local sign-out to
    // proceed so the user is not stranded on Settings.
    if (SUPABASE_ENABLED) {
      try {
        const supabase = createSupabaseClient();
        await supabase.auth.signOut();
      } catch {
        /* ignore — local sign-out still proceeds */
      }
    }
    clearName();
    setSignOutOpen(false);
    router.push("/login");
  }

  return (
    <main className="relative min-h-dvh bg-background pb-32 text-foreground">
      <div className="mx-auto w-full max-w-[720px] space-y-6 px-5 pt-6 md:max-w-3xl md:space-y-10 md:px-8 md:pt-10">
        {/* Page heading */}
        <header className="flex items-start gap-3">
          <Link
            href="/accounts"
            aria-label="Volver a Cuentas"
            className={cn(
              "mt-1 inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground",
              "transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
            )}
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </Link>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Tu app
            </p>
            <h1 className="mt-1 text-2xl font-bold md:text-3xl">Ajustes</h1>
          </div>
        </header>

        {/* Categorías */}
        <SettingsSection title="Categorías" headingId="settings-categories">
          <CategoriesCard />
        </SettingsSection>

        {/* Preferencias */}
        <SettingsSection title="Preferencias" headingId="settings-preferences">
          <Card className="rounded-2xl border-border p-5">
            {/* Currency */}
            <fieldset>
              <legend className="text-[13px] font-semibold">
                Moneda principal
              </legend>
              <p className="mt-0.5 text-xs text-muted-foreground">
                La moneda default para mostrar y registrar.
              </p>
              <RadioGroup
                value={prefs.currency}
                onValueChange={handleCurrencyChange}
                aria-label="Moneda principal"
                className="mt-3 grid gap-2 md:flex md:flex-wrap md:gap-3"
              >
                <PrefRadio value="PEN" label="PEN · Sol peruano" hint="S/" />
                <PrefRadio value="USD" label="USD · Dólar" hint="$" />
              </RadioGroup>
            </fieldset>

            <Separator className="my-5" />

            {/* Theme */}
            <fieldset>
              <legend className="text-[13px] font-semibold">Tema</legend>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Sistema sigue lo que tienes configurado en tu dispositivo
                {themeMounted && prefs.theme === "system" && resolvedTheme
                  ? ` (ahora: ${resolvedTheme === "dark" ? "oscuro" : "claro"})`
                  : ""}
                .
              </p>
              <RadioGroup
                value={prefs.theme}
                onValueChange={handleThemeChange}
                aria-label="Tema de la aplicación"
                className="mt-3 grid gap-2 md:flex md:flex-wrap md:gap-3"
              >
                <PrefRadio value="system" label="Sistema" />
                <PrefRadio value="light" label="Claro" />
                <PrefRadio value="dark" label="Oscuro" />
              </RadioGroup>
            </fieldset>

            <Separator className="my-5" />

            {/* Locale + Timezone (read-only) */}
            <dl className="grid gap-3">
              <div className="flex items-center gap-3 md:grid md:grid-cols-[180px_1fr] md:gap-x-6">
                <div className="flex items-center gap-3">
                  <Globe
                    size={16}
                    className="text-muted-foreground"
                    aria-hidden="true"
                  />
                  <dt className="text-[13px] font-semibold">Idioma</dt>
                </div>
                <dd className="ml-auto text-[13px] text-muted-foreground tabular-nums md:ml-0">
                  es-PE
                </dd>
              </div>
              <div className="flex items-center gap-3 md:grid md:grid-cols-[180px_1fr] md:gap-x-6">
                <div className="flex items-center gap-3">
                  <Clock
                    size={16}
                    className="text-muted-foreground"
                    aria-hidden="true"
                  />
                  <dt className="text-[13px] font-semibold">Zona horaria</dt>
                </div>
                <dd className="ml-auto text-[13px] text-muted-foreground tabular-nums md:ml-0">
                  America/Lima
                </dd>
              </div>
            </dl>
          </Card>
        </SettingsSection>

        {/* Sobre la app */}
        <SettingsSection title="Sobre la app" headingId="settings-about">
          <Card className="overflow-hidden rounded-2xl border-border p-0">
            <div className="flex items-center gap-3 px-4 py-4">
              <Info
                size={16}
                className="text-muted-foreground"
                aria-hidden="true"
              />
              <span className="text-[13px] font-semibold">Versión</span>
              <span className="ml-auto text-[13px] tabular-nums text-muted-foreground">
                {APP_VERSION}
              </span>
            </div>
            <Separator />
            <ul className="divide-y divide-border" role="list">
              <li>
                <Link
                  href="/legal/terms"
                  onClick={(e) => {
                    e.preventDefault();
                    toast("Próximamente", {
                      description: "Los términos llegan en la próxima fase.",
                    });
                  }}
                  className="flex min-h-[48px] w-full items-center gap-3 px-4 py-3 text-[13px] font-semibold transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                  Términos y condiciones
                  <ChevronRight
                    size={16}
                    className="ml-auto text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              </li>
              <li>
                <Link
                  href="/legal/privacy"
                  onClick={(e) => {
                    e.preventDefault();
                    toast("Próximamente", {
                      description: "La política llega en la próxima fase.",
                    });
                  }}
                  className="flex min-h-[48px] w-full items-center gap-3 px-4 py-3 text-[13px] font-semibold transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                  Política de privacidad
                  <ChevronRight
                    size={16}
                    className="ml-auto text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            </ul>
          </Card>
        </SettingsSection>

        {/* Sign out */}
        <div className="mt-8">
          <Button
            type="button"
            variant="destructive"
            onClick={() => setSignOutOpen(true)}
            aria-label="Cerrar sesión"
            className="h-12 w-full rounded-xl text-[14px] font-semibold md:max-w-xs"
          >
            <LogOut size={16} aria-hidden="true" />
            <span className="ml-1">Cerrar sesión</span>
          </Button>
        </div>
      </div>

      {/* Sign-out confirmation Sheet (bottom sheet on mobile, side panel on desktop) */}
      <Sheet open={signOutOpen} onOpenChange={setSignOutOpen}>
        <SheetContent
          side="bottom"
          role="alertdialog"
          aria-labelledby="signout-title"
          aria-describedby="signout-desc"
          className="rounded-t-2xl md:max-w-md"
        >
          <SheetHeader>
            <SheetTitle id="signout-title">¿Cerrar sesión?</SheetTitle>
            <SheetDescription id="signout-desc">
              Vamos a borrar tu nombre y volverás al inicio. Tus preferencias quedan
              guardadas.
            </SheetDescription>
          </SheetHeader>
          <SheetFooter className="flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSignOutOpen(false)}
              className="min-h-11"
            >
              Cancelar
            </Button>
            <Button
              ref={signOutConfirmRef}
              type="button"
              variant="destructive"
              onClick={handleConfirmSignOut}
              className="min-h-11"
            >
              Cerrar sesión
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

    </main>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────
function SettingsSection({
  title,
  headingId,
  children,
}: {
  title: string;
  headingId: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={headingId} className="mt-8">
      <h2
        id={headingId}
        className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function PrefRadio({
  value,
  label,
  hint,
}: {
  value: string;
  label: string;
  hint?: string;
}) {
  const id = `pref-${value}`;
  return (
    <Label
      htmlFor={id}
      className={cn(
        "flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-[14px] font-medium transition-colors",
        "hover:bg-muted has-[[data-checked]]:border-primary has-[[data-checked]]:bg-[var(--color-primary-soft)]",
      )}
    >
      <RadioGroupItem id={id} value={value} />
      <span className="flex-1">{label}</span>
      {hint ? (
        <span
          aria-hidden="true"
          className="text-[13px] tabular-nums text-muted-foreground"
        >
          {hint}
        </span>
      ) : null}
    </Label>
  );
}

// ─── Categories card ───────────────────────────────────────────────────────
/**
 * CategoriesCard
 *
 * Owns the data fetch + create/edit/archive flows for the Categorías section.
 * Lives inside the same file (rather than a separate component module) so the
 * SUPABASE_ENABLED demo branch can keep the original mock styling without
 * dragging the palette/icon mapping into the data layer.
 *
 * Demo mode (no envs): renders the legacy MOCK_CATEGORIES list with
 * "Próximamente" toasts on tap — same UX the page shipped with originally.
 *
 * Live mode: fetches from Supabase via `listCategories()`, shows a small
 * skeleton on first load, and opens a sheet to create or edit rows. System
 * categories (user_id NULL) get a "Sistema" badge and open the sheet in
 * read-only mode.
 */
function CategoriesCard() {
  if (!SUPABASE_ENABLED) {
    return <CategoriesCardMock />;
  }
  return <CategoriesCardLive />;
}

function CategoriesCardMock() {
  return (
    <Card className="overflow-hidden rounded-2xl border-border p-0">
      <ul className="divide-y divide-border" role="list">
        {MOCK_CATEGORIES.map((category) => {
          const CategoryIcon = category.icon;
          return (
            <li key={category.id}>
              <Link
                href={`/settings/categories/${category.id}`}
                aria-disabled
                onClick={(e) => {
                  e.preventDefault();
                  toast("Próximamente", {
                    description: "El detalle de categoría llega pronto.",
                  });
                }}
                className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <div
                  aria-hidden="true"
                  className={cn(
                    "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full",
                    CATEGORY_TINT[category.id],
                  )}
                >
                  <CategoryIcon size={16} aria-hidden />
                </div>
                <div className="min-w-0 flex-1 text-[14px] font-semibold">
                  {category.label}
                </div>
                <Tag
                  size={14}
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
                <ChevronRight
                  size={16}
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function CategoriesCardLive() {
  const [items, setItems] = React.useState<DbCategory[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);

  // Sheet state — only one sheet open at a time. `editing` is the row being
  // edited; null means the create sheet (or no sheet) is the active one.
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DbCategory | null>(null);

  const reload = React.useCallback(async () => {
    try {
      const rows = await listCategories();
      setItems(rows);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "No pudimos cargar las categorías.";
      toast.error(message);
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listCategories();
        if (!cancelled) setItems(rows);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : "No pudimos cargar las categorías.";
        toast.error(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Optimistic close for create/edit: dismiss the sheet BEFORE the round-trip
  // so the UX feels instant. The list reloads on success; on failure we surface
  // a toast and reload to discard any optimistic UI drift. We don't try to
  // re-open the sheet on failure — the user keeps their work in toast context
  // and can re-open without losing data (the form draft is already gone).
  // Archive intentionally does NOT short-circuit close — it's destructive, so
  // closing prematurely would make rollback confusing.
  async function handleCreate(draft: {
    name: string;
    kind: "expense" | "income";
    icon: string;
  }) {
    setCreateOpen(false);
    setSubmitting(true);
    try {
      await createCategory({
        name: draft.name,
        kind: draft.kind,
        icon: draft.icon,
      });
      toast.success("Categoría creada");
      await reload();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No pudimos crear la categoría.";
      toast.error(message);
      await reload();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEdit(patch: { name: string; icon: string }) {
    if (!editing) return;
    const target = editing;
    setEditing(null);
    setSubmitting(true);
    try {
      await updateCategory(target.id, patch);
      toast.success("Categoría actualizada");
      await reload();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "No pudimos actualizar la categoría.";
      toast.error(message);
      await reload();
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive() {
    if (!editing) return;
    setSubmitting(true);
    try {
      await archiveCategory(editing.id);
      setEditing(null);
      toast.success("Categoría archivada");
      await reload();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "No pudimos archivar la categoría.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  // Hint card sits ABOVE the list when the user has only system rows. Once
  // they create their first custom category we drop it. Subtle & calm — no
  // empty-screen drama since the system rows already render below.
  const hasUserCategories = items.some((row) => row.user_id !== null);
  const showFirstCustomHint = !loading && items.length > 0 && !hasUserCategories;

  return (
    <>
      {showFirstCustomHint ? (
        <Card className="mb-3 rounded-2xl border-dashed border-border bg-[var(--color-primary-soft)]/30 p-4">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-card text-[var(--color-primary-soft-foreground)] shadow-[var(--shadow-xs)]"
            >
              <Plus size={14} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold leading-snug">
                Tus categorías personalizadas aparecen acá.
              </p>
              <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                Agrega las que uses seguido para capturar más rápido.
              </p>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="mt-2 inline-flex min-h-9 items-center text-[12px] font-semibold text-foreground underline decoration-foreground/40 underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                Crear la primera
              </button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="overflow-hidden rounded-2xl border-border p-0">
        {/* Add button — full-width header row above the list */}
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          aria-label="Agregar categoría"
          className="flex min-h-[52px] w-full items-center gap-2 border-b border-border px-4 py-3 text-left text-[13px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
        >
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)]"
          >
            <Plus size={14} aria-hidden="true" />
          </span>
          Agregar categoría
        </button>

        {loading ? (
          <CategoriesSkeleton />
        ) : items.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
            No tienes categorías todavía.
          </p>
        ) : (
          <ul className="divide-y divide-border" role="list">
            {items.map((row) => {
              const Icon = getCategoryIcon(row.icon);
              const isSystem = row.user_id === null;
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setEditing(row)}
                    aria-label={`Editar categoría ${row.name}`}
                    className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <div
                      aria-hidden="true"
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
                      style={
                        row.color
                          ? {
                              backgroundColor: `${row.color}1f`,
                              color: row.color,
                            }
                          : undefined
                      }
                    >
                      <Icon size={16} aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold">
                        {row.name}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {row.kind === "income" ? "Ingreso" : "Gasto"}
                      </div>
                    </div>
                    {isSystem ? (
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                        Sistema
                      </span>
                    ) : null}
                    <ChevronRight
                      size={16}
                      className="text-muted-foreground"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Create sheet */}
      <CategoryFormSheet
        mode="create"
        open={createOpen}
        onOpenChange={(open) => {
          if (submitting && !open) return;
          setCreateOpen(open);
        }}
        submitting={submitting}
        onSubmit={handleCreate}
      />

      {/* Edit sheet — only mounted when a row is selected so the sheet's
          internal form state resets cleanly between rows. */}
      {editing ? (
        <CategoryFormSheet
          mode="edit"
          open={true}
          onOpenChange={(open) => {
            if (submitting && !open) return;
            if (!open) setEditing(null);
          }}
          submitting={submitting}
          readOnly={editing.user_id === null}
          initial={{
            name: editing.name,
            icon: editing.icon,
            kind: editing.kind,
          }}
          onSubmit={handleEdit}
          onArchive={handleArchive}
        />
      ) : null}
    </>
  );
}

function CategoriesSkeleton() {
  // Four shimmer rows mirroring the real row layout (icon + 2-line text +
  // chevron placeholder). Widths vary per row so it reads as data, not a bar
  // chart. The shimmer keyframe lives in globals.css.
  const widths = ["w-32", "w-24", "w-40", "w-28"];
  return (
    <ul
      className="divide-y divide-border"
      role="list"
      aria-busy="true"
      aria-label="Cargando categorías"
    >
      {widths.map((w, i) => (
        <li key={i} className="flex min-h-[56px] items-center gap-3 px-4 py-3">
          <Skeleton className="h-9 w-9 flex-shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className={cn("h-3 rounded", w)} />
            <Skeleton className="h-2 w-12 rounded" />
          </div>
          <Skeleton className="h-3 w-3 rounded" />
        </li>
      ))}
    </ul>
  );
}

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
  Download,
  AlertTriangle,
  Trash2,
  RotateCcw,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { SavingOverlay } from "@/components/lumi/SavingOverlay";
import {
  archiveAllUserCategories,
  archiveCategory,
  createCategory,
  listCategories,
  type Category as DbCategory,
  updateCategory,
} from "@/lib/data/categories";
import {
  archiveUserAccountsByKind,
  archiveAllUserAccounts,
  type AccountKind,
} from "@/lib/data/accounts";
import { factoryReset } from "@/lib/data/factory-reset";
import { exportLocalOnly, exportUserData } from "@/lib/data/export-data";
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
                <PrefRadio value="PEN" label="Sol peruano" hint="S/" />
                <PrefRadio value="USD" label="Dólar" hint="$" />
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

        {/* Tus datos — export safety net */}
        <SettingsSection title="Tus datos" headingId="settings-data">
          <DataExportCard />
        </SettingsSection>

        {/* Zona de peligro — destructive resets */}
        <SettingsSection title="Zona de peligro" headingId="settings-danger">
          <DangerZoneCard />
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
  const [overlayLabel, setOverlayLabel] = React.useState<string>("Guardando…");

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
    setOverlayLabel("Creando categoría…");
    setCreateOpen(false);
    setSubmitting(true);
    try {
      await createCategory({
        name: draft.name,
        kind: draft.kind,
        icon: draft.icon,
      });
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
    setOverlayLabel("Actualizando categoría…");
    setEditing(null);
    setSubmitting(true);
    try {
      await updateCategory(target.id, patch);
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
    setOverlayLabel("Archivando categoría…");
    setSubmitting(true);
    try {
      await archiveCategory(editing.id);
      setEditing(null);
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
      <SavingOverlay open={submitting} label={overlayLabel} />
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

// ─── Data export ──────────────────────────────────────────────────────────
/**
 * "Descargar mis datos" — exports a JSON snapshot of the user's data.
 * In demo mode (SUPABASE_ENABLED=false) we fall back to a local-only
 * export (just the localStorage keys) so the affordance still does
 * something useful when no Supabase env is wired.
 */
function DataExportCard() {
  const [busy, setBusy] = React.useState(false);

  async function handleDownload() {
    setBusy(true);
    try {
      const blob = SUPABASE_ENABLED ? await exportUserData() : exportLocalOnly();
      const today = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lumi-export-${today}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke after a tick so the browser has time to start the download.
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
      toast.success("Descarga iniciada", {
        description: "Guarda este archivo en un lugar seguro.",
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No pudimos exportar tus datos.";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden rounded-2xl border-border p-0">
      <button
        type="button"
        onClick={handleDownload}
        disabled={busy}
        aria-label="Descargar mis datos"
        className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-60"
      >
        <span
          aria-hidden="true"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-muted text-foreground"
        >
          <Download size={16} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold">Descargar mis datos</div>
          <div className="text-[12px] text-muted-foreground">
            Exporta tu información en un archivo JSON.
          </div>
        </div>
        <ChevronRight
          size={16}
          className="text-muted-foreground"
          aria-hidden="true"
        />
      </button>
    </Card>
  );
}

// ─── Danger zone ──────────────────────────────────────────────────────────
const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  bank: "Banco",
  yape: "Yape",
  plin: "Plin",
};

const ACCOUNT_KIND_OPTIONS: AccountKind[] = [
  "cash",
  "card",
  "bank",
  "yape",
  "plin",
];

/**
 * Three destructive resets with explicit confirmation. Each row opens a
 * Sheet with a clear "Esta acción no se puede deshacer" warning and a
 * single confirm button. Factory reset additionally requires the user to
 * type "BORRAR" exactly to enable the destructive action.
 *
 * In demo mode (no Supabase env) the rows are disabled with a hint, since
 * there's nothing to reset on the server.
 */
function DangerZoneCard() {
  const router = useRouter();

  const [resetCatsOpen, setResetCatsOpen] = React.useState(false);
  const [resetAccountsOpen, setResetAccountsOpen] = React.useState(false);
  const [factoryOpen, setFactoryOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // For the accounts sub-flow we use an "armed" pattern: tapping a button
  // once moves it into a confirm state showing "¿Confirmar?"; a second tap
  // executes. The armed kind ("all" or one of AccountKind) tracks which
  // button is currently primed.
  const [armedKind, setArmedKind] = React.useState<"all" | AccountKind | null>(
    null,
  );

  // Factory reset confirm — user must type BORRAR exactly.
  const [factoryConfirmText, setFactoryConfirmText] = React.useState("");

  // Reset transient state whenever a sheet closes so the next open starts
  // fresh (no stale "armed" button or pre-filled confirmation text).
  React.useEffect(() => {
    if (!resetAccountsOpen) setArmedKind(null);
  }, [resetAccountsOpen]);
  React.useEffect(() => {
    if (!factoryOpen) setFactoryConfirmText("");
  }, [factoryOpen]);

  async function handleResetCategories() {
    setSubmitting(true);
    try {
      const count = await archiveAllUserCategories();
      setResetCatsOpen(false);
      toast.success(
        count === 0
          ? "No tenías categorías propias."
          : `Borramos ${count} ${count === 1 ? "categoría" : "categorías"}.`,
      );
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "No pudimos restablecer las categorías.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetAccounts(kind: "all" | AccountKind) {
    setSubmitting(true);
    try {
      const count =
        kind === "all"
          ? await archiveAllUserAccounts()
          : await archiveUserAccountsByKind(kind);
      setResetAccountsOpen(false);
      setArmedKind(null);
      toast.success(
        count === 0
          ? "No había cuentas para borrar."
          : `Borramos ${count} ${count === 1 ? "cuenta" : "cuentas"}.`,
      );
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "No pudimos restablecer las cuentas.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleFactoryReset() {
    if (factoryConfirmText !== "BORRAR") return;
    setSubmitting(true);
    try {
      const counts = await factoryReset();
      setFactoryOpen(false);
      setFactoryConfirmText("");
      toast.success("Listo, comenzamos de nuevo.", {
        description: `Borramos ${counts.transactions} movimientos, ${counts.accounts} cuentas, ${counts.categories} categorías y ${counts.merchants} comercios.`,
      });
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "No pudimos restablecer la cuenta.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  const disabledHint = SUPABASE_ENABLED
    ? undefined
    : "Inicia sesión para continuar.";

  return (
    <>
      <Card className="overflow-hidden rounded-2xl border border-destructive/30 bg-destructive/5 p-0">
        <ul className="divide-y divide-destructive/20" role="list">
          <li>
            <button
              type="button"
              onClick={() => setResetCatsOpen(true)}
              disabled={!SUPABASE_ENABLED || submitting}
              aria-label="Restablecer categorías"
              className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:outline-none disabled:opacity-60"
            >
              <span
                aria-hidden="true"
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
              >
                <Tag size={16} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">
                  Restablecer categorías
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {disabledHint ??
                    "Borra solo las categorías que creaste tú."}
                </div>
              </div>
              <ChevronRight
                size={16}
                className="text-muted-foreground"
                aria-hidden="true"
              />
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setResetAccountsOpen(true)}
              disabled={!SUPABASE_ENABLED || submitting}
              aria-label="Restablecer cuentas"
              className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:outline-none disabled:opacity-60"
            >
              <span
                aria-hidden="true"
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
              >
                <Wallet size={16} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold">
                  Restablecer cuentas
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {disabledHint ??
                    "Borra todas tus cuentas o solo las de un tipo."}
                </div>
              </div>
              <ChevronRight
                size={16}
                className="text-muted-foreground"
                aria-hidden="true"
              />
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => setFactoryOpen(true)}
              disabled={!SUPABASE_ENABLED || submitting}
              aria-label="Restablecer todo de fábrica"
              className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:outline-none disabled:opacity-60"
            >
              <span
                aria-hidden="true"
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-destructive/15 text-destructive"
              >
                <RotateCcw size={16} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-destructive">
                  Restablecer todo de fábrica
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {disabledHint ??
                    "Borra movimientos, cuentas, categorías y comercios."}
                </div>
              </div>
              <ChevronRight
                size={16}
                className="text-muted-foreground"
                aria-hidden="true"
              />
            </button>
          </li>
        </ul>
      </Card>

      {/* Reset categorías — single confirm */}
      <Sheet open={resetCatsOpen} onOpenChange={setResetCatsOpen}>
        <SheetContent
          side="bottom"
          role="alertdialog"
          aria-labelledby="reset-cats-title"
          aria-describedby="reset-cats-desc"
          className="rounded-t-2xl md:max-w-md"
        >
          <SheetHeader>
            <SheetTitle
              id="reset-cats-title"
              className="flex items-center gap-2"
            >
              <AlertTriangle
                size={18}
                className="text-destructive"
                aria-hidden="true"
              />
              ¿Borrar tus categorías?
            </SheetTitle>
            <SheetDescription id="reset-cats-desc">
              Las categorías predeterminadas se mantienen. Las que creaste
              se eliminarán. Esta acción no se puede deshacer.
            </SheetDescription>
          </SheetHeader>
          <SheetFooter className="flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setResetCatsOpen(false)}
              disabled={submitting}
              className="min-h-11"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleResetCategories}
              disabled={submitting}
              className="min-h-11"
            >
              Sí, borrar categorías
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Reset cuentas — armed inline confirm */}
      <Sheet open={resetAccountsOpen} onOpenChange={setResetAccountsOpen}>
        <SheetContent
          side="bottom"
          role="alertdialog"
          aria-labelledby="reset-accounts-title"
          aria-describedby="reset-accounts-desc"
          className="rounded-t-2xl md:max-w-md"
        >
          <SheetHeader>
            <SheetTitle
              id="reset-accounts-title"
              className="flex items-center gap-2"
            >
              <AlertTriangle
                size={18}
                className="text-destructive"
                aria-hidden="true"
              />
              ¿Borrar tus cuentas?
            </SheetTitle>
            <SheetDescription id="reset-accounts-desc">
              Toca una opción para prepararla, vuelve a tocarla para
              confirmar. Esta acción no se puede deshacer.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-1 pb-1">
            <ArmedDestructiveButton
              label="Borrar todas las cuentas"
              armed={armedKind === "all"}
              disabled={submitting}
              onArm={() => setArmedKind("all")}
              onConfirm={() => handleResetAccounts("all")}
            />
            <div>
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                Borrar solo de tipo
              </p>
              <div className="flex flex-wrap gap-2">
                {ACCOUNT_KIND_OPTIONS.map((kind) => (
                  <ArmedKindPill
                    key={kind}
                    label={ACCOUNT_KIND_LABELS[kind]}
                    armed={armedKind === kind}
                    disabled={submitting}
                    onArm={() => setArmedKind(kind)}
                    onConfirm={() => handleResetAccounts(kind)}
                  />
                ))}
              </div>
            </div>
          </div>
          <SheetFooter className="flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setResetAccountsOpen(false)}
              disabled={submitting}
              className="min-h-11"
            >
              Cancelar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Factory reset — type BORRAR to confirm */}
      <Sheet open={factoryOpen} onOpenChange={setFactoryOpen}>
        <SheetContent
          side="bottom"
          role="alertdialog"
          aria-labelledby="factory-title"
          aria-describedby="factory-desc"
          className="rounded-t-2xl md:max-w-md"
        >
          <SheetHeader>
            <SheetTitle
              id="factory-title"
              className="flex items-center gap-2"
            >
              <AlertTriangle
                size={18}
                className="text-destructive"
                aria-hidden="true"
              />
              ¿Restablecer todo?
            </SheetTitle>
            <SheetDescription id="factory-desc">
              Vamos a borrar tus movimientos, cuentas, categorías propias,
              comercios y presupuestos. Tu perfil y tu sesión se mantienen.
              Esta acción no se puede deshacer.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-1 pb-1">
            <Label
              htmlFor="factory-confirm"
              className="text-[13px] font-semibold"
            >
              Escribe{" "}
              <span className="font-mono text-destructive">BORRAR</span> para
              confirmar
            </Label>
            <Input
              id="factory-confirm"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              value={factoryConfirmText}
              onChange={(e) => setFactoryConfirmText(e.target.value)}
              placeholder="BORRAR"
              disabled={submitting}
              className="h-11 font-mono"
            />
          </div>
          <SheetFooter className="flex-col-reverse gap-2 md:flex-row md:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setFactoryOpen(false)}
              disabled={submitting}
              className="min-h-11"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleFactoryReset}
              disabled={submitting || factoryConfirmText !== "BORRAR"}
              className="min-h-11"
            >
              <Trash2 size={16} aria-hidden="true" />
              <span className="ml-1">Restablecer todo</span>
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * Two-tap "armed" destructive button: first tap shows "¿Confirmar?",
 * second tap fires `onConfirm`. Mirrors the archive pattern from the
 * AccountFormSheet / CategoryFormSheet.
 */
function ArmedDestructiveButton({
  label,
  armed,
  disabled,
  onArm,
  onConfirm,
}: {
  label: string;
  armed: boolean;
  disabled: boolean;
  onArm: () => void;
  onConfirm: () => void;
}) {
  return (
    <Button
      type="button"
      variant={armed ? "destructive" : "outline"}
      onClick={armed ? onConfirm : onArm}
      disabled={disabled}
      className="h-11 w-full justify-center rounded-xl text-[14px] font-semibold"
    >
      {armed ? `¿Confirmar? ${label}` : label}
    </Button>
  );
}

/**
 * Pill variant of the armed-confirm pattern, for the kind-specific row.
 */
function ArmedKindPill({
  label,
  armed,
  disabled,
  onArm,
  onConfirm,
}: {
  label: string;
  armed: boolean;
  disabled: boolean;
  onArm: () => void;
  onConfirm: () => void;
}) {
  return (
    <button
      type="button"
      onClick={armed ? onConfirm : onArm}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-9 items-center rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        armed
          ? "border-destructive bg-destructive text-destructive-foreground"
          : "border-border bg-background text-foreground hover:bg-muted",
        "disabled:opacity-60",
      )}
    >
      {armed ? `¿Confirmar ${label}?` : label}
    </button>
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

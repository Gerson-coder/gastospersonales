// TODO: wire profile/categories/prefs to Supabase once Batch C lands.
// TODO: replace USER_EMAIL placeholder with the email from the Supabase session
// once we have a `useSession` hook.
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
  Pencil,
  Tag,
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
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { useUserName } from "@/lib/use-user-name";
import { cn } from "@/lib/utils";

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

const NAME_MAX_LENGTH = 40;

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

// User identity placeholders — email replaced by Supabase session data in Batch C.
const USER_EMAIL = "gerson@lumi.app";
const FALLBACK_USER_NAME = "Sin nombre";

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const router = useRouter();
  const { name, setName, clearName, hydrated: nameHydrated } = useUserName();

  const [prefs, setPrefs] = React.useState<Prefs>(DEFAULT_PREFS);
  const [hydrated, setHydrated] = React.useState(false);

  // Sheet state
  const [signOutOpen, setSignOutOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [draftName, setDraftName] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  // Refs for focus management on open
  const signOutConfirmRef = React.useRef<HTMLButtonElement | null>(null);
  const nameInputRef = React.useRef<HTMLInputElement | null>(null);

  // next-themes returns sane defaults outside a provider, so calling this at
  // the top level is safe even if RootLayout has not mounted ThemeProvider yet.
  const { setTheme } = useTheme();

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

  // When edit sheet opens, focus the input. autoFocus on the element itself is
  // unreliable inside portaled Dialogs, so we drive it imperatively.
  React.useEffect(() => {
    if (!editOpen) return;
    const id = window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [editOpen]);

  function handleCurrencyChange(value: string) {
    if (value === "PEN" || value === "USD") {
      setPrefs((p) => ({ ...p, currency: value }));
    }
  }

  function handleThemeChange(value: string) {
    if (value === "system" || value === "light" || value === "dark") {
      setPrefs((p) => ({ ...p, theme: value }));
      // No-op outside a ThemeProvider; harmless.
      setTheme(value);
    }
  }

  function openEditProfile() {
    setDraftName(name ?? "");
    setEditOpen(true);
  }

  function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = draftName.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      setName(trimmed);
      setEditOpen(false);
      toast.success("Nombre actualizado");
    } finally {
      setSubmitting(false);
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

  const displayName = nameHydrated ? (name ?? FALLBACK_USER_NAME) : " ";
  const displayInitials = nameHydrated && name ? deriveInitials(name) : "?";
  const trimmedDraft = draftName.trim();
  const canSubmitName = trimmedDraft.length > 0 && !submitting;

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
              Tu cuenta
            </p>
            <h1 className="mt-1 text-2xl font-bold md:text-3xl">Ajustes</h1>
          </div>
        </header>

        {/* Profile */}
        <SettingsSection title="Perfil" headingId="settings-profile">
          <Card className="rounded-2xl border-border p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
              <div
                aria-hidden="true"
                className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)] text-lg font-bold"
              >
                {displayInitials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold">{displayName}</div>
                <div className="truncate text-xs text-muted-foreground">{USER_EMAIL}</div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openEditProfile}
                aria-label="Editar perfil"
                className="min-h-11 rounded-full px-4"
              >
                <Pencil size={14} aria-hidden="true" />
                <span className="ml-1">Editar</span>
              </Button>
            </div>
          </Card>
        </SettingsSection>

        {/* Categorías */}
        <SettingsSection title="Categorías" headingId="settings-categories">
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
                Sistema sigue lo que tienes configurado en tu dispositivo.
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

      {/* Edit name Sheet */}
      <Sheet open={editOpen} onOpenChange={setEditOpen}>
        <SheetContent
          side="bottom"
          aria-labelledby="editname-title"
          className="rounded-t-2xl md:max-w-md"
        >
          <form onSubmit={handleEditSubmit} aria-busy={submitting}>
            <SheetHeader>
              <SheetTitle id="editname-title">Editar nombre</SheetTitle>
              <SheetDescription>
                Así te llamamos en Lumi. Podés cambiarlo cuando quieras.
              </SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-2">
              <Label
                htmlFor="edit-name-input"
                className="mb-1.5 block text-[13px] font-semibold"
              >
                Nombre
              </Label>
              <Input
                id="edit-name-input"
                ref={nameInputRef}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                maxLength={NAME_MAX_LENGTH}
                autoComplete="off"
                autoFocus
                placeholder="Tu nombre"
                disabled={submitting}
                className="h-11 text-[15px]"
              />
            </div>
            <SheetFooter className="flex-col-reverse gap-2 md:flex-row md:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setEditOpen(false)}
                disabled={submitting}
                className="min-h-11"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={!canSubmitName}
                className="min-h-11"
              >
                Guardar
              </Button>
            </SheetFooter>
          </form>
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

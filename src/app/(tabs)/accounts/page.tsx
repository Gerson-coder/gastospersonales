// TODO: wire to supabase.auth.signOut() in Batch C (mvp-foundations auth flow).
// TODO: persist prefs server-side once Batch C lands; localStorage is a stop-gap.
/**
 * Settings route — Lumi
 *
 * Mobile-first settings screen. All persisted prefs live in localStorage under
 * the key `lumi-prefs`. Reading localStorage during render is unsafe under SSR
 * (Next.js renders this on the server before hydration), so the page mounts
 * with DEFAULT_PREFS and hydrates from storage in a post-mount effect.
 *
 * NOTE: Sits inside the (tabs) route group. The shared tab layout is wired by
 * the orchestrator in a later step. Theme switching depends on a
 * `<ThemeProvider>` from next-themes mounted at the root layout — until that's
 * wired the radio still updates state, but `setTheme` is a no-op outside a
 * provider. We import the hook unconditionally; next-themes returns safe
 * defaults when no provider is present.
 */

"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  ChevronRight,
  Pencil,
  Wallet,
  CreditCard,
  Building2,
  Tag,
  Utensils,
  Car,
  ShoppingCart,
  Heart,
  Film,
  Zap,
  Home as HomeIcon,
  GraduationCap,
  Briefcase,
  Circle,
  LogOut,
  Info,
  Globe,
  Clock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────
type Currency = "PEN" | "USD";
type ThemeChoice = "system" | "light" | "dark";

type Prefs = {
  currency: Currency;
  theme: ThemeChoice;
};

type AccountKind = "cash" | "card" | "bank";
type Account = {
  id: string;
  label: string;
  currency: Currency;
  kind: AccountKind;
};

type CategoryId =
  | "food"
  | "transport"
  | "market"
  | "health"
  | "fun"
  | "utilities"
  | "home"
  | "edu"
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

// Mock data — same shape used elsewhere in the Lumi app.
// TODO: replace with Supabase-backed accounts/categories in Batch C.
const MOCK_ACCOUNTS: Account[] = [
  { id: "a1", label: "Efectivo", currency: "PEN", kind: "cash" },
  { id: "a2", label: "BCP Soles", currency: "PEN", kind: "bank" },
  { id: "a3", label: "Visa BBVA", currency: "PEN", kind: "card" },
  { id: "a4", label: "BCP Dólares", currency: "USD", kind: "bank" },
];

const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  bank: "Banco",
};

const ACCOUNT_KIND_ICON: Record<
  AccountKind,
  React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>
> = {
  cash: Wallet,
  card: CreditCard,
  bank: Building2,
};

const MOCK_CATEGORIES: Category[] = [
  { id: "food", label: "Comida", icon: Utensils },
  { id: "transport", label: "Transporte", icon: Car },
  { id: "market", label: "Mercado", icon: ShoppingCart },
  { id: "health", label: "Salud", icon: Heart },
  { id: "fun", label: "Entretenimiento", icon: Film },
  { id: "utilities", label: "Servicios", icon: Zap },
  { id: "home", label: "Hogar", icon: HomeIcon },
  { id: "edu", label: "Educación", icon: GraduationCap },
  { id: "work", label: "Trabajo", icon: Briefcase },
  { id: "other", label: "Otros", icon: Circle },
];

// User identity placeholders — replaced by Supabase session data in Batch C.
const USER_NAME = "Ana Bermúdez";
const USER_EMAIL = "gerson@lumi.app";
const USER_INITIALS = USER_NAME.split(" ")
  .map((p) => p[0])
  .slice(0, 2)
  .join("")
  .toUpperCase();

// ─── Page ──────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const [prefs, setPrefs] = React.useState<Prefs>(DEFAULT_PREFS);
  const [hydrated, setHydrated] = React.useState(false);

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

  function handleEditProfile() {
    toast("Próximamente", {
      description: "La edición de perfil llega en la próxima fase.",
    });
  }

  function handleSignOut() {
    // TODO: wire to supabase.auth.signOut() in Batch C.
    toast("Próximamente", {
      description: "Auth llega en la próxima fase.",
    });
  }

  return (
    <main className="relative min-h-dvh bg-background pb-32 text-foreground">
      <div className="mx-auto w-full max-w-[720px] px-5 pt-6 md:px-8 md:pt-10">
        {/* Page heading */}
        <header>
          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Tu cuenta
          </p>
          <h1 className="mt-1 text-[22px] font-bold md:text-3xl">Ajustes</h1>
        </header>

        {/* Profile */}
        <SettingsSection title="Perfil" headingId="settings-profile">
          <Card className="rounded-2xl border-border p-5">
            <div className="flex items-center gap-4">
              <div
                aria-hidden="true"
                className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)] text-lg font-bold"
              >
                {USER_INITIALS}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold">{USER_NAME}</div>
                <div className="truncate text-xs text-muted-foreground">{USER_EMAIL}</div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleEditProfile}
                aria-label="Editar perfil"
                className="min-h-11 rounded-full px-4"
              >
                <Pencil size={14} aria-hidden="true" />
                <span className="ml-1">Editar</span>
              </Button>
            </div>
          </Card>
        </SettingsSection>

        {/* Cuentas */}
        <SettingsSection title="Cuentas" headingId="settings-accounts">
          <Card className="overflow-hidden rounded-2xl border-border p-0">
            <ul className="divide-y divide-border" role="list">
              {MOCK_ACCOUNTS.map((account) => {
                const KindIcon = ACCOUNT_KIND_ICON[account.kind];
                return (
                  <li key={account.id}>
                    <Link
                      href={`/settings/accounts/${account.id}`}
                      aria-disabled
                      onClick={(e) => {
                        // Destinations don't exist yet; surface the placeholder.
                        e.preventDefault();
                        toast("Próximamente", {
                          description: "El detalle de cuenta llega pronto.",
                        });
                      }}
                      className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    >
                      <div
                        aria-hidden="true"
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-foreground"
                      >
                        <KindIcon size={18} aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-semibold">
                          {account.label}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {account.currency} · {ACCOUNT_KIND_LABEL[account.kind]}
                        </div>
                      </div>
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
                        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)]"
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
                className="mt-3 grid gap-2"
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
                Sistema sigue lo que tenés configurado en tu dispositivo.
              </p>
              <RadioGroup
                value={prefs.theme}
                onValueChange={handleThemeChange}
                aria-label="Tema de la aplicación"
                className="mt-3 grid gap-2"
              >
                <PrefRadio value="system" label="Sistema" />
                <PrefRadio value="light" label="Claro" />
                <PrefRadio value="dark" label="Oscuro" />
              </RadioGroup>
            </fieldset>

            <Separator className="my-5" />

            {/* Locale + Timezone (read-only) */}
            <dl className="grid gap-3">
              <div className="flex items-center gap-3">
                <Globe
                  size={16}
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
                <dt className="text-[13px] font-semibold">Idioma</dt>
                <dd className="ml-auto text-[13px] text-muted-foreground tabular-nums">
                  es-PE
                </dd>
              </div>
              <div className="flex items-center gap-3">
                <Clock
                  size={16}
                  className="text-muted-foreground"
                  aria-hidden="true"
                />
                <dt className="text-[13px] font-semibold">Zona horaria</dt>
                <dd className="ml-auto text-[13px] text-muted-foreground tabular-nums">
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
            onClick={handleSignOut}
            className="h-12 w-full rounded-xl text-[14px] font-semibold"
          >
            <LogOut size={16} aria-hidden="true" />
            <span className="ml-1">Cerrar sesión</span>
          </Button>
        </div>
      </div>
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

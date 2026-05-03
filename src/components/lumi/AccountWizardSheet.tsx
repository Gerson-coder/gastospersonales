/**
 * AccountWizardSheet — flujo de creación de cuenta con preview live.
 *
 * Reemplaza al `AccountFormSheet` solo en modo CREATE. Edit sigue
 * usando el form viejo (menos riesgo, menos UI nueva).
 *
 * Diseño:
 *   - Header "Agregando cuenta" + X
 *   - Card preview live (reusa `AccountCard` + `getAccountCardStyle`)
 *   - Plantillas: Efectivo + BCP + Interbank + BBVA + Yape + Plin +
 *     Scotiabank en una fila scrollable horizontal
 *   - Form inline: nombre + moneda + subtipo (solo banco)
 *   - Botón "Agregar a Lumi"
 *
 * Auto-defaults sensatos al elegir una plantilla:
 *   - Yape / Plin → kind correspondiente, name lock, currency=PEN
 *     (no soportan dólares en Perú)
 *   - Banco → kind=bank, label=brand, currency=PEN inicial
 *   - Efectivo → kind=cash, label=Efectivo
 *
 * El nombre de las plantillas Yape/Plin queda LOCKED (mismo patrón
 * que el form viejo via LOCKED_KIND_NAMES) para que dos accounts no
 * deriven en "Yape" vs "yape" vs "YAPE" por typing libre.
 */

"use client";

import * as React from "react";
import { X, Banknote, Wallet } from "lucide-react";
import { toast } from "sonner";

import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { AccountCard } from "@/components/lumi/AccountCard";
import { AccountBrandIcon } from "@/components/lumi/AccountBrandIcon";
import { SavingOverlay } from "@/components/lumi/SavingOverlay";
import {
  accountBrandSlug,
  accountChipBgClass,
} from "@/lib/account-brand-slug";
import { getAccountCardStyle } from "@/lib/account-card-theme";
import {
  ACCOUNT_SUBTYPE_LABEL,
  ACCOUNT_SUBTYPE_OPTIONS,
  createAccount,
  type Account,
  type AccountKind,
  type AccountSubtype,
  type Currency,
} from "@/lib/data/accounts";
import { cn } from "@/lib/utils";

// Char cap igual al del form viejo — mantiene consistencia con la
// UI de chips en /dashboard y la fila de /accounts.
const LABEL_MAX_LENGTH = 12;

// Yape / Plin tienen nombres canónicos. El form viejo usa el mismo
// truco para evitar variantes "Yape"/"yape"/"YAPE" en el catálogo
// del user.
const LOCKED_KIND_NAMES: Partial<Record<AccountKind, string>> = {
  yape: "Yape",
  plin: "Plin",
};

type WizardPreset = {
  id: string;
  label: string;
  kind: AccountKind;
  /** Pre-set la moneda al elegir el preset. Yape/Plin → PEN forzado. */
  currency?: Currency;
  /** Para presets sin marca registrada (Efectivo) usamos un Lucide
   *  icon en vez de buscar el SVG en /public/logos/banks. */
  fallbackIcon?: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
};

const PRESETS: WizardPreset[] = [
  { id: "cash", label: "Efectivo", kind: "cash", fallbackIcon: Banknote },
  { id: "bcp", label: "BCP", kind: "bank" },
  { id: "interbank", label: "Interbank", kind: "bank" },
  { id: "bbva", label: "BBVA", kind: "bank" },
  { id: "scotiabank", label: "Scotiabank", kind: "bank" },
  { id: "yape", label: "Yape", kind: "yape", currency: "PEN" },
  { id: "plin", label: "Plin", kind: "plin", currency: "PEN" },
];

export type AccountWizardSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lista actual de cuentas — usada para detectar duplicados antes
   *  de hacer el round-trip a Supabase. */
  existingAccounts: Account[];
  /** Refrescar el listado en el parent tras un create exitoso. */
  reload: () => Promise<void>;
};

export function AccountWizardSheet({
  open,
  onOpenChange,
  existingAccounts,
  reload,
}: AccountWizardSheetProps) {
  const [label, setLabel] = React.useState("");
  const [kind, setKind] = React.useState<AccountKind>("cash");
  const [currency, setCurrency] = React.useState<Currency>("PEN");
  const [subtype, setSubtype] = React.useState<AccountSubtype | null>(null);
  const [selectedPresetId, setSelectedPresetId] = React.useState<string | null>(
    null,
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [dupOpen, setDupOpen] = React.useState(false);
  // Surface validation only after the user toca Save una vez —
  // mismo patrón que el form viejo, evita rojo prematuro.
  const [showError, setShowError] = React.useState(false);

  // Re-seed cada vez que el sheet abre. Sin esto, un cancelar +
  // reabrir mantenía el último draft → sorpresa.
  React.useEffect(() => {
    if (!open) return;
    setLabel("");
    setKind("cash");
    setCurrency("PEN");
    setSubtype(null);
    setSelectedPresetId(null);
    setShowError(false);
  }, [open]);

  const lockedKindName = LOCKED_KIND_NAMES[kind];
  const nameLocked = lockedKindName !== undefined;
  const currencyLocked = kind === "yape" || kind === "plin";

  // Account "ficticio" para el preview. Usa el label efectivo (lock
  // si aplica, sino lo tipeado, sino "Mi cuenta" para que la card
  // nunca se vea con un hueco). saldo=0 + hideAmounts=true porque
  // todavía no hay nada que mostrar — solo la skin.
  const previewAccount: Account = React.useMemo(
    () => ({
      id: "__preview",
      label: lockedKindName ?? (label.trim() || "Mi cuenta"),
      kind,
      currency,
      subtype,
    }),
    [lockedKindName, label, kind, currency, subtype],
  );

  function applyPreset(preset: WizardPreset) {
    setSelectedPresetId(preset.id);
    setKind(preset.kind);
    // Yape/Plin → name canónico via LOCKED_KIND_NAMES;
    // banco/efectivo → label del preset como starter.
    const locked = LOCKED_KIND_NAMES[preset.kind];
    setLabel(locked ?? preset.label);
    if (preset.currency) setCurrency(preset.currency);
    // Subtype solo aplica a banco — limpio si elegimos otra cosa.
    if (preset.kind !== "bank") setSubtype(null);
    setShowError(false);
  }

  function handleLabelChange(next: string) {
    if (nameLocked) return;
    setLabel(next.slice(0, LABEL_MAX_LENGTH));
    // Si el user tipea libre, despinea la plantilla activa — está
    // editando el nombre, no se compromete con BCP/etc.
    if (selectedPresetId && selectedPresetId !== "cash") {
      setSelectedPresetId(null);
    }
  }

  async function handleSubmit() {
    if (submitting) return;
    const trimmed = label.trim();
    if (trimmed.length === 0) {
      setShowError(true);
      return;
    }

    const finalLabel = lockedKindName ?? trimmed;
    const finalSubtype = kind === "bank" ? subtype : null;

    // Duplicate guard — mismo (label, kind, subtype, currency)
    // ya existe.
    const norm = (s: string) => s.trim().toLowerCase();
    const isDuplicate = existingAccounts.some(
      (a) =>
        norm(a.label) === norm(finalLabel) &&
        a.kind === kind &&
        a.subtype === finalSubtype &&
        a.currency === currency,
    );
    if (isDuplicate) {
      setDupOpen(true);
      return;
    }

    setSubmitting(true);
    try {
      await createAccount({
        label: finalLabel,
        kind,
        currency,
        subtype: finalSubtype,
      });
      await reload();
      onOpenChange(false);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "No pudimos crear la cuenta.";
      toast.error("No se pudo guardar", { description: msg });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SavingOverlay open={submitting} label="Creando cuenta…" />
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (submitting && !next) return;
          onOpenChange(next);
        }}
      >
        <SheetContent
          side="bottom"
          aria-labelledby="account-wizard-title"
          className="rounded-t-3xl px-0 pb-6 pt-2 md:max-w-md"
        >
          {/* Header: X + título centrado. SheetTitle queda visualmente
              hidden — la H2 visible la maneja el span del header. */}
          <SheetTitle id="account-wizard-title" className="sr-only">
            Agregando cuenta
          </SheetTitle>
          <header className="flex items-center justify-between px-5 pt-2 pb-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Cerrar"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X size={18} aria-hidden />
            </button>
            <span className="text-[14px] font-semibold text-foreground">
              Agregando cuenta
            </span>
            {/* Spacer para que el título quede centrado entre la X y
                este placeholder de mismo ancho. */}
            <span aria-hidden className="h-9 w-9" />
          </header>

          {/* Card preview live — el style inyecta los CSS vars del
              tema según el slug detectado. Si el label no matchea
              ningún brand registrado (cash, custom name) cae al
              gradiente neutral por defecto. */}
          <div className="px-5 pt-3">
            <div style={getAccountCardStyle(previewAccount)}>
              <AccountCard
                bankSlug={accountBrandSlug(previewAccount.label)}
                bankLabel={previewAccount.label}
                subtypeLabel={
                  subtype ? ACCOUNT_SUBTYPE_LABEL[subtype] : null
                }
                currency={currency}
                saldoActual={0}
                hideAmounts={true}
                variant="full"
              />
            </div>
          </div>

          {/* Plantillas — fila scrollable. Cada chip aplica el preset
              completo (kind + label + currency cuando aplica). El que
              está activo lleva un ring para que el user vea de un
              vistazo qué está construyendo. */}
          <section className="px-5 pt-5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              Plantillas
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {PRESETS.map((preset) => {
                const active = selectedPresetId === preset.id;
                const Fallback = preset.fallbackIcon ?? Wallet;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    aria-pressed={active}
                    className={cn(
                      "flex w-[72px] flex-shrink-0 flex-col items-center gap-1.5 rounded-2xl px-1 py-2 transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active ? "bg-muted" : "hover:bg-muted/50",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl text-foreground",
                        accountChipBgClass(preset.label),
                        active &&
                          "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                      )}
                    >
                      <AccountBrandIcon
                        label={preset.label}
                        fallback={<Fallback size={20} aria-hidden />}
                      />
                    </span>
                    <span
                      className={cn(
                        "w-full truncate text-center text-[11px] leading-tight",
                        active
                          ? "font-semibold text-foreground"
                          : "font-medium text-muted-foreground",
                      )}
                    >
                      {preset.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Form fields. Nombre + moneda siempre. Subtipo solo
              cuando es banco — sin él la lista de "Sueldo / Ahorro /
              Crédito" no tiene sentido para Yape o Efectivo. */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
            aria-busy={submitting}
            className="flex flex-col gap-4 px-5 pt-5"
          >
            <label className="block">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                Nombre
              </span>
              <input
                type="text"
                value={label}
                onChange={(e) => handleLabelChange(e.target.value)}
                disabled={nameLocked || submitting}
                placeholder={
                  nameLocked ? lockedKindName : "Ej. Mi colchón, BCP, Caja"
                }
                aria-invalid={showError && label.trim().length === 0}
                maxLength={LABEL_MAX_LENGTH}
                className={cn(
                  "mt-1.5 h-11 w-full rounded-xl border bg-card px-3 text-[14px] font-medium text-foreground transition-colors placeholder:text-muted-foreground/60",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
                  showError && label.trim().length === 0
                    ? "border-destructive"
                    : "border-border",
                )}
              />
              {showError && label.trim().length === 0 ? (
                <p className="mt-1 text-[12px] text-destructive">
                  Asigna un nombre antes de continuar.
                </p>
              ) : null}
            </label>

            {/* Moneda — segmented control. Yape/Plin desactivan USD
                porque ninguna soporta dólares en Perú. */}
            <div role="radiogroup" aria-label="Moneda">
              <span className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                Moneda
              </span>
              <div className="mt-1.5 inline-flex h-11 w-full items-stretch rounded-xl border border-border bg-muted p-1">
                {(
                  [
                    { value: "PEN" as const, label: "S/ Soles" },
                    { value: "USD" as const, label: "$ Dólares" },
                  ]
                ).map((opt) => {
                  const selected = currency === opt.value;
                  const disabled =
                    submitting || (currencyLocked && opt.value === "USD");
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={disabled}
                      onClick={() => setCurrency(opt.value)}
                      className={cn(
                        "flex-1 rounded-lg text-[13px] font-semibold transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected
                          ? "bg-background text-foreground shadow-[var(--shadow-xs)]"
                          : "text-muted-foreground hover:text-foreground",
                        disabled &&
                          "cursor-not-allowed opacity-50 hover:text-muted-foreground",
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {currencyLocked ? (
                <p className="mt-1 text-[11.5px] text-muted-foreground">
                  {lockedKindName} solo opera en soles.
                </p>
              ) : null}
            </div>

            {/* Subtipo — solo banco. Útil para diferenciar dos cuentas
                en el mismo banco (ej. BCP Sueldo + BCP Ahorro). */}
            {kind === "bank" ? (
              <div role="radiogroup" aria-label="Tipo de producto">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                  Tipo de producto (opcional)
                </span>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {ACCOUNT_SUBTYPE_OPTIONS.map((opt) => {
                    const selected = subtype === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setSubtype(selected ? null : opt)}
                        className={cn(
                          "inline-flex h-9 items-center rounded-full border px-3 text-[12px] font-semibold transition-colors",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-card text-foreground hover:bg-muted",
                        )}
                      >
                        {ACCOUNT_SUBTYPE_LABEL[opt]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* CTA primaria. Verde Lumi + ícono inline en el copy. */}
            <button
              type="submit"
              disabled={submitting}
              className={cn(
                "mt-2 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-primary px-5 text-[14px] font-semibold text-primary-foreground transition-colors",
                "shadow-[var(--shadow-card)] hover:bg-primary/90 active:bg-primary/80",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              Agregar a Lumi
            </button>
          </form>
        </SheetContent>
      </Sheet>

      {/* Duplicate guard — mismo patrón que el form viejo. Drawer
          modal con título + descripción + botón Entendido. */}
      <Drawer open={dupOpen} onOpenChange={setDupOpen}>
        <DrawerContent
          aria-describedby="account-dup-desc"
          className="bg-background"
        >
          <DrawerHeader>
            <DrawerTitle>Cuenta duplicada</DrawerTitle>
            <DrawerDescription id="account-dup-desc">
              Ya existe una cuenta con el mismo nombre, tipo, subtipo y moneda.
              Cambia alguno para diferenciarla.
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-2 px-4 pb-6">
            <button
              type="button"
              onClick={() => setDupOpen(false)}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-foreground text-[14px] font-semibold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Entendido
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

export default AccountWizardSheet;

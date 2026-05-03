/**
 * AccountWizardSheet — flujo de creación de cuenta con preview live
 * y wizard de 2 pasos.
 *
 * Solo modo CREATE. Edit sigue usando el AccountFormSheet viejo.
 *
 * Pasos:
 *   1. Plantilla + nombre + moneda. Si el kind resultante es banco,
 *      el botón dice "Continuar" y avanza al paso 2. Si es Yape /
 *      Plin / Efectivo (donde el subtipo no aplica), el botón dice
 *      "Agregar a Lumi" y guarda directo.
 *   2. Subtipo del producto (Sueldo / Corriente / Ahorro / Crédito /
 *      Débito / Dólares). Solo se muestra para banco. Botón
 *      "Agregar a Lumi" guarda. Header trae back-arrow para volver
 *      al paso 1 sin perder lo tipeado.
 *
 * Auto-defaults sensatos al elegir plantilla:
 *   - Yape / Plin → kind correspondiente, name LOCKED, currency=PEN
 *   - Banco → kind=bank, label=brand, name LOCKED (consistencia del
 *     slug; cuentas múltiples del mismo banco se diferencian por
 *     subtipo en el paso 2)
 *   - Efectivo → kind=cash, label="Efectivo" pero EDITABLE (los
 *     users renombran a "Mi colchón" / "Caja" / etc.)
 *
 * Layout: SheetContent toma 100dvh en mobile (full screen, sin
 * rounded-t porque ya no es un sheet flotante visible). Card preview
 * + header + footer son shrink-0 anclados; el form scrollea en el
 * medio. Desktop sigue centrado a 90vh con rounding (modal feel).
 */

"use client";

import * as React from "react";
import { X, ArrowLeft, Banknote, Wallet } from "lucide-react";
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

const LABEL_MAX_LENGTH = 12;

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

type Step = 1 | 2;

export type AccountWizardSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingAccounts: Account[];
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
  const [step, setStep] = React.useState<Step>(1);
  const [submitting, setSubmitting] = React.useState(false);
  const [dupOpen, setDupOpen] = React.useState(false);
  const [showError, setShowError] = React.useState(false);

  // Re-seed cada vez que el sheet abre.
  React.useEffect(() => {
    if (!open) return;
    setLabel("");
    setKind("cash");
    setCurrency("PEN");
    setSubtype(null);
    setSelectedPresetId(null);
    setStep(1);
    setShowError(false);
  }, [open]);

  const lockedKindName = LOCKED_KIND_NAMES[kind];
  const selectedPreset = React.useMemo(
    () => PRESETS.find((p) => p.id === selectedPresetId) ?? null,
    [selectedPresetId],
  );
  // Lock del nombre: kind-based (Yape/Plin) o por preset bancario.
  // Banco bloquea para preservar la consistencia del slug — cuentas
  // múltiples del mismo banco se diferencian via subtipo (paso 2),
  // no via label libre.
  const nameLocked =
    lockedKindName !== undefined || selectedPreset?.kind === "bank";
  const currencyLocked = kind === "yape" || kind === "plin";

  // El paso 2 solo tiene sentido para banco — es el subtipo. Para
  // Yape/Plin/Efectivo el paso 1 termina en submit directo.
  const needsStep2 = kind === "bank";

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

  // Si el user vuelve al paso 1 y cambia kind a algo que ya no
  // necesita paso 2, no hace falta forzarlo de vuelta — el render
  // del paso 2 solo ocurre si needsStep2 es true. Pero si está EN
  // paso 2 y de alguna forma llegamos a kind != bank, baja a paso 1.
  React.useEffect(() => {
    if (step === 2 && !needsStep2) setStep(1);
  }, [step, needsStep2]);

  function applyPreset(preset: WizardPreset) {
    setSelectedPresetId(preset.id);
    setKind(preset.kind);
    const locked = LOCKED_KIND_NAMES[preset.kind];
    setLabel(locked ?? preset.label);
    if (preset.currency) setCurrency(preset.currency);
    if (preset.kind !== "bank") setSubtype(null);
    setShowError(false);
  }

  function handleLabelChange(next: string) {
    if (nameLocked) return;
    setLabel(next.slice(0, LABEL_MAX_LENGTH));
    if (selectedPresetId && selectedPresetId !== "cash") {
      setSelectedPresetId(null);
    }
  }

  function handlePrimaryAction() {
    if (submitting) return;
    if (step === 1) {
      // Validación de nombre antes de avanzar / guardar.
      const trimmed = label.trim();
      if (!nameLocked && trimmed.length === 0) {
        setShowError(true);
        return;
      }
      if (needsStep2) {
        setStep(2);
        return;
      }
      void persist();
      return;
    }
    // step === 2 → guardar.
    void persist();
  }

  async function persist() {
    if (submitting) return;
    const trimmed = label.trim();
    const finalLabel = lockedKindName ?? trimmed;
    const finalSubtype = kind === "bank" ? subtype : null;

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

  // Copy del botón primario depende del paso + si necesita paso 2.
  const primaryLabel =
    step === 1 && needsStep2 ? "Continuar" : "Agregar a Lumi";
  const headerTitle =
    step === 2 ? "Tipo de producto" : "Agregando cuenta";

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
          showCloseButton={false}
          // Mobile: full-screen 100dvh, sin rounded-t (ya no es un
          // sheet flotante — es la pantalla completa). Desktop:
          // centrado modal con rounded.
          className={cn(
            "flex flex-col px-0 pb-0 pt-2",
            "data-[side=bottom]:!h-[100dvh] data-[side=bottom]:!max-h-[100dvh] data-[side=bottom]:rounded-none",
            "md:max-w-md md:data-[side=bottom]:!h-auto md:data-[side=bottom]:!max-h-[90vh] md:rounded-2xl",
          )}
        >
          <SheetTitle id="account-wizard-title" className="sr-only">
            {headerTitle}
          </SheetTitle>

          {/* Header: en step 1 muestra X (cerrar). En step 2 muestra
              flecha back que vuelve a step 1 sin perder estado. */}
          <header className="flex shrink-0 items-center justify-between px-5 pt-2 pb-1">
            {step === 1 ? (
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Cerrar"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X size={18} aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStep(1)}
                aria-label="Volver al paso anterior"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowLeft size={18} aria-hidden />
              </button>
            )}
            <span className="text-[14px] font-semibold text-foreground">
              {headerTitle}
            </span>
            {/* Indicador de paso a la derecha. Solo visible cuando hay
                wizard de 2 pasos (kind=bank). Para flujos de 1 paso lo
                ocultamos para no confundir. */}
            {needsStep2 ? (
              <span
                aria-label={`Paso ${step} de 2`}
                className="text-[11px] font-semibold tabular-nums text-muted-foreground"
              >
                {step}/2
              </span>
            ) : (
              <span aria-hidden className="h-9 w-9" />
            )}
          </header>

          {/* Card preview — siempre visible en ambos pasos. La
              continuidad visual ayuda al user a ver cómo va quedando
              su cuenta mientras refina el subtipo en step 2. */}
          <div className="shrink-0 px-5 pt-3">
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

          {/* Scroll area: contenido específico de cada paso. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {step === 1 ? (
              <>
                {/* Plantillas */}
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

                {/* Nombre + moneda. Subtipo NO va acá — es el paso 2. */}
                <div className="flex flex-col gap-4 px-5 pt-5 pb-5">
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
                        nameLocked
                          ? lockedKindName
                          : "Ej. Mi colchón, BCP, Caja"
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
                          submitting ||
                          (currencyLocked && opt.value === "USD");
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
                </div>
              </>
            ) : (
              // Step 2 — subtipo del producto. Pills más grandes que
              // antes porque ahora son la única decisión visible en
              // este paso, no un detalle más al pie del form.
              <div className="flex flex-col gap-3 px-5 pt-5 pb-5">
                <p className="text-[14px] font-semibold text-foreground">
                  ¿Qué tipo de producto es?
                </p>
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  Si tienes varias cuentas en el mismo banco, esto las
                  diferencia. Puedes saltarlo y dejarlo en blanco.
                </p>
                <div
                  role="radiogroup"
                  aria-label="Tipo de producto"
                  className="mt-2 grid grid-cols-2 gap-2"
                >
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
                          "inline-flex h-12 items-center justify-center rounded-xl border px-3 text-[13px] font-semibold transition-colors",
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
            )}
          </div>

          {/* Footer fijo abajo. Copy y action dependen del paso:
                step 1 + needsStep2 → "Continuar" (advance)
                step 1 + !needsStep2 → "Agregar a Lumi" (submit)
                step 2 → "Agregar a Lumi" (submit) */}
          <div className="shrink-0 border-t border-border bg-popover px-5 pb-6 pt-3">
            <button
              type="button"
              onClick={handlePrimaryAction}
              disabled={submitting}
              className={cn(
                "inline-flex h-12 w-full items-center justify-center rounded-2xl bg-primary px-5 text-[14px] font-semibold text-primary-foreground transition-colors",
                "shadow-[var(--shadow-card)] hover:bg-primary/90 active:bg-primary/80",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              {primaryLabel}
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Duplicate guard — Drawer modal sobre el wizard. */}
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

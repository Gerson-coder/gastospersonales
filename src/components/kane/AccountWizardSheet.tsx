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
 *      "Agregar a Kane" y guarda directo.
 *   2. Subtipo del producto (Sueldo / Corriente / Ahorro / Crédito /
 *      Débito / Dólares). Solo se muestra para banco. Botón
 *      "Agregar a Kane" guarda. Header trae back-arrow para volver
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
import { useRouter } from "next/navigation";
import {
  X,
  ArrowLeft,
  Banknote,
  Wallet,
  Plus,
  Pencil,
  Landmark,
} from "lucide-react";
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
import { AccountCard } from "@/components/kane/AccountCard";
import { AccountBrandIcon } from "@/components/kane/AccountBrandIcon";
import { SavingOverlay } from "@/components/kane/SavingOverlay";
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
import { useActiveAccountId } from "@/hooks/use-active-account-id";
import { cn } from "@/lib/utils";

// Subido a 20 (era 12) por feedback del user — nombres como
// "Caja Huancayo" (13), "Mibanco Crédito" (15), "Banco Pichincha" (15)
// no entraban en 12. Las superficies que rendean labels de cuenta
// (/accounts row, /dashboard chip, AccountCard) ya truncan via
// className truncate, asi que un label largo se corta visualmente sin
// romper layout.
const LABEL_MAX_LENGTH = 20;

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
  { id: "bcp", label: "BCP", kind: "bank" },
  { id: "yape", label: "Yape", kind: "yape", currency: "PEN" },
  { id: "interbank", label: "Interbank", kind: "bank" },
  { id: "bbva", label: "BBVA", kind: "bank" },
  { id: "scotiabank", label: "Scotiabank", kind: "bank" },
  { id: "plin", label: "Plin", kind: "plin", currency: "PEN" },
  // Catch-all para cualquier cuenta que no esté en los presets de
  // marca: Caja Huancayo, Caja Arequipa, Mibanco, BanBif, Pichincha,
  // Falabella, Ripley, Tunki, o simplemente "Mi colchón" / "Caja
  // chica" para efectivo. Cuando el user elige "Mi cuenta", la UI
  // muestra un mini-picker para decidir si es efectivo o banco, y el
  // campo de nombre queda editable. La card preview cae al gradiente
  // neutral porque accountBrandSlug no encuentra el slug — si más
  // adelante registramos un theme para esa marca el render lo toma
  // automáticamente.
  //
  // Antes había también un preset "Efectivo" separado, pero quedaba
  // redundante con "Mi cuenta" + kind=cash. Lo sacamos por feedback
  // del user para evitar dos caminos hacia el mismo flujo.
  { id: "other", label: "Mi cuenta", kind: "cash", fallbackIcon: Pencil },
];

// Cuántas plantillas se muestran inline antes del "Más" affordance.
// Misma idea que el strip de comercios en /capture: 3 visibles +
// pill de "Más" para descubrir el resto. Sin esto, los users nuevos
// no se enteran de que pueden scrollear horizontal.
const VISIBLE_PRESETS = 3;

// Subtipos disponibles en el wizard. Filtramos "debito" porque el
// user lo pidió quitar — los users peruanos rara vez piensan en
// "Débito" como categoria de cuenta (es más bien una tarjeta, y eso
// se modela aparte). Las cuentas con kind=card legacy siguen
// renderizando bien en otras superficies — solo no las creamos
// nuevas desde acá.
const WIZARD_SUBTYPE_OPTIONS = ACCOUNT_SUBTYPE_OPTIONS.filter(
  (opt) => opt !== "debito",
);

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
  const router = useRouter();
  // Set la cuenta recién creada como activa antes de navegar al
  // dashboard. Sin esto, el carousel del dashboard arranca en la
  // primera cuenta de la lista (created_at ASC), que NO es la
  // recién creada — el user vería su cuenta antigua aunque acabe
  // de agregar otra.
  const { setActiveAccountId } = useActiveAccountId();
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
  // Drawer con todas las plantillas — abre desde el pill "Más" del
  // strip horizontal. Sin esto, las plantillas que no entran en los 3
  // visibles quedaban escondidas detrás de un scroll que los users
  // nuevos no descubren.
  const [allPresetsOpen, setAllPresetsOpen] = React.useState(false);

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
    setAllPresetsOpen(false);
  }, [open]);

  // Visible 3 + pinning del preset activo. Si el user ya eligió una
  // plantilla que NO está en los 3 visibles (lo seleccionó desde el
  // drawer "Más"), la pineamos al frente para que el chip activo
  // aparezca en el strip — mismo patrón que MerchantPicker.
  const visiblePresets = React.useMemo<WizardPreset[]>(() => {
    const head = PRESETS.slice(0, VISIBLE_PRESETS);
    if (!selectedPresetId) return head;
    if (head.some((p) => p.id === selectedPresetId)) return head;
    const pinned = PRESETS.find((p) => p.id === selectedPresetId);
    if (!pinned) return head;
    // Reemplazamos el último visible por el pinneado para no romper
    // el cap visual de 3.
    return [pinned, ...head.slice(0, VISIBLE_PRESETS - 1)];
  }, [selectedPresetId]);

  const lockedKindName = LOCKED_KIND_NAMES[kind];
  const selectedPreset = React.useMemo(
    () => PRESETS.find((p) => p.id === selectedPresetId) ?? null,
    [selectedPresetId],
  );
  // El preset "Otro" deja TODO editable — kind se elige inline,
  // nombre se tipea libre. Lo flageo separado porque varias ramas
  // de la lógica (lock del nombre, mini-picker visible, copy del
  // helper) se bifurcan en este caso.
  const isOtherPreset = selectedPreset?.id === "other";
  // Lock del nombre: kind-based (Yape/Plin) o por preset bancario,
  // PERO no cuando es "Otro" (ese permite tipear cualquier marca,
  // ej. "Caja Huancayo", "Mibanco", "BanBif").
  const nameLocked =
    lockedKindName !== undefined ||
    (selectedPreset?.kind === "bank" && !isOtherPreset);
  const currencyLocked = kind === "yape" || kind === "plin";

  // El paso 2 solo tiene sentido para banco — es el subtipo. Para
  // Yape/Plin/Efectivo el paso 1 termina en submit directo.
  const needsStep2 = kind === "bank";

  const previewAccount: Account = React.useMemo(
    () => ({
      id: "__preview",
      // Preview no tiene owner real ni esta compartida — son
      // fields requeridos por el type Account desde 00027.
      userId: "",
      label: lockedKindName ?? (label.trim() || "Mi cuenta"),
      kind,
      currency,
      subtype,
      sharedWithPartner: false,
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
    // "Otro" arranca con label vacío para que el user tipee desde
    // cero. El resto de presets pre-rellenan la marca como starter.
    if (preset.id === "other") {
      setLabel("");
    } else {
      setLabel(locked ?? preset.label);
    }
    if (preset.currency) setCurrency(preset.currency);
    if (preset.kind !== "bank") setSubtype(null);
    setShowError(false);
  }

  // Cambio de kind desde el mini-picker del preset "Otro". Limpia el
  // subtype si el user vuelve a cash (no aplica a no-banco).
  function handleOtherKindChange(next: AccountKind) {
    setKind(next);
    if (next !== "bank") setSubtype(null);
  }

  // Salida de "Otro" — limpia el preset seleccionado y vuelve al
  // estado inicial para que el strip de plantillas reaparezca y el
  // user pueda elegir otra. Reseteamos kind/label/subtype porque
  // "Cambiar plantilla" implica empezar de cero (cualquier preset
  // que elija después va a sobrescribirlos igual).
  function exitOtherPreset() {
    setSelectedPresetId(null);
    setKind("cash");
    setLabel("");
    setSubtype(null);
    setShowError(false);
  }

  function handleLabelChange(next: string) {
    if (nameLocked) return;
    setLabel(next.slice(0, LABEL_MAX_LENGTH));
    // Si el user tipea libre sobre una plantilla de marca (BCP, Yape,
    // etc.), despineamos el preset porque ya no se compromete con esa
    // marca literal. EXCEPCIÓN: "Mi cuenta" (id "other") existe
    // específicamente para tipear libre — no debe despinearse al
    // teclear, sino quedarse activo para que el mini-picker de
    // efectivo/banco siga visible. Bug previo: tipear el nombre en
    // Mi cuenta hacía desaparecer el kind picker, dejando al user
    // sin manera de elegir efectivo/banco una vez empezado a tipear.
    if (selectedPresetId && selectedPresetId !== "other") {
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
      const created = await createAccount({
        label: finalLabel,
        kind,
        currency,
        subtype: finalSubtype,
      });
      // Set the brand-new account as active so the dashboard carousel
      // lands on it instead of defaulting to the oldest account.
      setActiveAccountId(created.id);
      await reload();
      onOpenChange(false);
      // Navegar al dashboard para reflejar la nueva cuenta. El
      // dashboard ya escucha ACCOUNT_UPSERTED_EVENT (emitido dentro
      // de createAccount) + refetcha en focus, así que la lista
      // estará al día cuando llegue.
      router.push("/dashboard");
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
    step === 1 && needsStep2 ? "Continuar" : "Agregar a Kane";
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
            "flex flex-col px-0 pb-0 pt-0",
            "data-[side=bottom]:!h-[100dvh] data-[side=bottom]:!max-h-[100dvh] data-[side=bottom]:rounded-none",
            "md:max-w-3xl md:data-[side=bottom]:!h-auto md:data-[side=bottom]:!max-h-[90vh] md:rounded-2xl",
          )}
        >
          <SheetTitle id="account-wizard-title" className="sr-only">
            {headerTitle}
          </SheetTitle>

          {/* Header: en step 1 muestra X (cerrar). En step 2 muestra
              flecha back que vuelve a step 1 sin perder estado. */}
          <header className="flex shrink-0 items-center justify-between px-5 pt-1 pb-0">
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
              su cuenta mientras refina el subtipo en step 2. pt-0
              después de pedido del user — la card pegada al header
              hace que sea lo primero que el ojo encuentra al abrir el
              wizard, sin un colchón de aire arriba. */}
          <div className="shrink-0 px-5 pt-0">
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
                {/* Cuando "Otro" está activo el strip de plantillas
                    se oculta — la decisión "elijo banco/efectivo
                    custom" ya está tomada y los chips serían ruido.
                    En su lugar mostramos un breadcrumb minimal con
                    salida "Cambiar plantilla" para volver al strip
                    sin tener que cerrar y reabrir el wizard. */}
                {isOtherPreset ? (
                  <section className="flex items-center justify-between px-5 pt-5">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Cuenta personalizada
                    </span>
                    <button
                      type="button"
                      onClick={exitOtherPreset}
                      className="text-[12px] font-semibold text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-1"
                    >
                      Cambiar plantilla
                    </button>
                  </section>
                ) : (
                  // Plantillas — solo 3 visibles + pill "Más". Mismo
                  // patrón que el strip de comercios en /capture.
                  <section className="px-5 pt-5">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      Plantillas
                    </p>
                  <div className="flex gap-2">
                    {visiblePresets.map((preset) => {
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
                    {/* "Más" — círculo dashed con + adentro, mismo
                        lenguaje visual que las plantillas pero claro
                        que es affordance, no un banco más. */}
                    <button
                      type="button"
                      onClick={() => setAllPresetsOpen(true)}
                      aria-haspopup="dialog"
                      aria-expanded={allPresetsOpen}
                      aria-label="Ver todas las plantillas"
                      className="flex w-[72px] flex-shrink-0 flex-col items-center gap-1.5 rounded-2xl px-1 py-2 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-border text-muted-foreground"
                      >
                        <Plus size={18} aria-hidden="true" />
                      </span>
                      <span className="text-[11px] font-medium text-muted-foreground">
                        Más
                      </span>
                    </button>
                  </div>
                  </section>
                )}

                {/* Nombre + moneda. Subtipo NO va acá — es el paso 2. */}
                <div className="flex flex-col gap-4 px-5 pt-5 pb-5">
                  {/* Mini-picker de kind solo cuando el user eligió
                      "Otro" — necesita decidir si su cuenta nueva es
                      efectivo (Mi colchón / Caja chica) o banco
                      (Caja Huancayo / Mibanco). Para los presets de
                      marca el kind ya está fijado y este picker no
                      hace falta. */}
                  {isOtherPreset ? (
                    <div role="radiogroup" aria-label="Tipo de cuenta">
                      <span className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                        ¿Qué tipo de cuenta?
                      </span>
                      <div className="mt-1.5 grid grid-cols-2 gap-2">
                        {(
                          [
                            {
                              value: "cash" as const,
                              label: "Efectivo",
                              Icon: Banknote,
                            },
                            {
                              value: "bank" as const,
                              label: "Banco",
                              Icon: Landmark,
                            },
                          ]
                        ).map((opt) => {
                          const selected = kind === opt.value;
                          const Icon = opt.Icon;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              disabled={submitting}
                              onClick={() =>
                                handleOtherKindChange(opt.value)
                              }
                              className={cn(
                                "inline-flex h-12 items-center justify-center gap-2 rounded-xl border px-3 text-[13px] font-semibold transition-colors",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                selected
                                  ? "border-foreground bg-foreground text-background"
                                  : "border-border bg-card text-foreground hover:bg-muted",
                              )}
                            >
                              <Icon size={16} aria-hidden="true" />
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

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
                          : isOtherPreset && kind === "bank"
                            ? "Ej. Caja Huancayo, Mibanco"
                            : "Ponle un nombre"
                      }
                      aria-invalid={showError && label.trim().length === 0}
                      aria-describedby={!nameLocked ? "wizard-name-hint" : undefined}
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
                    ) : !nameLocked ? (
                      // Helper text context-aware. Si el user está en
                      // "Otro" + Banco, sugerimos cajas/bancos que NO
                      // están en nuestros presets (para que descubra
                      // que esa rama existe). Si está en "Otro" +
                      // Efectivo o sin preset, sugerimos nombres de
                      // efectivo típicos.
                      <p
                        id="wizard-name-hint"
                        className="mt-1 text-[11.5px] text-muted-foreground"
                      >
                        {isOtherPreset && kind === "bank"
                          ? "Ejemplos: Caja Huancayo, Mibanco, BanBif, Pichincha."
                          : "Ejemplos: Mi colchón, Caja chica, Ahorros."}
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
                  {WIZARD_SUBTYPE_OPTIONS.map((opt) => {
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
                step 1 + !needsStep2 → "Agregar a Kane" (submit)
                step 2 → "Agregar a Kane" (submit) */}
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

      {/* Todas las plantillas — drawer que abre desde el pill "Más"
          del strip. Muestra el catálogo completo en una grid 3-col
          para que el user vea TODAS las opciones disponibles sin
          tener que recordar que existe scroll horizontal. */}
      <Drawer open={allPresetsOpen} onOpenChange={setAllPresetsOpen}>
        <DrawerContent
          aria-describedby="wizard-presets-desc"
          className="bg-background md:!max-w-2xl"
        >
          <DrawerHeader>
            <DrawerTitle>Elige una plantilla</DrawerTitle>
            <DrawerDescription
              id="wizard-presets-desc"
              className="text-[12.5px]"
            >
              Aplica el banco o billetera y sigue editando si quieres.
            </DrawerDescription>
          </DrawerHeader>
          <div className="grid grid-cols-3 gap-2 px-4 pb-6 max-h-[60vh] overflow-y-auto overscroll-contain">
            {PRESETS.map((preset) => {
              const active = selectedPresetId === preset.id;
              const Fallback = preset.fallbackIcon ?? Wallet;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    applyPreset(preset);
                    setAllPresetsOpen(false);
                  }}
                  aria-pressed={active}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-2xl px-1 py-3 transition-colors",
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
        </DrawerContent>
      </Drawer>

      {/* Duplicate guard — Drawer modal sobre el wizard. */}
      <Drawer open={dupOpen} onOpenChange={setDupOpen}>
        <DrawerContent
          aria-describedby="account-dup-desc"
          className="bg-background md:!max-w-2xl"
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

/**
 * CommitmentFormSheet — Vaul drawer create/edit form for commitments.
 *
 * Cubre los 4 tipos en un solo form con secciones condicionales:
 *   - Type chips arriba (Pagar/Cobrar/Presté/Me prestaron).
 *   - Categoría + cuenta solo para payment/income (los prestamos no
 *     necesitan categoria del catalogo).
 *   - Counterparty solo para lent/borrowed.
 *   - Recurrence aplica a los 4 pero defaultea segun kind.
 *
 * Es PRESENTACIONAL — el padre maneja el submit y los toasts. Reusa
 * CategoryFilterPicker y AccountFilterPicker del modulo de movements
 * para los selectores opcionales.
 */
"use client";

import * as React from "react";
import nextDynamic from "next/dynamic";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  HandCoins,
  HandHeart,
  Loader2,
} from "lucide-react";

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
import {
  type CommitmentDraft,
  type CommitmentKind,
  type CommitmentRecurrence,
  type CommitmentView,
  RECURRENCE_LABEL,
} from "@/lib/data/commitments";
import { cn } from "@/lib/utils";

const CategoryFilterPicker = nextDynamic(
  () =>
    import("@/components/kane/MovementsFilterPickers").then(
      (m) => m.CategoryFilterPicker,
    ),
  { ssr: false },
);
const AccountFilterPicker = nextDynamic(
  () =>
    import("@/components/kane/MovementsFilterPickers").then(
      (m) => m.AccountFilterPicker,
    ),
  { ssr: false },
);

const KIND_OPTIONS: ReadonlyArray<{
  id: CommitmentKind;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  hint: string;
}> = [
  { id: "payment", label: "Por pagar", icon: ArrowUpFromLine, hint: "Recibo, cuota, alquiler que pagas" },
  { id: "income", label: "Por cobrar", icon: ArrowDownToLine, hint: "Sueldo, alquiler que cobras" },
  { id: "lent", label: "Presté", icon: HandHeart, hint: "Le prestaste dinero a alguien" },
  { id: "borrowed", label: "Me prestaron", icon: HandCoins, hint: "Te prestaron dinero" },
];

const RECURRENCE_OPTIONS: ReadonlyArray<CommitmentRecurrence> = [
  "none",
  "weekly",
  "biweekly",
  "monthly",
  "yearly",
];

type CreateProps = {
  mode: "create";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitting?: boolean;
  /** Defaults — el padre puede pre-seleccionar tipo/moneda. */
  defaultKind?: CommitmentKind;
  defaultCurrency?: "PEN" | "USD";
  onSubmit: (draft: CommitmentDraft) => void;
};

type EditProps = {
  mode: "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitting?: boolean;
  initial: CommitmentView;
  onSubmit: (draft: CommitmentDraft) => void;
};

export type CommitmentFormSheetProps = CreateProps | EditProps;

/** Default due_date = hoy local en formato YYYY-MM-DD. */
function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function CommitmentFormSheet(props: CommitmentFormSheetProps) {
  const isEdit = props.mode === "edit";

  // Local form state — rehidratada cada vez que se abre el sheet.
  const [kind, setKind] = React.useState<CommitmentKind>(
    isEdit ? props.initial.kind : (props.defaultKind ?? "payment"),
  );
  const [title, setTitle] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [currency, setCurrency] = React.useState<"PEN" | "USD">(
    isEdit ? props.initial.currency : (props.defaultCurrency ?? "PEN"),
  );
  const [dueDate, setDueDate] = React.useState(todayKey());
  const [recurrence, setRecurrence] =
    React.useState<CommitmentRecurrence>("monthly");
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [categoryName, setCategoryName] = React.useState<string | null>(null);
  const [accountId, setAccountId] = React.useState<string | null>(null);
  const [accountName, setAccountName] = React.useState<string | null>(null);
  const [counterparty, setCounterparty] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [remindDays, setRemindDays] = React.useState("3");

  // Sheets internos (lazy, ssr:false).
  const [categoryPickerOpen, setCategoryPickerOpen] = React.useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = React.useState(false);

  const [showError, setShowError] = React.useState(false);

  // Rehidratar al abrir.
  React.useEffect(() => {
    if (!props.open) return;
    setShowError(false);
    if (props.mode === "edit") {
      const i = props.initial;
      setKind(i.kind);
      setTitle(i.title);
      setAmount(i.amount.toFixed(2));
      setCurrency(i.currency);
      setDueDate(i.dueDate);
      setRecurrence(i.recurrence);
      setCategoryId(i.categoryId);
      setCategoryName(i.categoryName);
      setAccountId(i.accountId);
      setAccountName(i.accountName);
      setCounterparty(i.counterparty ?? "");
      setNotes(i.notes ?? "");
      setRemindDays(String(i.remindDaysBefore));
    } else {
      setKind(props.defaultKind ?? "payment");
      setTitle("");
      setAmount("");
      setCurrency(props.defaultCurrency ?? "PEN");
      setDueDate(todayKey());
      setRecurrence("monthly");
      setCategoryId(null);
      setCategoryName(null);
      setAccountId(null);
      setAccountName(null);
      setCounterparty("");
      setNotes("");
      setRemindDays("3");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

  const submitting = props.submitting === true;
  const trimmedTitle = title.trim();
  const amountNum = parseFloat(amount.replace(",", "."));
  const remindDaysNum = parseInt(remindDays, 10);

  const showCategoryAccount = kind === "payment" || kind === "income";
  const showCounterparty = kind === "lent" || kind === "borrowed";

  const valid =
    trimmedTitle.length > 0 &&
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(dueDate) &&
    Number.isInteger(remindDaysNum) &&
    remindDaysNum >= 0 &&
    remindDaysNum <= 30;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    if (!valid) {
      setShowError(true);
      return;
    }
    props.onSubmit({
      kind,
      title: trimmedTitle,
      amount: amountNum,
      currency,
      dueDate,
      recurrence,
      categoryId: showCategoryAccount ? categoryId : null,
      accountId: showCategoryAccount ? accountId : null,
      counterparty: showCounterparty ? counterparty.trim() || null : null,
      notes: notes.trim() || null,
      remindDaysBefore: remindDaysNum,
    });
  }

  return (
    <>
      <Drawer open={props.open} onOpenChange={props.onOpenChange}>
        <DrawerContent
          aria-describedby="commitment-form-desc"
          className="bg-background md:!max-w-2xl"
        >
          <DrawerHeader className="text-left">
            <DrawerTitle className="font-sans not-italic text-base font-semibold">
              {isEdit ? "Editar compromiso" : "Nuevo compromiso"}
            </DrawerTitle>
            <DrawerDescription
              id="commitment-form-desc"
              className="text-[12px]"
            >
              {isEdit
                ? "Cambia los detalles del compromiso."
                : "Registra un pago, cobro o préstamo para no olvidarlo."}
            </DrawerDescription>
          </DrawerHeader>

          <form onSubmit={handleSubmit} className="overflow-y-auto px-4 pb-4">
            {/* Kind selector — 2x2 grid de cards con icono. */}
            <fieldset className="mb-5">
              <legend className="sr-only">Tipo de compromiso</legend>
              <div className="grid grid-cols-2 gap-2">
                {KIND_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const selected = kind === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setKind(opt.id)}
                      aria-pressed={selected}
                      className={cn(
                        "flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected
                          ? "border-foreground bg-muted shadow-sm"
                          : "border-border hover:bg-muted/60",
                      )}
                    >
                      <Icon size={18} aria-hidden className="text-foreground" />
                      <span className="text-[13px] font-semibold text-foreground">
                        {opt.label}
                      </span>
                      <span className="text-[10.5px] text-muted-foreground leading-tight">
                        {opt.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Title */}
            <div className="mb-4">
              <Label
                htmlFor="commitment-title"
                className="mb-1.5 block text-[12px]"
              >
                Título
              </Label>
              <Input
                id="commitment-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  kind === "payment"
                    ? "Ej. Recibo de luz"
                    : kind === "income"
                      ? "Ej. Alquiler cuarto Juan"
                      : kind === "lent"
                        ? "Ej. Préstamo a Pedro"
                        : "Ej. Préstamo de papá"
                }
                maxLength={80}
                className="h-11 text-[14px]"
              />
              {showError && trimmedTitle.length === 0 ? (
                <p className="mt-1 text-[11.5px] text-destructive">
                  Pon un título.
                </p>
              ) : null}
            </div>

            {/* Amount + currency */}
            <div className="mb-4 grid grid-cols-[1fr_auto] gap-2">
              <div>
                <Label
                  htmlFor="commitment-amount"
                  className="mb-1.5 block text-[12px]"
                >
                  Monto
                </Label>
                <Input
                  id="commitment-amount"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) =>
                    setAmount(e.target.value.replace(/[^0-9.,]/g, ""))
                  }
                  placeholder="0.00"
                  className="h-11 text-[14px] tabular-nums"
                />
                {showError && (!Number.isFinite(amountNum) || amountNum <= 0) ? (
                  <p className="mt-1 text-[11.5px] text-destructive">
                    Pon un monto mayor a cero.
                  </p>
                ) : null}
              </div>
              <div>
                <Label className="mb-1.5 block text-[12px]">Moneda</Label>
                <div className="flex h-11 overflow-hidden rounded-md border border-border">
                  {(["PEN", "USD"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCurrency(c)}
                      aria-pressed={currency === c}
                      className={cn(
                        "px-3 text-[12.5px] font-semibold transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        currency === c
                          ? "bg-foreground text-background"
                          : "bg-transparent text-foreground hover:bg-muted",
                      )}
                    >
                      {c === "PEN" ? "S/" : "$"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Due date */}
            <div className="mb-4">
              <Label
                htmlFor="commitment-due"
                className="mb-1.5 block text-[12px]"
              >
                Fecha
              </Label>
              <Input
                id="commitment-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-11 text-[14px]"
              />
            </div>

            {/* Recurrence — chips horizontales. */}
            <div className="mb-4">
              <Label className="mb-1.5 block text-[12px]">Recurrencia</Label>
              <div className="flex flex-wrap gap-2">
                {RECURRENCE_OPTIONS.map((r) => {
                  const selected = recurrence === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRecurrence(r)}
                      aria-pressed={selected}
                      className={cn(
                        "inline-flex h-9 items-center justify-center rounded-full border px-3 text-[12px] font-semibold transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-transparent text-foreground hover:bg-muted",
                      )}
                    >
                      {RECURRENCE_LABEL[r]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Categoria + cuenta — solo para payment/income. Reusa los
                pickers que ya tenemos en /movements para no construir UI
                duplicada. */}
            {showCategoryAccount ? (
              <div className="mb-4 grid grid-cols-2 gap-2">
                <div>
                  <Label className="mb-1.5 block text-[12px]">
                    Categoría (opcional)
                  </Label>
                  <button
                    type="button"
                    onClick={() => setCategoryPickerOpen(true)}
                    className="flex h-11 w-full items-center justify-between rounded-md border border-border bg-background px-3 text-left text-[13px] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className={cn(
                        "truncate",
                        categoryName ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {categoryName ?? "Elegir…"}
                    </span>
                  </button>
                </div>
                <div>
                  <Label className="mb-1.5 block text-[12px]">
                    Cuenta (opcional)
                  </Label>
                  <button
                    type="button"
                    onClick={() => setAccountPickerOpen(true)}
                    className="flex h-11 w-full items-center justify-between rounded-md border border-border bg-background px-3 text-left text-[13px] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className={cn(
                        "truncate",
                        accountName ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {accountName ?? "Elegir…"}
                    </span>
                  </button>
                </div>
              </div>
            ) : null}

            {/* Counterparty — solo para prestamos. */}
            {showCounterparty ? (
              <div className="mb-4">
                <Label
                  htmlFor="commitment-counterparty"
                  className="mb-1.5 block text-[12px]"
                >
                  ¿A quién? (opcional)
                </Label>
                <Input
                  id="commitment-counterparty"
                  value={counterparty}
                  onChange={(e) => setCounterparty(e.target.value)}
                  placeholder="Nombre de la otra parte"
                  maxLength={60}
                  className="h-11 text-[14px]"
                />
              </div>
            ) : null}

            {/* Reminder days — input numerico simple. */}
            <div className="mb-4">
              <Label
                htmlFor="commitment-remind"
                className="mb-1.5 block text-[12px]"
              >
                Avisarme con antelación
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="commitment-remind"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={30}
                  value={remindDays}
                  onChange={(e) => setRemindDays(e.target.value)}
                  className="h-11 w-24 text-[14px] tabular-nums"
                />
                <span className="text-[12.5px] text-muted-foreground">
                  días antes de la fecha
                </span>
              </div>
            </div>

            {/* Notes */}
            <div className="mb-4">
              <Label
                htmlFor="commitment-notes"
                className="mb-1.5 block text-[12px]"
              >
                Notas (opcional)
              </Label>
              <textarea
                id="commitment-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                rows={3}
                className="min-h-[72px] w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Ej. Vence el 12, llega por correo"
              />
            </div>

            <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-border bg-background px-4 py-3">
              <Button
                type="submit"
                disabled={submitting || !valid}
                className="h-11 w-full rounded-full text-[13px] font-semibold"
              >
                {submitting ? (
                  <>
                    <Loader2
                      size={14}
                      aria-hidden
                      className="mr-1.5 animate-spin"
                    />
                    Guardando…
                  </>
                ) : isEdit ? (
                  "Guardar cambios"
                ) : (
                  "Crear compromiso"
                )}
              </Button>
            </div>
          </form>
        </DrawerContent>
      </Drawer>

      {/* Pickers internos. */}
      {categoryPickerOpen ? (
        <CategoryFilterPicker
          open={categoryPickerOpen}
          onOpenChange={setCategoryPickerOpen}
          value={categoryId}
          onSelect={(id, name) => {
            setCategoryId(id);
            setCategoryName(name);
          }}
        />
      ) : null}
      {accountPickerOpen ? (
        <AccountFilterPicker
          open={accountPickerOpen}
          onOpenChange={setAccountPickerOpen}
          value={accountId}
          onSelect={(id, label) => {
            setAccountId(id);
            setAccountName(label);
          }}
        />
      ) : null}
    </>
  );
}

export default CommitmentFormSheet;

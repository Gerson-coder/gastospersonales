/**
 * TemplateFormSheet — Vaul drawer create/edit form para templates de
 * gastos/ingresos frecuentes.
 *
 * Form fields:
 *   - kind (Gasto/Ingreso) toggle
 *   - title
 *   - amount + currency
 *   - category (CategoryFilterPicker reusado de /movements)
 *   - account (AccountFilterPicker)
 *   - merchant opcional (drawer de comercios scoped a la categoria)
 *   - notes opcional
 *
 * Es PRESENTACIONAL — el padre maneja el submit y los toasts.
 */
"use client";

import * as React from "react";
import nextDynamic from "next/dynamic";
import { ArrowDownToLine, ArrowUpFromLine, Loader2, Store, X } from "lucide-react";

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
import { MerchantAvatar } from "@/components/kane/MerchantAvatar";
import { listMerchantsByCategory } from "@/lib/data/merchants";
import {
  type TemplateDraft,
  type TemplateView,
} from "@/lib/data/templates";
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
const MerchantsDrawer = nextDynamic(
  () => import("@/components/kane/MerchantsDrawer"),
  { ssr: false },
);

type CreateProps = {
  mode: "create";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitting?: boolean;
  defaultKind?: "expense" | "income";
  defaultCurrency?: "PEN" | "USD";
  onSubmit: (draft: TemplateDraft) => void;
};

type EditProps = {
  mode: "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitting?: boolean;
  initial: TemplateView;
  onSubmit: (draft: TemplateDraft) => void;
};

export type TemplateFormSheetProps = CreateProps | EditProps;

export function TemplateFormSheet(props: TemplateFormSheetProps) {
  const isEdit = props.mode === "edit";

  const [kind, setKind] = React.useState<"expense" | "income">(
    isEdit ? props.initial.kind : (props.defaultKind ?? "expense"),
  );
  const [title, setTitle] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [currency, setCurrency] = React.useState<"PEN" | "USD">(
    isEdit ? props.initial.currency : (props.defaultCurrency ?? "PEN"),
  );
  const [categoryId, setCategoryId] = React.useState<string | null>(null);
  const [categoryName, setCategoryName] = React.useState<string | null>(null);
  const [accountId, setAccountId] = React.useState<string | null>(null);
  const [accountName, setAccountName] = React.useState<string | null>(null);
  const [merchantId, setMerchantId] = React.useState<string | null>(null);
  const [merchantName, setMerchantName] = React.useState<string | null>(null);
  const [merchantLogoSlug, setMerchantLogoSlug] = React.useState<string | null>(
    null,
  );
  const [notes, setNotes] = React.useState("");

  const [categoryPickerOpen, setCategoryPickerOpen] = React.useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = React.useState(false);
  const [merchantsOpen, setMerchantsOpen] = React.useState(false);

  const [showError, setShowError] = React.useState(false);

  React.useEffect(() => {
    if (!props.open) return;
    setShowError(false);
    if (props.mode === "edit") {
      const i = props.initial;
      setKind(i.kind);
      setTitle(i.title);
      setAmount(i.amount.toFixed(2));
      setCurrency(i.currency);
      setCategoryId(i.categoryId);
      setCategoryName(i.categoryName);
      setAccountId(i.accountId);
      setAccountName(i.accountName);
      setMerchantId(i.merchantId);
      setMerchantName(i.merchantName);
      setMerchantLogoSlug(i.merchantLogoSlug);
      setNotes(i.note ?? "");
    } else {
      setKind(props.defaultKind ?? "expense");
      setTitle("");
      setAmount("");
      setCurrency(props.defaultCurrency ?? "PEN");
      setCategoryId(null);
      setCategoryName(null);
      setAccountId(null);
      setAccountName(null);
      setMerchantId(null);
      setMerchantName(null);
      setMerchantLogoSlug(null);
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

  const submitting = props.submitting === true;
  const trimmedTitle = title.trim();
  const amountNum = parseFloat(amount.replace(",", "."));

  const valid =
    trimmedTitle.length > 0 &&
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    accountId !== null;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    if (!valid) {
      setShowError(true);
      return;
    }
    props.onSubmit({
      title: trimmedTitle,
      kind,
      amount: amountNum,
      currency,
      categoryId,
      accountId,
      merchantId,
      note: notes.trim() || null,
    });
  }

  function clearMerchant() {
    setMerchantId(null);
    setMerchantName(null);
    setMerchantLogoSlug(null);
  }

  return (
    <Drawer open={props.open} onOpenChange={props.onOpenChange}>
      <DrawerContent
        aria-describedby="template-form-desc"
        className="bg-background md:!max-w-2xl"
      >
        <DrawerHeader className="text-left">
          <DrawerTitle className="font-sans not-italic text-base font-semibold">
            {isEdit ? "Editar template" : "Nuevo template"}
          </DrawerTitle>
          <DrawerDescription
            id="template-form-desc"
            className="text-[12px]"
          >
            {isEdit
              ? "Cambia los detalles del template."
              : "Guarda un gasto o ingreso frecuente para registrarlo con un solo tap."}
          </DrawerDescription>
        </DrawerHeader>

        <form onSubmit={handleSubmit} className="overflow-y-auto px-4 pb-4">
          {/* Kind toggle */}
          <fieldset className="mb-5">
            <legend className="sr-only">Tipo de movimiento</legend>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  {
                    id: "expense",
                    label: "Gasto",
                    icon: ArrowUpFromLine,
                  },
                  {
                    id: "income",
                    label: "Ingreso",
                    icon: ArrowDownToLine,
                  },
                ] as const
              ).map((opt) => {
                const Icon = opt.icon;
                const selected = kind === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setKind(opt.id)}
                    aria-pressed={selected}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-2xl border px-3 py-3 text-[13px] font-semibold transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "border-foreground bg-muted shadow-sm"
                        : "border-border hover:bg-muted/60",
                    )}
                  >
                    <Icon size={16} aria-hidden />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Title */}
          <div className="mb-4">
            <Label
              htmlFor="template-title"
              className="mb-1.5 block text-[12px]"
            >
              Título
            </Label>
            <Input
              id="template-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                kind === "expense" ? "Ej. Café Starbucks" : "Ej. Pago freelance"
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
                htmlFor="template-amount"
                className="mb-1.5 block text-[12px]"
              >
                Monto
              </Label>
              <Input
                id="template-amount"
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

          {/* Category + Account */}
          <div className="mb-4 grid grid-cols-2 gap-2">
            <div>
              <Label className="mb-1.5 block text-[12px]">
                Categoría
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
              <Label className="mb-1.5 block text-[12px]">Cuenta</Label>
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
              {showError && accountId === null ? (
                <p className="mt-1 text-[11.5px] text-destructive">
                  Elige una cuenta.
                </p>
              ) : null}
            </div>
          </div>

          {/* Merchant — solo aparece cuando hay categoria; sin categoria
              no podemos abrir el drawer de comercios (es scoped). */}
          <div className="mb-4">
            <Label className="mb-1.5 block text-[12px]">
              Comercio (opcional)
            </Label>
            {categoryId ? (
              <div className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => setMerchantsOpen(true)}
                  className="flex h-11 flex-1 items-center gap-2 rounded-md border border-border bg-background px-3 text-left text-[13px] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {merchantName ? (
                    <>
                      <MerchantAvatar
                        name={merchantName}
                        logoSlug={merchantLogoSlug}
                        size="sm"
                      />
                      <span className="truncate text-foreground">
                        {merchantName}
                      </span>
                    </>
                  ) : (
                    <>
                      <Store
                        size={14}
                        aria-hidden
                        className="text-muted-foreground"
                      />
                      <span className="truncate text-muted-foreground">
                        Elegir comercio
                      </span>
                    </>
                  )}
                </button>
                {merchantId ? (
                  <button
                    type="button"
                    onClick={clearMerchant}
                    aria-label="Quitar comercio"
                    className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X size={14} aria-hidden />
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="text-[11.5px] text-muted-foreground">
                Elige una categoría primero para asociar un comercio.
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="mb-4">
            <Label
              htmlFor="template-notes"
              className="mb-1.5 block text-[12px]"
            >
              Notas (opcional)
            </Label>
            <textarea
              id="template-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={3}
              className="min-h-[72px] w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Ej. Cafe vainilla grande"
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
              ) : (
                "Guardar template"
              )}
            </Button>
          </div>
        </form>

        {categoryPickerOpen ? (
          <CategoryFilterPicker
            nested
            open={categoryPickerOpen}
            onOpenChange={setCategoryPickerOpen}
            value={categoryId}
            onSelect={(id, name) => {
              setCategoryId(id);
              setCategoryName(name);
              // El merchant es scoped por categoria; cambiar la
              // categoria invalida la seleccion previa.
              clearMerchant();
            }}
          />
        ) : null}
        {accountPickerOpen ? (
          <AccountFilterPicker
            nested
            open={accountPickerOpen}
            onOpenChange={setAccountPickerOpen}
            value={accountId}
            onSelect={(id, label) => {
              setAccountId(id);
              setAccountName(label);
            }}
          />
        ) : null}
        {merchantsOpen && categoryId && categoryName ? (
          <MerchantsDrawer
            open={merchantsOpen}
            onOpenChange={setMerchantsOpen}
            categoryId={categoryId}
            categoryName={categoryName}
            selectedMerchantId={merchantId}
            onSelect={(id) => {
              setMerchantId(id);
              if (id === null) {
                setMerchantName(null);
                setMerchantLogoSlug(null);
                return;
              }
              // El drawer solo nos da el id — buscamos el nombre y
              // logo en la lista de la categoria para mostrar el chip
              // del comercio seleccionado al cerrar el drawer.
              void listMerchantsByCategory(categoryId)
                .then((rows) => {
                  const m = rows.find((r) => r.id === id);
                  if (!m) return;
                  setMerchantName(m.name);
                  setMerchantLogoSlug(m.logo_slug ?? null);
                })
                .catch(() => {
                  // Silenciamos — el id quedo, solo no resolvimos
                  // el nombre. Aparece en blanco hasta que el user
                  // re-abra el drawer.
                });
            }}
            onMerchantCreated={(m) => {
              setMerchantId(m.id);
              setMerchantName(m.name);
              setMerchantLogoSlug(m.logo_slug ?? null);
            }}
          />
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}

export default TemplateFormSheet;

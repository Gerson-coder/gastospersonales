/**
 * CategoryFormSheet — Sheet-based create/edit form for a category.
 *
 * Two modes via the `mode` prop:
 *   - "create": shows name + kind toggle + icon picker. Calls `onSubmit` with
 *     a CategoryDraft.
 *   - "edit":   shows name + icon picker (kind is immutable post-create) +
 *     Archive button. Calls `onSubmit` with a CategoryPatch and `onArchive`
 *     when the user taps Archive. System rows render in a calm info card
 *     instead of a disabled form (parent enforces by passing `readOnly`).
 *
 * Kept presentational: no Supabase calls inside. Parent owns submit state and
 * toasts. The sheet's internal form state is reset every time the sheet
 * opens — so closing via swipe/escape behaves the same as Cancelar.
 */
"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  CATEGORY_ICONS,
  DEFAULT_CATEGORY_ICON,
  getCategoryIcon,
} from "@/lib/category-icons";
import type { CategoryKind } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

type CreateProps = {
  mode: "create";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitting?: boolean;
  onSubmit: (draft: { name: string; kind: CategoryKind; icon: string }) => void;
};

type EditProps = {
  mode: "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitting?: boolean;
  initial: { name: string; icon: string | null; kind: CategoryKind };
  /** When true, render the calm read-only info card (system categories). */
  readOnly?: boolean;
  onSubmit: (patch: { name: string; icon: string }) => void;
  onArchive: () => void;
};

type Props = CreateProps | EditProps;

const NAME_MAX_LENGTH = 32;

export function CategoryFormSheet(props: Props) {
  const isEdit = props.mode === "edit";

  // Local form state — initialised on open from `initial` (edit) or defaults
  // (create). Reset every time the sheet opens so an aborted edit (cancel,
  // swipe, escape) doesn't leak into the next session.
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<CategoryKind>("expense");
  const [icon, setIcon] = React.useState<string>(DEFAULT_CATEGORY_ICON);
  // Validation surfaces only after the user touches Save once — saves them
  // from a red error blooming the moment they open the sheet.
  const [showError, setShowError] = React.useState(false);
  // Inline archive confirm — opens a small "¿Archivar?" row instead of a
  // second sheet. Reset on open so a previous abort doesn't pre-arm.
  const [archiveArmed, setArchiveArmed] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!props.open) return;
    if (props.mode === "edit") {
      setName(props.initial.name);
      setKind(props.initial.kind);
      setIcon(props.initial.icon ?? DEFAULT_CATEGORY_ICON);
    } else {
      setName("");
      setKind("expense");
      setIcon(DEFAULT_CATEGORY_ICON);
    }
    setShowError(false);
    setArchiveArmed(false);
    // Focus the name input shortly after the portal mounts. autoFocus is
    // unreliable inside Base UI's portaled Dialog, so we drive it manually.
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      if (props.mode === "edit") inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
    // We intentionally re-run when the sheet opens or the initial values change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

  const trimmed = name.trim();
  const readOnly = isEdit && props.readOnly === true;
  const nameInvalid = trimmed.length === 0;
  const submitting = props.submitting === true;
  // Char counter only when the user is closing in on the cap, otherwise the
  // form looks visually noisy on a calm sheet.
  const nameRemaining = NAME_MAX_LENGTH - name.length;
  const showNameCounter = nameRemaining <= 5;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || readOnly) return;
    if (nameInvalid) {
      setShowError(true);
      inputRef.current?.focus();
      return;
    }
    if (props.mode === "create") {
      props.onSubmit({ name: trimmed, kind, icon });
    } else {
      props.onSubmit({ name: trimmed, icon });
    }
  }

  function handleArchiveClick() {
    if (!isEdit || readOnly || submitting) return;
    if (!archiveArmed) {
      setArchiveArmed(true);
      return;
    }
    (props as EditProps).onArchive();
  }

  const titleId = isEdit ? "category-edit-title" : "category-create-title";
  const title = isEdit ? "Editar categoría" : "Nueva categoría";
  const description = readOnly
    ? "Las categorías del sistema están disponibles para todos."
    : isEdit
      ? "Cambia el nombre o el ícono. El tipo no se puede modificar."
      : "Elige un nombre, un tipo y un ícono.";

  // Read-only info card for system categories — replaces the disabled form
  // with a single, calm presentation of the category + a Cerrar button.
  if (readOnly && isEdit) {
    const SystemIcon = getCategoryIcon(props.initial.icon ?? DEFAULT_CATEGORY_ICON);
    return (
      <Sheet open={props.open} onOpenChange={props.onOpenChange}>
        <SheetContent
          side="bottom"
          aria-labelledby={titleId}
          className="rounded-t-3xl px-5 pb-6 pt-2 md:max-w-md"
        >
          <SheetHeader className="px-0">
            <SheetTitle id={titleId} className="font-sans not-italic text-base font-semibold">{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>

          <div className="mt-2 flex items-center gap-4 rounded-2xl border border-border bg-muted/40 px-4 py-4">
            <span
              aria-hidden="true"
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-card text-foreground shadow-[var(--shadow-xs)]"
            >
              <SystemIcon size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold">
                {props.initial.name}
              </div>
              <div className="text-[12px] text-muted-foreground">
                {props.initial.kind === "income" ? "Ingreso" : "Gasto"} ·
                Categoría del sistema
              </div>
            </div>
          </div>

          <p className="mt-3 text-[12px] leading-snug text-muted-foreground">
            Esta categoría viene incluida con Lumi. No se puede editar ni
            archivar — pero puedes crear las tuyas para personalizar tus listas.
          </p>

          <SheetFooter className="mt-4 flex-col-reverse gap-2 px-0 md:flex-row md:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => props.onOpenChange(false)}
              className="min-h-11"
            >
              Cerrar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  const errorId = "category-name-error";

  return (
    <Sheet open={props.open} onOpenChange={props.onOpenChange}>
      <SheetContent
        side="bottom"
        aria-labelledby={titleId}
        className="rounded-t-3xl px-5 pb-6 pt-2 md:max-w-md"
      >
        <form onSubmit={handleSubmit} aria-busy={submitting}>
          <SheetHeader className="px-0">
            <SheetTitle id={titleId} className="font-sans not-italic text-base font-semibold">{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>

          <div className="mt-2 flex flex-col gap-4 px-0 pb-2">
            {/* Name */}
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <Label
                  htmlFor="category-name-input"
                  className="block text-[13px] font-semibold"
                >
                  Nombre
                </Label>
                {showNameCounter ? (
                  <span
                    aria-live="polite"
                    className={cn(
                      "text-[11px] tabular-nums",
                      nameRemaining < 0
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {nameRemaining}
                  </span>
                ) : null}
              </div>
              <Input
                id="category-name-input"
                ref={inputRef}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (showError && e.target.value.trim().length > 0) {
                    setShowError(false);
                  }
                }}
                onBlur={() => {
                  if (nameInvalid) setShowError(true);
                }}
                maxLength={NAME_MAX_LENGTH}
                autoComplete="off"
                placeholder="Ej. Mascotas"
                disabled={submitting}
                aria-invalid={showError && nameInvalid}
                aria-describedby={
                  showError && nameInvalid ? errorId : undefined
                }
                className={cn(
                  "h-11 text-[15px]",
                  showError && nameInvalid && "border-destructive focus-visible:ring-destructive",
                )}
              />
              {showError && nameInvalid ? (
                <span
                  id={errorId}
                  role="alert"
                  className="mt-1.5 block text-[12px] font-medium text-destructive"
                >
                  Necesita un nombre para guardarla.
                </span>
              ) : null}
            </div>

            {/* Kind toggle — only when creating */}
            {props.mode === "create" ? (
              <fieldset>
                <legend className="mb-1.5 text-[13px] font-semibold">
                  Tipo
                </legend>
                <div
                  role="radiogroup"
                  aria-label="Tipo de categoría"
                  className="flex h-10 items-center gap-0.5 rounded-full bg-muted p-0.5"
                >
                  <KindOption
                    label="Gasto"
                    selected={kind === "expense"}
                    onClick={() => setKind("expense")}
                    disabled={submitting}
                  />
                  <KindOption
                    label="Ingreso"
                    selected={kind === "income"}
                    onClick={() => setKind("income")}
                    disabled={submitting}
                  />
                </div>
              </fieldset>
            ) : null}

            {/* Icon picker — selection feels like picking, not inspecting:
                scale-up + primary-soft tint mirror the CATEGORY_TINT vibe. */}
            <fieldset>
              <legend className="mb-1.5 text-[13px] font-semibold">
                Ícono
              </legend>
              <div
                role="radiogroup"
                aria-label="Ícono de la categoría"
                className="grid max-h-[224px] grid-cols-4 gap-2 overflow-y-auto pr-1 [-ms-overflow-style:none] [scrollbar-width:thin]"
              >
                {CATEGORY_ICONS.map((choice) => {
                  const Icon = choice.Icon;
                  const selected = icon === choice.name;
                  return (
                    <button
                      key={choice.name}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={choice.label}
                      disabled={submitting}
                      onClick={() => setIcon(choice.name)}
                      className={cn(
                        "flex h-12 items-center justify-center rounded-xl border transition-[transform,background-color,border-color,color] duration-150 ease-out",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                        selected
                          ? "scale-[1.04] border-transparent bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)] shadow-[var(--shadow-xs)]"
                          : "border-border bg-card text-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Icon size={18} aria-hidden />
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Inline archive confirm — appears in-place on first Archive tap.
                Keeps the action calm and reversible without stacking sheets. */}
            {isEdit && archiveArmed && !readOnly ? (
              <div
                role="alert"
                className="flex flex-col gap-2 rounded-2xl border border-destructive/30 bg-[var(--color-destructive-soft)] px-3.5 py-3 text-[13px] text-foreground"
              >
                <p className="font-semibold leading-snug">
                  ¿Archivar esta categoría?
                </p>
                <p className="text-[12px] leading-snug text-muted-foreground">
                  La ocultamos de las listas. Tus movimientos pasados la
                  conservan.
                </p>
                <div className="mt-1 flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setArchiveArmed(false)}
                    disabled={submitting}
                    className="min-h-9 flex-1"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleArchiveClick}
                    disabled={submitting}
                    className="min-h-9 flex-1"
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={14} aria-hidden className="animate-spin" />
                        <span className="ml-1.5">Archivando…</span>
                      </>
                    ) : (
                      "Archivar"
                    )}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <SheetFooter className="px-0 flex-col-reverse gap-2 md:flex-row md:justify-end">
            {isEdit && !readOnly && !archiveArmed ? (
              <Button
                type="button"
                variant="outline"
                onClick={handleArchiveClick}
                disabled={submitting}
                className="min-h-11 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                Archivar
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={() => props.onOpenChange(false)}
              disabled={submitting}
              className="min-h-11"
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting} className="min-h-11">
              {submitting ? (
                <>
                  <Loader2 size={14} aria-hidden className="animate-spin" />
                  <span className="ml-1.5">Guardando…</span>
                </>
              ) : (
                "Guardar"
              )}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function KindOption({
  label,
  selected,
  onClick,
  disabled,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-9 flex-1 rounded-full px-3.5 text-xs font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? "bg-card text-foreground shadow-[var(--shadow-xs)]"
          : "text-muted-foreground",
      )}
    >
      {label}
    </button>
  );
}

// Re-export so consumers don't need a second import for the icon resolver.
export { getCategoryIcon };

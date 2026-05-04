/**
 * MerchantFormSheet — Sheet-based create/edit form for a merchant.
 *
 * Mirrors {@link CategoryFormSheet} in structure, focus management, and
 * a11y. Differences vs. the categories form:
 *   - No `kind` toggle (kind is inherited from the parent category).
 *   - No icon picker (avatars are deterministic from the name — see
 *     {@link getMerchantAvatar}). The form shows a live avatar preview that
 *     updates as the user types so they can see the tint they'll get.
 *   - System merchants (`user_id IS NULL`) render in a calm read-only info
 *     card, never as a disabled form.
 *   - Validation: trimmed non-empty, max 64 chars (matches the DB CHECK in
 *     `00006_merchants.sql`).
 *
 * Kept presentational: no Supabase calls inside. Parent owns submit state
 * and toasts. Form state is reset every time the sheet opens so an aborted
 * edit (cancel/swipe/escape) doesn't leak into the next session.
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
import { MerchantAvatar } from "@/components/kane/MerchantAvatar";
import { cn } from "@/lib/utils";

type CreateProps = {
  mode: "create";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitting?: boolean;
  /** Category the new merchant will live in — used in the header copy. */
  categoryId: string;
  categoryName: string;
  onSubmit: (draft: { name: string }) => void;
};

type EditProps = {
  mode: "edit";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitting?: boolean;
  initial: { name: string };
  /** When true, render the calm read-only info card (system merchants). */
  readOnly?: boolean;
  onSubmit: (patch: { name: string }) => void;
  onArchive: () => void;
};

type Props = CreateProps | EditProps;

const NAME_MAX_LENGTH = 64;

export function MerchantFormSheet(props: Props) {
  const isEdit = props.mode === "edit";

  // Local form state — initialised on open from `initial` (edit) or empty
  // (create). Reset every time the sheet opens.
  const [name, setName] = React.useState("");
  // Validation surfaces only after the user touches Save once — keeps the
  // sheet calm on open.
  const [showError, setShowError] = React.useState(false);
  // Inline archive confirm — opens a small "¿Archivar?" row instead of a
  // second sheet. Reset on open so a previous abort doesn't pre-arm.
  const [archiveArmed, setArchiveArmed] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!props.open) return;
    if (props.mode === "edit") {
      setName(props.initial.name);
    } else {
      setName("");
    }
    setShowError(false);
    setArchiveArmed(false);
    // Focus the name input once the portal mounts AND the sheet's
    // slide-in animation finishes. requestAnimationFrame fired too
    // early — the input was technically focused but the Base UI Dialog
    // was still mid-transition (data-starting-style:opacity-0,
    // duration-200), so on mobile the keyboard never came up and the
    // user had to tap the input again to "wake it up". setTimeout with
    // a 250ms delay covers the Sheet's 200ms animation + a small buffer.
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      if (props.mode === "edit") inputRef.current?.select();
    }, 250);
    return () => window.clearTimeout(id);
    // We intentionally re-run when the sheet opens or the initial values change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.open]);

  const trimmed = name.trim();
  const readOnly = isEdit && props.readOnly === true;
  const nameInvalid = trimmed.length === 0;
  const submitting = props.submitting === true;
  // Counter only when nearing the cap — keeps the sheet calm by default.
  const nameRemaining = NAME_MAX_LENGTH - name.length;
  const showNameCounter = nameRemaining <= 8;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || readOnly) return;
    if (nameInvalid) {
      setShowError(true);
      inputRef.current?.focus();
      return;
    }
    if (props.mode === "create") {
      props.onSubmit({ name: trimmed });
    } else {
      props.onSubmit({ name: trimmed });
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

  const titleId = isEdit ? "merchant-edit-title" : "merchant-create-title";
  const title = isEdit ? "Editar comercio" : "Nuevo comercio";
  const description = readOnly
    ? "Los comercios del sistema están disponibles para todos."
    : isEdit
      ? "Cambia el nombre. La categoría no se puede mover desde acá."
      : props.mode === "create"
        ? `Nuevo comercio en ${props.categoryName}.`
        : "";

  // Read-only info card for system merchants — replaces the disabled form
  // with a single, calm presentation of the merchant + a Cerrar button.
  if (readOnly && isEdit) {
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
            <MerchantAvatar name={props.initial.name} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold">
                {props.initial.name}
              </div>
              <div className="text-[12px] text-muted-foreground">
                Comercio del sistema
              </div>
            </div>
          </div>

          <p className="mt-3 text-[12px] leading-snug text-muted-foreground">
            Este comercio viene incluido con Kane. No se puede editar ni
            archivar — pero puedes crear los tuyos para personalizar tus listas.
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

  const errorId = "merchant-name-error";
  // Live avatar preview — falls back to a sensible placeholder so the
  // circle never renders as "?" while the user is mid-type. We pass the
  // raw `name` (not trimmed) so the tint updates in real-time.
  const previewName = trimmed.length > 0 ? name : "Nuevo";

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
            {/* Name — wrapper completo es clickable y delega focus al
                input. Sin esto, el user reportaba tener que tap en un
                pixel exacto del input (h-11 dejaba un area chica). El
                onClick redirige cualquier tap dentro del bloque al
                input, asi tap en el label, en la fila del counter o
                cerca del borde dispara teclado igual. */}
            <div
              onClick={() => inputRef.current?.focus()}
              className="cursor-text"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <Label
                  htmlFor="merchant-name-input"
                  className="block cursor-text text-[13px] font-semibold"
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
                id="merchant-name-input"
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
                inputMode="text"
                placeholder="Ej. KFC"
                disabled={submitting}
                aria-invalid={showError && nameInvalid}
                aria-describedby={
                  showError && nameInvalid ? errorId : undefined
                }
                className={cn(
                  // h-12 (48px) en lugar de h-11 — el min-tap-target
                  // recomendado por iOS/Android es 44-48px. h-11 quedaba
                  // justo en el borde y en pantallas con DPI alto el
                  // user perdia el target con facilidad.
                  "h-12 text-[15px]",
                  showError && nameInvalid && "border-destructive focus-visible:ring-destructive",
                )}
              />
              {showError && nameInvalid ? (
                <span
                  id={errorId}
                  role="alert"
                  className="mt-1.5 block text-[12px] font-medium text-destructive"
                >
                  Necesita un nombre para guardarlo.
                </span>
              ) : null}
            </div>

            {/* Live avatar preview — replaces the icon picker. The tint and
                initials shift as the user types so they see what the chip
                will look like before saving. */}
            <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 px-3.5 py-3">
              <MerchantAvatar name={previewName} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold leading-snug">
                  {trimmed.length > 0 ? trimmed : "Avatar"}
                </div>
                <div className="text-[11px] leading-snug text-muted-foreground">
                  Avatar generado automáticamente.
                </div>
              </div>
            </div>

            {/* Inline archive confirm — appears in-place on first Archive
                tap. Keeps the action calm and reversible without stacking
                sheets. */}
            {isEdit && archiveArmed && !readOnly ? (
              <div
                role="alert"
                className="flex flex-col gap-2 rounded-2xl border border-destructive/30 bg-[var(--color-destructive-soft)] px-3.5 py-3 text-[13px] text-foreground"
              >
                <p className="font-semibold leading-snug">
                  ¿Archivar este comercio?
                </p>
                <p className="text-[12px] leading-snug text-muted-foreground">
                  Lo ocultamos de las listas. Tus movimientos pasados lo
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
                Archivar comercio
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

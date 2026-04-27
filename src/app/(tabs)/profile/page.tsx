/**
 * Profile route — Lumi
 *
 * Standalone "Perfil" surface, lifted out of /settings so it can live as its
 * own destination from the ProfileMenu dropdown. Hosts identity (avatar +
 * name + email + edit) and read-only account metadata (user id, member
 * since). Settings keeps the rest (categorías, preferencias, sobre la app,
 * cerrar sesión).
 *
 * Reachable via the avatar in the AppHeader → Perfil. Not added to the
 * TabBar — this is a secondary destination, not a primary tab.
 */

"use client";

import * as React from "react";
import { toast } from "sonner";
import { Camera, Copy, Loader2, Pencil, Trash2 } from "lucide-react";

import { AppHeader } from "@/components/lumi/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { removeAvatar, uploadAvatar } from "@/lib/data/avatar";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/use-session";
import { useUserName } from "@/lib/use-user-name";

// Mirrors /login + /settings: when env vars are absent we hide DB-backed
// metadata since there is no profile row to read from. Identity card still
// works via localStorage (useUserName) so demo users keep a usable surface.
const SUPABASE_ENABLED =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;

const NAME_MAX_LENGTH = 40;
const FALLBACK_USER_NAME = "Sin nombre";
const FALLBACK_USER_EMAIL = "—";

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const memberSinceFormatter = new Intl.DateTimeFormat("es-PE", {
  dateStyle: "long",
});

function formatMemberSince(isoDate: string | undefined): string | null {
  if (!isoDate) return null;
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) return null;
  return memberSinceFormatter.format(parsed);
}

function shortenUserId(id: string): string {
  if (id.length <= 8) return id;
  return `${id.slice(0, 8)}…`;
}

// ─── Page ──────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const session = useSession();
  const { name, avatarUrl, setName, hydrated: nameHydrated } = useUserName();

  const [editOpen, setEditOpen] = React.useState(false);
  const [draftName, setDraftName] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const nameInputRef = React.useRef<HTMLInputElement | null>(null);

  // Avatar upload state. The hidden <input type="file"> is driven via ref
  // so we can put the user-facing affordance inside a styled <Button>.
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [avatarBusy, setAvatarBusy] = React.useState(false);
  const [imgFailed, setImgFailed] = React.useState(false);
  // Reset the broken-image flag whenever the URL changes (e.g. after a
  // successful upload that replaces a previously failing URL).
  React.useEffect(() => {
    setImgFailed(false);
  }, [avatarUrl]);

  async function handleAvatarFileChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    // Always clear the input value so picking the SAME file twice in a row
    // still triggers `onChange` (browsers skip identical-value events).
    event.target.value = "";
    if (!file) return;
    setAvatarBusy(true);
    try {
      await uploadAvatar(file);
      await session.refresh();
      toast.success("Foto actualizada");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No pudimos subir la imagen.";
      toast.error("No se pudo actualizar tu foto", { description: message });
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleAvatarRemove() {
    setAvatarBusy(true);
    try {
      await removeAvatar();
      await session.refresh();
      toast.success("Foto eliminada");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "No pudimos quitar la imagen.";
      toast.error("No se pudo quitar tu foto", { description: message });
    } finally {
      setAvatarBusy(false);
    }
  }

  // When the edit sheet opens, focus the input. autoFocus inside portaled
  // Dialogs is unreliable, so we drive focus imperatively after the next
  // animation frame.
  React.useEffect(() => {
    if (!editOpen) return;
    const id = window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [editOpen]);

  function openEditProfile() {
    setDraftName(name ?? "");
    setEditOpen(true);
  }

  async function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = draftName.trim();
    if (!trimmed) return;
    // Optimistic close: useUserName.setName flips state before the round-trip,
    // so the new name is already on screen. We only revert + reopen on
    // failure. `prevName` is captured BEFORE the call so rollback can reapply.
    const prevName = name ?? "";
    setEditOpen(false);
    setSubmitting(true);
    try {
      await setName(trimmed);
      toast.success("Nombre actualizado");
    } catch {
      try {
        await setName(prevName);
      } catch {
        /* nested rollback failure: nothing actionable, the toast covers it */
      }
      setDraftName(trimmed);
      setEditOpen(true);
      toast.error("No se pudo guardar tu nombre", {
        description: "Reintentá en un momento.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopyUserId() {
    const userId = session.user?.id;
    if (!userId) return;
    try {
      await navigator.clipboard.writeText(userId);
      toast.success("ID copiado");
    } catch {
      toast.error("No se pudo copiar el ID");
    }
  }

  const displayName = nameHydrated ? (name ?? FALLBACK_USER_NAME) : " ";
  const displayInitials = nameHydrated && name ? deriveInitials(name) : "?";
  const displayEmail = session.hydrated
    ? (session.user?.email ?? FALLBACK_USER_EMAIL)
    : " ";
  const trimmedDraft = draftName.trim();
  const canSubmitName = trimmedDraft.length > 0 && !submitting;

  // Identity card waits for the name hook (and, when wired, the session) so
  // we don't show "?" + "—" placeholders before the first paint resolves.
  const identityReady = nameHydrated && (!SUPABASE_ENABLED || session.hydrated);

  const userId = session.user?.id ?? null;
  const memberSince = formatMemberSince(session.profile?.created_at);

  return (
    <main className="relative min-h-dvh bg-background pb-32 text-foreground">
      <div className="mx-auto w-full max-w-[720px] space-y-6 px-5 pt-6 md:max-w-3xl md:space-y-10 md:px-8 md:pt-10">
        <AppHeader
          eyebrow="Tu cuenta"
          title="Perfil"
          titleStyle="page"
          className="px-0 pt-0"
        />

        {/* Identity */}
        <section aria-labelledby="profile-identity" className="mt-2">
          <h2
            id="profile-identity"
            className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
          >
            Quién eres
          </h2>
          <Card className="rounded-2xl border-border p-5 md:p-6">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:gap-6">
              {identityReady ? (
                <div
                  aria-hidden="true"
                  className="relative flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)] text-xl font-bold md:h-20 md:w-20 md:text-2xl"
                >
                  {avatarUrl && !imgFailed ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={() => setImgFailed(true)}
                    />
                  ) : (
                    displayInitials
                  )}
                  {avatarBusy ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                      <Loader2 size={20} className="animate-spin" aria-hidden="true" />
                    </span>
                  ) : null}
                </div>
              ) : (
                <Skeleton className="h-16 w-16 flex-shrink-0 rounded-full md:h-20 md:w-20" />
              )}
              <div className="min-w-0 flex-1 space-y-1.5">
                {identityReady ? (
                  <>
                    <div className="truncate text-lg font-bold md:text-xl">
                      {displayName}
                    </div>
                    <div className="truncate text-sm text-muted-foreground">
                      {displayEmail}
                    </div>
                  </>
                ) : (
                  <>
                    <Skeleton className="h-5 w-40 rounded" />
                    <Skeleton className="h-3.5 w-56 rounded" />
                  </>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openEditProfile}
                disabled={!identityReady}
                aria-label="Editar nombre"
                className="min-h-11 self-start rounded-full px-4 md:self-auto"
              >
                <Pencil size={14} aria-hidden="true" />
                <span className="ml-1.5">Editar nombre</span>
              </Button>
            </div>

            {/* Avatar actions — only shown when Supabase is wired since the
                upload requires an authenticated session and persists to the
                avatars Storage bucket. */}
            {SUPABASE_ENABLED ? (
              <div className="mt-5 border-t border-border pt-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!identityReady || avatarBusy}
                    className="min-h-11 rounded-full px-4"
                  >
                    {avatarBusy ? (
                      <Loader2
                        size={14}
                        aria-hidden="true"
                        className="animate-spin"
                      />
                    ) : (
                      <Camera size={14} aria-hidden="true" />
                    )}
                    <span className="ml-1.5">
                      {avatarUrl ? "Cambiar foto" : "Subir foto"}
                    </span>
                  </Button>
                  {avatarUrl ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleAvatarRemove}
                      disabled={!identityReady || avatarBusy}
                      className="min-h-11 rounded-full px-3 text-muted-foreground hover:text-foreground"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                      <span className="ml-1.5">Quitar</span>
                    </Button>
                  ) : null}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={handleAvatarFileChange}
                  />
                </div>
                <p className="mt-2 text-[12px] text-muted-foreground">
                  PNG, JPEG o WebP. Máximo 2 MB.
                </p>
              </div>
            ) : null}
          </Card>
        </section>

        {/* Account metadata — only meaningful when a real Supabase session
            exists. In demo mode there is no DB row to read, so we hide it
            entirely rather than render placeholder noise. */}
        {SUPABASE_ENABLED ? (
          <section aria-labelledby="profile-meta" className="mt-8">
            <h2
              id="profile-meta"
              className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
            >
              Sobre tu cuenta
            </h2>
            <Card className="overflow-hidden rounded-2xl border-border p-0">
              <dl className="divide-y divide-border" role="list">
                <div className="flex min-h-[56px] items-center gap-3 px-4 py-3">
                  <dt className="text-[13px] font-semibold">ID de usuario</dt>
                  <dd className="ml-auto flex items-center gap-2">
                    {session.hydrated && userId ? (
                      <>
                        <span className="font-mono text-[12px] tabular-nums text-muted-foreground">
                          {shortenUserId(userId)}
                        </span>
                        <button
                          type="button"
                          onClick={handleCopyUserId}
                          aria-label="Copiar ID de usuario"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Copy size={14} aria-hidden="true" />
                        </button>
                      </>
                    ) : session.hydrated ? (
                      <span className="text-[12px] text-muted-foreground">—</span>
                    ) : (
                      <Skeleton className="h-4 w-24 rounded" />
                    )}
                  </dd>
                </div>
                <div className="flex min-h-[56px] items-center gap-3 px-4 py-3">
                  <dt className="text-[13px] font-semibold">Miembro desde</dt>
                  <dd className="ml-auto">
                    {session.hydrated ? (
                      <span className="text-[13px] text-muted-foreground">
                        {memberSince ?? "—"}
                      </span>
                    ) : (
                      <Skeleton className="h-4 w-32 rounded" />
                    )}
                  </dd>
                </div>
              </dl>
            </Card>
            <Separator className="mt-6 opacity-0" aria-hidden="true" />
          </section>
        ) : null}
      </div>

      {/* Edit name Sheet */}
      <Sheet
        open={editOpen}
        onOpenChange={(open) => {
          // Block close while submitting so the optimistic flow can finish
          // its rollback path cleanly.
          if (submitting && !open) return;
          setEditOpen(open);
        }}
      >
        <SheetContent
          side="bottom"
          aria-labelledby="editname-title"
          className="rounded-t-3xl px-5 pb-6 pt-2 md:max-w-md"
        >
          <form onSubmit={handleEditSubmit} aria-busy={submitting}>
            <SheetHeader className="px-0">
              <SheetTitle id="editname-title">Editar nombre</SheetTitle>
              <SheetDescription>
                Así te llamamos en Lumi. Puedes cambiarlo cuando quieras.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-2 px-0 pb-2">
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
            <SheetFooter className="px-0 flex-col-reverse gap-2 md:flex-row md:justify-end">
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
    </main>
  );
}

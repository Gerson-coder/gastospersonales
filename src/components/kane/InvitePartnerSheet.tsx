/**
 * InvitePartnerSheet — drawer para generar y compartir el link de
 * invitacion a una cuenta compartida.
 *
 * Flow:
 *   1. Al abrir, si ya hay una invitacion pendiente para esta
 *      cuenta, la mostramos (no creamos otra). Esto evita ensuciar
 *      la tabla de invitations cada vez que el user abre el drawer.
 *   2. Si no hay pendiente, mostramos un CTA "Generar link" que
 *      crea uno nuevo. Tras crear, swap a la pantalla de "compartir".
 *   3. Pantalla de compartir: link visible (input readonly + boton
 *      copiar), boton "Compartir por WhatsApp" (deep link wa.me),
 *      boton "Compartir" via Web Share API (cuando esta disponible),
 *      info de "expira en 7 dias", boton "Cancelar invitacion".
 *
 * Estados: idle / loading / generated / generating-error.
 *
 * Reusa el lenguaje visual de los otros drawers (vaul + rounded-2xl).
 */
"use client";

import * as React from "react";
import {
  AlertCircle,
  Check,
  Copy,
  Heart,
  Loader2,
  MessageCircle,
  Share2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  buildInvitationUrl,
  createInvitation,
  listPendingInvitations,
  revokeInvitation,
  type AccountInvitation,
} from "@/lib/data/partnerships";
import { cn } from "@/lib/utils";

export type InvitePartnerSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  accountLabel: string;
};

/**
 * Sanitiza el nombre de cuenta antes de meterlo en cualquier texto que
 * vaya a una app de chat. Comillas tipograficas, slashes y backslashes
 * rompen el autodetector de URLs en Yape (chat interno), Messenger y
 * algunos clientes de Telegram, dejando el link como texto plano.
 */
function sanitizeAccountLabel(raw: string): string {
  return raw
    .replace(/["“”]/g, "")
    .replace(/[\\/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Texto plano para WhatsApp deep link (wa.me) y como fallback para apps
 * que solo aceptan `text` en el Web Share API. Pone la URL en linea propia
 * con doble salto antes — eso maximiza la chance de que cualquier parser
 * de chat (incluyendo Yape) la detecte como link standalone y no como
 * pegado al texto previo.
 */
const buildWhatsAppText = (url: string, account: string) =>
  `Te invito a la cuenta compartida ${sanitizeAccountLabel(account)} en Kane.\n\n${url}`;

/**
 * Descripcion CORTA y SIN url embebida para el Web Share API. La URL
 * viaja por el campo `url` del ShareData — duplicar el link en `text`
 * confunde a apps que priorizan uno u otro y termina rompiendo el auto
 * link en algunos targets (notablemente Yape).
 */
const buildShareDescription = (account: string) =>
  `Te invito a la cuenta compartida ${sanitizeAccountLabel(account)} en Kane.`;

export function InvitePartnerSheet({
  open,
  onOpenChange,
  accountId,
  accountLabel,
}: InvitePartnerSheetProps) {
  const [loading, setLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [invitation, setInvitation] = React.useState<AccountInvitation | null>(
    null,
  );
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  // Reset + lookup al abrir.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setErrorMsg(null);
    setCopied(false);
    setLoading(true);
    void (async () => {
      try {
        const pending = await listPendingInvitations(accountId);
        if (cancelled) return;
        setInvitation(pending[0] ?? null);
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(
          err instanceof Error
            ? err.message
            : "No pudimos cargar el estado de la invitación.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, accountId]);

  async function handleGenerate() {
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const inv = await createInvitation(accountId);
      setInvitation(inv);
      toast.success("Link generado.");
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "No pudimos crear la invitación.";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    if (!invitation) return;
    setSubmitting(true);
    try {
      await revokeInvitation(invitation.id);
      setInvitation(null);
      toast.success("Invitación cancelada.");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "No pudimos cancelar la invitación.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!invitation) return;
    const url = buildInvitationUrl(invitation.code);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copiado.");
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("No pudimos copiar. Selecciona y copia manualmente.");
    }
  }

  async function handleNativeShare() {
    if (!invitation) return;
    const url = buildInvitationUrl(invitation.code);
    if (typeof navigator === "undefined" || !navigator.share) {
      // Fallback a copiar — el caller renderiza este boton solo
      // cuando navigator.share existe, pero por defensa.
      await handleCopy();
      return;
    }
    try {
      // text SIN url embebida + url separado: muchas apps de chat (Yape
      // entre ellas) priorizan `text` y descartan `url`, pero si los
      // duplicas el autodetector de links no engancha por ruido. Asi
      // dejamos que cada target arme el mensaje como sabe.
      await navigator.share({
        title: "Kane — invitación a cuenta compartida",
        text: buildShareDescription(accountLabel),
        url,
      });
    } catch (err) {
      // El user cancelo el share — no es un error real.
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error("No pudimos abrir el menú de compartir.");
    }
  }

  function handleWhatsApp() {
    if (!invitation) return;
    const url = buildInvitationUrl(invitation.code);
    const text = buildWhatsAppText(url, accountLabel);
    const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  }

  // Web Share API: solo en mobile + Safari/Chrome >= ~2018.
  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        aria-describedby="invite-partner-desc"
        className="bg-background md:!max-w-2xl"
      >
        <DrawerHeader className="text-left">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary"
            >
              <Heart size={16} aria-hidden strokeWidth={2.4} />
            </span>
            <div className="min-w-0 flex-1">
              <DrawerTitle className="font-sans not-italic text-base font-semibold">
                Invitar a tu pareja
              </DrawerTitle>
              <DrawerDescription
                id="invite-partner-desc"
                className="text-[12px]"
              >
                {accountLabel}
              </DrawerDescription>
            </div>
          </div>
        </DrawerHeader>

        <div className="px-4 pb-2">
          {loading ? (
            <div className="flex items-center justify-center py-10 text-[13px] text-muted-foreground">
              <Loader2 size={16} aria-hidden className="mr-2 animate-spin" />
              Cargando…
            </div>
          ) : errorMsg && !invitation ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <AlertCircle
                size={22}
                aria-hidden
                className="text-destructive"
              />
              <p className="text-[13px] text-muted-foreground">{errorMsg}</p>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="mt-2 h-10 rounded-full"
              >
                Cerrar
              </Button>
            </div>
          ) : !invitation ? (
            <IdleState onGenerate={handleGenerate} submitting={submitting} />
          ) : (
            <ShareState
              invitation={invitation}
              accountLabel={accountLabel}
              copied={copied}
              canNativeShare={canNativeShare}
              submitting={submitting}
              onCopy={handleCopy}
              onWhatsApp={handleWhatsApp}
              onNativeShare={handleNativeShare}
              onCancel={handleCancel}
            />
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ─── Sub-states ──────────────────────────────────────────────────────

function IdleState({
  onGenerate,
  submitting,
}: {
  onGenerate: () => void;
  submitting: boolean;
}) {
  return (
    <div className="space-y-4 pb-4">
      <div className="rounded-2xl border border-border bg-muted/40 p-4 space-y-2">
        <p className="text-[13px] leading-relaxed text-foreground">
          Tu pareja podrá ver el saldo y los movimientos de esta cuenta en
          su propio dashboard. Lo que registre uno aparece al instante en
          el otro.
        </p>
        <ul className="text-[12px] text-muted-foreground space-y-1 pl-4 list-disc">
          <li>Las cuentas privadas siguen siendo solo tuyas.</li>
          <li>Si quieres separar, retiras a tu pareja en cualquier momento.</li>
          <li>El link expira en 7 días y solo lo puede aceptar 1 persona.</li>
        </ul>
      </div>
      <Button
        type="button"
        onClick={onGenerate}
        disabled={submitting}
        className="h-11 w-full rounded-full text-[13.5px] font-semibold"
      >
        {submitting ? (
          <>
            <Loader2 size={15} aria-hidden className="mr-1.5 animate-spin" />
            Generando…
          </>
        ) : (
          "Generar link de invitación"
        )}
      </Button>
    </div>
  );
}

function ShareState({
  invitation,
  accountLabel,
  copied,
  canNativeShare,
  submitting,
  onCopy,
  onWhatsApp,
  onNativeShare,
  onCancel,
}: {
  invitation: AccountInvitation;
  accountLabel: string;
  copied: boolean;
  canNativeShare: boolean;
  submitting: boolean;
  onCopy: () => void;
  onWhatsApp: () => void;
  onNativeShare: () => void;
  onCancel: () => void;
}) {
  const url = buildInvitationUrl(invitation.code);
  const expires = formatExpiresHint(invitation.expires_at);
  void accountLabel; // queda como prop por si en el futuro lo mostramos en algun copy.

  return (
    <div className="space-y-4 pb-4">
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Link de invitación
        </p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={url}
            onClick={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-[12.5px] font-mono text-foreground"
          />
          <button
            type="button"
            onClick={onCopy}
            aria-label="Copiar link"
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl border border-border transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              copied
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground hover:bg-muted",
            )}
          >
            {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          </button>
        </div>
        <p className="text-[11.5px] text-muted-foreground">{expires}</p>
      </div>

      <div className="space-y-2">
        <Button
          type="button"
          onClick={onWhatsApp}
          className="h-11 w-full rounded-full text-[13.5px] font-semibold bg-[#25D366] text-white hover:bg-[#1ebe5a] focus-visible:ring-[#25D366]"
        >
          <MessageCircle size={15} aria-hidden className="mr-1.5" />
          Compartir por WhatsApp
        </Button>
        {canNativeShare ? (
          <Button
            type="button"
            variant="outline"
            onClick={onNativeShare}
            className="h-11 w-full rounded-full text-[13.5px] font-semibold"
          >
            <Share2 size={15} aria-hidden className="mr-1.5" />
            Más opciones de compartir
          </Button>
        ) : null}
      </div>

      <div className="border-t border-border pt-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-destructive hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          <Trash2 size={13} aria-hidden />
          Cancelar invitación
        </button>
        <p className="mt-1 text-[11px] text-muted-foreground">
          El link dejará de funcionar y nadie podrá aceptarlo.
        </p>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatExpiresHint(expiresAtIso: string): string {
  const expires = new Date(expiresAtIso);
  const now = new Date();
  const diffMs = expires.getTime() - now.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 0) return "El link ya expiró. Genera uno nuevo.";
  if (days === 0) return "El link expira hoy.";
  if (days === 1) return "El link expira mañana.";
  return `El link expira en ${days} días.`;
}

export default InvitePartnerSheet;

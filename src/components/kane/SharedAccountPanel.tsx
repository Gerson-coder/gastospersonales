/**
 * SharedAccountPanel — panel embebible que muestra el estado de
 * cuenta compartida y los botones de gestion.
 *
 * 4 estados visibles:
 *   1. La cuenta NO esta compartida y no hay invitacion pendiente
 *      → CTA "Invitar a tu pareja" (abre InvitePartnerSheet).
 *   2. Hay invitacion pendiente → row con "Invitación enviada" +
 *      "Ver link / Cancelar" (re-abre el sheet).
 *   3. La cuenta esta compartida y soy el owner → badge "Compartida
 *      con [nombre]" + boton "Quitar pareja".
 *   4. La cuenta esta compartida y soy el partner → badge "Compartes
 *      esta cuenta con [nombre del owner]" + boton "Salir de la
 *      cuenta compartida".
 *
 * Auto-fetch del estado al montar y refetch en
 * PARTNERSHIP_UPSERTED_EVENT.
 *
 * Es PRESENTACIONAL hasta donde puede serlo: el componente fetcha
 * su propio estado (la lista de cuentas no carga partner info por
 * default), pero todas las acciones revoke/leave llaman al data
 * layer y emiten el bus para que la UI ancestra refetchee.
 */
"use client";

import * as React from "react";
import nextDynamic from "next/dynamic";
import { Heart, Loader2, LogOut, Send, UserMinus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  getAccountPartnerInfo,
  leavePartnership,
  listPendingInvitations,
  PARTNERSHIP_UPSERTED_EVENT,
  revokePartnership,
  type AccountInvitation,
  type AccountPartnerInfo,
} from "@/lib/data/partnerships";
import { useSession } from "@/lib/use-session";
import { cn } from "@/lib/utils";

const InvitePartnerSheet = nextDynamic(
  () => import("@/components/kane/InvitePartnerSheet"),
  { ssr: false },
);

export type SharedAccountPanelProps = {
  /** UUID de la cuenta. */
  accountId: string;
  /** Label visible (BCP, Casa, etc.) — usado en headers del sheet. */
  accountLabel: string;
  /**
   * user_id del owner (accounts.user_id). Si auth.uid() coincide
   * el user es owner y ve "Quitar pareja". Si no, es partner y ve
   * "Salir".
   */
  ownerUserId: string;
  /** Flag de la cuenta. Determina si renderizamos partner info o
   *  el CTA de invitar. */
  sharedWithPartner: boolean;
  /** Notifica al padre que la cuenta cambio (lo usa /accounts para
   *  reload la lista). */
  onChange?: () => void;
};

export function SharedAccountPanel({
  accountId,
  accountLabel,
  ownerUserId,
  sharedWithPartner,
  onChange,
}: SharedAccountPanelProps) {
  const { user } = useSession();
  const isOwner = user?.id === ownerUserId;

  const [partnerInfo, setPartnerInfo] = React.useState<AccountPartnerInfo | null>(
    null,
  );
  const [pending, setPending] = React.useState<AccountInvitation | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [confirmKick, setConfirmKick] = React.useState(false);
  const [confirmLeave, setConfirmLeave] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const [info, pendingList] = await Promise.all([
        sharedWithPartner
          ? getAccountPartnerInfo(accountId)
          : Promise.resolve(null),
        // Solo el owner ve invitaciones pendientes (RLS).
        isOwner ? listPendingInvitations(accountId) : Promise.resolve([]),
      ]);
      setPartnerInfo(info);
      setPending(pendingList[0] ?? null);
    } catch {
      // Soft-fail — si falla el fetch dejamos los valores previos.
      // No mostramos error UI porque este panel es secundario.
    } finally {
      setLoading(false);
    }
  }, [accountId, sharedWithPartner, isOwner]);

  React.useEffect(() => {
    void refresh();
    const handler = () => void refresh();
    globalThis.addEventListener(PARTNERSHIP_UPSERTED_EVENT, handler);
    return () => {
      globalThis.removeEventListener(PARTNERSHIP_UPSERTED_EVENT, handler);
    };
  }, [refresh]);

  async function handleRevoke() {
    setSubmitting(true);
    try {
      await revokePartnership(accountId);
      toast.success("Tu pareja ya no tiene acceso a esta cuenta.");
      setConfirmKick(false);
      setPartnerInfo(null);
      onChange?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No pudimos retirar a tu pareja.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLeave() {
    setSubmitting(true);
    try {
      await leavePartnership(accountId);
      toast.success("Saliste de la cuenta compartida.");
      setConfirmLeave(false);
      setPartnerInfo(null);
      onChange?.();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "No pudimos salir de la cuenta compartida.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────

  return (
    <section
      aria-labelledby="shared-account-heading"
      className="rounded-2xl border border-border bg-card p-4 space-y-3"
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary"
        >
          <Heart size={13} aria-hidden strokeWidth={2.4} />
        </span>
        <h3
          id="shared-account-heading"
          className="text-[13.5px] font-bold text-foreground"
        >
          Cuenta compartida
        </h3>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-3 text-[12px] text-muted-foreground">
          <Loader2 size={14} aria-hidden className="mr-1.5 animate-spin" />
          Cargando estado…
        </div>
      ) : sharedWithPartner && partnerInfo ? (
        // Estado: ya compartida.
        isOwner ? (
          <OwnerSharedView
            partnerName={partnerInfo.partnerName}
            confirmKick={confirmKick}
            submitting={submitting}
            onArmKick={() => setConfirmKick(true)}
            onCancelKick={() => setConfirmKick(false)}
            onConfirmKick={handleRevoke}
          />
        ) : (
          <PartnerSharedView
            partnerName={partnerInfo.partnerName}
            confirmLeave={confirmLeave}
            submitting={submitting}
            onArmLeave={() => setConfirmLeave(true)}
            onCancelLeave={() => setConfirmLeave(false)}
            onConfirmLeave={handleLeave}
          />
        )
      ) : pending && isOwner ? (
        // Estado: invitacion pendiente (lado owner).
        <PendingInviteView
          accountLabel={accountLabel}
          onOpenSheet={() => setInviteOpen(true)}
        />
      ) : isOwner ? (
        // Estado: sin compartir, soy owner.
        <IdleOwnerView
          accountLabel={accountLabel}
          onOpenSheet={() => setInviteOpen(true)}
        />
      ) : (
        // Estado raro: la cuenta no esta compartida y no soy owner.
        // Tecnicamente no deberia llegar aca (la RLS no me deja ver
        // cuentas no compartidas que no son mias), pero defensa.
        <div className="text-[12px] text-muted-foreground">
          Esta cuenta no está compartida.
        </div>
      )}

      {inviteOpen ? (
        <InvitePartnerSheet
          open={inviteOpen}
          onOpenChange={(open) => {
            setInviteOpen(open);
            if (!open) void refresh();
          }}
          accountId={accountId}
          accountLabel={accountLabel}
        />
      ) : null}
    </section>
  );
}

// ─── Sub-vistas ─────────────────────────────────────────────────────

function IdleOwnerView({
  accountLabel,
  onOpenSheet,
}: {
  accountLabel: string;
  onOpenSheet: () => void;
}) {
  void accountLabel;
  return (
    <div className="space-y-2.5">
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        Invita a tu pareja para ver y registrar movimientos juntos en
        tiempo real.
      </p>
      <Button
        type="button"
        onClick={onOpenSheet}
        className="h-10 rounded-full text-[12.5px] font-semibold w-full sm:w-auto"
      >
        <Send size={13} aria-hidden className="mr-1.5" />
        Invitar a tu pareja
      </Button>
    </div>
  );
}

function PendingInviteView({
  accountLabel,
  onOpenSheet,
}: {
  accountLabel: string;
  onOpenSheet: () => void;
}) {
  void accountLabel;
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"
        />
        <p className="text-[12.5px] font-semibold text-foreground">
          Invitación pendiente
        </p>
      </div>
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        Tu pareja aún no aceptó el link. Puedes verlo, copiarlo de nuevo
        o cancelarlo.
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={onOpenSheet}
        className="h-10 rounded-full text-[12.5px] font-semibold w-full sm:w-auto"
      >
        Ver invitación
      </Button>
    </div>
  );
}

function OwnerSharedView({
  partnerName,
  confirmKick,
  submitting,
  onArmKick,
  onCancelKick,
  onConfirmKick,
}: {
  partnerName: string;
  confirmKick: boolean;
  submitting: boolean;
  onArmKick: () => void;
  onCancelKick: () => void;
  onConfirmKick: () => void;
}) {
  if (confirmKick) {
    return (
      <div
        role="alert"
        className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-[var(--color-destructive-soft)] px-3 py-2.5 text-[12.5px] text-foreground"
      >
        <p className="font-semibold leading-snug">
          ¿Quitar a {partnerName} de esta cuenta?
        </p>
        <p className="text-[11.5px] leading-snug text-muted-foreground">
          Pierde acceso de inmediato. Las transacciones que registró se
          quedan en la cuenta.
        </p>
        <div className="mt-1 flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancelKick}
            disabled={submitting}
            className="min-h-9 flex-1"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onConfirmKick}
            disabled={submitting}
            className="min-h-9 flex-1"
          >
            {submitting ? (
              <>
                <Loader2 size={13} aria-hidden className="animate-spin" />
                <span className="ml-1.5">Quitando…</span>
              </>
            ) : (
              "Quitar pareja"
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-2 w-2 rounded-full bg-emerald-500"
        />
        <p className="text-[12.5px] text-foreground">
          Compartida con{" "}
          <span className="font-semibold">{partnerName}</span>
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onArmKick}
        disabled={submitting}
        className={cn(
          "h-10 rounded-full text-[12.5px] font-semibold w-full sm:w-auto",
          "border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive",
        )}
      >
        <UserMinus size={13} aria-hidden className="mr-1.5" />
        Quitar pareja
      </Button>
    </div>
  );
}

function PartnerSharedView({
  partnerName,
  confirmLeave,
  submitting,
  onArmLeave,
  onCancelLeave,
  onConfirmLeave,
}: {
  partnerName: string;
  confirmLeave: boolean;
  submitting: boolean;
  onArmLeave: () => void;
  onCancelLeave: () => void;
  onConfirmLeave: () => void;
}) {
  if (confirmLeave) {
    return (
      <div
        role="alert"
        className="flex flex-col gap-2 rounded-xl border border-destructive/30 bg-[var(--color-destructive-soft)] px-3 py-2.5 text-[12.5px] text-foreground"
      >
        <p className="font-semibold leading-snug">
          ¿Salir de esta cuenta compartida?
        </p>
        <p className="text-[11.5px] leading-snug text-muted-foreground">
          Dejarás de ver los movimientos. Las transacciones que
          registraste quedan en la cuenta del dueño.
        </p>
        <div className="mt-1 flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancelLeave}
            disabled={submitting}
            className="min-h-9 flex-1"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onConfirmLeave}
            disabled={submitting}
            className="min-h-9 flex-1"
          >
            {submitting ? (
              <>
                <Loader2 size={13} aria-hidden className="animate-spin" />
                <span className="ml-1.5">Saliendo…</span>
              </>
            ) : (
              "Salir"
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-2 w-2 rounded-full bg-emerald-500"
        />
        <p className="text-[12.5px] text-foreground">
          Compartes esta cuenta con{" "}
          <span className="font-semibold">{partnerName}</span>
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        onClick={onArmLeave}
        disabled={submitting}
        className={cn(
          "h-10 rounded-full text-[12.5px] font-semibold w-full sm:w-auto",
          "border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive",
        )}
      >
        <LogOut size={13} aria-hidden className="mr-1.5" />
        Salir de la cuenta
      </Button>
    </div>
  );
}

export default SharedAccountPanel;

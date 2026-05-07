"use client";

import * as React from "react";
import { toast } from "sonner";
import { Bell, BellOff, Loader2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { usePushSubscription } from "@/hooks/use-push-subscription";

/**
 * Toggle "Avisarme cuando me acerque a un presupuesto".
 *
 * Estados visuales:
 *   - checking → spinner sutil en la fila del toggle
 *   - unsupported → fila deshabilitada con copy de razon
 *     (iOS sin instalar PWA, browser viejo, etc).
 *   - denied → fila deshabilitada + CTA "Activar permisos en el navegador"
 *   - default + !enabled → toggle off, accion subscribe
 *   - granted + enabled → toggle on + boton "Probar aviso ahora"
 *
 * Errores se surfacean via Sonner toast — el copy del error viene del
 * server (en es-PE neutral).
 */
export function PushNotificationsToggle() {
  const { status, enabled, busy, deviceLabel, subscribe, unsubscribe, sendTest } =
    usePushSubscription();

  const handleToggle = async () => {
    try {
      if (enabled) {
        await unsubscribe();
        toast("Avisos desactivados en este dispositivo.");
      } else {
        await subscribe();
        if (status === "denied") {
          toast.error(
            "Permiso denegado. Activa las notificaciones en la configuración del navegador.",
          );
        } else {
          toast.success("Avisos activados en este dispositivo.");
        }
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "No pudimos cambiar el estado de los avisos.",
      );
    }
  };

  const handleTest = async () => {
    try {
      await sendTest();
      toast.success("Aviso enviado. Si no aparece, revisa los permisos.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No pudimos enviar el aviso.",
      );
    }
  };

  return (
    <Card className="overflow-hidden rounded-2xl border-border p-0">
      <div className="flex items-start gap-3 px-5 py-4">
        <span
          aria-hidden
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
        >
          {enabled ? <Bell size={16} /> : <BellOff size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[14px] font-semibold text-foreground">
              Avisarme cuando me acerque a un presupuesto
            </p>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              disabled={
                busy ||
                status === "checking" ||
                status === "unsupported" ||
                status === "denied"
              }
              onClick={handleToggle}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
                enabled ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                aria-hidden
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                  enabled ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
              {busy ? (
                <Loader2
                  size={12}
                  className="absolute inset-0 m-auto animate-spin text-foreground/60"
                  aria-hidden
                />
              ) : null}
            </button>
          </div>

          <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
            {status === "checking"
              ? "Verificando permisos…"
              : status === "unsupported"
                ? "Tu navegador no soporta notificaciones. En iPhone, primero instala la app en la pantalla de inicio."
                : status === "denied"
                  ? "Permiso denegado. Habilítalo en la configuración del navegador y recarga."
                  : enabled
                    ? `Activado en ${deviceLabel}. Te avisamos al 80% y al pasar el límite.`
                    : "Te avisamos al 80% del límite y al pasarlo. Sin spam."}
          </p>

          {enabled && status === "granted" ? (
            <button
              type="button"
              onClick={handleTest}
              disabled={busy}
              className="mt-3 inline-flex h-9 items-center justify-center rounded-full border border-border bg-card px-4 text-[12.5px] font-semibold transition-colors hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {busy ? (
                <>
                  <Loader2 size={12} className="animate-spin" aria-hidden />
                  <span className="ml-1.5">Enviando…</span>
                </>
              ) : (
                "Probar aviso ahora"
              )}
            </button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

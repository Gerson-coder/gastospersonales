"use client";

import * as React from "react";

/**
 * Wrapper que retrasa el mount de `children` hasta que el browser
 * indica que esta idle (`requestIdleCallback`) o pase un timeout
 * defensivo. En navegadores que no soportan `requestIdleCallback` (iOS
 * Safari < 17) cae a un `setTimeout(200)` — mismo orden de magnitud
 * que el browser nativo.
 *
 * Uso: envolver cards secundarias del dashboard (presupuestos, metas,
 * compromisos, plantillas, banner de insights) para que sus useEffect
 * de fetch NO compitan con el primer paint del hero + saldo + ultimas
 * transacciones. El user ve un placeholder durante ~50-200ms y luego
 * el card aparece con su contenido.
 *
 * Auditoria perf 2026-05-07: el dashboard hacia 8-10 fetch paralelos
 * en mount, y aunque corren en paralelo el TTI = max(slowest). Diferir
 * los secundarios da el efecto de "carga rapida" porque los criticos
 * aparecen primero.
 *
 * `fallback` opcional reserva alto para evitar layout shift cuando el
 * children real aparece. Si no se pasa, no se renderiza nada hasta
 * idle (solo recomendado para cards que ya tienen su propio empty
 * state que no genera CLS).
 */
type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** Timeout maximo antes de forzar el mount aunque no haya idle. */
  timeoutMs?: number;
};

type IdleCallbackHandle = number;
type IdleRequestCallback = (deadline: { didTimeout: boolean }) => void;

interface IdleApi {
  requestIdleCallback?: (
    cb: IdleRequestCallback,
    opts?: { timeout: number },
  ) => IdleCallbackHandle;
  cancelIdleCallback?: (handle: IdleCallbackHandle) => void;
}

export function DeferUntilIdle({
  children,
  fallback = null,
  timeoutMs = 1500,
}: Props) {
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const api = globalThis as unknown as IdleApi;
    if (typeof api.requestIdleCallback === "function") {
      const id = api.requestIdleCallback(() => setReady(true), {
        timeout: timeoutMs,
      });
      return () => {
        api.cancelIdleCallback?.(id);
      };
    }
    // Fallback browsers (Safari < 17): timeout corto. 200ms suele ser
    // suficiente para que el primer paint termine.
    const id = window.setTimeout(() => setReady(true), 200);
    return () => window.clearTimeout(id);
  }, [timeoutMs]);

  return <>{ready ? children : fallback}</>;
}

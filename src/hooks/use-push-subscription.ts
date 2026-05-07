"use client";

import * as React from "react";

/**
 * `usePushSubscription` — manage the Web Push subscription for the current
 * device.
 *
 * State machine:
 *   - status="checking"  → reading the browser API + querying existing sub
 *   - status="unsupported" → browser sin Push API (Safari < 16.4 sin PWA, etc.)
 *   - status="denied" → user nego permiso anteriormente
 *   - status="default" → permiso ni concedido ni negado, listo para pedir
 *   - status="granted" → permiso OK; `enabled` indica si hay sub registrada
 *
 * Acciones:
 *   - subscribe(): pide permiso si hace falta + registra subscription +
 *     POST a /api/push/subscribe.
 *   - unsubscribe(): unsubscribe del browser + DELETE en server.
 *   - sendTest(): POST /api/push/test para verificar end-to-end.
 *
 * Por que un hook propio en lugar de un Context: solo /settings consume
 * estos states, no necesitamos compartir entre paginas. Cada mount
 * lee el state real del browser asi se mantiene en sync con la realidad.
 */

export type PushStatus =
  | "checking"
  | "unsupported"
  | "denied"
  | "default"
  | "granted";

type Result = {
  status: PushStatus;
  /** True si tenemos una subscription registrada en este device. */
  enabled: boolean;
  /** Acciones bloqueadas mientras corre alguna operacion async. */
  busy: boolean;
  /** Texto descriptivo del device actual ("iPhone", "Android", etc). */
  deviceLabel: string;
  subscribe: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  sendTest: () => Promise<void>;
};

/** Convierte una clave base64-url (formato VAPID) a Uint8Array para
 *  pasarla a pushManager.subscribe().
 *
 *  Devuelve `Uint8Array<ArrayBuffer>` explicitamente (no
 *  `Uint8Array<ArrayBufferLike>`) porque desde TS 5.7 el lib.dom.d.ts
 *  diferencia ArrayBuffer vs SharedArrayBuffer en `BufferSource`, y
 *  `pushManager.subscribe({ applicationServerKey })` espera el primero.
 *  Construir el buffer via `new ArrayBuffer(...)` garantiza el subtype
 *  correcto. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** Etiqueta humana del device a partir del userAgent. Best-effort. */
function detectDeviceLabel(): string {
  if (typeof navigator === "undefined") return "Dispositivo";
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) {
    const match = ua.match(/\(Linux; Android [^;]+; ([^)]+)\)/);
    return match?.[1]?.trim() || "Android";
  }
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Linux/i.test(ua)) return "Linux";
  return "Dispositivo";
}

export function usePushSubscription(): Result {
  const [status, setStatus] = React.useState<PushStatus>("checking");
  const [enabled, setEnabled] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [deviceLabel, setDeviceLabel] = React.useState("Dispositivo");

  // Helper: lee el estado real del browser y sincroniza state local.
  const refresh = React.useCallback(async () => {
    if (typeof window === "undefined") return;
    setDeviceLabel(detectDeviceLabel());

    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setStatus("unsupported");
      setEnabled(false);
      return;
    }

    const permission = Notification.permission;
    if (permission === "denied") {
      setStatus("denied");
      setEnabled(false);
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setEnabled(sub !== null);
    } catch {
      setEnabled(false);
    }

    setStatus(permission === "granted" ? "granted" : "default");
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const subscribe = React.useCallback(async () => {
    if (busy) return;
    if (typeof window === "undefined") return;
    setBusy(true);
    try {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        throw new Error(
          "Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY — pídele al admin que configure las llaves VAPID.",
        );
      }

      // Pide permiso si aun no fue concedido. Notification.requestPermission
      // resuelve con el valor final ('granted' | 'denied' | 'default').
      let permission: NotificationPermission = Notification.permission;
      if (permission === "default") {
        permission = await Notification.requestPermission();
      }
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "default");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      // Pasamos el `.buffer` (ArrayBuffer concreto) en lugar del Uint8Array
      // porque TS 5.7+ es estricto en la diferencia entre
      // ArrayBuffer / SharedArrayBuffer dentro de BufferSource. ArrayBuffer
      // es directamente asignable a `applicationServerKey` sin generic
      // dispute.
      const applicationServerKey: ArrayBuffer =
        urlBase64ToUint8Array(vapidKey).buffer;
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey,
        }));

      const json = sub.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: {
            p256dh: json.keys?.p256dh,
            auth: json.keys?.auth,
          },
          deviceLabel: detectDeviceLabel(),
        }),
      });
      if (!res.ok) {
        throw new Error(
          (await res.json().catch(() => ({})))?.error ??
            "No pudimos registrar la suscripción.",
        );
      }
      setStatus("granted");
      setEnabled(true);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const unsubscribe = React.useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe().catch(() => {
          // Si el browser falla al unsubscribe local, igual borramos
          // del server — la fila DB ya no es accionable de cualquier modo.
        });
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const sendTest = React.useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      if (!res.ok) {
        throw new Error(
          (await res.json().catch(() => ({})))?.error ??
            "No pudimos enviar el aviso de prueba.",
        );
      }
    } finally {
      setBusy(false);
    }
  }, [busy]);

  return {
    status,
    enabled,
    busy,
    deviceLabel,
    subscribe,
    unsubscribe,
    sendTest,
  };
}

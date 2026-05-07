/// <reference lib="WebWorker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Auto skip-waiting + clientsClaim so a new deploy applies seamlessly:
  // the new worker takes over immediately, fires controllerchange in the
  // client, and the page reloads to the fresh shell. The previous manual
  // opt-in (UpdatePrompt) caused a "stuck screen" window where the OLD
  // worker served stale chunks while Next.js was already requesting NEW
  // chunk hashes for navigation — RSC fetches missed cache, navigation
  // hung, and the user had to force-quit the app to recover. Auto-update
  // collapses that window to a sub-second reload.
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // CRITICAL — Supabase REST / auth / realtime: NetworkOnly.
    //
    // Causa raíz reportada: el bug "los gastos OCR no aparecen en el
    // dashboard hasta refresh manual" pasaba SOLO en celular (PWA). El
    // matcher `cross-origin` de `defaultCache` aplica `NetworkFirst` con
    // timeout 10s + TTL 1h a TODAS las peticiones cross-origin, lo cual
    // incluye `https://<proyecto>.supabase.co/rest/v1/transactions` —
    // los GETs de listTransactionsWindow / listAccounts / etc.
    //
    // En red lenta tras subir la foto de OCR (post-/api/ocr/extract,
    // ~1MB de imagen), el `refetch()` post-save podía exceder los 10s y
    // caer al body cacheado del cache "cross-origin", entregando data
    // PRE-INSERT al dashboard. La nueva transacción quedaba invisible
    // hasta que un refetch posterior ganara la red.
    //
    // NetworkOnly garantiza que nunca se sirva una respuesta cacheada de
    // Supabase REST. Para offline puro, esto significa que la app no
    // mostrará datos en mobile sin red — pero los datos de Supabase
    // tampoco deberían ser cacheados a 1h: cambian segundo a segundo.
    //
    // El cache de imágenes (Supabase Storage en `/storage/v1/*`) sigue
    // pasando por el matcher `cross-origin` de defaultCache abajo —
    // esas SÍ son immutable y vale la pena cachearlas.
    {
      matcher: ({ url }) => {
        if (!url.hostname.endsWith(".supabase.co")) return false;
        return (
          url.pathname.startsWith("/rest/v1/") ||
          url.pathname.startsWith("/auth/v1/") ||
          url.pathname.startsWith("/realtime/v1/")
        );
      },
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
});

serwist.addEventListeners();

// ─── Web Push handlers ───────────────────────────────────────────────────
//
// Listeners separados de Serwist (que solo maneja cache). Reciben los push
// del backend (via /api/push/test o el cron de presupuestos), parsean el
// payload JSON {title, body, url, tag, ...} y muestran la notificacion
// nativa del OS. notificationclick abre / enfoca la app en la URL del
// payload.
//
// El payload llega como event.data — lo intentamos parsear como JSON; si
// no parsea, fallback a texto crudo. Asi nunca se tira el push entero por
// un payload mal formado.

interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  data?: Record<string, unknown>;
}

self.addEventListener("push", (event) => {
  let payload: PushPayload = {};
  if (event.data) {
    try {
      payload = event.data.json() as PushPayload;
    } catch {
      payload = { title: "Kane", body: event.data.text() };
    }
  }
  const title = payload.title ?? "Kane";
  const options: NotificationOptions = {
    body: payload.body ?? "",
    icon: payload.icon ?? "/icons/icon-192.png?v=6",
    badge: payload.badge ?? "/icons/icon-192.png?v=6",
    tag: payload.tag,
    data: { url: payload.url ?? "/dashboard", ...payload.data },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data as { url?: string } | null;
  const targetUrl = data?.url ?? "/dashboard";
  event.waitUntil(
    (async () => {
      // Si el user ya tiene una pestana / instancia de la PWA abierta,
      // la enfocamos y navegamos a la URL — evita abrir 2 ventanas.
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(targetUrl);
            } catch {
              // navigate puede fallar en cross-origin; ignoramos.
            }
          }
          return;
        }
      }
      // Si no hay instancia abierta, abrimos una nueva.
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});

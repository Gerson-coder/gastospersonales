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

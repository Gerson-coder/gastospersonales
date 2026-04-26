/// <reference lib="WebWorker" />
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Do NOT auto skip-waiting. We wait for the user to opt in via the
  // UpdatePrompt toast — the client posts { type: "SKIP_WAITING" } and
  // the listener below activates the new worker. This gives users
  // control: they decide when to reload to the new version.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();

// Opt-in skip-waiting: the client (useServiceWorkerUpdate) posts this
// message when the user clicks "Actualizar" in the UpdatePrompt.
self.addEventListener("message", (event) => {
  if ((event.data as { type?: string } | undefined)?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

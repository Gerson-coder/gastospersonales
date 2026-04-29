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
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();

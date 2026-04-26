"use client";

import * as React from "react";
import { Download, Plus, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Chrome-only event interface (not in lib.dom yet).
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

type IosNavigator = Navigator & { standalone?: boolean };

function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  const nav = window.navigator as IosNavigator;
  return nav.standalone === true;
}

function isIosDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}

/**
 * InstallPrompt
 *
 * Persistent install nudge. The card stays visible on every page until the
 * app is detected as running standalone (PWA installed). There is NO
 * "dismiss" button by design — we want every user to install Lumi.
 *
 * Detection of installed state:
 *   - Android Chrome / Edge / Brave: `display-mode: standalone` media query
 *     flips to true after install, even before app is reopened.
 *   - iOS Safari: `navigator.standalone === true` ONLY when launched from
 *     the home-screen icon (not in regular Safari tab). So iOS users
 *     continue to see the card in the browser even after installing — but
 *     once they open the app from the home screen, the card never renders.
 *   - We also listen for the `appinstalled` event to flip immediately.
 *
 * The card also re-checks the standalone flag when the page regains
 * visibility (so reopening the browser tab after an install hides it).
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    React.useState<BeforeInstallPromptEvent | null>(null);
  const [hydrated, setHydrated] = React.useState(false);
  const [standalone, setStandalone] = React.useState(false);
  const [isIos, setIsIos] = React.useState(false);
  const [showIosHelp, setShowIosHelp] = React.useState(false);

  React.useEffect(() => {
    setStandalone(isStandaloneMode());
    setIsIos(isIosDevice());
    setHydrated(true);

    const handlePrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => {
      setDeferredPrompt(null);
      setStandalone(true);
    };
    const handleVisibility = () => {
      // Re-check on tab focus — catches Android post-install where
      // display-mode flips while the user was on the install prompt.
      if (document.visibilityState === "visible") {
        setStandalone(isStandaloneMode());
      }
    };

    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
      }
    } else if (isIos) {
      setShowIosHelp(true);
    }
  };

  if (!hydrated || standalone) return null;
  // Show only if we either have a Chrome prompt OR we're on iOS Safari.
  if (!deferredPrompt && !isIos) return null;

  return (
    <>
      <div
        role="region"
        aria-label="Instalar aplicación"
        className={cn(
          "fixed left-4 right-4 z-40",
          "bottom-28 md:bottom-6 md:left-auto md:right-6 md:max-w-sm",
          "flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-card",
        )}
      >
        <div
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">Instala Lumi</p>
          <p className="text-sm text-muted-foreground">
            Tenlo a un toque desde tu pantalla principal.
          </p>
        </div>
        <Button size="sm" onClick={handleInstall} className="h-10 shrink-0 px-4">
          {isIos && !deferredPrompt ? "Cómo" : "Instalar"}
        </Button>
      </div>

      {showIosHelp && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-ios-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 md:items-center"
          onClick={() => setShowIosHelp(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="install-ios-title"
              className="text-2xl font-bold text-foreground"
            >
              Instalar Lumi en iOS
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Apple no permite el botón directo. Son 3 pasos en Safari:
            </p>
            <ol className="mt-5 space-y-4 text-sm text-foreground">
              <li className="flex items-start gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground font-semibold">
                  1
                </span>
                <span>
                  Toca el botón{" "}
                  <Share
                    className="inline-block h-4 w-4 align-text-bottom"
                    aria-hidden="true"
                  />{" "}
                  <strong>Compartir</strong> abajo en Safari.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground font-semibold">
                  2
                </span>
                <span>
                  Desliza hacia abajo y toca{" "}
                  <strong>&quot;Agregar a la pantalla principal&quot;</strong>{" "}
                  <Plus
                    className="inline-block h-4 w-4 align-text-bottom"
                    aria-hidden="true"
                  />
                  .
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground font-semibold">
                  3
                </span>
                <span>
                  Toca <strong>&quot;Agregar&quot;</strong> arriba a la derecha. Listo.
                </span>
              </li>
            </ol>
            <Button
              className="mt-6 w-full"
              onClick={() => setShowIosHelp(false)}
            >
              Entendido
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

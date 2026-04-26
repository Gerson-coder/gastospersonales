"use client";

import * as React from "react";
import { Download, Plus, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Chrome-only event interface (not in lib.dom yet).
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISS_KEY = "lumi-install-dismissed";

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

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] =
    React.useState<BeforeInstallPromptEvent | null>(null);
  const [hydrated, setHydrated] = React.useState(false);
  const [standalone, setStandalone] = React.useState(false);
  const [isIos, setIsIos] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [showIosHelp, setShowIosHelp] = React.useState(false);

  React.useEffect(() => {
    setStandalone(isStandaloneMode());
    setIsIos(isIosDevice());
    try {
      if (window.localStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
    } catch {
      // ignore — private mode etc.
    }
    setHydrated(true);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);

    const installedHandler = () => {
      setDeferredPrompt(null);
      setStandalone(true);
    };
    window.addEventListener("appinstalled", installedHandler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", installedHandler);
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

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  };

  if (!hydrated || standalone || dismissed) return null;
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
          "flex items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-card",
        )}
      >
        <div
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">Instalá Lumi</p>
          <p className="text-sm text-muted-foreground">
            Tenelo a un toque desde tu pantalla principal.
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <Button size="sm" onClick={handleInstall} className="h-9 px-3">
            {isIos && !deferredPrompt ? "Cómo" : "Instalar"}
          </Button>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="No mostrar más"
            className="grid h-7 place-items-center rounded text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
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
              className="font-display text-2xl italic text-foreground"
            >
              Instalar Lumi en iOS
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Apple no permite el botón directo — son 3 pasos en Safari:
            </p>
            <ol className="mt-5 space-y-4 text-sm text-foreground">
              <li className="flex items-start gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground font-semibold">
                  1
                </span>
                <span>
                  Tocá el botón{" "}
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
                  Deslizá hacia abajo y tocá{" "}
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
                  Tocá <strong>&quot;Agregar&quot;</strong> arriba a la derecha. Listo.
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

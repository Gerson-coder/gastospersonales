"use client";

import * as React from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { UpdatePrompt } from "@/components/lumi/UpdatePrompt";
import { SessionProvider } from "@/lib/use-session";

/**
 * Suppresses a known upstream noise from vaul (the lib that powers shadcn
 * Drawer): "Failed to execute 'releasePointerCapture' on 'Element': No
 * active pointer with the given id is found." It fires when a swipe gesture
 * races with vaul's pointer cleanup. The exception is non-fatal — vaul
 * already completed the visual cleanup and only the redundant capture
 * release fails. Tracked: https://github.com/emilkowalski/vaul (search
 * "releasePointerCapture"). Remove this filter once vaul ships a fix.
 */
function useSuppressVaulPointerError() {
  React.useEffect(() => {
    const isVaulNoise = (msg: unknown) =>
      typeof msg === "string" && msg.includes("releasePointerCapture");

    const onError = (e: ErrorEvent) => {
      if (isVaulNoise(e.message) || isVaulNoise(e.error?.message)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason as { message?: string } | undefined;
      if (isVaulNoise(reason?.message)) {
        e.preventDefault();
      }
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
}

export function Providers({ children }: { children: React.ReactNode }) {
  useSuppressVaulPointerError();
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <SessionProvider>
        {children}
        <UpdatePrompt />
        <Toaster richColors position="top-center" />
      </SessionProvider>
    </ThemeProvider>
  );
}

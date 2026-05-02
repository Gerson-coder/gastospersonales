/**
 * /onboarding/welcome — splash screen.
 *
 * Entry point for new users. Auto-advances to /onboarding/intro after 2.5s
 * or on tap anywhere. Returning users (with `lumi_seen_intro === "1"` in
 * localStorage) are redirected straight to /login so they don't relive the
 * splash + intro every time.
 */

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

const SEEN_INTRO_KEY = "lumi_seen_intro";
const AUTO_ADVANCE_MS = 2500;

export default function WelcomePage() {
  const router = useRouter();
  const [redirected, setRedirected] = React.useState(false);

  // Page guard: if user already saw intro, skip straight to /login.
  React.useEffect(() => {
    try {
      const seen = window.localStorage.getItem(SEEN_INTRO_KEY);
      if (seen === "1") {
        setRedirected(true);
        router.replace("/login");
      }
    } catch {
      // localStorage disabled — treat as new user, fall through.
    }
  }, [router]);

  const advance = React.useCallback(() => {
    try {
      window.localStorage.setItem(SEEN_INTRO_KEY, "1");
    } catch {
      // ignore — flag is UX, not security
    }
    router.push("/onboarding/intro");
  }, [router]);

  React.useEffect(() => {
    if (redirected) return;
    const id = window.setTimeout(advance, AUTO_ADVANCE_MS);
    return () => window.clearTimeout(id);
  }, [advance, redirected]);

  if (redirected) {
    return null;
  }

  return (
    <main
      onClick={advance}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          advance();
        }
      }}
      aria-label={`Bienvenido a ${APP_NAME}. Toca para continuar.`}
      className={cn(
        "relative flex min-h-[100dvh] flex-col items-center justify-center",
        "bg-background px-6 text-foreground cursor-pointer select-none",
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60"
        style={{
          background:
            "radial-gradient(closest-side, var(--color-primary-soft), transparent 70%)",
        }}
      />

      <div className="relative flex flex-col items-center gap-5">
        <span
          aria-hidden
          className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-lg"
        >
          <Sparkles size={36} strokeWidth={2.2} />
        </span>

        <h1 className="text-center text-[40px] font-bold leading-none tracking-tight text-foreground">
          {APP_NAME}
        </h1>

        <p className="max-w-[280px] text-center text-[15px] leading-relaxed text-muted-foreground">
          Controla tu dinero, mejora tu vida.
        </p>
      </div>

      <div
        aria-hidden
        className="absolute bottom-12 flex items-center gap-2"
      >
        <span className="h-1.5 w-6 rounded-full bg-primary" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted" />
        <span className="h-1.5 w-1.5 rounded-full bg-muted" />
      </div>
    </main>
  );
}

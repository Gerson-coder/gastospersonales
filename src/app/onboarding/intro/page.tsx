/**
 * /onboarding/intro — second-step welcome screen with primary + secondary
 * CTAs. Either action persists `lumi_seen_intro=1` so the user skips the
 * splash + intro on subsequent app opens.
 */

"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

const SEEN_INTRO_KEY = "lumi_seen_intro";

export default function IntroPage() {
  const router = useRouter();

  const markSeen = React.useCallback(() => {
    try {
      window.localStorage.setItem(SEEN_INTRO_KEY, "1");
    } catch {
      // ignore
    }
  }, []);

  function handleStart() {
    markSeen();
    router.push("/register");
  }

  function handleSignIn() {
    markSeen();
    router.push("/login");
  }

  return (
    <main className="relative flex min-h-[100dvh] flex-col bg-background px-6 py-10 text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[320px] overflow-hidden"
      >
        <div
          className="absolute left-1/2 top-[-120px] h-[420px] w-[420px] -translate-x-1/2 rounded-full opacity-50"
          style={{
            background:
              "radial-gradient(closest-side, var(--color-primary-soft), transparent 70%)",
          }}
        />
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-8">
        <div
          aria-hidden
          className={cn(
            "flex h-44 w-44 items-center justify-center rounded-[44px]",
            "bg-gradient-to-br from-primary/20 via-primary/5 to-transparent",
            "border border-primary/20 shadow-lg",
          )}
        >
          <div className="h-32 w-20 rounded-2xl bg-primary/80 shadow-inner" />
        </div>

        <header className="flex flex-col items-center gap-3 text-center">
          <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Te damos la bienvenida
          </span>
          <h1 className="text-[34px] font-bold leading-[1.05] tracking-tight text-foreground md:text-[40px]">
            Controla tu dinero
            <br />
            <span className="text-primary">sin esfuerzo</span>
          </h1>
          <p className="mt-2 max-w-[320px] text-[15px] leading-relaxed text-muted-foreground">
            Registra gastos e ingresos, analiza tus hábitos y alcanza tus metas
            financieras con {APP_NAME}.
          </p>
        </header>
      </div>

      <div className="relative flex flex-col items-center gap-4 pb-2">
        <Button
          onClick={handleStart}
          className="h-12 w-full max-w-[360px] rounded-xl text-[15px] font-semibold"
        >
          Empezar
        </Button>
        <Link
          href="/login"
          onClick={handleSignIn}
          className="text-[14px] font-semibold text-primary underline-offset-4 hover:underline"
        >
          Ya tengo cuenta
        </Link>
      </div>
    </main>
  );
}

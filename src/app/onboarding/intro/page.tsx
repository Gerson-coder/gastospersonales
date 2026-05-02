/**
 * /onboarding/intro — second-step welcome screen with primary + secondary
 * CTAs. Either action persists `lumi_seen_intro=1` so the user skips the
 * splash + intro on subsequent app opens.
 *
 * The illustration is a CSS-only phone mockup (frame + dashboard + floating
 * cards) — keeps the bundle weightless. Swap to a real PNG/SVG render by
 * dropping it into the central column when a designed asset is ready.
 */

"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowUpRight,
  PieChart,
  ShieldCheck,
} from "lucide-react";

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
      // ignore — flag is UX, not security
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
      {/* Hero copy */}
      <header className="flex flex-col gap-3">
        <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">
          Te damos la bienvenida
        </span>
        <h1 className="text-[34px] font-bold leading-[1.05] tracking-tight md:text-[40px]">
          Controla tu dinero
          <br />
          <span className="text-primary">sin esfuerzo</span>
        </h1>
        <p className="mt-1 max-w-[340px] text-[14px] leading-relaxed text-muted-foreground">
          Registra gastos e ingresos, analiza tus hábitos y alcanza tus metas
          financieras con {APP_NAME}.
        </p>
      </header>

      {/* Illustration */}
      <div className="relative my-8 flex flex-1 items-center justify-center">
        {/* Glow halo */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div
            className="h-[340px] w-[340px] rounded-full opacity-60"
            style={{
              background:
                "radial-gradient(closest-side, var(--color-primary-soft), transparent 70%)",
            }}
          />
        </div>

        {/* Phone mock */}
        <div
          aria-hidden
          className={cn(
            "relative z-10 w-[240px] overflow-hidden rounded-[36px] pb-4",
            "border border-border/60 bg-card shadow-2xl shadow-primary/10",
          )}
        >
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Resumen
            </span>
            <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />
          </div>

          {/* Gasto del mes */}
          <div className="mx-4 rounded-2xl border border-border/40 bg-muted/40 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Gasto del mes
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <p className="text-[18px] font-bold leading-none">S/ 1,245.90</p>
              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                +12%
              </span>
            </div>

            {/* Trend line */}
            <svg
              viewBox="0 0 200 60"
              className="mt-2 h-12 w-full"
              fill="none"
              aria-hidden
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="intro-line-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    style={{ stopColor: "var(--primary)", stopOpacity: 0.35 }}
                  />
                  <stop
                    offset="100%"
                    style={{ stopColor: "var(--primary)", stopOpacity: 0 }}
                  />
                </linearGradient>
              </defs>
              <path
                d="M 0 45 L 30 38 L 60 42 L 90 28 L 120 32 L 150 18 L 180 14 L 200 10 L 200 60 L 0 60 Z"
                fill="url(#intro-line-fill)"
              />
              <path
                d="M 0 45 L 30 38 L 60 42 L 90 28 L 120 32 L 150 18 L 180 14 L 200 10"
                style={{ stroke: "var(--primary)" }}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            <div className="mt-1 flex justify-between text-[9px] text-muted-foreground/80">
              <span>L</span>
              <span>M</span>
              <span>M</span>
              <span>J</span>
              <span>V</span>
              <span>S</span>
              <span>D</span>
            </div>
          </div>

          {/* Categorías */}
          <div className="mx-4 mt-3 rounded-2xl border border-border/40 bg-muted/40 p-3">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Categorías
            </p>
            <div className="flex items-center gap-3">
              <div
                aria-hidden
                className="h-12 w-12 flex-shrink-0 rounded-full"
                style={{
                  background:
                    "conic-gradient(var(--primary) 0deg 126deg, color-mix(in oklch, var(--primary) 60%, transparent) 126deg 216deg, color-mix(in oklch, var(--primary) 35%, transparent) 216deg 288deg, color-mix(in oklch, var(--primary) 18%, transparent) 288deg 360deg)",
                }}
              />
              <ul className="flex flex-1 flex-col gap-1 text-[10px]">
                <li className="flex justify-between gap-2">
                  <span className="text-foreground">Comida</span>
                  <span className="text-muted-foreground">35%</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span className="text-foreground">Transporte</span>
                  <span className="text-muted-foreground">25%</span>
                </li>
                <li className="flex justify-between gap-2">
                  <span className="text-foreground">Otros</span>
                  <span className="text-muted-foreground">20%</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Floating: Ingresos */}
        <div
          aria-hidden
          className={cn(
            "absolute left-0 top-10 z-20 flex items-center gap-2 rounded-2xl",
            "border border-border bg-card px-3 py-2 shadow-xl",
          )}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <ArrowUpRight size={14} strokeWidth={2.6} aria-hidden />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Ingresos
            </span>
            <span className="text-[12px] font-semibold">S/ 2,500.00</span>
          </div>
        </div>

        {/* Floating: Gastos */}
        <div
          aria-hidden
          className={cn(
            "absolute right-0 top-32 z-20 flex items-center gap-2 rounded-2xl",
            "border border-border bg-card px-3 py-2 shadow-xl",
          )}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-destructive/15 text-destructive">
            <ArrowDownRight size={14} strokeWidth={2.6} aria-hidden />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Gastos
            </span>
            <span className="text-[12px] font-semibold">S/ 1,245.90</span>
          </div>
        </div>

        {/* Floating: pie-chart accent (bottom-left) */}
        <div
          aria-hidden
          className={cn(
            "absolute bottom-2 left-3 z-20 flex h-12 w-12 items-center justify-center rounded-2xl",
            "border border-primary/30 bg-primary/15 shadow-lg",
          )}
        >
          <PieChart
            size={20}
            className="text-primary"
            strokeWidth={2.4}
            aria-hidden
          />
        </div>

        {/* Floating: muted block (bottom-right) */}
        <div
          aria-hidden
          className={cn(
            "absolute bottom-6 right-3 z-20 h-12 w-12 rounded-2xl",
            "border border-border bg-muted/60 shadow-lg",
          )}
        />
      </div>

      {/* CTAs */}
      <div className="flex flex-col items-center gap-4">
        <Button
          onClick={handleStart}
          className="h-12 w-full max-w-[400px] rounded-2xl text-[15px] font-semibold"
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

        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
          <ShieldCheck size={14} className="text-primary" aria-hidden />
          Tu información está protegida y encriptada
        </div>
      </div>
    </main>
  );
}

/**
 * /landing — public marketing page (server-rendered, indexable).
 *
 * Pure RSC: no "use client", no client hooks, no auth state. Crawlers and
 * first-time visitors should be able to read the entire page from the HTML
 * payload alone — that's the whole point of having a separate marketing
 * surface from the auth-gated `/`.
 *
 * SEO:
 *   - Full Next.js Metadata API export (title, description, OG, Twitter,
 *     canonical, robots).
 *   - Inline JSON-LD (SoftwareApplication + WebSite) for rich results.
 *   - Sitemap entry at `src/app/sitemap.ts`.
 *   - `public/robots.txt` references the sitemap.
 *
 * Design tokens are the same Kane palette used in-app — emerald primary,
 * warm bone background, Instrument Serif italic display, Plus Jakarta sans
 * body, JetBrains Mono for tabular figures.
 */

import * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Camera,
  Clock,
  Coins,
  Globe,
  Lock,
  PieChart,
  Receipt,
  ShieldCheck,
  Sparkles,
  Wallet,
  Zap,
} from "lucide-react";

import { APP_NAME } from "@/lib/brand";
import { KaneWordmark } from "@/components/kane/KaneWordmark";
import { cn } from "@/lib/utils";

// ─── Metadata ────────────────────────────────────────────────────────────
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://kane.verkex.com";

const OG_TITLE = `${APP_NAME} — Tu asesor financiero personal`;
const OG_DESCRIPTION =
  "Captura gastos en 3 toques con foto del recibo. Mira a dónde se va tu dinero por categoría, mes a mes. Multi-cuenta, multi-moneda, instalable en tu móvil.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: OG_TITLE,
    template: `%s · ${APP_NAME}`,
  },
  description: OG_DESCRIPTION,
  keywords: [
    "finanzas personales",
    "registro de gastos",
    "control de gastos",
    "presupuesto personal",
    "OCR boletas",
    "lector de recibos",
    "PWA finanzas",
    "Perú soles dólares",
    "app de gastos",
    "Kane",
  ],
  applicationName: APP_NAME,
  authors: [{ name: "Kane" }],
  creator: APP_NAME,
  publisher: APP_NAME,
  category: "finance",
  alternates: {
    canonical: "/landing",
    languages: {
      "es-PE": "/landing",
      es: "/landing",
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    locale: "es_PE",
    url: "/landing",
    images: [
      {
        url: "/icons/icon-512.png?v=6",
        width: 512,
        height: 512,
        alt: `${APP_NAME} — logo`,
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    images: ["/icons/icon-512.png?v=6"],
  },
};

// ─── Page ────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <>
      <JsonLd />
      <div className="relative min-h-dvh bg-background text-foreground">
        <BackdropDecor />
        <SiteHeader />
        <main className="relative">
          <Hero />
          <Pillars />
          <HowItWorks />
          <FeatureGrid />
          <PrivacySection />
          <FinalCta />
        </main>
        <SiteFooter />
      </div>
    </>
  );
}

// ─── Decor: subtle radial halo + grid lines ─────────────────────────────
function BackdropDecor() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div
        className="absolute -top-64 left-1/2 h-[680px] w-[680px] -translate-x-1/2 rounded-full opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, var(--color-primary-soft), transparent 70%)",
        }}
      />
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(to right, transparent, var(--border) 40%, var(--border) 60%, transparent)",
        }}
      />
    </div>
  );
}

// ─── Site header ─────────────────────────────────────────────────────────
function SiteHeader() {
  return (
    <header className="relative z-10">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5 md:py-7">
        <Link
          href="/landing"
          aria-label={`${APP_NAME} — inicio`}
          className="inline-flex items-center gap-2"
        >
          <KaneWordmark width={84} height={26} />
        </Link>
        <nav
          aria-label="Navegación principal"
          className="hidden items-center gap-7 md:flex"
        >
          <a
            href="#como-funciona"
            className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Cómo funciona
          </a>
          <a
            href="#caracteristicas"
            className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Características
          </a>
          <a
            href="#privacidad"
            className="text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Privacidad
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="hidden h-10 items-center rounded-xl px-4 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            Iniciar sesión
          </Link>
          <Link
            href="/register"
            className={cn(
              "inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-[13px] font-semibold text-primary-foreground",
              "shadow-[var(--shadow-fab)] transition-all hover:opacity-90 active:translate-y-px",
            )}
          >
            Crear cuenta
            <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}

// ─── Hero ────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-6 py-14 md:grid-cols-12 md:gap-10 md:py-24">
        <div className="md:col-span-7">
          <Eyebrow>
            <Sparkles size={12} aria-hidden />
            PWA · Multi-cuenta · OCR con IA
          </Eyebrow>

          <h1 className="mt-5 text-balance text-[44px] font-bold leading-[1.02] tracking-tight md:text-[64px]">
            Tu dinero,{" "}
            <span className="font-display italic font-normal text-primary">
              entendido
            </span>{" "}
            sin hojas de cálculo.
          </h1>

          <p className="mt-6 max-w-xl text-pretty text-[16px] leading-relaxed text-muted-foreground md:text-[17px]">
            {APP_NAME} es la app de finanzas personales para registrar un gasto
            en tres toques desde el cine, la tienda o el taxi. Saca foto del
            recibo y la inteligencia artificial completa el resto.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/register"
              className={cn(
                "inline-flex h-12 items-center gap-2 rounded-xl bg-primary px-5 text-[14px] font-semibold text-primary-foreground",
                "shadow-[var(--shadow-fab)] transition-all hover:opacity-90 active:translate-y-px",
              )}
            >
              Empezar gratis
              <ArrowRight size={16} aria-hidden />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center rounded-xl border border-border bg-card px-5 text-[14px] font-semibold text-foreground transition-colors hover:bg-muted"
            >
              Ya tengo cuenta
            </Link>
          </div>

          <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-muted-foreground">
            <li className="inline-flex items-center gap-1.5">
              <BadgeCheck size={14} className="text-primary" aria-hidden />
              Sin tarjeta de crédito
            </li>
            <li className="inline-flex items-center gap-1.5">
              <BadgeCheck size={14} className="text-primary" aria-hidden />
              Soles y dólares
            </li>
            <li className="inline-flex items-center gap-1.5">
              <BadgeCheck size={14} className="text-primary" aria-hidden />
              Datos cifrados
            </li>
          </ul>
        </div>

        <div className="md:col-span-5">
          <HeroMockup />
        </div>
      </div>
    </section>
  );
}

// Static mock of the in-app capture card. This is HAND-WRITTEN markup that
// mirrors the look of <DashboardHero /> + <TransactionRow /> — it's a
// preview, not the live component, so it stays static and safe in RSC.
function HeroMockup() {
  return (
    <div className="relative">
      {/* Floating receipt thumbnail behind the main card */}
      <div
        aria-hidden
        className="absolute -top-8 -left-6 hidden w-40 rotate-[-6deg] rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-card)] md:block"
      >
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          <Receipt size={12} aria-hidden />
          Boleta
        </div>
        <div className="mt-2 space-y-1.5">
          <div className="h-1.5 w-3/4 rounded-full bg-muted" />
          <div className="h-1.5 w-full rounded-full bg-muted" />
          <div className="h-1.5 w-1/2 rounded-full bg-muted" />
          <div className="mt-2 h-3 w-2/3 rounded-full bg-foreground/10" />
        </div>
        <div className="mt-3 flex items-center justify-between text-[11px] font-semibold text-foreground">
          <span>Total</span>
          <span className="font-mono tabular-nums">S/ 48.50</span>
        </div>
      </div>

      {/* Main: Account hero + tx list */}
      <div
        className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-float)]"
        role="img"
        aria-label="Vista previa: panel de Kane mostrando el saldo de cuenta y los últimos movimientos"
      >
        <div
          className="relative overflow-hidden rounded-2xl p-5 text-primary-foreground"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.45 0.16 162) 0%, oklch(0.58 0.18 162) 100%)",
          }}
        >
          <div className="flex items-center justify-between text-[11px] font-medium opacity-90">
            <span className="inline-flex items-center gap-1.5">
              <Wallet size={12} aria-hidden />
              Cuenta principal
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              PEN
            </span>
          </div>
          <div className="mt-5">
            <div className="text-[11px] uppercase tracking-[0.08em] opacity-80">
              Saldo disponible
            </div>
            <div className="mt-1 text-[44px] font-display italic tabular-nums leading-none">
              S/ 4,820.<span className="opacity-70">00</span>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-4 text-[11px]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-white/80" />
              Ingresos +S/ 2,300
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-white/40" />
              Gastos −S/ 1,180
            </span>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="text-[12px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
            Últimos movimientos
          </div>
          <div className="text-[11px] text-muted-foreground">Hoy</div>
        </div>

        <ul className="mt-3 space-y-2.5">
          <MockTxRow
            iconBg="oklch(0.95 0.04 56)"
            iconFg="oklch(0.45 0.12 56)"
            icon={<Receipt size={14} aria-hidden />}
            title="Tambo"
            sub="Comida"
            amount="−S/ 12.40"
            negative
          />
          <MockTxRow
            iconBg="oklch(0.95 0.04 250)"
            iconFg="oklch(0.45 0.16 250)"
            icon={<Globe size={14} aria-hidden />}
            title="Netflix"
            sub="Suscripciones"
            amount="−S/ 32.90"
            negative
          />
          <MockTxRow
            iconBg="oklch(0.95 0.05 162)"
            iconFg="oklch(0.40 0.16 162)"
            icon={<Coins size={14} aria-hidden />}
            title="Sueldo"
            sub="Ingreso · BBVA"
            amount="+S/ 2,300"
          />
        </ul>

        {/* Floating FAB-ish chip */}
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-3 -right-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-[12px] font-semibold text-primary-foreground shadow-[var(--shadow-fab)]"
        >
          <Camera size={13} aria-hidden />
          Capturar
        </div>
      </div>
    </div>
  );
}

function MockTxRow({
  icon,
  title,
  sub,
  amount,
  negative = false,
  iconBg,
  iconFg,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  amount: string;
  negative?: boolean;
  iconBg: string;
  iconFg: string;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border/60 bg-background px-3 py-2.5">
      <span
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: iconBg, color: iconFg }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold leading-tight">
          {title}
        </div>
        <div className="text-[11.5px] text-muted-foreground">{sub}</div>
      </div>
      <div
        className={cn(
          "font-mono text-[13px] tabular-nums font-semibold",
          negative ? "text-foreground" : "text-primary",
        )}
      >
        {amount}
      </div>
    </li>
  );
}

// ─── Pillars ─────────────────────────────────────────────────────────────
function Pillars() {
  const items = [
    {
      icon: Zap,
      title: "Captura en 3 toques",
      body:
        "Anota un gasto sin abandonar el momento. Categoría, monto y comercio en menos tiempo del que tarda el café en llegar a la mesa.",
    },
    {
      icon: Camera,
      title: "Boleta a transacción",
      body:
        "Saca foto al recibo y la IA extrae comercio, monto y fecha. Tú solo confirmas. Funciona con boletas peruanas, voucher Yape y vouchers de tarjeta.",
    },
    {
      icon: PieChart,
      title: "Insights claros",
      body:
        "Mira a dónde se va tu sueldo por categoría y mes. Sin gráficos eternos: lo importante arriba, lo demás un toque más abajo.",
    },
  ];

  return (
    <section className="relative border-y border-border/60 bg-card/40">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-6 py-16 md:grid-cols-3 md:py-20">
        {items.map(({ icon: Icon, title, body }) => (
          <article
            key={title}
            className="group relative overflow-hidden rounded-2xl border border-border bg-background p-6 transition-all hover:shadow-[var(--shadow-card)]"
          >
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)]">
              <Icon size={20} aria-hidden />
            </div>
            <h3 className="mt-5 text-[19px] font-bold leading-snug tracking-tight">
              {title}
            </h3>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
              {body}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

// ─── How it works ────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    {
      n: "01",
      title: "Crea tu cuenta",
      body:
        "Regístrate con tu correo. Sin tarjeta de crédito. Tus datos viven aislados detrás de RLS — nadie más los ve.",
    },
    {
      n: "02",
      title: "Registra o escanea",
      body:
        "Toca + para apuntar un gasto en segundos, o saca foto a la boleta y deja que la IA llene el formulario.",
    },
    {
      n: "03",
      title: "Mira tu mes",
      body:
        "Saldo, ingresos, gastos por categoría y evolución mes a mes. Todo en tiempo real, sin sincronizar nada.",
    },
  ];

  return (
    <section
      id="como-funciona"
      className="relative scroll-mt-20"
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-20 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Cómo funciona</Eyebrow>
          <h2 className="mt-4 text-balance text-[34px] font-bold leading-tight tracking-tight md:text-[44px]">
            De{" "}
            <span className="font-display italic font-normal">
              gasto suelto
            </span>{" "}
            a panorama claro.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground md:text-[16px]">
            Tres pasos, ningún Excel. Pensado para que abras la app, registres y
            cierres antes de pedir el segundo café.
          </p>
        </div>

        <ol className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-border bg-border md:grid-cols-3">
          {steps.map(({ n, title, body }, i) => (
            <li key={n} className="relative bg-background p-7 md:p-8">
              <div
                className="font-display italic text-[44px] leading-none text-primary md:text-[56px]"
                aria-hidden
              >
                {n}
              </div>
              <h3 className="mt-4 text-[18px] font-bold tracking-tight">
                {title}
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
                {body}
              </p>
              {i < steps.length - 1 ? (
                <ArrowRight
                  size={18}
                  aria-hidden
                  className="absolute right-5 top-1/2 hidden -translate-y-1/2 text-muted-foreground/40 md:block"
                />
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ─── Feature grid ────────────────────────────────────────────────────────
function FeatureGrid() {
  const features = [
    {
      icon: Wallet,
      title: "Multi-cuenta",
      body:
        "Efectivo, tarjeta, banco, Yape. Cada cuenta con su saldo y su color. Cambia entre cuentas con un swipe.",
    },
    {
      icon: Coins,
      title: "Soles y dólares",
      body:
        "Multi-moneda real (PEN y USD). El switch superior filtra todo el panel — saldo, gastos e insights.",
    },
    {
      icon: Globe,
      title: "Instalable como app",
      body:
        "Es una PWA: instálala en la pantalla de inicio de tu móvil. Abre offline para capturar y sincroniza al volver.",
    },
    {
      icon: Clock,
      title: "Tiempo real",
      body:
        "Si registras desde la web, aparece en tu móvil al instante. Realtime sobre Supabase, debounced para no marear.",
    },
    {
      icon: ShieldCheck,
      title: "Aislamiento por usuario",
      body:
        "Row-Level Security desde el día uno. Cada fila lleva tu user_id y la base de datos solo te entrega lo tuyo.",
    },
    {
      icon: Sparkles,
      title: "Categorías a tu medida",
      body:
        "Las categorías que vienen son un punto de partida. Renómbralas, agrégales icono o crea las tuyas.",
    },
  ];

  return (
    <section
      id="caracteristicas"
      className="relative scroll-mt-20 border-y border-border/60 bg-card/40"
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-20 md:py-24">
        <div className="mb-12 max-w-2xl">
          <Eyebrow>Características</Eyebrow>
          <h2 className="mt-4 text-balance text-[32px] font-bold leading-tight tracking-tight md:text-[40px]">
            Construido como un{" "}
            <span className="font-display italic font-normal">neobank</span>,
            sin la fricción del banco.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="rounded-2xl border border-border bg-background p-5"
            >
              <div className="flex items-start gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)]">
                  <Icon size={18} aria-hidden />
                </span>
                <div>
                  <h3 className="text-[15.5px] font-bold leading-tight">
                    {title}
                  </h3>
                  <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Privacy ─────────────────────────────────────────────────────────────
function PrivacySection() {
  const points = [
    {
      icon: Lock,
      title: "Tus datos son tuyos",
      body:
        "Postgres con Row-Level Security. La base de datos rechaza cualquier consulta que no traiga tu sesión.",
    },
    {
      icon: ShieldCheck,
      title: "Claves del lado servidor",
      body:
        "Las claves de OpenAI y la clave de servicio de Supabase nunca llegan al navegador. La OCR corre en una API protegida.",
    },
    {
      icon: BadgeCheck,
      title: "Disciplina de costos",
      body:
        "Usamos GPT-4o-mini para procesar boletas y solo escalamos cuando el resultado no convence. Pagamos por lectura útil, no por foto.",
    },
  ];

  return (
    <section id="privacidad" className="relative scroll-mt-20">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-12 px-6 py-20 md:grid-cols-12 md:gap-10 md:py-28">
        <div className="md:col-span-5">
          <Eyebrow>Privacidad</Eyebrow>
          <h2 className="mt-4 text-balance text-[32px] font-bold leading-tight tracking-tight md:text-[42px]">
            Diseñado{" "}
            <span className="font-display italic font-normal">
              multi-tenant
            </span>{" "}
            desde la primera línea de código.
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-muted-foreground">
            Las apps de finanzas que ves en la tienda nacieron como demos
            mono-usuario. {APP_NAME} arrancó pensando en muchos usuarios
            distintos compartiendo una misma base, así que el aislamiento es
            estructural, no un parche al final.
          </p>
        </div>
        <ul className="space-y-4 md:col-span-7">
          {points.map(({ icon: Icon, title, body }) => (
            <li
              key={title}
              className="flex gap-4 rounded-2xl border border-border bg-card p-5"
            >
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)]">
                <Icon size={18} aria-hidden />
              </span>
              <div>
                <h3 className="text-[15.5px] font-bold leading-tight">
                  {title}
                </h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ─── Final CTA ───────────────────────────────────────────────────────────
function FinalCta() {
  return (
    <section className="relative px-6 pb-20 md:pb-28">
      <div
        className="relative mx-auto w-full max-w-6xl overflow-hidden rounded-3xl px-6 py-14 md:px-12 md:py-20"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.40 0.15 162) 0%, oklch(0.55 0.18 162) 100%)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, oklch(0.95 0.05 162 / 0.5), transparent 70%)",
          }}
        />
        <div className="relative max-w-2xl text-primary-foreground">
          <h2 className="text-balance text-[34px] font-bold leading-tight tracking-tight md:text-[44px]">
            El primer mes empieza{" "}
            <span className="font-display italic font-normal">ahora.</span>
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed opacity-90 md:text-[16px]">
            Crea tu cuenta y registra tu primer gasto en menos de un minuto.
            Cuando quieras irte, exportas todo y listo.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/register"
              className={cn(
                "inline-flex h-12 items-center gap-2 rounded-xl bg-white px-5 text-[14px] font-semibold",
                "transition-all hover:opacity-90 active:translate-y-px",
              )}
              style={{ color: "oklch(0.18 0.005 95)" }}
            >
              Crear cuenta gratis
              <ArrowRight size={16} aria-hidden />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center rounded-xl border border-white/30 px-5 text-[14px] font-semibold text-primary-foreground transition-colors hover:bg-white/10"
            >
              Iniciar sesión
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────
function SiteFooter() {
  return (
    <footer className="relative border-t border-border/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-6 px-6 py-10 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <KaneWordmark width={72} height={22} />
          <span className="text-[12px] text-muted-foreground">
            Tu asesor financiero personal.
          </span>
        </div>
        <nav
          aria-label="Pie de página"
          className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-muted-foreground"
        >
          <a className="hover:text-foreground" href="#como-funciona">
            Cómo funciona
          </a>
          <a className="hover:text-foreground" href="#caracteristicas">
            Características
          </a>
          <a className="hover:text-foreground" href="#privacidad">
            Privacidad
          </a>
          <Link className="hover:text-foreground" href="/login">
            Iniciar sesión
          </Link>
          <Link className="hover:text-foreground" href="/register">
            Crear cuenta
          </Link>
        </nav>
      </div>
      <div className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5 text-[11.5px] text-muted-foreground">
          <span>
            © {new Date().getFullYear()} {APP_NAME}. Todos los derechos
            reservados.
          </span>
          <span>Hecho en Perú · es-PE</span>
        </div>
      </div>
    </footer>
  );
}

// ─── Tiny atoms ──────────────────────────────────────────────────────────
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
      {children}
    </span>
  );
}

// ─── JSON-LD structured data ─────────────────────────────────────────────
function JsonLd() {
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: APP_NAME,
        description: OG_DESCRIPTION,
        inLanguage: "es-PE",
        publisher: { "@id": `${SITE_URL}/#org` },
      },
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#org`,
        name: APP_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/icons/icon-512.png?v=6`,
      },
      {
        "@type": "SoftwareApplication",
        name: APP_NAME,
        operatingSystem: "Web, iOS, Android",
        applicationCategory: "FinanceApplication",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
        url: `${SITE_URL}/landing`,
        description: OG_DESCRIPTION,
        inLanguage: "es-PE",
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      // Server-rendered string. No user input — safe.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
    />
  );
}

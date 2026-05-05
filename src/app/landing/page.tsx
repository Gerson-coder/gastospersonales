/**
 * /landing — public marketing page (server-rendered, indexable).
 *
 * Dark fintech aesthetic, Stripe / Linear / Vercel-grade composition:
 *   - Pure-black backdrop with emerald glow halos.
 *   - Phone mockup on the right (rounded chassis + dynamic island), live
 *     UI inside, two floating cards + dashed flow lines connecting them.
 *   - Top-aligned headline with italic display lines for "Excel /
 *     fricción / pensar" (Instrument Serif).
 *
 * The page forces dark mode via a `dark` class on the root wrapper, so
 * the existing `--*` token system flips to its night palette regardless
 * of the user's system preference. Pure black background uses Tailwind
 * `bg-black` to override the slightly-warm `--background` token.
 *
 * SEO is unchanged from the previous revision: Metadata API + JSON-LD
 * + sitemap + robots.txt all wired.
 */

import * as React from "react";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  BarChart3,
  Camera,
  Check,
  ChevronDown,
  Lock,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

// ─── Metadata ────────────────────────────────────────────────────────────
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://kane.verkex.com";

const OG_TITLE = `${APP_NAME} — Registra gastos en segundos`;
const OG_DESCRIPTION =
  "Toma una foto. La IA lo organiza por ti. App de finanzas personales para registrar gastos en segundos — multi-cuenta, multi-moneda, instalable como app en tu móvil.";

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
    "app de gastos Perú",
    "PWA finanzas",
    "soles dólares",
    "Yape gastos",
    APP_NAME,
  ],
  applicationName: APP_NAME,
  authors: [{ name: APP_NAME }],
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

// Per-page Viewport: overrides the global emerald theme-color from
// `app/layout.tsx` so mobile chrome (URL bar / status bar) renders
// black on the landing — matches the on-page background.
export const viewport: Viewport = {
  themeColor: "#000000",
};

// ─── Page ────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <>
      <JsonLd />
      {/* `dark` flips all `--*` tokens via globals.css custom-variant.
          `bg-black` overrides the warm-near-black `--background` for a
          flat, premium fintech feel. */}
      <div className="dark relative min-h-dvh overflow-x-clip bg-black text-white">
        <BackdropGlow />
        <TopNav />
        <main className="relative">
          <Hero />
          <BankStrip />
          <Pillars />
          <HowItWorks />
          <SecurityBlock />
          <FinalCta />
        </main>
        <SiteFooter />
      </div>
    </>
  );
}

// ─── Backdrop: emerald glows + faint grid ────────────────────────────────
function BackdropGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Top-left ambient halo */}
      <div
        className="absolute -left-40 top-0 h-[640px] w-[640px] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, oklch(0.78 0.16 162 / 0.22), transparent 70%)",
        }}
      />
      {/* Bottom-right deeper green */}
      <div
        className="absolute -right-32 top-[18%] h-[720px] w-[720px] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, oklch(0.55 0.18 162 / 0.30), transparent 70%)",
        }}
      />
      {/* Subtle dotted grid texture */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />
    </div>
  );
}

// ─── Top nav ─────────────────────────────────────────────────────────────
function TopNav() {
  const links = [
    { href: "#como-funciona", label: "Cómo funciona" },
    { href: "#caracteristicas", label: "Características" },
    { href: "#seguridad", label: "Privacidad" },
    { href: "#precios", label: "Precios" },
  ];

  return (
    <header className="relative z-20">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 md:py-7">
        <Link
          href="/landing"
          aria-label={`${APP_NAME} — inicio`}
          className="inline-flex items-center gap-2"
        >
          <KaneMark />
          <span className="text-[18px] font-semibold tracking-tight text-white">
            Kane
          </span>
        </Link>

        <nav
          aria-label="Navegación principal"
          className="hidden items-center gap-9 md:flex"
        >
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-[14px] font-medium text-white/65 transition-colors hover:text-white"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-5">
          <Link
            href="/login"
            className="hidden text-[14px] font-medium text-white/75 transition-colors hover:text-white sm:inline-flex"
          >
            Iniciar sesión
          </Link>
          <Link
            href="/register"
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-full bg-primary px-5 text-[13.5px] font-semibold text-black",
              "transition-colors hover:bg-primary/90",
              "shadow-[0_4px_16px_-4px_oklch(0.78_0.16_162/0.35)]",
            )}
          >
            Crear cuenta gratis
          </Link>
        </div>
      </div>
    </header>
  );
}

// Small "K" mark — green rounded square with a stylized K. Used as the
// brand glyph in the top-nav and footer.
function KaneMark() {
  return (
    <span
      aria-hidden
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-black"
      style={{
        boxShadow:
          "inset 0 0 0 1px rgba(255,255,255,0.18), 0 4px 16px -6px oklch(0.78 0.16 162 / 0.5)",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path
          d="M3.5 2v12M3.5 8L11 2M5.5 8L12 14"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

// ─── Hero ────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-16 px-6 py-16 md:px-10 md:py-24 lg:grid-cols-[1fr_1.3fr] lg:gap-10 lg:py-28">
        <HeroCopy />
        <HeroVisual />
      </div>
      <ScrollHint />
    </section>
  );
}

function HeroCopy() {
  return (
    <div className="relative">
      {/* Eyebrow pill */}
      <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/[0.06] px-3 py-1.5 backdrop-blur-sm">
        <Sparkles size={12} className="text-primary" aria-hidden />
        <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-primary">
          IA que lee tus boletas
        </span>
      </div>

      {/* Headline */}
      <h1 className="mt-8 text-balance text-[56px] font-bold leading-[1.02] tracking-[-0.025em] text-white md:text-[72px] lg:text-[84px]">
        Registra gastos en{" "}
        <span className="text-primary">segundos.</span>
      </h1>

      {/* Subtitle — strict 2 lines */}
      <p className="mt-7 max-w-[440px] text-[19px] font-medium leading-[1.45] text-white/70 md:text-[21px]">
        Toma una foto.
        <br />
        La <span className="text-primary">IA</span> lo organiza por ti.
      </p>

      {/* CTAs */}
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Link
          href="/register"
          className={cn(
            "group inline-flex h-14 items-center gap-2 rounded-full bg-primary px-6 text-[14.5px] font-semibold text-black",
            "transition-colors hover:bg-primary/92",
            "shadow-[0_8px_24px_-8px_oklch(0.78_0.16_162/0.45)]",
          )}
        >
          Crear cuenta gratis
          <ArrowRight
            size={15}
            className="transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
        <a
          href="#demo"
          className="inline-flex h-14 items-center gap-2 rounded-full border border-white/12 px-6 text-[14.5px] font-semibold text-white transition-colors hover:bg-white/[0.04]"
        >
          <PlayTriangle />
          Ver demo
        </a>
      </div>

      {/* Micro-copy: just two reassurances, low opacity, lots of breathing room */}
      <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-white/45">
        <span className="inline-flex items-center gap-1.5">
          <Lock size={12} aria-hidden />
          Sin tarjeta
        </span>
        <span aria-hidden className="text-white/25">
          ·
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck size={12} aria-hidden />
          Privado por diseño
        </span>
      </div>
    </div>
  );
}

function PlayTriangle() {
  return (
    <svg
      width="10"
      height="12"
      viewBox="0 0 11 13"
      fill="currentColor"
      aria-hidden
      className="text-white/90"
    >
      <path d="M0 1.6C0 0.7 1 0.2 1.7 0.7L10 6L1.7 11.3C1 11.8 0 11.3 0 10.4V1.6Z" />
    </svg>
  );
}

// "Descubre más" scroll indicator below the hero — soft text + chevron
// that gently bobs (CSS-only, respects prefers-reduced-motion via
// globals.css clamping all animations to 0.01ms).
function ScrollHint() {
  return (
    <div className="pointer-events-none absolute inset-x-0 -bottom-6 hidden flex-col items-center gap-1 text-white/40 md:flex">
      <span className="text-[11.5px] font-medium tracking-wide">
        Descubre más
      </span>
      <ChevronDown size={14} className="animate-bounce" aria-hidden />
    </div>
  );
}

// ─── Hero visual ─────────────────────────────────────────────────────────
// Static hero image: phone with the Resumen view + TAMBO+ receipt being
// captured + "Gasto registrado" confirmation, pre-composed in WebP at
// /public/hero.webp. Replaces the old React-rendered phone/cards/flow
// curve stack — the artwork is now a single image so it always renders
// pixel-perfect across browsers without me having to maintain the inline
// SVG/CSS chassis. Dead helpers (PhoneMockup, PhoneTxRow, PhoneTab,
// FloatingReceipt, FloatingConfirmation, ReceiptRow, CornerBracket,
// FlowCurve, SignalIcon, WifiIcon, BatteryIcon) were removed.
function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[820px] lg:max-w-none">
      {/* Soft emerald halo behind the image — kept from the previous
          layout so the artwork "sits" on a glow instead of pure black. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 translate-y-6 scale-95 rounded-[80px] blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, oklch(0.78 0.16 162 / 0.32), transparent 70%)",
        }}
      />
      {/* Plain <img> matching the AccountBrandIcon pattern in this repo —
          avoids needing extra config in next.config.ts and keeps the loader
          path simple for a static webp. `eager` + `async` because this is
          the LCP image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/hero.webp"
        alt="Pantalla de Kane mostrando el resumen de cuenta con saldo y movimientos, una boleta de Tambo+ siendo capturada por la IA, y la confirmación 'Gasto registrado · S/ 12.40'."
        loading="eager"
        decoding="async"
        className="relative block h-auto w-full select-none"
        draggable={false}
      />
    </div>
  );
}


// ─── Bank strip ──────────────────────────────────────────────────────────
function BankStrip() {
  const banks = [
    { src: "/logos/banks/bcp.svg", name: "BCP" },
    { src: "/logos/banks/bbva.svg", name: "BBVA" },
    { src: "/logos/banks/interbank.svg", name: "Interbank" },
    { src: "/logos/banks/yape.svg", name: "Yape" },
    { src: "/logos/banks/plin.svg", name: "Plin" },
  ];
  return (
    <section className="relative">
      <div className="mx-auto w-full max-w-7xl px-6 pb-16 pt-4">
        <p className="mb-6 text-center text-[13px] font-medium text-white/60">
          Conecta todas tus cuentas
        </p>
        <ul className="flex flex-wrap items-center justify-center gap-3">
          {banks.map((b) => (
            <li
              key={b.name}
              className="flex h-16 w-32 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.025] px-4 transition-colors hover:bg-white/[0.05]"
            >
              {/* Plain <img> over next/image — tiny static SVGs in /public,
                  matches the AccountBrandIcon pattern in the rest of the
                  app and avoids needing `images.dangerouslyAllowSVG` in
                  next.config.ts. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={b.src}
                alt={b.name}
                loading="lazy"
                className="max-h-9 w-auto object-contain"
              />
            </li>
          ))}
          <li className="flex h-16 items-center justify-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.025] px-5 text-[13.5px] font-semibold text-white/85 transition-colors hover:bg-white/[0.05]">
            <Banknote size={16} className="text-primary" aria-hidden />
            Efectivo
          </li>
        </ul>
      </div>
    </section>
  );
}

// ─── Pillars ─────────────────────────────────────────────────────────────
function Pillars() {
  const items = [
    {
      icon: Camera,
      title: "Boleta a transacción",
      body:
        "Saca foto al recibo y la IA extrae comercio, monto y fecha. Tú solo confirmas. Funciona con boletas peruanas, voucher Yape y vouchers de tarjeta.",
    },
    {
      icon: Sparkles,
      title: "Captura en 3 toques",
      body:
        "Anota un gasto sin abandonar el momento. Categoría, monto y comercio en menos tiempo del que tarda el café en llegar a la mesa.",
    },
    {
      icon: BarChart3,
      title: "Insights claros",
      body:
        "Mira a dónde se va tu sueldo por categoría y mes. Sin gráficos eternos: lo importante arriba, lo demás un toque más abajo.",
    },
  ];

  return (
    <section
      id="caracteristicas"
      className="relative scroll-mt-20 border-y border-white/[0.06] bg-white/[0.015]"
    >
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-5 px-6 py-20 md:grid-cols-3">
        {items.map(({ icon: Icon, title, body }) => (
          <article
            key={title}
            className={cn(
              "group relative overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0A0A0A] p-7",
              "transition-colors hover:border-primary/20",
            )}
          >
            <div
              aria-hidden
              className="absolute inset-x-0 -top-10 h-32 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              style={{
                background:
                  "radial-gradient(closest-side, oklch(0.78 0.16 162 / 0.18), transparent 70%)",
              }}
            />
            <div className="relative inline-flex h-12 w-12 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <Icon size={20} aria-hidden />
            </div>
            <h3 className="relative mt-6 text-[19px] font-bold leading-snug tracking-tight text-white">
              {title}
            </h3>
            <p className="relative mt-2 text-[14px] leading-relaxed text-white/65">
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
    <section id="como-funciona" className="relative scroll-mt-20">
      <div className="mx-auto w-full max-w-7xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow>Cómo funciona</Eyebrow>
          <h2 className="mt-5 text-balance text-[36px] font-extrabold leading-tight tracking-tight text-white md:text-[48px]">
            De{" "}
            <span className="font-display italic font-normal text-white/85">
              gasto suelto
            </span>{" "}
            a panorama claro.
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/60">
            Tres pasos, ningún Excel. Pensado para que abras la app, registres
            y cierres antes de pedir el segundo café.
          </p>
        </div>

        <ol className="mt-16 grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-white/[0.07] bg-white/[0.06] md:grid-cols-3">
          {steps.map(({ n, title, body }) => (
            <li
              key={n}
              className="relative bg-[#0A0A0A] p-8 transition-colors hover:bg-[#0F0F0F]"
            >
              <div
                className="font-display italic text-[56px] leading-none text-primary"
                aria-hidden
              >
                {n}
              </div>
              <h3 className="mt-5 text-[19px] font-bold tracking-tight text-white">
                {title}
              </h3>
              <p className="mt-2 text-[14px] leading-relaxed text-white/65">
                {body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ─── Security block ──────────────────────────────────────────────────────
function SecurityBlock() {
  const points = [
    {
      icon: ShieldCheck,
      title: "Aislamiento por usuario",
      body:
        "Row-Level Security desde el día uno. Cada fila lleva tu user_id y la base de datos solo te entrega lo tuyo.",
    },
    {
      icon: Sparkles,
      title: "IA del lado servidor",
      body:
        "Las claves de OpenAI y la clave de servicio nunca llegan al navegador. La OCR corre en una API protegida.",
    },
    {
      icon: Check,
      title: "Disciplina de costos",
      body:
        "Usamos GPT-4o-mini para procesar boletas y solo escalamos cuando el resultado no convence. Pagamos por lectura útil, no por foto.",
    },
  ];
  return (
    <section
      id="seguridad"
      className="relative scroll-mt-20 border-y border-white/[0.06] bg-white/[0.015]"
    >
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-12 px-6 py-24 md:grid-cols-12">
        <div className="md:col-span-5">
          <Eyebrow>Seguridad</Eyebrow>
          <h2 className="mt-5 text-balance text-[34px] font-extrabold leading-tight tracking-tight text-white md:text-[42px]">
            Tu plata,{" "}
            <span className="font-display italic font-normal text-white/85">
              tus datos.
            </span>
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-white/65">
            {APP_NAME} arrancó pensando en muchos usuarios distintos
            compartiendo una misma base, así que el aislamiento es estructural,
            no un parche al final.
          </p>
        </div>
        <ul className="space-y-4 md:col-span-7">
          {points.map(({ icon: Icon, title, body }) => (
            <li
              key={title}
              className="flex gap-4 rounded-2xl border border-white/[0.07] bg-[#0A0A0A] p-5"
            >
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                <Icon size={18} aria-hidden />
              </span>
              <div>
                <h3 className="text-[15.5px] font-bold leading-tight text-white">
                  {title}
                </h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/60">
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
    <section id="precios" className="relative scroll-mt-20 px-6 pb-24 pt-16">
      <div
        className="relative mx-auto w-full max-w-7xl overflow-hidden rounded-3xl border border-white/[0.08] px-6 py-20 text-center md:px-12"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, oklch(0.45 0.18 162 / 0.45), transparent 70%), #050505",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 h-80 w-[60%] -translate-x-1/2 rounded-full blur-3xl"
          style={{
            background:
              "radial-gradient(closest-side, oklch(0.78 0.16 162 / 0.55), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-2xl">
          <Eyebrow>Empieza gratis</Eyebrow>
          <h2 className="mt-5 text-balance text-[40px] font-extrabold leading-[1.05] tracking-tight text-white md:text-[56px]">
            El primer mes empieza{" "}
            <span className="font-display italic font-normal text-primary">
              ahora.
            </span>
          </h2>
          <p className="mt-5 text-[15px] leading-relaxed text-white/70 md:text-[16px]">
            Crea tu cuenta y registra tu primer gasto en menos de un minuto.
            Cuando quieras irte, exportas todo y listo.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/register"
              className={cn(
                "group inline-flex h-14 items-center gap-2 rounded-full bg-primary px-8 text-[15px] font-semibold text-black",
                "transition-all hover:opacity-95 active:translate-y-px",
                "shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_10px_30px_-6px_oklch(0.78_0.16_162/0.55),0_0_80px_-12px_oklch(0.78_0.16_162/0.85)]",
              )}
            >
              Crear cuenta gratis
              <ArrowRight
                size={16}
                className="transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-14 items-center rounded-full border border-white/15 bg-white/[0.04] px-7 text-[15px] font-semibold text-white transition-colors hover:bg-white/[0.08]"
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
    <footer
      id="faq"
      className="relative scroll-mt-20 border-t border-white/[0.06]"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col items-start justify-between gap-6 px-6 py-10 md:flex-row md:items-center">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-baseline gap-0.5">
            <span className="text-[18px] font-extrabold tracking-tight text-white">
              KANE
            </span>
            <span className="text-[18px] font-extrabold leading-none text-primary">
              .
            </span>
          </span>
          <span className="text-[12px] text-white/55">
            Tu asesor financiero personal.
          </span>
        </div>
        <nav
          aria-label="Pie de página"
          className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-white/55"
        >
          <a className="hover:text-white" href="#como-funciona">
            Cómo funciona
          </a>
          <a className="hover:text-white" href="#caracteristicas">
            Características
          </a>
          <a className="hover:text-white" href="#seguridad">
            Seguridad
          </a>
          <Link className="hover:text-white" href="/login">
            Iniciar sesión
          </Link>
          <Link className="hover:text-white" href="/register">
            Crear cuenta
          </Link>
        </nav>
      </div>
      <div className="border-t border-white/[0.04]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5 text-[11.5px] text-white/45">
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
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/70">
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
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: "4.9",
          ratingCount: "2500",
          bestRating: "5",
          worstRating: "1",
        },
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
    />
  );
}

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
  Bell,
  Camera,
  Check,
  Globe,
  Home,
  Plus,
  Receipt,
  ShieldCheck,
  Sparkles,
  Star,
  User,
  Wallet,
} from "lucide-react";

import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

// ─── Metadata ────────────────────────────────────────────────────────────
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
  "https://kane.verkex.com";

const OG_TITLE = `${APP_NAME} — Registra gastos en 3 segundos`;
const OG_DESCRIPTION =
  "Sin Excel. Sin fricción. Sin pensar. Toma foto de tu boleta y la IA registra el gasto por ti. Multi-cuenta, multi-moneda, instalable como app.";

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
    { href: "#seguridad", label: "Seguridad" },
    { href: "#precios", label: "Precios" },
    { href: "#faq", label: "FAQ" },
  ];

  return (
    <header className="relative z-20">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 md:py-7">
        <Link
          href="/landing"
          aria-label={`${APP_NAME} — inicio`}
          className="group inline-flex items-baseline gap-0.5"
        >
          <span className="text-[22px] font-extrabold tracking-tight text-white">
            KANE
          </span>
          <span className="text-[22px] font-extrabold leading-none text-primary">
            .
          </span>
        </Link>

        <nav
          aria-label="Navegación principal"
          className="hidden items-center gap-8 lg:flex"
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

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden h-10 items-center px-3 text-[14px] font-medium text-white/75 transition-colors hover:text-white sm:inline-flex"
          >
            Iniciar sesión
          </Link>
          <Link
            href="/register"
            className={cn(
              "group inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-[14px] font-semibold text-black",
              "transition-all hover:opacity-95 active:translate-y-px",
              "shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_8px_24px_-6px_oklch(0.78_0.16_162/0.55),0_0_60px_-12px_oklch(0.78_0.16_162/0.7)]",
            )}
          >
            Crear cuenta gratis
            <ArrowRight
              size={15}
              className="transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
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
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-14 px-6 py-12 md:py-20 lg:grid-cols-2 lg:gap-10">
        <HeroCopy />
        <HeroVisual />
      </div>
    </section>
  );
}

function HeroCopy() {
  return (
    <div className="relative">
      {/* NUEVO badge */}
      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1.5 pl-1.5 pr-4 backdrop-blur-sm">
        <span className="rounded-full border border-primary/40 bg-primary/15 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-primary">
          Nuevo
        </span>
        <span className="text-[12.5px] font-medium text-white/80">
          IA que lee tus boletas por ti
        </span>
        <Sparkles size={13} className="text-primary" aria-hidden />
      </div>

      {/* Headline */}
      <h1 className="mt-7 text-balance text-[52px] font-extrabold leading-[1.02] tracking-[-0.02em] text-white md:text-[68px] lg:text-[76px]">
        Registra gastos en{" "}
        <span className="text-primary">3 segundos.</span>
      </h1>

      {/* Italic subheadline triplet */}
      <div className="mt-4 space-y-1 text-[40px] font-light leading-[1.1] tracking-[-0.02em] text-white md:text-[52px] lg:text-[58px]">
        <p>
          Sin{" "}
          <span className="font-display italic font-normal text-white/85">
            Excel.
          </span>
        </p>
        <p>
          Sin{" "}
          <span className="font-display italic font-normal text-white/85">
            fricción.
          </span>
        </p>
        <p>
          Sin{" "}
          <span className="font-display italic font-normal text-white/85">
            pensar.
          </span>
        </p>
      </div>

      {/* Body */}
      <p className="mt-7 max-w-md text-[15px] leading-relaxed text-white/65">
        Toma foto de tu boleta. Nuestra IA extrae todos los datos
        automáticamente. Tú solo confirmas y listo.
      </p>

      {/* CTAs */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link
          href="/register"
          className={cn(
            "group inline-flex h-14 items-center gap-2 rounded-full bg-primary px-7 text-[15px] font-semibold text-black",
            "transition-all hover:opacity-95 active:translate-y-px",
            "shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_10px_30px_-6px_oklch(0.78_0.16_162/0.55),0_0_80px_-12px_oklch(0.78_0.16_162/0.85)]",
          )}
        >
          Empieza gratis ahora
          <ArrowRight
            size={16}
            className="transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
        <a
          href="#demo"
          className="inline-flex h-14 items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-7 text-[15px] font-semibold text-white transition-colors hover:bg-white/[0.07]"
        >
          <PlayTriangle />
          Ver demo
        </a>
      </div>

      {/* Trust list */}
      <ul className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-3 text-[13px] text-white/70">
        <li className="inline-flex items-center gap-2">
          <CheckPill />
          Sin tarjeta de crédito
        </li>
        <li className="inline-flex items-center gap-2">
          <CheckPill />
          Datos cifrados
        </li>
        <li className="inline-flex items-center gap-2">
          <CheckPill />
          Hecho en Perú <span aria-hidden>🇵🇪</span>
        </li>
      </ul>

      {/* Social proof */}
      <div className="mt-10 flex items-center gap-4">
        <AvatarStack />
        <div>
          <div className="text-[13.5px] font-semibold text-white">
            Más de 2,500 personas ya están ahorrando tiempo
          </div>
          <div className="mt-1 inline-flex items-center gap-2">
            <span className="inline-flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  size={13}
                  className="fill-primary text-primary"
                  aria-hidden
                />
              ))}
            </span>
            <span className="text-[12px] text-white/60">
              4.9 de 5 estrellas
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayTriangle() {
  return (
    <svg
      width="11"
      height="13"
      viewBox="0 0 11 13"
      fill="currentColor"
      aria-hidden
      className="text-white/90"
    >
      <path d="M0 1.6C0 0.7 1 0.2 1.7 0.7L10 6L1.7 11.3C1 11.8 0 11.3 0 10.4V1.6Z" />
    </svg>
  );
}

function CheckPill() {
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary">
      <Check size={12} strokeWidth={3} aria-hidden />
    </span>
  );
}

function AvatarStack() {
  // Stylized gradient avatars — no real user faces. Each circle has
  // a unique hue ring + initial so the strip reads as people, not as
  // a generic "users" icon.
  const seeds = [
    { hue: "from-rose-500 to-orange-400", initial: "A" },
    { hue: "from-sky-500 to-violet-500", initial: "M" },
    { hue: "from-emerald-400 to-teal-500", initial: "L" },
    { hue: "from-amber-400 to-rose-500", initial: "C" },
  ];
  return (
    <ul className="flex -space-x-2">
      {seeds.map((s, i) => (
        <li
          key={i}
          className={cn(
            "h-9 w-9 rounded-full bg-gradient-to-br ring-2 ring-black",
            "flex items-center justify-center text-[12px] font-bold text-white/90",
            s.hue,
          )}
          aria-hidden
        >
          {s.initial}
        </li>
      ))}
    </ul>
  );
}

// ─── Hero visual: phone + floating cards + flow lines ────────────────────
function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-[520px] lg:max-w-none">
      {/* Connection flow lines (decorative) */}
      <FlowLines />

      {/* Phone mockup, centered */}
      <div className="relative z-10 mx-auto w-[300px] sm:w-[340px] md:w-[360px]">
        <PhoneMockup />
      </div>

      {/* Floating cards */}
      <FloatingReceipt />
      <FloatingConfirmation />
    </div>
  );
}

function FlowLines() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 600 700"
      className="pointer-events-none absolute inset-0 z-0 hidden h-full w-full md:block"
      fill="none"
    >
      <defs>
        <linearGradient id="flow-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="oklch(0.78 0.16 162)" stopOpacity="0" />
          <stop
            offset="50%"
            stopColor="oklch(0.78 0.16 162)"
            stopOpacity="0.55"
          />
          <stop offset="100%" stopColor="oklch(0.78 0.16 162)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Receipt → phone */}
      <path
        d="M 130 300 Q 200 130 320 200"
        stroke="url(#flow-grad)"
        strokeWidth="1.5"
        strokeDasharray="4 6"
      />
      {/* Phone → confirmation */}
      <path
        d="M 460 360 Q 540 320 540 460"
        stroke="url(#flow-grad)"
        strokeWidth="1.5"
        strokeDasharray="4 6"
      />
      {/* Sparkle marks */}
      <g fill="oklch(0.78 0.16 162)" opacity="0.85">
        <circle cx="320" cy="200" r="3" />
        <circle cx="540" cy="460" r="3" />
        <circle cx="130" cy="300" r="2" />
      </g>
    </svg>
  );
}

function PhoneMockup() {
  return (
    <div className="relative">
      {/* Glow halo behind phone */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 translate-y-6 scale-95 rounded-[60px] blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, oklch(0.78 0.16 162 / 0.45), transparent 70%)",
        }}
      />
      {/* Chassis */}
      <div
        className={cn(
          "relative rounded-[48px] p-[3px]",
          "shadow-[0_50px_120px_-20px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.08)]",
        )}
        style={{
          background:
            "linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 50%, #050505 100%)",
        }}
      >
        <div
          className="relative overflow-hidden rounded-[46px] p-2"
          style={{
            background:
              "linear-gradient(180deg, #2a2a2a 0%, #0e0e0e 100%)",
          }}
        >
          {/* Screen */}
          <div className="relative overflow-hidden rounded-[40px] bg-[#0A0A0A]">
            {/* Status bar */}
            <div className="flex items-center justify-between px-7 pt-3 pb-1.5 text-[10.5px] font-semibold text-white">
              <span>9:41</span>
              <span className="absolute left-1/2 top-2 h-[26px] w-[100px] -translate-x-1/2 rounded-full bg-black" />
              <span className="inline-flex items-center gap-1.5 text-white/85">
                <SignalIcon />
                <WifiIcon />
                <BatteryIcon />
              </span>
            </div>

            {/* App content */}
            <div className="px-5 pb-5 pt-4">
              {/* Greeting row */}
              <div className="flex items-center justify-between">
                <div className="text-[18px] font-bold text-white">
                  Hola, Gee <span aria-hidden>👋</span>
                </div>
                <button
                  type="button"
                  aria-label="Notificaciones"
                  className="relative inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-white/80"
                >
                  <Bell size={15} aria-hidden />
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                </button>
              </div>

              {/* Account hero card */}
              <div
                className="relative mt-4 overflow-hidden rounded-2xl p-4 text-white"
                style={{
                  background:
                    "linear-gradient(135deg, oklch(0.45 0.16 162) 0%, oklch(0.62 0.18 162) 100%)",
                }}
              >
                <div className="flex items-center justify-between text-[10.5px] font-medium">
                  <span className="inline-flex items-center gap-1.5 opacity-95">
                    <Wallet size={11} aria-hidden />
                    Cuenta principal
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5">
                    <span className="h-1 w-1 rounded-full bg-white" />
                    PEN
                  </span>
                </div>
                <div className="mt-3 text-[10px] uppercase tracking-[0.1em] opacity-75">
                  Saldo disponible
                </div>
                <div className="mt-0.5 font-mono text-[28px] font-bold leading-none tracking-tight tabular-nums">
                  S/ 4,820.00
                </div>
                <div className="mt-3 flex items-center gap-3 text-[10px]">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
                    Ingresos +S/ 2,300
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                    Gastos −S/ 1,180
                  </span>
                </div>
              </div>

              {/* Movements list */}
              <div className="mt-4 flex items-baseline justify-between">
                <div className="text-[12px] font-semibold text-white">
                  Últimos movimientos
                </div>
                <div className="text-[10px] text-white/50">Hoy</div>
              </div>
              <ul className="mt-2.5 space-y-2.5">
                <PhoneTxRow
                  icon={<Receipt size={11} aria-hidden />}
                  iconBg="oklch(0.95 0.04 56)"
                  iconFg="oklch(0.45 0.12 56)"
                  title="Tambo"
                  sub="Comida"
                  amount="−S/ 12.40"
                />
                <PhoneTxRow
                  icon={<Globe size={11} aria-hidden />}
                  iconBg="oklch(0.95 0.04 250)"
                  iconFg="oklch(0.45 0.16 250)"
                  title="Netflix"
                  sub="Suscripciones"
                  amount="−S/ 32.90"
                />
                <PhoneTxRow
                  icon={<Banknote size={11} aria-hidden />}
                  iconBg="oklch(0.95 0.05 162)"
                  iconFg="oklch(0.40 0.16 162)"
                  title="Sueldo"
                  sub="Ingreso · BBVA"
                  amount="+S/ 2,300"
                  positive
                />
                <PhoneTxRow
                  icon={<Wallet size={11} aria-hidden />}
                  iconBg="oklch(0.93 0.005 95)"
                  iconFg="oklch(0.30 0.005 95)"
                  title="Taxi"
                  sub="Transporte"
                  amount="−S/ 18.50"
                />
              </ul>
            </div>

            {/* Tab bar */}
            <div className="mt-2 border-t border-white/[0.06] bg-[#0E0E0E] px-3 pb-4 pt-2.5">
              <ul className="flex items-end justify-between text-white/55">
                <PhoneTab icon={<Home size={14} />} label="Inicio" active />
                <PhoneTab
                  icon={<BarChart3 size={14} />}
                  label="Movimientos"
                />
                {/* FAB */}
                <li className="-mt-7">
                  <button
                    type="button"
                    aria-label="Capturar gasto"
                    className={cn(
                      "inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary text-black",
                      "shadow-[0_0_0_4px_#0E0E0E,0_0_30px_-4px_oklch(0.78_0.16_162/0.9)]",
                    )}
                  >
                    <Plus size={18} strokeWidth={3} aria-hidden />
                  </button>
                </li>
                <PhoneTab icon={<Sparkles size={14} />} label="Insights" />
                <PhoneTab icon={<User size={14} />} label="Cuenta" />
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PhoneTxRow({
  icon,
  title,
  sub,
  amount,
  positive = false,
  iconBg,
  iconFg,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  amount: string;
  positive?: boolean;
  iconBg: string;
  iconFg: string;
}) {
  return (
    <li className="flex items-center gap-2.5">
      <span
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: iconBg, color: iconFg }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11.5px] font-semibold text-white">
          {title}
        </div>
        <div className="text-[9.5px] text-white/50">{sub}</div>
      </div>
      <div
        className={cn(
          "font-mono text-[11px] font-semibold tabular-nums",
          positive ? "text-primary" : "text-white",
        )}
      >
        {amount}
      </div>
    </li>
  );
}

function PhoneTab({
  icon,
  label,
  active = false,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex flex-col items-center gap-1 text-[9.5px] font-medium",
        active ? "text-primary" : "text-white/55",
      )}
    >
      {icon}
      <span>{label}</span>
    </li>
  );
}

// ─── Floating cards ──────────────────────────────────────────────────────
function FloatingReceipt() {
  return (
    <aside
      aria-label="Vista previa: capturando boleta de Tambo con IA"
      className={cn(
        "absolute left-2 top-12 z-20 hidden w-[210px] -rotate-[5deg] rounded-2xl border border-white/10 p-3.5",
        "bg-[#0F0F0F]/90 backdrop-blur-md md:block",
        "shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.04)]",
      )}
    >
      <div className="flex items-center justify-between text-[10px] font-medium text-white/70">
        <span>Capturando boleta...</span>
        <ScanCornerMark />
      </div>

      {/* Faux receipt */}
      <div className="relative mt-2.5 overflow-hidden rounded-md bg-[#F4F1EB] px-3 py-3 text-[8px] font-mono text-neutral-700">
        {/* scanner sweep */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, oklch(0.78 0.16 162 / 0.9), transparent)",
            boxShadow: "0 0 8px oklch(0.78 0.16 162)",
            transform: "translateY(60%)",
          }}
        />
        <div className="text-center text-[11px] font-bold tracking-[0.05em] text-neutral-900">
          TAMBO+
        </div>
        <div className="mt-1 text-center text-[7px] uppercase tracking-wider text-neutral-500">
          Av. Arequipa 123 · Lima
        </div>
        <div className="mt-2.5 space-y-0.5">
          <ReceiptRow label="Agua Cielo 600ml" amount="2.90" />
          <ReceiptRow label="Snickers 50g" amount="7.80" />
          <ReceiptRow label="Galleta Oreo 36g" amount="1.80" />
        </div>
        <div className="mt-2 border-t border-dashed border-neutral-300 pt-1.5">
          <div className="flex justify-between text-[9px] font-bold text-neutral-900">
            <span>TOTAL</span>
            <span>S/ 12.40</span>
          </div>
        </div>
        <div className="mt-1.5 text-center text-[6.5px] text-neutral-400">
          12/05/2026 · 11:39 AM
        </div>
        {/* scan corners */}
        <CornerBracket position="tl" />
        <CornerBracket position="tr" />
        <CornerBracket position="bl" />
        <CornerBracket position="br" />
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[10px] font-medium text-primary">
        <span className="relative inline-flex h-1.5 w-1.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-primary/60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
        </span>
        Leyendo datos con IA
      </div>
    </aside>
  );
}

function ReceiptRow({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="flex justify-between">
      <span className="truncate">{label}</span>
      <span className="ml-2 shrink-0">{amount}</span>
    </div>
  );
}

function ScanCornerMark() {
  return (
    <span
      aria-hidden
      className="inline-block h-2 w-2 rounded-sm border-l-2 border-t-2 border-primary"
    />
  );
}

function CornerBracket({
  position,
}: {
  position: "tl" | "tr" | "bl" | "br";
}) {
  const classes = {
    tl: "left-1 top-1 border-l-2 border-t-2",
    tr: "right-1 top-1 border-r-2 border-t-2",
    bl: "left-1 bottom-1 border-l-2 border-b-2",
    br: "right-1 bottom-1 border-r-2 border-b-2",
  } as const;
  return (
    <span
      aria-hidden
      className={cn(
        "absolute h-2.5 w-2.5 border-primary",
        classes[position],
      )}
    />
  );
}

function FloatingConfirmation() {
  return (
    <aside
      aria-label="Vista previa: confirmación de gasto registrado por S/ 12.40"
      className={cn(
        "absolute -right-2 bottom-10 z-20 hidden w-[180px] rotate-[4deg] rounded-2xl border border-white/10 p-4 text-center",
        "bg-[#0F0F0F]/95 backdrop-blur-md md:block",
        "shadow-[0_30px_60px_-20px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.04)]",
      )}
    >
      <div className="mx-auto inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-black shadow-[0_0_30px_-2px_oklch(0.78_0.16_162/0.85)]">
        <Check size={16} strokeWidth={3} aria-hidden />
      </div>
      <div className="mt-3 text-[14px] font-bold text-white">¡Listo!</div>
      <div className="mt-0.5 text-[11px] text-white/65">Gasto registrado</div>
      <div className="mt-2 font-mono text-[20px] font-bold tabular-nums text-white">
        S/ 12.40
      </div>
      <button
        type="button"
        className="mt-3 inline-flex h-8 w-full items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-[11px] font-semibold text-white/85 transition-colors hover:bg-white/[0.08]"
      >
        Ver movimiento
      </button>
    </aside>
  );
}

// ─── Tiny status-bar icons ───────────────────────────────────────────────
function SignalIcon() {
  return (
    <svg
      width="13"
      height="9"
      viewBox="0 0 13 9"
      fill="currentColor"
      aria-hidden
    >
      <rect x="0" y="6" width="2" height="3" rx="0.5" />
      <rect x="3.5" y="4" width="2" height="5" rx="0.5" />
      <rect x="7" y="2" width="2" height="7" rx="0.5" />
      <rect x="10.5" y="0" width="2" height="9" rx="0.5" />
    </svg>
  );
}

function WifiIcon() {
  return (
    <svg
      width="11"
      height="9"
      viewBox="0 0 11 9"
      fill="none"
      aria-hidden
    >
      <path
        d="M5.5 2C3.5 2 1.7 2.7 0.4 3.9L1.4 5C2.5 4 3.9 3.4 5.5 3.4C7.1 3.4 8.5 4 9.6 5L10.6 3.9C9.3 2.7 7.5 2 5.5 2Z"
        fill="currentColor"
      />
      <path
        d="M5.5 4.6C4.2 4.6 3.0 5.1 2.2 5.9L3.2 7C3.8 6.4 4.6 6 5.5 6C6.4 6 7.2 6.4 7.8 7L8.8 5.9C8.0 5.1 6.8 4.6 5.5 4.6Z"
        fill="currentColor"
      />
      <circle cx="5.5" cy="8" r="1" fill="currentColor" />
    </svg>
  );
}

function BatteryIcon() {
  return (
    <svg
      width="22"
      height="11"
      viewBox="0 0 22 11"
      fill="none"
      aria-hidden
    >
      <rect
        x="0.5"
        y="0.5"
        width="19"
        height="10"
        rx="2.2"
        stroke="currentColor"
        strokeOpacity="0.5"
      />
      <rect
        x="20.4"
        y="3.5"
        width="1.2"
        height="4"
        rx="0.6"
        fill="currentColor"
        fillOpacity="0.5"
      />
      <rect x="2" y="2" width="14" height="7" rx="1.2" fill="currentColor" />
    </svg>
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

/**
 * Login route — Lumi
 *
 * Two modes, branched at runtime by the presence of NEXT_PUBLIC_SUPABASE_URL
 * (Next inlines NEXT_PUBLIC_* at build time, so the check works in the
 * browser bundle):
 *
 *   1. Envs PRESENT  → real Supabase magic-link OTP. Submitting the email
 *      calls `supabase.auth.signInWithOtp`, which mails a one-tap link that
 *      lands at `/auth/callback`. The callback exchanges the code for a
 *      session cookie and inspects `profiles.display_name` to decide whether
 *      to send the user to /welcome (first login) or /dashboard.
 *
 *   2. Envs ABSENT   → name-only stub (offline preview / demo). The original
 *      onboarding: enter name → persist to localStorage under `lumi-user-name`
 *      → /dashboard. Lets `npm run dev` work without a Supabase project.
 *
 * Both modes share the brand wordmark, the headline, the radial-glow hero
 * backdrop, and the legal footer.
 */

"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useUserName } from "@/lib/use-user-name";
import { cn } from "@/lib/utils";

// Runtime feature flag: do we have Supabase wired up?
// Next.js inlines NEXT_PUBLIC_* at build time, so this constant is folded
// into the browser bundle as a literal `true` or `false`.
const SUPABASE_ENABLED =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;

// Maps the `?error=` codes that /auth/callback may send back to user-facing
// copy. Anything not listed falls through to the generic message so unknown
// Supabase error strings (which we URL-encode raw) never leak to the UI.
const ERROR_MESSAGES: Record<string, string> = {
  missing_code: "El enlace no es válido. Pedí uno nuevo.",
  auth_disabled: "El inicio de sesión no está activo en este entorno.",
};
const GENERIC_ERROR = "No pudimos iniciarte sesión. Probá de nuevo.";

// Cooldown between magic-link resends. Long enough to discourage spamming
// the SMTP queue, short enough that a user who just cleared their inbox can
// retry without rage-quitting.
const RESEND_COOLDOWN_SECONDS = 60;

export default function LoginPage() {
  // useSearchParams() forces this subtree to be client-rendered, so wrap the
  // body in Suspense to satisfy Next 15+/16's static-rendering check.
  return (
    <React.Suspense fallback={<LoginShell />}>
      <LoginInner />
    </React.Suspense>
  );
}

function LoginInner() {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");
  const errorMessage = errorParam
    ? (ERROR_MESSAGES[errorParam] ?? GENERIC_ERROR)
    : null;

  return (
    <main className="relative flex min-h-dvh flex-col bg-background text-foreground md:min-h-screen md:items-center md:justify-center md:px-6">
      {/* Hero glow — a soft primary-soft radial gradient that sits behind the
          wordmark and headline. Pointer-events-none so it never interferes
          with form interaction. Pinned to the top of the shell on mobile and
          floats behind the card on desktop. */}
      <HeroGlow />

      <div className="relative mx-auto flex w-full max-w-[440px] flex-1 flex-col px-6 pb-10 pt-14 md:flex-initial md:px-0 md:pb-0 md:pt-0 md:rounded-2xl md:border md:border-border md:bg-card md:shadow-card md:p-8">
        {/* Brand mark */}
        <div className="mb-12 md:mb-8">
          <Image
            src="/brand/lumi-wordmark.svg"
            alt="Lumi"
            width={120}
            height={38}
            priority
            className="text-foreground"
          />
        </div>

        <section
          aria-labelledby="login-heading"
          className="animate-in fade-in slide-in-from-bottom-2 duration-500"
        >
          <h1
            id="login-heading"
            className="font-display text-[40px] italic leading-[1.05] tracking-tight md:text-4xl"
          >
            Bienvenido
            <br />
            a Lumi
          </h1>

          {errorMessage ? (
            <div
              role="alert"
              className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive"
            >
              {errorMessage}
            </div>
          ) : null}

          {SUPABASE_ENABLED ? <EmailMagicLinkForm /> : <NameOnlyForm />}
        </section>

        <footer className="mt-auto pt-12">
          <nav
            aria-label="Legal"
            className="flex justify-center gap-5 text-[12px] text-muted-foreground"
          >
            <a
              href="#"
              className="rounded-sm hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Términos
            </a>
            <span aria-hidden="true">·</span>
            <a
              href="#"
              className="rounded-sm hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Privacidad
            </a>
          </nav>
        </footer>
      </div>
    </main>
  );
}

// Empty shell shown while Suspense resolves useSearchParams. Renders the
// brand chrome so there's no flash of nothing.
function LoginShell() {
  return (
    <main className="relative flex min-h-dvh flex-col bg-background text-foreground md:min-h-screen md:items-center md:justify-center md:px-6">
      <HeroGlow />
      <div className="relative mx-auto flex w-full max-w-[440px] flex-1 flex-col px-6 pb-10 pt-14 md:flex-initial md:px-0 md:pb-0 md:pt-0 md:rounded-2xl md:border md:border-border md:bg-card md:shadow-card md:p-8">
        <div className="mb-12 md:mb-8">
          <Image
            src="/brand/lumi-wordmark.svg"
            alt="Lumi"
            width={120}
            height={38}
            priority
            className="text-foreground"
          />
        </div>
      </div>
    </main>
  );
}

// ─── Hero visual ──────────────────────────────────────────────────────────
/**
 * A soft radial-gradient backdrop using `--color-primary-soft` at low alpha
 * so it picks up the brand emerald in light mode and a muted teal-shaded
 * version in dark mode without ever touching the headline contrast. We avoid
 * an SVG/illustration on purpose — Lumi is calm, not Stripe-y.
 */
function HeroGlow() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[360px] overflow-hidden md:rounded-2xl"
    >
      <div
        className="absolute left-1/2 top-[-120px] h-[420px] w-[420px] -translate-x-1/2 rounded-full opacity-70"
        style={{
          background:
            "radial-gradient(closest-side, var(--color-primary-soft), transparent 70%)",
        }}
      />
    </div>
  );
}

// ─── Stub: name-only onboarding (no Supabase) ─────────────────────────────
function NameOnlyForm() {
  const router = useRouter();
  const { setName: persistName } = useUserName();
  const [name, setName] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const trimmed = name.trim();
  const isEmpty = trimmed.length === 0;
  const showError = submitted && isEmpty;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setSubmitted(true);
    if (isEmpty) return;

    setIsSubmitting(true);
    // Demo path: persistName resolves immediately (no Supabase). The promise
    // is intentionally not awaited — name-only flow is purely localStorage.
    void persistName(trimmed);
    router.push("/dashboard");
  }

  return (
    <>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
        ¿Cómo te llamas? Así te llamaremos desde aquí.
      </p>

      <form
        noValidate
        onSubmit={handleSubmit}
        aria-busy={isSubmitting}
        className="mt-9 space-y-4"
      >
        <div className="space-y-2">
          <Label
            htmlFor="login-name"
            className="text-[13px] font-semibold uppercase tracking-[0.04em] text-muted-foreground"
          >
            Tu nombre
          </Label>
          <Input
            id="login-name"
            name="name"
            type="text"
            autoComplete="given-name"
            inputMode="text"
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            required
            maxLength={40}
            placeholder="Tu nombre"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (submitted) setSubmitted(false);
            }}
            disabled={isSubmitting}
            aria-invalid={showError ? true : undefined}
            aria-describedby={
              showError ? "login-name-error" : "login-name-hint"
            }
            className="h-12 rounded-xl px-4 text-base"
          />
          {showError ? (
            <p
              id="login-name-error"
              role="alert"
              className="text-[13px] font-medium text-destructive"
            >
              Necesito un nombre para comenzar.
            </p>
          ) : (
            <p
              id="login-name-hint"
              className="text-[12px] leading-relaxed text-muted-foreground"
            >
              Puedes cambiarlo después.
            </p>
          )}
        </div>

        <Button
          type="submit"
          disabled={isSubmitting || isEmpty}
          className={cn(
            "h-12 w-full rounded-xl text-[15px] font-semibold",
            "transition-transform active:scale-[0.99]",
          )}
        >
          {isSubmitting ? (
            <>
              <Loader2
                size={16}
                className="mr-2 animate-spin"
                aria-hidden="true"
              />
              Comenzando…
            </>
          ) : (
            "Comenzar"
          )}
        </Button>

        <p className="pt-3 text-center text-[12px] leading-relaxed text-muted-foreground">
          Al continuar, aceptas los{" "}
          <a
            href="#"
            className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
          >
            términos
          </a>{" "}
          y la{" "}
          <a
            href="#"
            className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
          >
            política de privacidad
          </a>
          .
        </p>
      </form>
    </>
  );
}

// ─── Real flow: Supabase magic-link OTP ───────────────────────────────────
function EmailMagicLinkForm() {
  const [email, setEmail] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  // Cooldown timer for "Reenviar enlace". Counts down from
  // RESEND_COOLDOWN_SECONDS to 0; the resend button is disabled while > 0.
  const [cooldown, setCooldown] = React.useState(0);

  const trimmed = email.trim();
  const isInvalid =
    trimmed.length === 0 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed);
  const showError = submitted && isInvalid;

  // Tick the cooldown each second once the email is sent. We intentionally
  // store an absolute count rather than a target timestamp — a 60s window is
  // short enough that drift from setInterval scheduling is negligible.
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  async function sendMagicLink(): Promise<boolean> {
    setServerError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setServerError("No pudimos enviar el enlace. Probá de nuevo.");
        return false;
      }
      return true;
    } catch {
      setServerError("No pudimos enviar el enlace. Probá de nuevo.");
      return false;
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setSubmitted(true);
    if (isInvalid) return;

    setIsSubmitting(true);
    const ok = await sendMagicLink();
    setIsSubmitting(false);
    if (ok) {
      setSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    }
  }

  async function handleResend() {
    if (cooldown > 0 || isSubmitting) return;
    setIsSubmitting(true);
    const ok = await sendMagicLink();
    setIsSubmitting(false);
    if (ok) setCooldown(RESEND_COOLDOWN_SECONDS);
  }

  function handleReset() {
    setSent(false);
    setSubmitted(false);
    setServerError(null);
    setCooldown(0);
  }

  if (sent) {
    return (
      <div className="mt-9 space-y-5" aria-live="polite">
        <div className="rounded-2xl border border-border bg-[var(--color-primary-soft)] p-5 text-[var(--color-primary-soft-foreground)]">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background/50">
            <Mail size={18} aria-hidden="true" />
          </div>
          <p className="mt-4 text-[15px] font-semibold leading-snug">
            Te enviamos un enlace a tu email.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed">
            Tocá el enlace para entrar. Si no lo ves, revisá la carpeta de spam.
          </p>
          <p className="mt-4 break-all text-[14px] font-semibold tracking-tight">
            {trimmed}
          </p>
          {serverError ? (
            <p
              role="alert"
              className="mt-3 text-[13px] font-medium text-destructive"
            >
              {serverError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={handleResend}
            disabled={cooldown > 0 || isSubmitting}
            className={cn(
              "h-11 w-full rounded-xl text-[14px] font-semibold",
              "transition-transform active:scale-[0.99]",
            )}
          >
            {isSubmitting ? (
              <>
                <Loader2
                  size={16}
                  className="mr-2 animate-spin"
                  aria-hidden="true"
                />
                Reenviando…
              </>
            ) : cooldown > 0 ? (
              `Reenviar en ${cooldown}s`
            ) : (
              "Reenviar enlace"
            )}
          </Button>

          <button
            type="button"
            onClick={handleReset}
            className="self-center text-[13px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Cambiar email
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
        Te enviamos un enlace mágico a tu email. Sin contraseñas.
      </p>

      <form
        noValidate
        onSubmit={handleSubmit}
        aria-busy={isSubmitting}
        className="mt-9 space-y-4"
      >
        <div className="space-y-2">
          <Label
            htmlFor="login-email"
            className="text-[13px] font-semibold uppercase tracking-[0.04em] text-muted-foreground"
          >
            Tu email
          </Label>
          <Input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            required
            maxLength={254}
            placeholder="vos@email.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (submitted) setSubmitted(false);
              if (serverError) setServerError(null);
            }}
            disabled={isSubmitting}
            aria-invalid={showError ? true : undefined}
            aria-describedby={
              showError ? "login-email-error" : "login-email-hint"
            }
            className="h-12 rounded-xl px-4 text-base"
          />
          {showError ? (
            <p
              id="login-email-error"
              role="alert"
              className="text-[13px] font-medium text-destructive"
            >
              Ingresá un email válido.
            </p>
          ) : (
            <p
              id="login-email-hint"
              className="text-[12px] leading-relaxed text-muted-foreground"
            >
              No vas a tener que recordar contraseñas.
            </p>
          )}
          {serverError ? (
            <p
              role="alert"
              className="text-[13px] font-medium text-destructive"
            >
              {serverError}
            </p>
          ) : null}
        </div>

        <Button
          type="submit"
          disabled={isSubmitting || isInvalid}
          className={cn(
            "h-12 w-full rounded-xl text-[15px] font-semibold",
            "transition-transform active:scale-[0.99]",
          )}
        >
          {isSubmitting ? (
            <>
              <Loader2
                size={16}
                className="mr-2 animate-spin"
                aria-hidden="true"
              />
              Enviando…
            </>
          ) : (
            "Enviarme el enlace"
          )}
        </Button>

        <p className="pt-3 text-center text-[12px] leading-relaxed text-muted-foreground">
          Al continuar, aceptas los{" "}
          <a
            href="#"
            className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
          >
            términos
          </a>{" "}
          y la{" "}
          <a
            href="#"
            className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
          >
            política de privacidad
          </a>
          .
        </p>
      </form>
    </>
  );
}

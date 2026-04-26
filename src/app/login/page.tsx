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
 *      session cookie and redirects to /dashboard.
 *
 *   2. Envs ABSENT   → name-only stub (offline preview / demo). The original
 *      onboarding: enter name → persist to localStorage under `lumi-user-name`
 *      → /dashboard. Lets `npm run dev` work without a Supabase project.
 *
 * Both modes share the brand wordmark, the headline, and the legal footer.
 *
 * TODO: Once the auth integration is fully verified end-to-end, retire the
 * name-only fallback and make Supabase the only path.
 */

"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";

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

  return (
    <main className="relative flex min-h-dvh flex-col bg-background text-foreground md:min-h-screen md:items-center md:justify-center md:px-6">
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-6 pb-10 pt-14 md:flex-initial md:px-0 md:pb-0 md:pt-0 md:rounded-2xl md:border md:border-border md:bg-card md:shadow-card md:p-8">
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

          {errorParam ? (
            <div
              role="alert"
              className="mt-6 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive"
            >
              No pudimos iniciarte sesión. Probá de nuevo.
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
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-6 pb-10 pt-14 md:flex-initial md:px-0 md:pb-0 md:pt-0 md:rounded-2xl md:border md:border-border md:bg-card md:shadow-card md:p-8">
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
    persistName(trimmed);
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
          Comenzar
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
// TODO: copy the Supabase user.email/user.user_metadata.full_name back into
// the local `lumi-user-name` slot once we standardise on a profile model
// (Batch C+). For now the email becomes the identity and the display name
// is set inside Settings.
function EmailMagicLinkForm() {
  const [email, setEmail] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  const trimmed = email.trim();
  const isInvalid =
    trimmed.length === 0 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed);
  const showError = submitted && isInvalid;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setSubmitted(true);
    setServerError(null);
    if (isInvalid) return;

    setIsSubmitting(true);
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
        return;
      }
      setSent(true);
    } catch {
      setServerError("No pudimos enviar el enlace. Probá de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleReset() {
    setSent(false);
    setSubmitted(false);
    setServerError(null);
  }

  if (sent) {
    return (
      <div className="mt-9 space-y-5" aria-live="polite">
        <div className="rounded-2xl border border-border bg-[var(--color-primary-soft)] p-5 text-[var(--color-primary-soft-foreground)]">
          <p className="text-[15px] font-semibold leading-snug">
            Te enviamos un enlace a tu email.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed">
            Tocá el enlace para entrar. Si no lo ves, revisá la carpeta de spam.
          </p>
          <p className="mt-3 break-all text-[12px] font-medium opacity-80">
            {trimmed}
          </p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="text-[13px] font-medium text-foreground underline underline-offset-4 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Cambiar email
        </button>
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
          {isSubmitting ? "Enviando…" : "Enviarme el enlace"}
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

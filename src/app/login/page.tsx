// TODO: wire to supabase.auth.signInWithOtp() in Batch C (mvp-foundations auth flow).
/**
 * Login route — Lumi
 *
 * Magic-link UI stub. The actual Supabase auth wiring lands in Batch C; for now
 * the submit handler validates email shape, fakes an ~800ms async, and shows a
 * "revisá tu email" success state. Mobile-first, scales gracefully on desktop.
 */

"use client";

import * as React from "react";
import Image from "next/image";
import { ArrowLeft, Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────
type Status = "idle" | "loading" | "sent";

// Tiny email regex: enough to catch obvious typos. Not RFC-strict; the magic
// link itself is the source of truth.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Stubbed "send" delay. Replaced by real Supabase call in Batch C.
const SEND_DELAY_MS = 800;

export default function LoginPage() {
  const [email, setEmail] = React.useState("");
  const [status, setStatus] = React.useState<Status>("idle");
  const [error, setError] = React.useState<string | null>(null);

  const isLoading = status === "loading";
  const isSent = status === "sent";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;

    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) {
      setError("Ingresá un email válido, tipo ana@correo.pe.");
      return;
    }

    setError(null);
    setStatus("loading");
    // TODO (Batch C): replace with supabase.auth.signInWithOtp({ email: trimmed }).
    window.setTimeout(() => {
      setStatus("sent");
    }, SEND_DELAY_MS);
  }

  function handleReset() {
    setStatus("idle");
    setError(null);
  }

  return (
    <main className="relative flex min-h-dvh flex-col bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col px-6 pb-10 pt-14 md:pt-20">
        {/* Brand mark */}
        <div className="mb-12 md:mb-16">
          <Image
            src="/brand/lumi-wordmark.svg"
            alt="Lumi"
            width={120}
            height={38}
            priority
            className="text-foreground"
          />
        </div>

        {!isSent ? (
          <section
            aria-labelledby="login-heading"
            className="animate-in fade-in slide-in-from-bottom-2 duration-500"
          >
            <h1
              id="login-heading"
              className="font-display text-[40px] italic leading-[1.05] tracking-tight md:text-5xl"
            >
              Tu plata,
              <br />
              clara.
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
              Te mandamos un enlace al correo. Sin contraseñas, sin formularios.
            </p>

            <form
              noValidate
              onSubmit={handleSubmit}
              aria-busy={isLoading}
              className="mt-9 space-y-4"
            >
              <div className="space-y-2">
                <Label
                  htmlFor="login-email"
                  className="text-[13px] font-semibold uppercase tracking-[0.04em] text-muted-foreground"
                >
                  Email
                </Label>
                <Input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  required
                  placeholder="ana@correo.pe"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  disabled={isLoading}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "login-email-error" : undefined}
                  className="h-12 rounded-xl px-4 text-base"
                />
                {error ? (
                  <p
                    id="login-email-error"
                    role="alert"
                    className="text-[13px] font-medium text-destructive"
                  >
                    {error}
                  </p>
                ) : null}
              </div>

              <Button
                type="submit"
                disabled={isLoading || email.trim().length === 0}
                className={cn(
                  "h-12 w-full rounded-xl text-[15px] font-semibold",
                  "transition-transform active:scale-[0.99]",
                )}
              >
                {isLoading ? (
                  <>
                    <Loader2
                      size={18}
                      className="mr-2 animate-spin"
                      aria-hidden="true"
                    />
                    Enviando…
                  </>
                ) : (
                  "Enviar enlace"
                )}
              </Button>

              <p className="pt-3 text-center text-[12px] leading-relaxed text-muted-foreground">
                Al continuar, aceptás los{" "}
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
          </section>
        ) : (
          <section
            role="status"
            aria-live="polite"
            className="animate-in fade-in slide-in-from-bottom-2 pt-4 text-center duration-500"
          >
            <div
              aria-hidden="true"
              className="mx-auto mb-6 flex h-[72px] w-[72px] items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)]"
            >
              <Check size={32} strokeWidth={2.5} />
            </div>
            <h1 className="font-display text-[32px] italic leading-tight">
              Listo.
            </h1>
            <p className="mt-2.5 text-[15px] leading-relaxed text-muted-foreground">
              Te mandé un enlace a
            </p>
            <p className="mt-1 break-all text-[15px] font-semibold">{email}</p>
            <p className="mt-6 text-[13px] leading-relaxed text-muted-foreground">
              Revisá tu correo y tocá el enlace para entrar.
              <br />
              (Si no llegó, mirá en spam.)
            </p>

            <Button
              type="button"
              variant="ghost"
              onClick={handleReset}
              className="mt-6 h-11 rounded-xl px-4 text-[14px] font-semibold text-primary"
            >
              <ArrowLeft size={16} className="mr-1.5" aria-hidden="true" />
              Volver
            </Button>
          </section>
        )}

        <footer className="mt-auto pt-12">
          <nav
            aria-label="Legal"
            className="flex justify-center gap-5 text-[12px] text-muted-foreground"
          >
            <a
              href="#"
              className="hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
            >
              Términos
            </a>
            <span aria-hidden="true">·</span>
            <a
              href="#"
              className="hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
            >
              Privacidad
            </a>
          </nav>
        </footer>
      </div>
    </main>
  );
}

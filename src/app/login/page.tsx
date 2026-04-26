// TODO: replace with supabase.auth.signInWithOtp() in Batch C — for now this is name-only onboarding.
/**
 * Login route — Lumi
 *
 * Minimal onboarding: ask the user's name and persist it to localStorage under
 * the key `lumi-user-name`. After save, redirect to /dashboard. The real
 * Supabase auth (magic-link / OTP) lands in Batch C; this screen is the
 * placeholder gate. Mobile-first, scales gracefully on desktop.
 */

"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "lumi-user-name";

export default function LoginPage() {
  const router = useRouter();
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
    try {
      window.localStorage.setItem(STORAGE_KEY, trimmed);
    } catch {
      /* ignore — we still navigate; name will be re-asked on next visit */
    }
    router.push("/dashboard");
  }

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

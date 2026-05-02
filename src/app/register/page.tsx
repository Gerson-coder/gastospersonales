/**
 * Register route — Lumi
 *
 * New passwordless 2-screen registration flow:
 *
 *   /register             ← this file: collects email only, creates auth user
 *   /auth/verify-email    ← user types the 6-digit OTP we emailed
 *   …name → PIN → account → done (handled by /onboarding/* later)
 *
 * After /api/auth/register succeeds:
 *   - Supabase auth.users row exists (or is reused), user is signed in
 *   - email_verified_at is still NULL — middleware blocks /dashboard
 *   - An email_verification OTP is in the inbox (or the dev console)
 */

"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  function validate(): string | null {
    if (!EMAIL_REGEX.test(email.trim())) return "Correo inválido.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const validationErr = validate();
    if (validationErr) {
      setErrorMsg(validationErr);
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const normalized = email.trim().toLowerCase();
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: normalized }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        redirect?: string;
        devMode?: boolean;
        delivered?: boolean;
      };

      if (res.status === 409 && data.error === "email_exists_verified") {
        router.push(`/login?email=${encodeURIComponent(normalized)}`);
        return;
      }

      if (!res.ok) {
        setErrorMsg(data.error ?? "No pudimos crear la cuenta.");
        setSubmitting(false);
        return;
      }

      if (data.devMode) {
        toast.info("Modo dev: revisa la consola del servidor para el código.");
      } else if (data.delivered) {
        toast.success("Te enviamos un código a tu correo.");
      } else {
        toast.warning(
          "Cuenta creada. Si no llega el código, vuelve a /login y pídelo otra vez.",
        );
      }

      router.push("/auth/verify-email");
    } catch (err) {
      console.error("[register] submit:", err);
      setErrorMsg("No pudimos crear la cuenta. Revisa tu conexión.");
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8 text-foreground">
      <div className="relative w-full max-w-[440px]">
        <Link
          href="/login"
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft size={14} aria-hidden />
          Volver
        </Link>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
          <header className="mb-6">
            <h1 className="text-[24px] font-bold leading-tight text-foreground">
              Crea tu cuenta en {APP_NAME}
            </h1>
            <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
              Te enviaremos un código de 6 dígitos al correo para verificarlo.
            </p>
          </header>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Correo</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                autoComplete="email"
                autoFocus
                required
                inputMode="email"
              />
              <p className="text-[11px] text-muted-foreground">
                Sin contraseña. Verificamos por correo y luego configuras un
                PIN para entrar rápido.
              </p>
            </div>

            {errorMsg && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-[13px] text-destructive"
              >
                {errorMsg}
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting}
              className={cn("h-11 w-full rounded-xl text-[14px] font-semibold")}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                  Creando cuenta…
                </>
              ) : (
                "Crear cuenta"
              )}
            </Button>

            <p className="text-center text-[12px] text-muted-foreground">
              ¿Ya tienes cuenta?{" "}
              <Link
                href="/login"
                className="font-semibold text-primary hover:underline"
              >
                Inicia sesión
              </Link>
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}

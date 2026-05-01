/**
 * Register route — Lumi
 *
 * New 3-screen registration flow that replaces the legacy "signup" mode
 * inside /login:
 *
 *   /register             ← this file: collects identity + creates auth user
 *   /auth/verify-email    ← user types the 6-digit OTP we emailed
 *   /auth/set-pin         ← user picks a 6-digit PIN, becomes their daily login
 *
 * After /api/auth/register succeeds:
 *   - Supabase auth.users row exists, user is signed in (cookie set)
 *   - profiles row has full_name + birth_date + phone seeded
 *   - email_verified_at is still NULL — middleware blocks /dashboard
 *   - An email_verification OTP is in the inbox (or the dev console)
 */

"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD_LENGTH = 8;

export default function RegisterPage() {
  const router = useRouter();

  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [birthDate, setBirthDate] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  // Inline error message — shown above the submit button so the user
  // doesn't have to scroll back up to find what went wrong.
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  function validate(): string | null {
    const trimmedName = fullName.trim();
    if (trimmedName.length < 2) return "Ingresa tu nombre completo.";
    if (trimmedName.length > 80) return "El nombre es muy largo.";
    if (!EMAIL_REGEX.test(email.trim())) return "Correo inválido.";
    if (password.length < MIN_PASSWORD_LENGTH) {
      return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
    }
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
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          password,
          birthDate: birthDate || null,
          phone: phone.trim() || null,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        devMode?: boolean;
        delivered?: boolean;
      };

      if (!res.ok) {
        setErrorMsg(data.error ?? "No pudimos crear la cuenta.");
        setSubmitting(false);
        return;
      }

      // Surface the dev-mode hint so the project owner knows to look at
      // server logs for the OTP when Resend isn't wired yet.
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
              Crea tu cuenta
            </h1>
            <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
              Te enviaremos un código de 6 dígitos al correo para verificarlo.
            </p>
          </header>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="fullName">Nombre completo</Label>
              <Input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Gerson Herrera"
                autoComplete="name"
                required
                maxLength={80}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Correo</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                autoComplete="email"
                required
                inputMode="email"
              />
              <p className="text-[11px] text-muted-foreground">
                Para verificación en 2 pasos y recuperar tu PIN.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Al menos 8 caracteres"
                  autoComplete="new-password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={
                    showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="birthDate" className="flex items-center gap-1.5">
                Fecha de nacimiento
                <span className="text-[11px] font-normal text-muted-foreground">
                  (opcional)
                </span>
              </Label>
              <Input
                id="birthDate"
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                max={new Date().toISOString().slice(0, 10)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phone" className="flex items-center gap-1.5">
                Teléfono
                <span className="text-[11px] font-normal text-muted-foreground">
                  (opcional)
                </span>
              </Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+51 9XX XXX XXX"
                autoComplete="tel"
                inputMode="tel"
                maxLength={20}
              />
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

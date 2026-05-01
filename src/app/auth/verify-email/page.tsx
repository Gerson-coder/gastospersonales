/**
 * /auth/verify-email — second step of the new auth flow.
 *
 * The user landed here from /register; they're signed in but their
 * email_verified_at is still NULL. They type the 6-digit OTP that arrived
 * in their inbox; we POST to /api/auth/verify-otp; on success we route
 * them to /auth/set-pin.
 *
 * Resend is throttled to 3 codes per 10 minutes per (user, purpose) on
 * the server. The "Reenviar código" button has its own client-side
 * cooldown to discourage trigger-happy retries.
 */

"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const RESEND_COOLDOWN_SECONDS = 45;

export default function VerifyEmailPage() {
  const router = useRouter();
  const [code, setCode] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = React.useState(0);

  // Tick down the resend cooldown each second.
  React.useEffect(() => {
    if (resendCountdown <= 0) return;
    const id = window.setTimeout(
      () => setResendCountdown((n) => Math.max(0, n - 1)),
      1000,
    );
    return () => window.clearTimeout(id);
  }, [resendCountdown]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const trimmed = code.replace(/\D/g, "").slice(0, 6);
    if (trimmed.length !== 6) {
      setErrorMsg("Ingresa los 6 dígitos del código.");
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: trimmed, purpose: "email_verification" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error ?? "Código inválido.");
        setSubmitting(false);
        return;
      }
      toast.success("Correo verificado.");
      router.push("/auth/set-pin");
    } catch (err) {
      console.error("[verify-email] submit:", err);
      setErrorMsg("No pudimos verificar el código.");
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (resendCountdown > 0) return;
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purpose: "email_verification" }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        delivered?: boolean;
        devMode?: boolean;
      };
      if (!res.ok) {
        toast.error(data.error ?? "No pudimos reenviar el código.");
        return;
      }
      if (data.devMode) {
        toast.info("Modo dev: revisa la consola del servidor.");
      } else {
        toast.success("Te enviamos un código nuevo.");
      }
      setResendCountdown(RESEND_COOLDOWN_SECONDS);
    } catch {
      toast.error("No pudimos reenviar el código.");
    }
  }

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8 text-foreground">
      <div className="relative w-full max-w-[440px]">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
          <header className="mb-6">
            <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MailCheck size={20} aria-hidden />
            </span>
            <h1 className="text-[22px] font-bold leading-tight text-foreground">
              Verifica tu correo
            </h1>
            <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
              Te enviamos un código de 6 dígitos. Ingrésalo abajo para
              continuar.
            </p>
          </header>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              className="h-14 text-center text-[28px] font-bold tracking-[0.4em] tabular-nums"
              aria-label="Código de 6 dígitos"
            />

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
              disabled={submitting || code.length !== 6}
              className={cn("h-11 w-full rounded-xl text-[14px] font-semibold")}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                  Verificando…
                </>
              ) : (
                "Verificar"
              )}
            </Button>

            <div className="flex items-center justify-between text-[12px] text-muted-foreground">
              <button
                type="button"
                onClick={handleResend}
                disabled={resendCountdown > 0}
                className="font-semibold text-primary transition-opacity hover:underline disabled:cursor-not-allowed disabled:opacity-60"
              >
                {resendCountdown > 0
                  ? `Reenviar en ${resendCountdown}s`
                  : "Reenviar código"}
              </button>
              <Link href="/login" className="hover:underline">
                Cancelar
              </Link>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

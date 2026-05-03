/**
 * /auth/verify-email — OTP entry screen for three flows:
 *   - email_verification (default) → on success, /onboarding/name
 *   - pin_reset                     → on success, /auth/set-pin
 *   - new_device                    → on success, /dashboard
 *
 * The flow is selected via `?purpose=...`. The 6-digit code lands in six
 * individual cells with paste-fill, auto-advance, and backspace-back.
 *
 * Resend is throttled server-side (3 codes / 10 min / purpose). The
 * "Reenviar código" button gets its own client-side cooldown so the user
 * doesn't get rate-limited from a fat finger.
 */

"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ActionResultDrawer } from "@/components/kane/ActionResultDrawer";
import { cn } from "@/lib/utils";

const RESEND_COOLDOWN_SECONDS = 45;

type OtpPurpose = "email_verification" | "new_device" | "pin_reset";
const VALID_PURPOSES: ReadonlyArray<OtpPurpose> = [
  "email_verification",
  "new_device",
  "pin_reset",
];

/**
 * Where to land after a successful OTP verification.
 *
 * - email_verification → onboarding flow always.
 * - pin_reset          → /auth/set-pin always.
 * - new_device         → /auth/set-pin if the user has no PIN yet (e.g.
 *                        their account was set up on another device, or
 *                        they came via "Olvidé mi PIN" with `?next=set-pin`),
 *                        otherwise /dashboard.
 *
 * The `next` query param overrides everything when present.
 */
function computeNextRoute(
  purpose: OtpPurpose,
  hasPin: boolean,
  next: string | null,
): string {
  if (next === "set-pin") return "/auth/set-pin";
  if (purpose === "email_verification") return "/onboarding/name";
  if (purpose === "pin_reset") return "/auth/set-pin";
  if (purpose === "new_device") return hasPin ? "/dashboard" : "/auth/set-pin";
  return "/dashboard";
}

const TITLE_BY_PURPOSE: Record<OtpPurpose, string> = {
  email_verification: "Verifica tu correo",
  new_device: "Verifica este dispositivo",
  pin_reset: "Recupera tu PIN",
};

const SUCCESS_TITLE_BY_PURPOSE: Record<OtpPurpose, string> = {
  email_verification: "Correo verificado",
  new_device: "Dispositivo verificado",
  pin_reset: "Código verificado",
};

const SUCCESS_DESC_BY_PURPOSE: Record<OtpPurpose, string> = {
  email_verification:
    "Listo. Sigamos con tu nombre para terminar de configurar la cuenta.",
  new_device: "Este dispositivo quedó marcado como confiable.",
  pin_reset: "Ahora podrás crear un PIN nuevo en el siguiente paso.",
};

export default function VerifyEmailPage() {
  return (
    <React.Suspense
      fallback={
        <main className="flex min-h-[100dvh] items-center justify-center bg-background">
          <Loader2
            size={20}
            className="animate-spin text-muted-foreground"
            aria-label="Cargando"
          />
        </main>
      }
    >
      <VerifyEmailInner />
    </React.Suspense>
  );
}

function VerifyEmailInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const purposeParam = searchParams.get("purpose");
  const purpose: OtpPurpose = VALID_PURPOSES.includes(
    purposeParam as OtpPurpose,
  )
    ? (purposeParam as OtpPurpose)
    : "email_verification";
  // Email comes via URL only on the no-session new_device flow (login →
  // device not trusted). For email_verification and pin_reset the user is
  // already authenticated and the API uses session.user.email instead.
  const emailParam = searchParams.get("email")?.trim().toLowerCase() ?? "";
  // ?next=set-pin → after a successful new_device verification, override
  // the default destination (dashboard / set-pin via hasPin) and force the
  // user into /auth/set-pin. Used by the "Olvidé mi PIN" link in /login.
  const nextParam = searchParams.get("next");

  const [digits, setDigits] = React.useState<string[]>(() =>
    Array.from({ length: 6 }, () => ""),
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = React.useState(0);
  const [successOpen, setSuccessOpen] = React.useState(false);
  const [hasPin, setHasPin] = React.useState(false);
  // Reemplaza el legacy `toast.success("Te enviamos un código nuevo.")`.
  // El usuario explicitamente pide reenviar; un drawer modal hace el
  // acknowledgement mas claro que el toast efimero — facil perderlo si
  // estaba mirando el correo.
  const [resendSuccessOpen, setResendSuccessOpen] = React.useState(false);

  const code = digits.join("");

  function getDeviceSignals() {
    return {
      screenResolution:
        typeof window !== "undefined"
          ? `${window.screen.width}x${window.screen.height}`
          : null,
      timezone:
        typeof Intl !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone
          : null,
    };
  }

  // Tick down the resend cooldown each second.
  React.useEffect(() => {
    if (resendCountdown <= 0) return;
    const id = window.setTimeout(
      () => setResendCountdown((n) => Math.max(0, n - 1)),
      1000,
    );
    return () => window.clearTimeout(id);
  }, [resendCountdown]);

  async function submitCode(value: string) {
    if (submitting) return;
    if (value.length !== 6) {
      setErrorMsg("Ingresa los 6 dígitos del código.");
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const isNoSession = purpose === "new_device" && emailParam.length > 0;
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: value,
          purpose,
          ...(isNoSession
            ? { email: emailParam, deviceSignals: getDeviceSignals() }
            : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        hasPin?: boolean;
      };
      if (!res.ok) {
        setErrorMsg(data.error ?? "Código inválido.");
        setSubmitting(false);
        return;
      }
      // Persistir email del flujo new_device para auto-skip al PIN en
      // el proximo /login en este mismo device. Replica la misma key
      // que /login/page.tsx escribe en login-with-pin.
      if (
        purpose === "new_device" &&
        emailParam.length > 0 &&
        typeof window !== "undefined"
      ) {
        try {
          window.localStorage.setItem("kane-last-email", emailParam);
        } catch {
          // storage disabled
        }
      }
      setHasPin(!!data.hasPin);
      setSuccessOpen(true);
    } catch (err) {
      console.error("[verify-email] submit:", err);
      setErrorMsg("No pudimos verificar el código.");
      setSubmitting(false);
    }
  }

  function handleSuccessOpenChange(open: boolean) {
    setSuccessOpen(open);
    // Drawer cerrado = continuar al siguiente paso. Para flujos que
    // cambian la sesion (email_verification post-signup, new_device login
    // sin sesion previa) hacemos full reload asi el SessionProvider
    // re-monta con la cookie nueva. Para pin_reset la sesion no cambia,
    // soft nav alcanza.
    if (!open) {
      const target = computeNextRoute(purpose, hasPin, nextParam);
      const needsFullReload =
        purpose === "email_verification" || purpose === "new_device";
      if (needsFullReload && typeof window !== "undefined") {
        window.location.assign(target);
      } else {
        router.push(target);
      }
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submitCode(code);
  }

  async function handleResend() {
    if (resendCountdown > 0) return;
    try {
      const isNoSession = purpose === "new_device" && emailParam.length > 0;
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          purpose,
          ...(isNoSession ? { email: emailParam } : {}),
        }),
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
        setResendSuccessOpen(true);
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
              {TITLE_BY_PURPOSE[purpose]}
            </h1>
            <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
              Te enviamos un código de 6 dígitos. Ingrésalo abajo para
              continuar.
            </p>
          </header>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <OtpCells
              digits={digits}
              onChange={(next) => {
                setDigits(next);
                if (errorMsg) setErrorMsg(null);
                const joined = next.join("");
                if (joined.length === 6) {
                  void submitCode(joined);
                }
              }}
              disabled={submitting}
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

      <ActionResultDrawer
        open={successOpen}
        onOpenChange={handleSuccessOpenChange}
        tone="success"
        title={SUCCESS_TITLE_BY_PURPOSE[purpose]}
        description={SUCCESS_DESC_BY_PURPOSE[purpose]}
        closeLabel="Continuar"
      />

      <ActionResultDrawer
        open={resendSuccessOpen}
        onOpenChange={setResendSuccessOpen}
        tone="info"
        title="Código reenviado"
        description="Te enviamos un código nuevo a tu correo. Puede demorar unos segundos."
        closeLabel="Listo"
      />
    </main>
  );
}

/**
 * 6-cell OTP input with paste-fill + auto-advance + backspace-back.
 * Keeps the same 6-digit semantics — only the visual changes.
 */
function OtpCells({
  digits,
  onChange,
  disabled,
}: {
  digits: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([]);

  // Auto-focus the first cell on mount.
  React.useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  function handleCellChange(idx: number, raw: string) {
    const onlyDigits = raw.replace(/\D/g, "");
    if (onlyDigits.length === 0) {
      const next = digits.slice();
      next[idx] = "";
      onChange(next);
      return;
    }
    // If the user pasted multiple chars into one cell, distribute them.
    const next = digits.slice();
    let cursor = idx;
    for (const ch of onlyDigits) {
      if (cursor >= next.length) break;
      next[cursor] = ch;
      cursor += 1;
    }
    onChange(next);
    const focusIdx = Math.min(cursor, next.length - 1);
    refs.current[focusIdx]?.focus();
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      e.preventDefault();
      const next = digits.slice();
      next[idx - 1] = "";
      onChange(next);
      refs.current[idx - 1]?.focus();
      return;
    }
    if (e.key === "ArrowLeft" && idx > 0) {
      e.preventDefault();
      refs.current[idx - 1]?.focus();
      return;
    }
    if (e.key === "ArrowRight" && idx < digits.length - 1) {
      e.preventDefault();
      refs.current[idx + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const next = Array.from({ length: 6 }, (_, i) => text[i] ?? "");
    onChange(next);
    const focusIdx = Math.min(text.length, 5);
    refs.current[focusIdx]?.focus();
  }

  return (
    <div className="flex items-center justify-center gap-2" role="group" aria-label="Código de 6 dígitos">
      {digits.map((d, idx) => (
        <input
          key={idx}
          ref={(el) => {
            refs.current[idx] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={idx === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={d}
          disabled={disabled}
          onChange={(e) => handleCellChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={`Dígito ${idx + 1}`}
          className={cn(
            "h-14 w-12 rounded-xl border border-input bg-background",
            "text-center text-[24px] font-bold tabular-nums text-foreground",
            "outline-none transition-colors",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "disabled:opacity-60",
          )}
        />
      ))}
    </div>
  );
}

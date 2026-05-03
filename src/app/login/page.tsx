/**
 * /login — passwordless email-first login.
 *
 * Step 1: user types email. We POST to /api/auth/check-device with the
 *   email + device signals (no session needed) and decide:
 *
 *     - exists && hasPin && trusted   → step "pin": render the 4-digit
 *                                        keypad. On match, /api/auth/login-with-pin
 *                                        rotates the throwaway password
 *                                        and signs the user in.
 *     - exists && (!trusted || !hasPin) → send a `new_device` OTP and
 *                                        redirect to /auth/verify-email
 *                                        which finishes the auth + lands
 *                                        the user on /auth/set-pin or
 *                                        /dashboard depending on hasPin.
 *     - !exists                       → inline error pointing the user
 *                                        at /register.
 *
 * No password input anywhere — the legacy email+password forms got
 * replaced by this flow. The "Olvidé mi PIN" link in step 2 reuses the
 * new_device OTP path with `?next=set-pin` so the user lands directly
 * on /auth/set-pin after verifying.
 */

"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Delete, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionResultDrawer } from "@/components/kane/ActionResultDrawer";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

const PIN_LENGTH = 4;
const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
// Persist the last successfully-authed email per device. Lets a returning
// user skip the email step entirely on the next /login. Cleared on account
// deletion (settings/page.tsx) and on explicit "Cambiar correo" tap.
const LAST_EMAIL_KEY = "kane-last-email";

function readLastEmail(): string {
  try {
    return window.localStorage.getItem(LAST_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

function persistLastEmail(email: string) {
  try {
    window.localStorage.setItem(LAST_EMAIL_KEY, email);
  } catch {
    // storage disabled
  }
}

function clearLastEmail() {
  try {
    window.localStorage.removeItem(LAST_EMAIL_KEY);
  } catch {
    // storage disabled
  }
}

type Step = "email" | "pin";

export default function LoginPage() {
  // useSearchParams() forces a client-rendered subtree, so wrap with Suspense
  // to satisfy Next.js' static-rendering check.
  return (
    <React.Suspense fallback={<LoginShell />}>
      <LoginInner />
    </React.Suspense>
  );
}

function LoginShell() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background">
      <Loader2
        size={20}
        className="animate-spin text-muted-foreground"
        aria-label="Cargando"
      />
    </main>
  );
}

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefillEmail = (searchParams.get("email") ?? "").toLowerCase();

  const [step, setStep] = React.useState<Step>("email");
  const [email, setEmail] = React.useState(prefillEmail);
  const [pin, setPin] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Drawer info que aparece cuando el usuario aterriza con ?email= desde
  // /register (caso 409 email_exists_verified): un "ya tienes cuenta"
  // explicito antes de pedirle PIN.
  const [prefillDrawerOpen, setPrefillDrawerOpen] = React.useState(false);
  const [prefillNoticeShown, setPrefillNoticeShown] = React.useState(false);
  React.useEffect(() => {
    if (prefillEmail && !prefillNoticeShown) {
      setPrefillNoticeShown(true);
      setPrefillDrawerOpen(true);
    }
  }, [prefillEmail, prefillNoticeShown]);

  // Auto-skip a step "pin" si este device ya autentico antes a una
  // cuenta que sigue siendo confiable. Se ejecuta solo en el mount,
  // sin disparar OTP — silencioso. Si las condiciones cambiaron
  // (cuenta borrada, device revocado), el email queda prefilled en
  // step "email" y el usuario continua manualmente.
  const [autoSkipChecked, setAutoSkipChecked] = React.useState(false);
  React.useEffect(() => {
    if (autoSkipChecked) return;
    if (prefillEmail) {
      setAutoSkipChecked(true);
      return;
    }
    const last = readLastEmail();
    if (!last) {
      setAutoSkipChecked(true);
      return;
    }
    setEmail(last);

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/check-device", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: last,
            deviceSignals: getDeviceSignals(),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          exists?: boolean;
          hasPin?: boolean;
          trusted?: boolean;
        };
        if (cancelled) return;
        if (res.ok && data.exists && data.hasPin && data.trusted) {
          setStep("pin");
        } else if (res.ok && !data.exists) {
          // Email no longer exists in DB — clear stale entry.
          clearLastEmail();
        }
        // Else (untrusted or no PIN): leave on step "email" with prefill,
        // let the user click "Continuar" so the OTP send is intentional.
      } catch {
        // Network error — fall through with email prefilled.
      } finally {
        if (!cancelled) setAutoSkipChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const trimmedEmail = email.trim();
  const emailInvalid = !EMAIL_REGEX.test(trimmedEmail);

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || emailInvalid) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const checkRes = await fetch("/api/auth/check-device", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          deviceSignals: getDeviceSignals(),
        }),
      });
      const checkData = (await checkRes.json().catch(() => ({}))) as {
        exists?: boolean;
        hasPin?: boolean;
        trusted?: boolean;
        error?: string;
      };

      if (!checkRes.ok) {
        setErrorMsg(checkData.error ?? "No pudimos continuar.");
        setSubmitting(false);
        return;
      }

      if (!checkData.exists) {
        setErrorMsg(
          "No encontramos una cuenta con ese correo.",
        );
        setSubmitting(false);
        return;
      }

      if (checkData.hasPin && checkData.trusted) {
        setStep("pin");
        setSubmitting(false);
        return;
      }

      // Untrusted device or no PIN: route through new_device OTP.
      const otpRes = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          purpose: "new_device",
        }),
      });
      const otpData = (await otpRes.json().catch(() => ({}))) as {
        error?: string;
        delivered?: boolean;
        devMode?: boolean;
      };
      if (!otpRes.ok) {
        setErrorMsg(otpData.error ?? "No pudimos enviar el código.");
        setSubmitting(false);
        return;
      }
      if (otpData.devMode) {
        toast.info("Modo dev: revisa la consola del servidor.");
      }
      router.push(
        `/auth/verify-email?purpose=new_device&email=${encodeURIComponent(trimmedEmail)}`,
      );
    } catch (err) {
      console.error("[login] email_submit:", err);
      setErrorMsg("Error de red. Intenta otra vez.");
      setSubmitting(false);
    }
  }

  // Auto-submit when the 4 digits are filled.
  React.useEffect(() => {
    if (step !== "pin") return;
    if (pin.length !== PIN_LENGTH) return;
    if (submitting) return;
    void submitPin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, step]);

  async function submitPin() {
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/auth/login-with-pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          pin,
          deviceSignals: getDeviceSignals(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        attemptsRemaining?: number;
        lockedUntil?: string | null;
      };
      if (!res.ok) {
        setErrorMsg(data.error ?? "No pudimos iniciar sesión.");
        setPin("");
        setSubmitting(false);
        return;
      }
      // Recordar este email para skip-to-PIN en el proximo /login en
      // este device.
      persistLastEmail(trimmedEmail);
      // Hard navigate so SessionProvider re-mounts with the fresh cookie
      // and (tabs)/layout's server-side guard sees the active session.
      if (typeof window !== "undefined") {
        window.location.assign("/dashboard");
      }
    } catch (err) {
      console.error("[login] pin_submit:", err);
      setErrorMsg("Error de red. Intenta otra vez.");
      setPin("");
      setSubmitting(false);
    }
  }

  async function handleForgotPin() {
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          // Reusing new_device because pin_reset still requires a session.
          // The verify-email page reads ?next=set-pin and forces /auth/set-pin
          // after the OTP regardless of hasPin, so the user gets a fresh PIN.
          purpose: "new_device",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        delivered?: boolean;
        devMode?: boolean;
      };
      if (!res.ok) {
        toast.error(data.error ?? "No pudimos enviar el código.");
        setSubmitting(false);
        return;
      }
      if (data.devMode) {
        toast.info("Modo dev: revisa la consola del servidor.");
      }
      router.push(
        `/auth/verify-email?purpose=new_device&email=${encodeURIComponent(trimmedEmail)}&next=set-pin`,
      );
    } catch (err) {
      console.error("[login] forgot_pin:", err);
      toast.error("No pudimos enviar el código.");
      setSubmitting(false);
    }
  }

  function handleStartOver() {
    // El usuario explicitamente quiere cambiar de cuenta — borramos el
    // last-email cache asi no auto-volvemos al PIN del email anterior.
    clearLastEmail();
    setStep("email");
    setEmail("");
    setPin("");
    setErrorMsg(null);
  }

  function handleKeypadDigit(d: string) {
    if (submitting) return;
    if (pin.length >= PIN_LENGTH) return;
    setPin(pin + d);
    if (errorMsg) setErrorMsg(null);
  }

  function handleKeypadBackspace() {
    if (submitting) return;
    if (pin.length === 0) return;
    setPin(pin.slice(0, -1));
    if (errorMsg) setErrorMsg(null);
  }

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8 text-foreground">
      <div className="relative w-full max-w-[440px]">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
          <header className="mb-6">
            <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <KeyRound size={20} aria-hidden />
            </span>
            <h1 className="text-[22px] font-bold leading-tight text-foreground">
              {step === "email" ? "Inicia sesión" : "Ingresa tu PIN"}
            </h1>
            <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
              {step === "email"
                ? `Bienvenido de vuelta a ${APP_NAME}. Te pediremos tu PIN si este dispositivo ya está autorizado.`
                : `Hola${trimmedEmail ? `, ${trimmedEmail}` : ""}. Toca tu PIN de 4 dígitos.`}
            </p>
          </header>

          {step === "email" ? (
            <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="login-email">Correo</Label>
                <Input
                  id="login-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="tu@correo.com"
                  required
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
                disabled={submitting || emailInvalid}
                className={cn("h-11 w-full rounded-xl text-[14px] font-semibold")}
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" aria-hidden />
                    Verificando…
                  </>
                ) : (
                  "Continuar"
                )}
              </Button>

              <p className="text-center text-[12px] text-muted-foreground">
                ¿No tienes cuenta?{" "}
                <Link
                  href="/register"
                  className="font-semibold text-primary hover:underline"
                >
                  Crea una
                </Link>
              </p>
            </form>
          ) : (
            <div className="flex flex-col gap-2">
              <PinDots length={PIN_LENGTH} filled={pin.length} />

              {errorMsg && (
                <div
                  role="alert"
                  className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-center text-[13px] text-destructive"
                >
                  {errorMsg}
                </div>
              )}

              <Keypad
                onDigit={handleKeypadDigit}
                onBackspace={handleKeypadBackspace}
                disabled={submitting}
              />

              <div className="mt-3 flex flex-col items-center gap-2">
                {submitting && (
                  <span className="inline-flex items-center gap-2 text-[12px] text-muted-foreground">
                    <Loader2 size={14} className="animate-spin" aria-hidden />
                    Verificando…
                  </span>
                )}
                {!submitting && (
                  <>
                    <button
                      type="button"
                      onClick={handleForgotPin}
                      className="text-[13px] font-semibold text-primary hover:underline"
                    >
                      Olvidé mi PIN
                    </button>
                    <button
                      type="button"
                      onClick={handleStartOver}
                      className="text-[12px] font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Cambiar correo
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      <ActionResultDrawer
        open={prefillDrawerOpen}
        onOpenChange={setPrefillDrawerOpen}
        tone="info"
        title="Ya tienes cuenta"
        description={
          prefillEmail
            ? `Encontramos una cuenta con ${prefillEmail}. Ingresa tu PIN para continuar.`
            : "Encontramos una cuenta con este correo. Ingresa tu PIN para continuar."
        }
        closeLabel="Entendido"
      />
    </main>
  );
}

function PinDots({
  length,
  filled,
}: {
  length: number;
  filled: number;
}) {
  return (
    <div
      role="img"
      aria-label={`PIN: ${filled} de ${length} dígitos`}
      className="flex items-center justify-center gap-4 py-3"
    >
      {Array.from({ length }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            "h-3.5 w-3.5 rounded-full transition-colors",
            i < filled ? "bg-primary" : "border-2 border-border bg-transparent",
          )}
        />
      ))}
    </div>
  );
}

const KEYPAD_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

function Keypad({
  onDigit,
  onBackspace,
  disabled,
}: {
  onDigit: (d: string) => void;
  onBackspace: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-4 grid grid-cols-3 gap-3">
      {KEYPAD_DIGITS.map((d) => (
        <KeypadButton
          key={d}
          onClick={() => onDigit(d)}
          disabled={disabled}
          ariaLabel={`Dígito ${d}`}
        >
          {d}
        </KeypadButton>
      ))}
      <span aria-hidden />
      <KeypadButton
        onClick={() => onDigit("0")}
        disabled={disabled}
        ariaLabel="Dígito 0"
      >
        0
      </KeypadButton>
      <KeypadButton
        onClick={onBackspace}
        disabled={disabled}
        ariaLabel="Borrar último dígito"
        variant="utility"
      >
        <Delete size={22} aria-hidden />
      </KeypadButton>
    </div>
  );
}

function KeypadButton({
  children,
  onClick,
  disabled,
  ariaLabel,
  variant = "digit",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  ariaLabel: string;
  variant?: "digit" | "utility";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        "flex h-16 items-center justify-center rounded-2xl border border-border",
        "text-[24px] font-semibold tabular-nums transition-colors",
        "active:scale-[0.97] active:bg-primary/10",
        "disabled:cursor-not-allowed disabled:opacity-60",
        variant === "utility" ? "text-muted-foreground" : "text-foreground",
      )}
    >
      {children}
    </button>
  );
}

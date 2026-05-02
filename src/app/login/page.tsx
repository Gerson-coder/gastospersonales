/**
 * Login route — Lumi
 *
 * Two macro-modes, branched at runtime by the presence of NEXT_PUBLIC_SUPABASE_URL
 * (Next inlines NEXT_PUBLIC_* at build time, so the check works in the browser
 * bundle):
 *
 *   1. Envs PRESENT  → real Supabase email + password flow with five sub-modes:
 *        - "signin"        → sign in with email + password
 *        - "signup"        → create account (email + password + confirm)
 *        - "signup-sent"   → "check your inbox to confirm"
 *        - "forgot"        → request a password-reset email
 *        - "forgot-sent"   → "check your inbox for the reset link"
 *
 *      Magic-link is no longer the primary path. The /auth/callback route still
 *      handles `?code=` exchanges (signup confirmation, password reset, and any
 *      stray magic links Supabase might still issue via OTP).
 *
 *   2. Envs ABSENT   → name-only stub (offline preview / demo). Enter name,
 *      persist to localStorage, jump to /dashboard. Lets `npm run dev` work
 *      without a Supabase project.
 *
 * Layout: the form card is centered both vertically and horizontally inside
 * a `min-h-[100dvh] flex items-center justify-center` shell so it sits in the
 * middle of the viewport on every screen size. We use `100dvh` (dynamic
 * viewport height) instead of `100vh` to avoid the mobile Chrome address-bar
 * jump that pushes the card off-screen when the URL bar collapses/expands.
 */

"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useUserName } from "@/lib/use-user-name";
import { cn } from "@/lib/utils";

// Runtime feature flag: do we have Supabase wired up?
const SUPABASE_ENABLED =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;

// Maps the `?error=` codes that /auth/callback may send back to user-facing
// copy. Anything not listed falls through to the generic message.
const ERROR_MESSAGES: Record<string, string> = {
  missing_code: "El enlace no es válido. Pide uno nuevo.",
  auth_disabled: "El inicio de sesión no está activo en este entorno.",
};
const GENERIC_ERROR = "No pudimos iniciarte sesión. Inténtalo de nuevo.";

// Cooldown between "resend confirmation/reset" clicks. Long enough to
// discourage spamming the SMTP queue, short enough to retry without rage.
const RESEND_COOLDOWN_SECONDS = 30;

// Min password length enforced on the client. Supabase enforces a server-side
// minimum too (default 6, configurable). 8 is a friendlier default.
const MIN_PASSWORD_LENGTH = 8;

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type AuthMode = "signin" | "signup" | "signup-sent" | "forgot" | "forgot-sent";

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

  // ?mode=forgot lets external callers (e.g. the "link expired" page on
  // /auth/reset-password) deep-link straight into the forgot-password screen.
  const initialMode: AuthMode =
    searchParams.get("mode") === "forgot" ? "forgot" : "signin";

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8 text-foreground">
      <HeroGlow />

      <div className="relative w-full max-w-[440px]">
        <section
          aria-labelledby="login-heading"
          className="animate-in fade-in slide-in-from-bottom-2 duration-500 rounded-2xl border border-border bg-card p-6 shadow-card md:p-8"
        >
          {errorMessage ? (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive"
            >
              {errorMessage}
            </div>
          ) : null}

          {SUPABASE_ENABLED ? (
            <PasswordAuthForm initialMode={initialMode} />
          ) : (
            <NameOnlyForm />
          )}
        </section>

        <footer className="mt-8">
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

function LoginShell() {
  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8 text-foreground">
      <HeroGlow />
      <div className="relative w-full max-w-[440px]">
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card md:p-8" />
      </div>
    </main>
  );
}

// ─── Hero visual ──────────────────────────────────────────────────────────
function HeroGlow() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[360px] overflow-hidden"
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

// ─── Header (heading + subtitle, varies per mode) ─────────────────────────
function ModeHeading({ mode }: { mode: AuthMode }) {
  const subtitle = SUBTITLE_BY_MODE[mode];
  return (
    <header className="text-center">
      <h1
        id="login-heading"
        className="font-sans text-3xl font-bold leading-tight tracking-tight text-foreground md:text-[34px]"
      >
        Bienvenido a Lumi
      </h1>
      {subtitle ? (
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          {subtitle}
        </p>
      ) : null}
    </header>
  );
}

const SUBTITLE_BY_MODE: Record<AuthMode, string> = {
  signin: "Inicia sesión con tu email y contraseña.",
  signup: "Crea tu cuenta para empezar.",
  "signup-sent": "Revisa tu correo",
  forgot: "Recuperar contraseña",
  "forgot-sent": "Te enviamos un enlace",
};

// ─── Password-visibility toggle input ─────────────────────────────────────
function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  disabled,
  ariaInvalid,
  ariaDescribedBy,
  placeholder,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  disabled?: boolean;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        name={id}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        required
        maxLength={128}
        placeholder={placeholder ?? "••••••••"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={ariaInvalid ? true : undefined}
        aria-describedby={ariaDescribedBy}
        className="h-12 rounded-xl px-4 pr-12 text-base"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
        tabIndex={-1}
        className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {visible ? (
          <EyeOff size={18} aria-hidden="true" />
        ) : (
          <Eye size={18} aria-hidden="true" />
        )}
      </button>
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
    void persistName(trimmed);
    router.push("/dashboard");
  }

  return (
    <>
      <header className="text-center">
        <h1
          id="login-heading"
          className="font-sans text-3xl font-bold leading-tight tracking-tight text-foreground md:text-[34px]"
        >
          Bienvenido a Lumi
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          ¿Cómo te llamas? Así te llamaremos desde aquí.
        </p>
      </header>

      <form
        noValidate
        onSubmit={handleSubmit}
        aria-busy={isSubmitting}
        className="mt-8 space-y-4"
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

// ─── Real flow: Supabase email + password ─────────────────────────────────
function PasswordAuthForm({ initialMode }: { initialMode: AuthMode }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<AuthMode>(initialMode);

  // Shared state across modes.
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);

  // "Email not confirmed" surfaces a one-tap resend on the signin screen.
  const [needsConfirmation, setNeedsConfirmation] = React.useState(false);

  // Cooldown timer shared by signup-sent and forgot-sent.
  const [cooldown, setCooldown] = React.useState(0);

  // ── Trusted-device PIN check ─────────────────────────────────────────
  // On mount, if the user already has an active Supabase session AND a
  // PIN configured AND this device is trusted, we flip to a Yape-style
  // PIN-only screen. Otherwise we fall through to the existing email +
  // password form. The `pinGate` state holds the resolution; null means
  // "still checking" — we show a tiny spinner then.
  type PinGate =
    | { state: "checking" }
    | { state: "pin-only" }
    | { state: "password" };
  const [pinGate, setPinGate] = React.useState<PinGate>({ state: "checking" });
  const [pinValue, setPinValue] = React.useState("");
  const [pinSubmitting, setPinSubmitting] = React.useState(false);
  const [pinError, setPinError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const deviceSignals = {
          screenResolution:
            typeof window !== "undefined"
              ? `${window.screen.width}x${window.screen.height}`
              : null,
          timezone:
            typeof Intl !== "undefined"
              ? Intl.DateTimeFormat().resolvedOptions().timeZone
              : null,
        };
        const res = await fetch("/api/auth/check-device", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deviceSignals }),
        });
        if (!res.ok) {
          // 401 = no session, fall through to password screen.
          if (!cancelled) setPinGate({ state: "password" });
          return;
        }
        const data = (await res.json()) as { hasPin: boolean; trusted: boolean };
        if (cancelled) return;
        setPinGate({
          state: data.hasPin && data.trusted ? "pin-only" : "password",
        });
      } catch {
        if (!cancelled) setPinGate({ state: "password" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handlePinSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pinSubmitting) return;
    if (pinValue.length !== 6) {
      setPinError("Ingresa los 6 dígitos del PIN.");
      return;
    }
    setPinSubmitting(true);
    setPinError(null);
    try {
      const res = await fetch("/api/auth/verify-pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin: pinValue }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        attemptsRemaining?: number;
      };
      if (!res.ok) {
        setPinError(data.error ?? "PIN incorrecto.");
        setPinValue("");
        setPinSubmitting(false);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setPinError("No pudimos verificar el PIN.");
      setPinSubmitting(false);
    }
  }

  const trimmedEmail = email.trim();
  const emailInvalid =
    trimmedEmail.length === 0 || !EMAIL_REGEX.test(trimmedEmail);
  const passwordTooShort = password.length < MIN_PASSWORD_LENGTH;
  const passwordsMismatch = password !== confirmPassword;

  // Tick the cooldown each second.
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldown]);

  // When mode changes, drop transient validation/error UI but keep the email
  // so users hopping signin → forgot don't have to retype.
  function switchMode(next: AuthMode) {
    setMode(next);
    setSubmitted(false);
    setServerError(null);
    setNeedsConfirmation(false);
  }

  // ─── Submit handlers ────────────────────────────────────────────────────
  async function handleSignin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setSubmitted(true);
    if (emailInvalid || password.length === 0) return;

    setIsSubmitting(true);
    setServerError(null);
    setNeedsConfirmation(false);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });
      if (error) {
        // Surface the "email not confirmed" case explicitly so we can offer a
        // resend button. Rate-limit gets its own message so the user knows to
        // wait. Everything else falls back to a generic credentials message —
        // we deliberately don't reveal whether the email exists.
        console.error(
          `[login] signin_failed status=${error.status ?? "unknown"} code=${error.code ?? "unknown"} message=${error.message}`,
        );
        const msg = error.message.toLowerCase();
        if (msg.includes("not confirmed") || msg.includes("confirm")) {
          setNeedsConfirmation(true);
          setServerError(
            "Confirma tu email primero. Revisa tu correo.",
          );
        } else if (error.status === 429 || msg.includes("rate")) {
          toast.error(
            "Demasiados intentos. Espera unos minutos antes de volver a probar.",
          );
        } else {
          toast.error("Email o contraseña incorrectos.");
        }
        return;
      }
      router.push("/dashboard");
      // Refresh server components so middleware picks up the new session.
      router.refresh();
    } catch (err) {
      console.error(
        `[login] signin_threw message=${err instanceof Error ? err.message : String(err)}`,
      );
      toast.error("No pudimos iniciar sesión. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSignup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setSubmitted(true);
    if (emailInvalid || passwordTooShort || passwordsMismatch) return;

    setIsSubmitting(true);
    setServerError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        },
      });
      if (error) {
        const msg = error.message.toLowerCase();
        if (
          msg.includes("already registered") ||
          msg.includes("already been registered") ||
          msg.includes("user already")
        ) {
          toast.error("Ya tienes una cuenta con ese email. Inicia sesión.");
          switchMode("signin");
          return;
        }
        toast.error(error.message || "No pudimos crear la cuenta.");
        return;
      }
      setMode("signup-sent");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      toast.error("No pudimos crear la cuenta.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleForgot(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setSubmitted(true);
    if (emailInvalid) return;

    setIsSubmitting(true);
    setServerError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(
        trimmedEmail,
        {
          // Route through /auth/callback so the server handler exchanges the
          // PKCE code and writes session cookies, then forwards to the
          // reset-password form. Going directly to /auth/reset-password skips
          // the exchange and the page can't see a session.
          redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
        },
      );
      if (error) {
        toast.error(error.message || "No pudimos enviar el correo.");
        return;
      }
      setMode("forgot-sent");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      toast.error("No pudimos enviar el correo.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendSignup() {
    if (cooldown > 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: trimmedEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        },
      });
      if (error) {
        toast.error("No pudimos reenviar el correo. Inténtalo más tarde.");
        return;
      }
      toast.success("Correo reenviado");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendForgot() {
    if (cooldown > 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(
        trimmedEmail,
        {
          // Route through /auth/callback so the server handler exchanges the
          // PKCE code and writes session cookies, then forwards to the
          // reset-password form. Going directly to /auth/reset-password skips
          // the exchange and the page can't see a session.
          redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset-password`,
        },
      );
      if (error) {
        toast.error("No pudimos reenviar el correo. Inténtalo más tarde.");
        return;
      }
      toast.success("Correo reenviado");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResendConfirmationFromSignin() {
    if (isSubmitting || emailInvalid) return;
    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: trimmedEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        },
      });
      if (error) {
        toast.error("No pudimos reenviar el correo.");
        return;
      }
      toast.success("Correo de confirmación reenviado.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // ─── Trusted-device PIN screen (Yape style) ─────────────────────────────
  // While `check-device` resolves, show a calm spinner instead of flashing
  // the email form. After resolution, render either the PIN screen or fall
  // through to the existing email+password modes.
  if (pinGate.state === "checking") {
    return (
      <div
        className="flex min-h-[180px] items-center justify-center"
        aria-busy
      >
        <Loader2
          size={20}
          className="animate-spin text-muted-foreground"
          aria-label="Cargando"
        />
      </div>
    );
  }

  if (pinGate.state === "pin-only") {
    return (
      <form
        onSubmit={handlePinSubmit}
        className="mt-6 flex flex-col gap-4"
        noValidate
      >
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Hola de nuevo
          </p>
          <h2 className="mt-1 text-[20px] font-bold text-foreground">
            Ingresa tu PIN
          </h2>
          <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
            6 dígitos. Sigues conectado en este dispositivo.
          </p>
        </div>

        <Input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={pinValue}
          onChange={(e) =>
            setPinValue(e.target.value.replace(/\D/g, "").slice(0, 6))
          }
          placeholder="••••••"
          maxLength={6}
          className="h-14 text-center text-[28px] font-bold tracking-[0.5em] tabular-nums"
          aria-label="PIN de 6 dígitos"
        />

        {pinError && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-[13px] text-destructive"
          >
            {pinError}
          </div>
        )}

        <Button
          type="submit"
          disabled={pinSubmitting || pinValue.length !== 6}
          className="h-11 w-full rounded-xl text-[14px] font-semibold"
        >
          {pinSubmitting ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden />
              Verificando…
            </>
          ) : (
            "Entrar"
          )}
        </Button>

        <button
          type="button"
          onClick={() => {
            setPinGate({ state: "password" });
            setPinError(null);
          }}
          className="text-center text-[13px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          Ingresa con tu correo
        </button>
      </form>
    );
  }

  // ─── Sent-state cards (shared layout for signup-sent and forgot-sent) ───
  if (mode === "signup-sent" || mode === "forgot-sent") {
    const isSignupSent = mode === "signup-sent";
    const heading = isSignupSent
      ? "Revisa tu correo"
      : "Te enviamos el enlace de recuperación";
    const description = isSignupSent
      ? "para confirmar tu cuenta. Tócalo para activarla."
      : "y toca el link para crear una contraseña nueva.";
    const onResend = isSignupSent ? handleResendSignup : handleResendForgot;

    return (
      <SentCard
        heading={heading}
        email={trimmedEmail}
        description={description}
        cooldown={cooldown}
        isSubmitting={isSubmitting}
        onResend={onResend}
        onChangeEmail={() => switchMode(isSignupSent ? "signup" : "forgot")}
        onBackToSignin={() => switchMode("signin")}
      />
    );
  }

  // ─── Forms ──────────────────────────────────────────────────────────────
  return (
    <>
      <ModeHeading mode={mode} />

      {mode === "signin" ? (
        <form
          noValidate
          onSubmit={handleSignin}
          aria-busy={isSubmitting}
          className="mt-8 space-y-4"
        >
          <EmailField
            value={email}
            onChange={(v) => {
              setEmail(v);
              if (submitted) setSubmitted(false);
              if (serverError) setServerError(null);
              if (needsConfirmation) setNeedsConfirmation(false);
            }}
            disabled={isSubmitting}
            invalid={submitted && emailInvalid}
            autoFocus
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label
                htmlFor="login-password"
                className="text-[13px] font-semibold uppercase tracking-[0.04em] text-muted-foreground"
              >
                Contraseña
              </Label>
              <button
                type="button"
                onClick={() => switchMode("forgot")}
                className="text-[12px] font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            <PasswordInput
              id="login-password"
              value={password}
              onChange={(v) => {
                setPassword(v);
                if (submitted) setSubmitted(false);
                if (serverError) setServerError(null);
              }}
              autoComplete="current-password"
              disabled={isSubmitting}
              ariaInvalid={submitted && password.length === 0}
            />
            {submitted && password.length === 0 ? (
              <p
                role="alert"
                className="text-[13px] font-medium text-destructive"
              >
                Ingresa tu contraseña.
              </p>
            ) : null}
          </div>

          {serverError ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
              {serverError}
              {needsConfirmation ? (
                <button
                  type="button"
                  onClick={handleResendConfirmationFromSignin}
                  disabled={isSubmitting}
                  className="ml-2 underline underline-offset-2 hover:no-underline disabled:opacity-60"
                >
                  Reenviar correo de confirmación
                </button>
              ) : null}
            </div>
          ) : null}

          <Button
            type="submit"
            disabled={isSubmitting}
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
                Iniciando sesión…
              </>
            ) : (
              "Iniciar sesión"
            )}
          </Button>

          <p className="pt-2 text-center text-[13px] text-muted-foreground">
            ¿No tienes cuenta?{" "}
            <a
              href="/register"
              className="font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline"
            >
              Crear cuenta
            </a>
          </p>
        </form>
      ) : null}

      {mode === "signup" ? (
        <form
          noValidate
          onSubmit={handleSignup}
          aria-busy={isSubmitting}
          className="mt-8 space-y-4"
        >
          <EmailField
            value={email}
            onChange={(v) => {
              setEmail(v);
              if (submitted) setSubmitted(false);
            }}
            disabled={isSubmitting}
            invalid={submitted && emailInvalid}
            autoFocus
          />

          <div className="space-y-2">
            <Label
              htmlFor="signup-password"
              className="text-[13px] font-semibold uppercase tracking-[0.04em] text-muted-foreground"
            >
              Contraseña
            </Label>
            <PasswordInput
              id="signup-password"
              value={password}
              onChange={(v) => {
                setPassword(v);
                if (submitted) setSubmitted(false);
              }}
              autoComplete="new-password"
              disabled={isSubmitting}
              ariaInvalid={submitted && passwordTooShort}
              ariaDescribedBy="signup-password-hint"
            />
            <p
              id="signup-password-hint"
              className={cn(
                "text-[12px] leading-relaxed",
                submitted && passwordTooShort
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              Mínimo {MIN_PASSWORD_LENGTH} caracteres.
            </p>
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="signup-confirm"
              className="text-[13px] font-semibold uppercase tracking-[0.04em] text-muted-foreground"
            >
              Confirmar contraseña
            </Label>
            <PasswordInput
              id="signup-confirm"
              value={confirmPassword}
              onChange={(v) => {
                setConfirmPassword(v);
                if (submitted) setSubmitted(false);
              }}
              autoComplete="new-password"
              disabled={isSubmitting}
              ariaInvalid={submitted && passwordsMismatch}
            />
            {submitted && passwordsMismatch ? (
              <p
                role="alert"
                className="text-[13px] font-medium text-destructive"
              >
                Las contraseñas no coinciden.
              </p>
            ) : null}
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
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
                Creando cuenta…
              </>
            ) : (
              "Crear cuenta"
            )}
          </Button>

          <p className="pt-2 text-center text-[13px] text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className="font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline"
            >
              Iniciar sesión
            </button>
          </p>
        </form>
      ) : null}

      {mode === "forgot" ? (
        <form
          noValidate
          onSubmit={handleForgot}
          aria-busy={isSubmitting}
          className="mt-8 space-y-4"
        >
          <p className="text-[14px] leading-relaxed text-muted-foreground">
            Ingresa tu email y te enviaremos un enlace para crear una contraseña
            nueva.
          </p>
          <EmailField
            value={email}
            onChange={(v) => {
              setEmail(v);
              if (submitted) setSubmitted(false);
            }}
            disabled={isSubmitting}
            invalid={submitted && emailInvalid}
            autoFocus
          />

          <Button
            type="submit"
            disabled={isSubmitting}
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
              "Enviar enlace de recuperación"
            )}
          </Button>

          <p className="pt-2 text-center text-[13px] text-muted-foreground">
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className="font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline"
            >
              Volver a iniciar sesión
            </button>
          </p>
        </form>
      ) : null}

      <p className="pt-6 text-center text-[12px] leading-relaxed text-muted-foreground">
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
    </>
  );
}

// ─── Reusable email field (signin/signup/forgot share it) ─────────────────
function EmailField({
  value,
  onChange,
  disabled,
  invalid,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  return (
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
        autoFocus={autoFocus}
        required
        maxLength={254}
        placeholder="tu@email.com"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid ? "login-email-error" : undefined}
        className="h-12 rounded-xl px-4 text-base"
      />
      {invalid ? (
        <p
          id="login-email-error"
          role="alert"
          className="text-[13px] font-medium text-destructive"
        >
          Ingresa un email válido.
        </p>
      ) : null}
    </div>
  );
}

// ─── Sent card (shared by signup-sent and forgot-sent) ────────────────────
function SentCard({
  heading,
  email,
  description,
  cooldown,
  isSubmitting,
  onResend,
  onChangeEmail,
  onBackToSignin,
}: {
  heading: string;
  email: string;
  description: string;
  cooldown: number;
  isSubmitting: boolean;
  onResend: () => void;
  onChangeEmail: () => void;
  onBackToSignin: () => void;
}) {
  // Move focus to the resend button so screen readers announce the new state.
  const resendBtnRef = React.useRef<HTMLButtonElement | null>(null);
  React.useEffect(() => {
    resendBtnRef.current?.focus();
  }, []);

  return (
    <section
      role="status"
      aria-live="polite"
      aria-labelledby="sent-card-heading"
      className="animate-in fade-in slide-in-from-bottom-2 duration-500"
    >
      <div className="text-center">
        <div
          aria-hidden="true"
          className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)]"
        >
          <MailCheck size={26} strokeWidth={2} />
        </div>

        <h2
          id="sent-card-heading"
          className="mt-5 font-sans text-2xl font-bold leading-tight tracking-tight text-foreground md:text-[28px]"
        >
          {heading}
        </h2>

        <p className="mt-3 text-[14px] leading-relaxed text-muted-foreground">
          Te enviamos un correo a
        </p>
        <p className="mt-1 break-all text-[15px] font-semibold tracking-tight text-foreground">
          {email}
        </p>
        <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">
          {description}
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <Button
            ref={resendBtnRef}
            type="button"
            variant="secondary"
            onClick={onResend}
            disabled={cooldown > 0 || isSubmitting}
            aria-live="polite"
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
              "Reenviar correo"
            )}
          </Button>

          <button
            type="button"
            onClick={onChangeEmail}
            className="self-center rounded-sm text-[13px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            ¿No es tu correo? <span className="underline">Cambiar</span>
          </button>

          <button
            type="button"
            onClick={onBackToSignin}
            className="self-center rounded-sm text-[13px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Volver a iniciar sesión
          </button>
        </div>
      </div>

      <p className="mt-5 px-2 text-center text-[12px] leading-relaxed text-muted-foreground">
        Si no lo ves en unos minutos, revisa la carpeta de spam o promociones.
      </p>
    </section>
  );
}

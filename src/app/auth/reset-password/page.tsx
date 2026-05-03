/**
 * Reset password — Kane
 *
 * Destination of the password-reset email. Supabase issues a recovery token
 * and redirects the browser here. By the time this page mounts, the
 * `@supabase/ssr` client should already have an active recovery session
 * (Supabase parses the token from the URL fragment automatically when the
 * client initializes). We then call `supabase.auth.updateUser({ password })`
 * to commit the new password.
 *
 * Edge cases:
 *   - User opens the link after it expired, or visits this URL directly
 *     without a recovery session → we render a "link expired" card with a
 *     CTA back to /login?mode=forgot.
 *   - Passwords don't match or are too short → client-side validation,
 *     no Supabase call.
 *
 * Layout mirrors /login: the card is centered both vertically and
 * horizontally inside a `min-h-[100dvh] flex items-center justify-center`
 * shell using `100dvh` to dodge the mobile Chrome address-bar jump.
 */

"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionResultDrawer } from "@/components/kane/ActionResultDrawer";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const MIN_PASSWORD_LENGTH = 8;

const SUPABASE_ENABLED =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;

export default function ResetPasswordPage() {
  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8 text-foreground">
      <HeroGlow />
      <div className="relative w-full max-w-[440px]">
        <section
          aria-labelledby="reset-heading"
          className="animate-in fade-in slide-in-from-bottom-2 duration-500 rounded-2xl border border-border bg-card p-6 shadow-card md:p-8"
        >
          {SUPABASE_ENABLED ? <ResetPasswordForm /> : <DisabledNotice />}
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

function DisabledNotice() {
  return (
    <div className="text-center">
      <h1
        id="reset-heading"
        className="font-sans text-3xl font-bold leading-tight tracking-tight text-foreground"
      >
        No disponible
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
        El restablecimiento de contraseña no está activo en este entorno.
      </p>
    </div>
  );
}

function ResetPasswordForm() {
  const router = useRouter();

  // null = still checking | true = recovery session active | false = no session
  const [hasSession, setHasSession] = React.useState<boolean | null>(null);
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  // Replaces the legacy `toast.success("Contraseña actualizada.")` —
  // contraseña reset es accion puntual e importante; el drawer da un
  // acknowledgement claro antes de redirigir al dashboard. El push se
  // difiere al onClose para que el usuario controle cuando avanzar.
  const [successOpen, setSuccessOpen] = React.useState(false);

  // On mount, check whether Supabase landed us with a recovery session.
  // The client auto-parses the URL fragment (#access_token=...&type=recovery)
  // and calls onAuthStateChange("PASSWORD_RECOVERY"). We just need to verify
  // there's an active session before showing the form.
  React.useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    void (async () => {
      // Give Supabase a tick to process the URL fragment.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setHasSession(!!data.session);
    })();

    // Some Supabase versions fire PASSWORD_RECOVERY slightly after mount, so
    // listen for it too in case getSession() ran before the token was parsed.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        if (!cancelled) setHasSession(!!session);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const passwordTooShort = password.length < MIN_PASSWORD_LENGTH;
  const passwordsMismatch = password !== confirmPassword;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setSubmitted(true);
    if (passwordTooShort || passwordsMismatch) return;

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error(error.message || "No pudimos cambiar la contraseña.");
        return;
      }
      setSuccessOpen(true);
    } catch {
      toast.error("No pudimos cambiar la contraseña.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSuccessOpenChange(open: boolean) {
    setSuccessOpen(open);
    if (!open) {
      router.push("/dashboard");
      router.refresh();
    }
  }

  // Loading state — keep the card silent for ~half a second while we settle
  // the session check; otherwise the "expired" view flashes for users who
  // arrive with a valid token.
  if (hasSession === null) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2
          size={20}
          className="animate-spin text-muted-foreground"
          aria-hidden="true"
        />
        <span className="sr-only">Verificando enlace…</span>
      </div>
    );
  }

  if (hasSession === false) {
    return (
      <div className="text-center">
        <h1
          id="reset-heading"
          className="font-sans text-3xl font-bold leading-tight tracking-tight text-foreground"
        >
          Enlace expirado
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          Este enlace expiró o ya fue usado. Pide uno nuevo para continuar.
        </p>
        <div className="mt-6">
          <Link
            href="/login?mode=forgot"
            className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-5 text-[15px] font-semibold text-primary-foreground transition-transform hover:bg-primary/90 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Pedir un enlace nuevo
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="text-center">
        <h1
          id="reset-heading"
          className="font-sans text-3xl font-bold leading-tight tracking-tight text-foreground md:text-[34px]"
        >
          Nueva contraseña
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
          Crea una contraseña nueva para tu cuenta.
        </p>
      </header>

      <form
        noValidate
        onSubmit={handleSubmit}
        aria-busy={isSubmitting}
        className="mt-8 space-y-4"
      >
        <PasswordField
          id="reset-password"
          label="Nueva contraseña"
          value={password}
          onChange={(v) => {
            setPassword(v);
            if (submitted) setSubmitted(false);
          }}
          autoComplete="new-password"
          disabled={isSubmitting}
          invalid={submitted && passwordTooShort}
          hint={`Mínimo ${MIN_PASSWORD_LENGTH} caracteres.`}
          autoFocus
        />

        <PasswordField
          id="reset-confirm"
          label="Confirmar contraseña"
          value={confirmPassword}
          onChange={(v) => {
            setConfirmPassword(v);
            if (submitted) setSubmitted(false);
          }}
          autoComplete="new-password"
          disabled={isSubmitting}
          invalid={submitted && passwordsMismatch}
          errorMessage={
            submitted && passwordsMismatch
              ? "Las contraseñas no coinciden."
              : undefined
          }
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
              Cambiando…
            </>
          ) : (
            "Cambiar contraseña"
          )}
        </Button>
      </form>

      <ActionResultDrawer
        open={successOpen}
        onOpenChange={handleSuccessOpenChange}
        title="Contraseña actualizada"
        description="Ya puedes ingresar con tu contraseña nueva."
        closeLabel="Continuar"
        tone="success"
      />
    </>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  disabled,
  invalid,
  hint,
  errorMessage,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  disabled?: boolean;
  invalid?: boolean;
  hint?: string;
  errorMessage?: string;
  autoFocus?: boolean;
}) {
  const [visible, setVisible] = React.useState(false);
  const hintId = `${id}-hint`;
  return (
    <div className="space-y-2">
      <Label
        htmlFor={id}
        className="text-[13px] font-semibold uppercase tracking-[0.04em] text-muted-foreground"
      >
        {label}
      </Label>
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
          placeholder="••••••••"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={hint ? hintId : undefined}
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
      {errorMessage ? (
        <p role="alert" className="text-[13px] font-medium text-destructive">
          {errorMessage}
        </p>
      ) : hint ? (
        <p
          id={hintId}
          className={cn(
            "text-[12px] leading-relaxed",
            invalid ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

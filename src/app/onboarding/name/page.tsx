/**
 * /onboarding/name — captura el nombre después del OTP, antes del PIN.
 *
 * Diseño portado del legacy `/welcome` (NameStep): KANE wordmark arriba,
 * "Bienvenido" + "¿Cómo te llamamos?" + input + hint + botón. Mantiene
 * el lugar en el wizard (post-OTP, pre-PIN) pero alinea visualmente con
 * el resto del flujo brand.
 *
 * Persiste:
 *   - `display_name` via `useUserName().setName` (también escribe la
 *     cache en localStorage y dispara `storage` event para sincronía).
 *   - `full_name` en el mismo profile row para legal/OCR matching.
 *
 * Si display_name no se guarda (network blip), el `(tabs)/layout.tsx`
 * server guard rebota a `/welcome` como red de seguridad — pero el
 * happy path debería evitarlo siempre.
 */

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KaneWordmark } from "@/components/kane/KaneWordmark";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/use-session";
import { useUserName } from "@/lib/use-user-name";
import { cn } from "@/lib/utils";

const MIN_LENGTH = 2;
const MAX_LENGTH = 20;

export default function OnboardingNamePage() {
  const router = useRouter();
  const session = useSession();
  const { setName: persistName } = useUserName();

  const [name, setName] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  // Auth guard — si la sesion resolvio sin user, mandar al login.
  // Esto cubre el caso donde alguien llega a esta URL directamente sin
  // haber pasado por verify-email.
  React.useEffect(() => {
    if (!session.hydrated) return;
    if (!session.user) {
      router.replace("/login");
    }
  }, [session.hydrated, session.user, router]);

  const trimmed = name.trim();
  const isEmpty = trimmed.length === 0;
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_LENGTH;
  const showError = submitted && (isEmpty || tooShort);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    setSubmitted(true);
    if (isEmpty || tooShort) return;

    setIsSaving(true);

    try {
      // Persist display_name + cache local. Pessimistic: esperamos al
      // round-trip antes de avanzar al PIN. Si falla acá, NO empujamos
      // al wizard — mejor que el user reintente que llegar al dashboard
      // con display_name NULL y rebotar a /welcome (lo que motivaba el
      // duplicado original).
      await persistName(trimmed);

      // Guardar full_name en la misma fila — legal docs / OCR matching
      // pueden reusarlo despues. No-fatal: el push al PIN procede aunque
      // este UPDATE falle, ya que display_name (la fuente de verdad para
      // el dashboard guard) ya quedo persistido arriba.
      if (session.user) {
        const supabase = createClient();
        const { error } = await supabase
          .from("profiles")
          .update({ full_name: trimmed })
          .eq("id", session.user.id);
        if (error) {
          console.error("[onboarding/name] full_name update:", error.message);
        }
      }

      router.push("/auth/set-pin");
    } catch (err) {
      console.error("[onboarding/name] submit:", err);
      const message =
        err instanceof Error ? err.message : "No pudimos guardar tu nombre.";
      toast.error(message);
      setIsSaving(false);
    }
  }

  return (
    <main className="relative flex min-h-dvh flex-col bg-background text-foreground md:min-h-screen md:items-center md:justify-center md:px-6">
      <div className="relative mx-auto flex w-full max-w-[440px] flex-1 flex-col px-6 pb-10 pt-6 md:flex-initial md:px-0 md:pb-0 md:pt-0 md:rounded-2xl md:border md:border-border md:bg-card md:shadow-card md:p-8">
        {/* Brand mark — KANE wordmark grande arriba a la izquierda. Sin
            "Saltar" porque esta pantalla está dentro del wizard de
            onboarding y saltarla dejaría display_name NULL, lo que
            forzaria un loop en /welcome despues. */}
        <div className="mb-10 flex items-center justify-between md:mb-8">
          <KaneWordmark width={96} height={30} className="text-foreground" />
        </div>

        <section
          aria-live="polite"
          className="animate-in fade-in slide-in-from-bottom-2 duration-300"
        >
          <h1 className="text-[40px] font-bold leading-[1.05] tracking-tight md:text-4xl">
            Bienvenido
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            ¿Cómo te llamamos? Vas a verlo en cada saludo.
          </p>

          <form
            noValidate
            onSubmit={handleSubmit}
            aria-busy={isSaving}
            className="mt-9 space-y-4"
          >
            <div className="space-y-2">
              <Label
                htmlFor="onboarding-name"
                className="text-[13px] font-semibold uppercase tracking-[0.04em] text-muted-foreground"
              >
                Tu nombre
              </Label>
              <Input
                id="onboarding-name"
                name="name"
                type="text"
                autoComplete="given-name"
                inputMode="text"
                autoCapitalize="words"
                autoCorrect="off"
                spellCheck={false}
                autoFocus
                required
                maxLength={MAX_LENGTH}
                placeholder="Tu nombre"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (submitted) setSubmitted(false);
                }}
                disabled={isSaving}
                aria-invalid={showError ? true : undefined}
                aria-describedby={
                  showError ? "onboarding-name-error" : "onboarding-name-hint"
                }
                className="h-12 rounded-xl px-4 text-base"
              />
              {showError ? (
                <p
                  id="onboarding-name-error"
                  role="alert"
                  className="text-[13px] font-medium text-destructive"
                >
                  {isEmpty
                    ? "Necesito un nombre para continuar."
                    : `Ingresa al menos ${MIN_LENGTH} caracteres.`}
                </p>
              ) : (
                <p
                  id="onboarding-name-hint"
                  className="text-[12px] leading-relaxed text-muted-foreground"
                >
                  Puedes cambiarlo después en Ajustes.
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isSaving || isEmpty || tooShort}
              className={cn(
                "h-12 w-full rounded-xl text-[15px] font-semibold",
                "transition-transform active:scale-[0.99]",
              )}
            >
              {isSaving ? (
                <>
                  <Loader2
                    size={16}
                    className="mr-2 animate-spin"
                    aria-hidden="true"
                  />
                  Guardando…
                </>
              ) : (
                "Continuar"
              )}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}

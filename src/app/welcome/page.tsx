/**
 * Welcome route — Lumi
 *
 * One-time onboarding shown after a user verifies their magic-link and
 * `profiles.display_name` is still NULL (the state the `handle_new_user`
 * trigger leaves the row in). The flow:
 *
 *   1. Capture display_name (autoFocus, optimistic save via useUserName).
 *   2. Three-card orientation explaining the core surfaces (Capturar /
 *      Categorías / Insights). Skipped entirely in demo mode — local-only
 *      installs don't need to be sold the app they just opened.
 *   3. "Empezar" → /dashboard.
 *
 * The user can bail out at any time via the "Saltar" link in the header,
 * which still persists whatever name was typed in step 1 so we don't drop
 * intent on the floor.
 *
 * Routing in: /auth/callback and / both check `display_name IS NULL` and
 * redirect here. Routing out: every exit path eventually calls
 * router.replace('/dashboard') so the back button doesn't drop the user
 * back into onboarding mid-app.
 */

"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { BarChart3, Loader2, Sparkles, Tag } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUserName } from "@/lib/use-user-name";
import { cn } from "@/lib/utils";

// Demo mode (no Supabase) skips the orientation cards: someone running
// `npm run dev` against a stub backend doesn't need the welcome tour.
const SUPABASE_ENABLED =
  typeof process.env.NEXT_PUBLIC_SUPABASE_URL === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_URL.length > 0 &&
  typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0;

type Step = 0 | 1 | 2;
const TOTAL_STEPS: Step[] = SUPABASE_ENABLED ? [0, 1, 2] : [0];

type OrientationCard = {
  icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  title: string;
  description: string;
};

const ORIENTATION_CARDS: readonly OrientationCard[] = [
  {
    icon: Sparkles,
    title: "Capturar",
    description: "Registrá un gasto en 3 toques.",
  },
  {
    icon: Tag,
    title: "Categorías",
    description: "Personalizá las categorías a tu vida.",
  },
  {
    icon: BarChart3,
    title: "Insights",
    description: "Mirá a dónde se va tu plata.",
  },
] as const;

export default function WelcomePage() {
  const router = useRouter();
  const { setName: persistName } = useUserName();

  const [step, setStep] = React.useState<Step>(0);
  const [name, setName] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  const trimmed = name.trim();
  const isEmpty = trimmed.length === 0;
  const showError = submitted && isEmpty;

  /**
   * Persist the typed name (if any) and return whether the save succeeded.
   * Optimistic — the hook updates local state immediately, so failures only
   * matter for the DB round-trip. We swallow them here: a name save failure
   * shouldn't trap the user in onboarding.
   */
  const saveNameIfPresent = React.useCallback(async () => {
    if (isEmpty) return;
    try {
      await persistName(trimmed);
    } catch {
      // Non-fatal: name persists in localStorage even if the DB write failed,
      // and Settings can re-sync later.
    }
  }, [isEmpty, persistName, trimmed]);

  function goToDashboard() {
    router.replace("/dashboard");
  }

  async function handleStepOneSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;
    setSubmitted(true);
    if (isEmpty) return;

    setIsSaving(true);
    // Optimistic: kick off the DB write and advance immediately. Demo mode
    // resolves synchronously; auth mode shouldn't block onboarding behind
    // network latency.
    void persistName(trimmed);

    if (SUPABASE_ENABLED) {
      setStep(1);
      setIsSaving(false);
    } else {
      // Demo mode skips orientation entirely — head straight to dashboard.
      goToDashboard();
    }
  }

  async function handleSkip() {
    await saveNameIfPresent();
    goToDashboard();
  }

  function handleJumpToStep(target: Step) {
    if (target === step) return;
    if (target > 0 && isEmpty) {
      // Don't let the user skip past name capture without a value — surface
      // the validation error inline so they know why nothing happened.
      setSubmitted(true);
      return;
    }
    setStep(target);
  }

  return (
    <main className="relative flex min-h-dvh flex-col bg-background text-foreground md:min-h-screen md:items-center md:justify-center md:px-6">
      <div className="relative mx-auto flex w-full max-w-[440px] flex-1 flex-col px-6 pb-10 pt-6 md:flex-initial md:px-0 md:pb-0 md:pt-0 md:rounded-2xl md:border md:border-border md:bg-card md:shadow-card md:p-8">
        {/* Header row: brand mark + Saltar link. The link is hidden on the
            final step where the only sensible action is "Empezar". */}
        <div className="mb-10 flex items-center justify-between md:mb-8">
          <Image
            src="/brand/lumi-wordmark.svg"
            alt="Lumi"
            width={96}
            height={30}
            priority
            className="text-foreground"
          />
          {step !== TOTAL_STEPS[TOTAL_STEPS.length - 1] ? (
            <button
              type="button"
              onClick={handleSkip}
              className="text-[13px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Saltar
            </button>
          ) : null}
        </div>

        {/* Step content. Each step's wrapper re-keys on `step` so the fade-in
            animation re-triggers on every transition. */}
        <section
          key={step}
          aria-live="polite"
          className="animate-in fade-in slide-in-from-right-4 duration-300"
        >
          {step === 0 ? (
            <NameStep
              name={name}
              onChange={(value) => {
                setName(value);
                if (submitted) setSubmitted(false);
              }}
              onSubmit={handleStepOneSubmit}
              showError={showError}
              isSaving={isSaving}
              isEmpty={isEmpty}
            />
          ) : step === 1 ? (
            <OrientationStep
              displayName={trimmed}
              onContinue={() => setStep(2)}
            />
          ) : (
            <FinalStep displayName={trimmed} onStart={goToDashboard} />
          )}
        </section>

        {/* Step indicator. Only shown when there's more than one step
            (auth mode); demo mode is a single screen. */}
        {TOTAL_STEPS.length > 1 ? (
          <div className="mt-auto pt-10">
            <StepDots
              steps={TOTAL_STEPS}
              current={step}
              onJump={handleJumpToStep}
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}

// ─── Step 1: name capture ─────────────────────────────────────────────────
type NameStepProps = {
  name: string;
  onChange: (value: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  showError: boolean;
  isSaving: boolean;
  isEmpty: boolean;
};

function NameStep({
  name,
  onChange,
  onSubmit,
  showError,
  isSaving,
  isEmpty,
}: NameStepProps) {
  return (
    <>
      <h1 className="font-display text-[40px] italic leading-[1.05] tracking-tight md:text-4xl">
        Bienvenido
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
        ¿Cómo te llamamos? Vas a verlo en cada saludo.
      </p>

      <form
        noValidate
        onSubmit={onSubmit}
        aria-busy={isSaving}
        className="mt-9 space-y-4"
      >
        <div className="space-y-2">
          <Label
            htmlFor="welcome-name"
            className="text-[13px] font-semibold uppercase tracking-[0.04em] text-muted-foreground"
          >
            Tu nombre
          </Label>
          <Input
            id="welcome-name"
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
            onChange={(e) => onChange(e.target.value)}
            disabled={isSaving}
            aria-invalid={showError ? true : undefined}
            aria-describedby={
              showError ? "welcome-name-error" : "welcome-name-hint"
            }
            className="h-12 rounded-xl px-4 text-base"
          />
          {showError ? (
            <p
              id="welcome-name-error"
              role="alert"
              className="text-[13px] font-medium text-destructive"
            >
              Necesito un nombre para continuar.
            </p>
          ) : (
            <p
              id="welcome-name-hint"
              className="text-[12px] leading-relaxed text-muted-foreground"
            >
              Podés cambiarlo después en Ajustes.
            </p>
          )}
        </div>

        <Button
          type="submit"
          disabled={isSaving || isEmpty}
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
    </>
  );
}

// ─── Step 2: orientation cards ────────────────────────────────────────────
type OrientationStepProps = {
  displayName: string;
  onContinue: () => void;
};

function OrientationStep({ displayName, onContinue }: OrientationStepProps) {
  return (
    <>
      <h1 className="font-display text-[34px] italic leading-[1.05] tracking-tight md:text-4xl">
        Hola, {displayName}
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
        Antes de arrancar, así está armada Lumi.
      </p>

      <ul className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-3">
        {ORIENTATION_CARDS.map(({ icon: Icon, title, description }) => (
          <li
            key={title}
            className="rounded-2xl border border-border bg-card p-4"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)]">
              <Icon size={18} aria-hidden={true} />
            </div>
            <div className="mt-3 text-[14px] font-semibold leading-snug">
              {title}
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          </li>
        ))}
      </ul>

      <Button
        type="button"
        onClick={onContinue}
        className={cn(
          "mt-8 h-12 w-full rounded-xl text-[15px] font-semibold",
          "transition-transform active:scale-[0.99]",
        )}
      >
        Continuar
      </Button>
    </>
  );
}

// ─── Step 3: final CTA ────────────────────────────────────────────────────
type FinalStepProps = {
  displayName: string;
  onStart: () => void;
};

function FinalStep({ displayName, onStart }: FinalStepProps) {
  return (
    <>
      <h1 className="font-display text-[34px] italic leading-[1.05] tracking-tight md:text-4xl">
        Listo, {displayName}.
      </h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
        Tu primer mes empieza ahora. Capturá un gasto cuando quieras.
      </p>

      <Button
        type="button"
        onClick={onStart}
        className={cn(
          "mt-10 h-12 w-full rounded-xl text-[15px] font-semibold",
          "transition-transform active:scale-[0.99]",
        )}
      >
        Empezar
      </Button>
    </>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────
type StepDotsProps = {
  steps: readonly Step[];
  current: Step;
  onJump: (target: Step) => void;
};

function StepDots({ steps, current, onJump }: StepDotsProps) {
  return (
    <nav aria-label="Pasos" className="flex items-center justify-center gap-2">
      {steps.map((s) => {
        const isCurrent = s === current;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onJump(s)}
            aria-label={`Ir al paso ${s + 1}`}
            aria-current={isCurrent ? "step" : undefined}
            className={cn(
              "h-2 rounded-full transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              isCurrent ? "w-6 bg-foreground" : "w-2 bg-muted-foreground/40",
            )}
          />
        );
      })}
    </nav>
  );
}

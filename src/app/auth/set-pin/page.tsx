/**
 * /auth/set-pin — third step of the new auth flow (also reused for PIN
 * recovery).
 *
 * The user has verified their email; now they pick a 4-digit PIN. This
 * is what they'll type every time they open the app on a trusted device
 * (Yape-style). The PIN's bcrypt hash goes to user_pins via the API; we
 * also mark the current device as trusted so the next /login can skip
 * the email path.
 *
 * UI: 4 dot indicators + a custom 3x4 numeric keypad (no native keyboard
 * on mobile). Two stages on the same screen: type → confirm.
 */

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Delete, KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ActionResultDrawer } from "@/components/kane/ActionResultDrawer";
import { cn } from "@/lib/utils";

const PIN_LENGTH = 4;
const TRIVIAL_PINS = new Set([
  "0000",
  "1111",
  "2222",
  "3333",
  "4444",
  "5555",
  "6666",
  "7777",
  "8888",
  "9999",
  "1234",
  "4321",
]);

type Stage = "create" | "confirm";

export default function SetPinPage() {
  const router = useRouter();
  const [stage, setStage] = React.useState<Stage>("create");
  const [pin, setPin] = React.useState("");
  const [confirmPin, setConfirmPin] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  // Reemplaza el legacy `toast.success("Listo. Ya puedes ingresar...")`.
  // PIN setup es paso clave del onboarding; el drawer da un acknowledgement
  // claro antes del push a /onboarding/account.
  const [successOpen, setSuccessOpen] = React.useState(false);

  const activeValue = stage === "create" ? pin : confirmPin;
  const setActiveValue = stage === "create" ? setPin : setConfirmPin;

  // Auto-advance from "create" to "confirm" once 4 digits are filled.
  React.useEffect(() => {
    if (stage !== "create") return;
    if (pin.length !== PIN_LENGTH) return;
    if (!/^\d{4}$/.test(pin)) {
      setErrorMsg("El PIN debe tener 4 dígitos.");
      return;
    }
    if (TRIVIAL_PINS.has(pin)) {
      setErrorMsg("Elige un PIN menos predecible.");
      return;
    }
    setErrorMsg(null);
    const id = window.setTimeout(() => setStage("confirm"), 180);
    return () => window.clearTimeout(id);
  }, [pin, stage]);

  // Auto-submit once confirm has 4 digits.
  React.useEffect(() => {
    if (stage !== "confirm") return;
    if (confirmPin.length !== PIN_LENGTH) return;
    if (submitting) return;
    void submitPin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmPin, stage]);

  async function submitPin() {
    if (submitting) return;
    setErrorMsg(null);
    if (confirmPin !== pin) {
      setErrorMsg("Los PIN no coinciden.");
      // Reset confirm so the user can retry without backspacing.
      setConfirmPin("");
      return;
    }
    setSubmitting(true);

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

    try {
      const res = await fetch("/api/auth/set-pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin, deviceSignals }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error ?? "No pudimos guardar tu PIN.");
        setSubmitting(false);
        setConfirmPin("");
        return;
      }
      setSuccessOpen(true);
    } catch (err) {
      console.error("[set-pin] submit:", err);
      setErrorMsg("Error de red. Intenta otra vez.");
      setSubmitting(false);
      setConfirmPin("");
    }
  }

  function handleSuccessOpenChange(open: boolean) {
    setSuccessOpen(open);
    if (!open) {
      router.push("/onboarding/account");
    }
  }

  function handleStartOver() {
    setPin("");
    setConfirmPin("");
    setErrorMsg(null);
    setStage("create");
  }

  function handleKeypadDigit(d: string) {
    if (submitting) return;
    if (activeValue.length >= PIN_LENGTH) return;
    setActiveValue(activeValue + d);
    if (errorMsg) setErrorMsg(null);
  }

  function handleKeypadBackspace() {
    if (submitting) return;
    if (activeValue.length === 0) return;
    setActiveValue(activeValue.slice(0, -1));
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
              {stage === "create" ? "Crea tu PIN" : "Confirma tu PIN"}
            </h1>
            <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
              {stage === "create"
                ? "Usarás este PIN para ingresar a la app en este dispositivo."
                : "Ingresa el mismo PIN otra vez para confirmar."}
            </p>
          </header>

          <PinDots
            length={PIN_LENGTH}
            filled={activeValue.length}
            ariaLabel={stage === "create" ? "PIN" : "Confirmación de PIN"}
          />

          {errorMsg && (
            <div
              role="alert"
              className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-center text-[13px] text-destructive"
            >
              {errorMsg}
            </div>
          )}

          <Keypad
            onDigit={handleKeypadDigit}
            onBackspace={handleKeypadBackspace}
            disabled={submitting}
          />

          <div className="mt-4 flex flex-col items-center gap-3">
            {submitting && (
              <span className="inline-flex items-center gap-2 text-[12px] text-muted-foreground">
                <Loader2 size={14} className="animate-spin" aria-hidden />
                Guardando…
              </span>
            )}
            {stage === "confirm" && !submitting && (
              <Button
                type="button"
                variant="ghost"
                onClick={handleStartOver}
                className="h-9 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
              >
                Volver a elegir PIN
              </Button>
            )}
          </div>
        </section>
      </div>

      <ActionResultDrawer
        open={successOpen}
        onOpenChange={handleSuccessOpenChange}
        title="PIN configurado"
        description="Ya puedes ingresar con tu PIN en este dispositivo."
        closeLabel="Continuar"
        tone="success"
      />
    </main>
  );
}

function PinDots({
  length,
  filled,
  ariaLabel,
}: {
  length: number;
  filled: number;
  ariaLabel: string;
}) {
  return (
    <div
      role="img"
      aria-label={`${ariaLabel}: ${filled} de ${length} dígitos`}
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
    <div className="mt-6 grid grid-cols-3 gap-3">
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
        "disabled:cursor-not-allowed disabled:opacity-50",
        variant === "digit"
          ? "bg-background text-foreground hover:border-primary/40 hover:bg-primary/5"
          : "bg-muted/40 text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

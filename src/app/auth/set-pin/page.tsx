/**
 * /auth/set-pin — third step of the new auth flow.
 *
 * The user has verified their email; now they pick a 6-digit PIN. This
 * is what they'll type every time they open the app on a trusted device
 * (Yape-style). The PIN's bcrypt hash goes to user_pins via the API; we
 * also mark the current device as trusted so the next /login can skip
 * the email path.
 *
 * Two stages on the same screen:
 *   1. Type PIN
 *   2. Confirm by typing again
 *
 * The page also reads the device signals (screen + tz) and posts them
 * with the PIN so the server can compute the fingerprint hash.
 */

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Stage = "create" | "confirm";

export default function SetPinPage() {
  const router = useRouter();
  const [stage, setStage] = React.useState<Stage>("create");
  const [pin, setPin] = React.useState("");
  const [confirmPin, setConfirmPin] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  function handleCreateNext(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!/^\d{6}$/.test(pin)) {
      setErrorMsg("El PIN debe ser de 6 dígitos.");
      return;
    }
    if (["000000", "111111", "123456", "654321"].includes(pin)) {
      setErrorMsg("Elige un PIN menos predecible.");
      return;
    }
    setStage("confirm");
  }

  async function handleConfirmSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg(null);
    if (confirmPin !== pin) {
      setErrorMsg("Los PINs no coinciden.");
      return;
    }
    setSubmitting(true);

    // Capture client-side signals — the server combines them with the
    // request headers (UA + Accept-Language) to compute the device
    // fingerprint hash.
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
        return;
      }
      toast.success("Listo. Ya puedes ingresar con tu PIN.");
      router.push("/dashboard");
    } catch (err) {
      console.error("[set-pin] submit:", err);
      setErrorMsg("Error de red. Intenta otra vez.");
      setSubmitting(false);
    }
  }

  function handleStartOver() {
    setPin("");
    setConfirmPin("");
    setErrorMsg(null);
    setStage("create");
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
                ? "Será tu acceso rápido en este dispositivo. Elige 6 dígitos que recuerdes."
                : "Ingresa el mismo PIN otra vez para confirmar."}
            </p>
          </header>

          {stage === "create" ? (
            <form onSubmit={handleCreateNext} className="flex flex-col gap-4">
              <PinInput
                value={pin}
                onChange={setPin}
                ariaLabel="PIN de 6 dígitos"
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
                disabled={pin.length !== 6}
                className={cn("h-11 w-full rounded-xl text-[14px] font-semibold")}
              >
                Continuar
              </Button>
            </form>
          ) : (
            <form onSubmit={handleConfirmSubmit} className="flex flex-col gap-4">
              <PinInput
                value={confirmPin}
                onChange={setConfirmPin}
                ariaLabel="Confirma tu PIN"
                autoFocus
              />
              {errorMsg && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-[13px] text-destructive"
                >
                  {errorMsg}
                </div>
              )}
              <div className="flex flex-col gap-2">
                <Button
                  type="submit"
                  disabled={submitting || confirmPin.length !== 6}
                  className={cn("h-11 w-full rounded-xl text-[14px] font-semibold")}
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" aria-hidden />
                      Guardando…
                    </>
                  ) : (
                    "Confirmar y entrar"
                  )}
                </Button>
                <button
                  type="button"
                  onClick={handleStartOver}
                  className="text-center text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                >
                  Volver a elegir PIN
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}

/**
 * Single 6-digit text field styled like the OTP input. Uses
 * `inputMode="numeric"` + `autoComplete="off"` so iOS / Android show the
 * numeric keypad without proposing autofill suggestions.
 */
function PinInput({
  value,
  onChange,
  ariaLabel,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
  autoFocus?: boolean;
}) {
  return (
    <Input
      type="password"
      inputMode="numeric"
      autoComplete="off"
      autoFocus={autoFocus ?? true}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      placeholder="••••••"
      maxLength={6}
      className="h-14 text-center text-[28px] font-bold tracking-[0.5em] tabular-nums"
      aria-label={ariaLabel}
    />
  );
}

/**
 * /onboarding/name — captures the user's display name after OTP verification.
 *
 * Persists `display_name` and `full_name` to `profiles` via the RLS-protected
 * browser client (auth.uid() = id is enforced by policy). Uses the shared
 * `useUserName` hook so the cross-tab cache + localStorage mirror stay in
 * sync with the rest of the app immediately.
 */

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, User } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useSession } from "@/lib/use-session";
import { useUserName } from "@/lib/use-user-name";
import { cn } from "@/lib/utils";

const MIN_LENGTH = 2;
const MAX_LENGTH = 60;

export default function OnboardingNamePage() {
  const router = useRouter();
  const session = useSession();
  const { setName: persistName } = useUserName();

  const [name, setNameValue] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  // Auth guard — bounce to /login if the session resolved with no user.
  React.useEffect(() => {
    if (!session.hydrated) return;
    if (!session.user) {
      router.replace("/login");
    }
  }, [session.hydrated, session.user, router]);

  const trimmed = name.trim();
  const tooShort = trimmed.length < MIN_LENGTH;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (tooShort) {
      setErrorMsg(`Ingresa al menos ${MIN_LENGTH} caracteres.`);
      return;
    }
    setErrorMsg(null);
    setSubmitting(true);

    try {
      // Persist display_name via the shared hook (handles localStorage mirror
      // + storage event broadcast). Then UPDATE full_name in the same row so
      // legal docs / OCR matching can reuse it later.
      await persistName(trimmed);

      if (session.user) {
        const supabase = createClient();
        const { error } = await supabase
          .from("profiles")
          .update({ full_name: trimmed })
          .eq("id", session.user.id);
        if (error) {
          // Display name already saved — log full_name failure but continue.
          console.error("[onboarding/name] full_name update:", error.message);
        }
      }

      router.push("/auth/set-pin");
    } catch (err) {
      console.error("[onboarding/name] submit:", err);
      const message =
        err instanceof Error ? err.message : "No pudimos guardar tu nombre.";
      setErrorMsg(message);
      toast.error(message);
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8 text-foreground">
      <div className="relative w-full max-w-[440px]">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
          <header className="mb-6">
            <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User size={20} aria-hidden />
            </span>
            <h1 className="text-[22px] font-bold leading-tight text-foreground">
              ¿Cómo te llamas?
            </h1>
            <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
              Ingresa tu nombre completo. Lo usaremos para personalizar tu
              experiencia.
            </p>
          </header>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="onboarding-name">Tu nombre</Label>
              <Input
                id="onboarding-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setNameValue(e.target.value);
                  if (errorMsg) setErrorMsg(null);
                }}
                placeholder="Tu nombre completo"
                autoComplete="name"
                autoCapitalize="words"
                autoFocus
                required
                maxLength={MAX_LENGTH}
                className="h-12 rounded-xl px-4 text-base"
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
              disabled={submitting || tooShort}
              className={cn("h-11 w-full rounded-xl text-[14px] font-semibold")}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden />
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

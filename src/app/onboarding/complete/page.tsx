/**
 * /onboarding/complete — success screen after the new user finishes the
 * onboarding flow. CTA jumps straight to the dashboard.
 */

"use client";

import { useRouter } from "next/navigation";
import { CircleCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function OnboardingCompletePage() {
  const router = useRouter();

  return (
    <main className="relative flex min-h-[100dvh] flex-col bg-background px-6 py-10 text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[360px] overflow-hidden"
      >
        <div
          className="absolute left-1/2 top-[-160px] h-[480px] w-[480px] -translate-x-1/2 rounded-full opacity-60"
          style={{
            background:
              "radial-gradient(closest-side, var(--color-primary-soft), transparent 70%)",
          }}
        />
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-8">
        <div
          aria-hidden
          className={cn(
            "relative flex h-32 w-32 items-center justify-center rounded-full",
            "bg-primary/15 ring-8 ring-primary/10",
          )}
        >
          <CircleCheck
            size={88}
            strokeWidth={2}
            className="text-primary"
          />
        </div>

        <header className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-[32px] font-bold leading-[1.1] tracking-tight text-foreground md:text-[36px]">
            ¡Todo listo!
          </h1>
          <p className="max-w-[320px] text-[15px] leading-relaxed text-muted-foreground">
            Tu cuenta ha sido creada exitosamente. Ya puedes empezar a
            registrar tus movimientos.
          </p>
        </header>
      </div>

      <div className="relative flex flex-col items-center gap-3 pb-2">
        <Button
          onClick={() => router.replace("/dashboard")}
          className="h-12 w-full max-w-[360px] rounded-xl text-[15px] font-semibold"
        >
          Ir al inicio
        </Button>
        <p className="max-w-[320px] text-center text-[12px] leading-relaxed text-muted-foreground">
          Puedes ajustar tus preferencias en cualquier momento desde tu perfil.
        </p>
      </div>
    </main>
  );
}

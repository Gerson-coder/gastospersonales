/**
 * /onboarding/account — optional first-bank picker.
 *
 * The handle_new_user trigger already seeded an "Efectivo" account, so any
 * choice here is purely additive. BBVA / BCP / Interbank create a new bank
 * account in PEN; "Otro banco" hands off to /accounts (where the create
 * sheet lets the user name it freely); "Omitir por ahora" skips the step.
 */

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Landmark, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { AccountBrandIcon } from "@/components/lumi/AccountBrandIcon";
import { createAccount } from "@/lib/data/accounts";
import { cn } from "@/lib/utils";

type BankOption = {
  label: string;
  isOther?: boolean;
};

const PRESET_BANKS: BankOption[] = [
  { label: "BBVA" },
  { label: "BCP" },
  { label: "Interbank" },
  { label: "Otro banco", isOther: true },
];

export default function OnboardingAccountPage() {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);

  async function handleSelect(option: BankOption) {
    if (pending) return;

    if (option.isOther) {
      router.push("/accounts?create=1");
      return;
    }

    setPending(option.label);
    try {
      await createAccount({
        label: option.label,
        kind: "bank",
        currency: "PEN",
      });
      router.push("/onboarding/complete");
    } catch (err) {
      console.error("[onboarding/account] create:", err);
      const message =
        err instanceof Error
          ? err.message
          : "No pudimos crear la cuenta.";
      toast.error(message);
      setPending(null);
    }
  }

  function handleSkip() {
    if (pending) return;
    router.push("/onboarding/complete");
  }

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8 text-foreground">
      <div className="relative w-full max-w-[440px]">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm md:p-8">
          <header className="mb-6">
            <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Landmark size={20} aria-hidden />
            </span>
            <h1 className="text-[22px] font-bold leading-tight text-foreground">
              Agrega tu cuenta
            </h1>
            <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">
              Selecciona tu banco para empezar a gestionar tus finanzas. Ya
              creamos tu cuenta de Efectivo; puedes agregar más después.
            </p>
          </header>

          <ul className="flex flex-col gap-2">
            {PRESET_BANKS.map((option) => {
              const isPending = pending === option.label;
              return (
                <li key={option.label}>
                  <button
                    type="button"
                    onClick={() => handleSelect(option)}
                    disabled={pending !== null}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border border-border bg-background px-3.5 py-3",
                      "text-left transition-colors",
                      "hover:border-primary/40 hover:bg-primary/5",
                      "disabled:cursor-not-allowed disabled:opacity-60",
                    )}
                  >
                    <span
                      aria-hidden
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-background"
                    >
                      {option.isOther ? (
                        <Landmark
                          size={18}
                          className="text-muted-foreground"
                          aria-hidden
                        />
                      ) : (
                        <AccountBrandIcon
                          label={option.label}
                          fallback={
                            <Landmark
                              size={18}
                              className="text-muted-foreground"
                              aria-hidden
                            />
                          }
                        />
                      )}
                    </span>
                    <span className="flex-1 text-[14px] font-semibold text-foreground">
                      {option.label}
                    </span>
                    {isPending ? (
                      <Loader2
                        size={16}
                        className="animate-spin text-muted-foreground"
                        aria-hidden
                      />
                    ) : (
                      <ChevronRight
                        size={16}
                        className="text-muted-foreground"
                        aria-hidden
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-6 flex flex-col items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={handleSkip}
              disabled={pending !== null}
              className="h-10 text-[14px] font-semibold text-primary hover:bg-primary/5 hover:text-primary"
            >
              Omitir por ahora
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}

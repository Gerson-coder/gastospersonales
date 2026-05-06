/**
 * Invite landing — el partner abre este link desde WhatsApp o donde
 * sea que el inviter se lo haya mandado.
 *
 * Flow:
 *   1. Carga preview del code (account_name + inviter_name + expires_at)
 *      via SECURITY DEFINER function. Anonimo OK — el code es el
 *      gating, conocer el code = conocer el preview.
 *   2. Si preview es null o errorea → estado "Invitación no válida".
 *   3. Si user no esta autenticado → CTA a "Iniciar sesión" con un
 *      hint para volver al link tras ingresar (el code queda en la
 *      URL, vuelven a tocar el link de WhatsApp y listo).
 *   4. Si user esta autenticado → Card con preview + boton "Aceptar".
 *      Tras aceptar: toast de exito + redirect a /accounts.
 *
 * Ruta a nivel raiz (fuera de (tabs)) — esta pantalla es de
 * onboarding del partner: sin TabBar / Sidebar para foco maximo
 * en la decision aceptar/no.
 */
"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Heart, Loader2, LogIn } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSession } from "@/lib/use-session";
import {
  acceptInvitation,
  previewInvitation,
  type InvitationPreview,
} from "@/lib/data/partnerships";

export default function InvitePage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = typeof params?.code === "string" ? params.code : null;
  const { user, hydrated } = useSession();

  const [preview, setPreview] = React.useState<InvitationPreview | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(true);
  const [previewError, setPreviewError] = React.useState<string | null>(null);
  const [accepting, setAccepting] = React.useState(false);

  React.useEffect(() => {
    if (!code) {
      setPreviewError("Link de invitación inválido.");
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const p = await previewInvitation(code);
        if (cancelled) return;
        if (!p) {
          setPreviewError("Esta invitación ya no es válida o expiró.");
        } else {
          setPreview(p);
        }
      } catch (err) {
        if (!cancelled) {
          setPreviewError(
            err instanceof Error
              ? err.message
              : "No pudimos cargar la invitación.",
          );
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function handleAccept() {
    if (!code) return;
    setAccepting(true);
    try {
      await acceptInvitation(code);
      toast.success("Te uniste a la cuenta compartida.");
      router.push("/accounts");
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "No pudimos aceptar la invitación.",
      );
      setAccepting(false);
    }
  }

  // Loading: preview en vuelo o session no hidratada todavia.
  if (previewLoading || !hydrated) {
    return <LoadingScreen />;
  }
  if (previewError) {
    return <ErrorScreen message={previewError} />;
  }
  if (!preview) {
    return <ErrorScreen message="Esta invitación ya no es válida." />;
  }
  if (!user) {
    return <SignInScreen preview={preview} code={code ?? ""} />;
  }

  // Caso feliz: autenticado + preview valido.
  return (
    <Shell>
      <Card className="max-w-md w-full rounded-2xl border-border p-6 text-center">
        <div
          aria-hidden
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary"
        >
          <Heart size={26} aria-hidden strokeWidth={2.2} />
        </div>
        <h1 className="text-[18px] font-bold text-foreground leading-tight">
          {preview.inviterName} te invita a una cuenta compartida
        </h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">
          Te unirás a <strong className="text-foreground">{preview.accountName}</strong>.
          Verás los movimientos de la cuenta en tiempo real desde tu propio
          dashboard, y podrás registrar gastos que ambos verán.
        </p>
        <p className="mt-3 text-[11.5px] text-muted-foreground">
          {formatExpiresHint(preview.expiresAt)}
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <Button
            type="button"
            onClick={handleAccept}
            disabled={accepting}
            className="h-11 w-full rounded-full text-[13.5px] font-semibold"
          >
            {accepting ? (
              <>
                <Loader2 size={15} aria-hidden className="mr-1.5 animate-spin" />
                Vinculando…
              </>
            ) : (
              <>
                Aceptar y vincular
                <ArrowRight size={15} aria-hidden className="ml-1.5" />
              </>
            )}
          </Button>
          <Link
            href="/dashboard"
            className="text-[12px] text-muted-foreground hover:text-foreground"
          >
            No, gracias
          </Link>
        </div>
      </Card>
    </Shell>
  );
}

// ─── Sub-screens ─────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-background flex items-center justify-center p-4 text-foreground">
      {children}
    </main>
  );
}

function LoadingScreen() {
  return (
    <Shell>
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 size={26} aria-hidden className="animate-spin" />
        <p className="text-[12.5px]">Validando invitación…</p>
      </div>
    </Shell>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <Shell>
      <Card className="max-w-md w-full rounded-2xl border-border p-6 text-center">
        <div
          aria-hidden
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive"
        >
          <AlertCircle size={26} aria-hidden strokeWidth={2.2} />
        </div>
        <h1 className="text-[17px] font-bold text-foreground leading-tight">
          Invitación no válida
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          {message}
        </p>
        <p className="mt-2 text-[11.5px] text-muted-foreground">
          Pídele a quien te invitó que te envíe un link nuevo.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-flex h-10 items-center justify-center rounded-full border border-border bg-card px-4 text-[12.5px] font-semibold text-foreground hover:bg-muted"
        >
          Ir al inicio
        </Link>
      </Card>
    </Shell>
  );
}

function SignInScreen({
  preview,
  code,
}: {
  preview: InvitationPreview;
  code: string;
}) {
  return (
    <Shell>
      <Card className="max-w-md w-full rounded-2xl border-border p-6 text-center">
        <div
          aria-hidden
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary"
        >
          <Heart size={26} aria-hidden strokeWidth={2.2} />
        </div>
        <h1 className="text-[18px] font-bold text-foreground leading-tight">
          {preview.inviterName} te invita a {preview.accountName}
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
          Para aceptar, primero ingresa a Kane (o crea tu cuenta si aún no
          la tienes). Cuando vuelvas, toca el mismo link y se vinculará
          automáticamente.
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <Link
            href="/login"
            className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-foreground text-[13.5px] font-semibold text-background hover:bg-foreground/90"
          >
            <LogIn size={15} aria-hidden />
            Iniciar sesión
          </Link>
          <Link
            href="/register"
            className="inline-flex h-11 w-full items-center justify-center rounded-full border border-border bg-card text-[13.5px] font-semibold text-foreground hover:bg-muted"
          >
            Crear cuenta gratis
          </Link>
        </div>

        <p className="mt-4 text-[11px] text-muted-foreground break-all">
          Después de ingresar, vuelve a este link:
          <br />
          <span className="font-mono">/invite/{code}</span>
        </p>
      </Card>
    </Shell>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** "Vence en 3 días" / "Vence hoy" / "Vence mañana" — texto suave
 *  que le da urgencia al partner sin asustarlo. */
function formatExpiresHint(expiresAtIso: string): string {
  const expires = new Date(expiresAtIso);
  const now = new Date();
  const diffMs = expires.getTime() - now.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 0) return "Esta invitación expiró.";
  if (days === 0) return "Esta invitación vence hoy.";
  if (days === 1) return "Esta invitación vence mañana.";
  return `Esta invitación vence en ${days} días.`;
}

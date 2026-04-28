/**
 * Receipt OCR review route — Lumi (Phase B: design-only, no backend)
 *
 * Mock OCR: simulates a snap → wait → review → confirm flow with hardcoded
 * results. The real wiring (image upload, OpenAI vision call, Supabase
 * persistence) lands in a later phase.
 *
 * State machine:
 *   idle      — empty state, choose camera or gallery (or write by hand)
 *   preview   — image picked, confirm before "scanning"
 *   loading   — fake 2.5s scan with a calm UI (scan-line + 3-step indicator)
 *   failed    — friendly error with recovery paths
 *   review    — the meat: per-field confidence + editable rows + sticky CTA
 *
 * Dev affordance: the loading→failed branch fires on every 4th attempt
 * (deterministic counter in module scope). Lets reviewers see the failed
 * state without env flags. Removed when real OCR lands.
 */

// TODO: replace inline money formatting with formatMoney from @/lib/money once Batch B lands.
// TODO: swap MOCK_ACCOUNTS for `await listAccounts()` once data wiring phase begins.
// TODO: replace simulated 2.5s setTimeout with a real call to /api/ocr.

"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronRight,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  PenLine,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { CATEGORY_ICONS, getCategoryIcon } from "@/lib/category-icons";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────
type Currency = "PEN" | "USD";
type Status = "idle" | "preview" | "loading" | "failed" | "review";

// Per-field confidence — moved from a single global score to one per editable
// row so the UI can highlight exactly which value the user should sanity-check.
type FieldKey = "merchant" | "amount" | "occurred_at" | "suggested_category";
type ConfidenceMap = Record<FieldKey, number>;

type AccountId = "bcp" | "bbva" | "cash" | "yape";

type LoadingPhase = 0 | 1 | 2;

// ─── Mock OCR result ───────────────────────────────────────────────────────
// NOTE: amount stays `number` (decimal pesos) until Batch B brings BIGINT
// minor-units across the codebase. occurred_at is a stable ISO date so it
// never causes hydration mismatches.
const MOCK_OCR = {
  merchant: "Cineplanet Plaza Norte",
  amount: 80.0,
  currency: "PEN" as Currency,
  occurred_at: "2026-04-25",
  suggested_category: "film",
  confidence: {
    merchant: 0.92,
    amount: 0.88,
    occurred_at: 0.71,
    suggested_category: 0.65,
  } satisfies ConfidenceMap,
};

// Mock account list — mirrors capture/page.tsx shape. Will be replaced by
// `await listAccounts()` from @/lib/data/accounts in the wiring phase.
const MOCK_ACCOUNTS: Array<{ id: AccountId; label: string; currency: Currency }> = [
  { id: "bcp", label: "BCP Soles", currency: "PEN" },
  { id: "bbva", label: "BBVA Soles", currency: "PEN" },
  { id: "yape", label: "Yape", currency: "PEN" },
  { id: "cash", label: "Efectivo", currency: "PEN" },
];

// Module-scope counter for the dev failure simulation. We deterministically
// fail every 4th attempt so reviewers can see the failed state by retrying;
// using a real RNG would make screenshots inconsistent across reloads.
let mockOcrAttempts = 0;
function shouldMockFail(): boolean {
  // % 4 === 3 → fails on attempts #4, #8, #12 …  (0-indexed remainder 3)
  return mockOcrAttempts++ % 4 === 3;
}

const LOADING_STEPS = [
  "Leyendo texto",
  "Identificando montos",
  "Sugiriendo categoría",
] as const;

// ─── Money formatting ─────────────────────────────────────────────────────
// TODO: replace with formatMoney from @/lib/money once Batch B lands.
function formatMoney(amount: number, currency: Currency = "PEN"): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ─── Confidence helpers ───────────────────────────────────────────────────
type ConfidenceTone = "high" | "medium" | "low";

function toneFromScore(score: number): ConfidenceTone {
  if (score >= 0.85) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

// Single source of truth for the confidence color ramp. Defined here (instead
// of pulled from CSS vars) because these are one-off semantic colors that
// don't map to the existing `--primary`/`--destructive` system cleanly.
const CONFIDENCE_COLORS: Record<
  ConfidenceTone,
  { dot: string; text: string; ring: string }
> = {
  high: {
    dot: "bg-[oklch(0.55_0.14_140)]",
    text: "text-[oklch(0.45_0.14_140)] dark:text-[oklch(0.78_0.14_140)]",
    ring: "",
  },
  medium: {
    dot: "bg-[oklch(0.65_0.16_70)]",
    text: "text-[oklch(0.50_0.14_70)] dark:text-[oklch(0.78_0.14_70)]",
    ring: "ring-1 ring-inset ring-[oklch(0.65_0.16_70)]/30",
  },
  low: {
    dot: "bg-destructive",
    text: "text-destructive",
    ring: "ring-1 ring-inset ring-destructive/35",
  },
};

const CONFIDENCE_LABEL: Record<ConfidenceTone, string> = {
  high: "Confianza alta",
  medium: "Revisa este dato",
  low: "Conviene corregir",
};

// Tiny inline confidence dot + a11y label. Does NOT carry color alone — the
// label is read aloud by screen readers.
function ConfidenceDot({ score }: { score: number }) {
  const tone = toneFromScore(score);
  const c = CONFIDENCE_COLORS[tone];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-[11px] font-semibold", c.text)}
      aria-label={`${CONFIDENCE_LABEL[tone]} (${Math.round(score * 100)}%)`}
    >
      <span aria-hidden="true" className={cn("inline-block h-1.5 w-1.5 rounded-full", c.dot)} />
      {CONFIDENCE_LABEL[tone]}
    </span>
  );
}

// ─── Idle state ───────────────────────────────────────────────────────────
function IdleState({
  onPickCamera,
  onPickGallery,
  onWriteByHand,
}: {
  onPickCamera: () => void;
  onPickGallery: () => void;
  onWriteByHand: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-6 pb-20 pt-12 text-center md:py-20">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)]">
        <Camera size={28} aria-hidden="true" />
      </div>
      <div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Escanear ticket
      </div>
      <h1 className="mt-1.5 text-3xl font-bold leading-tight md:text-4xl">
        Una foto y listo
      </h1>
      <p className="mt-2 max-w-[28ch] text-sm text-muted-foreground">
        Yo leo el monto, la fecha y el comercio. Tú revisas y guardas.
      </p>

      <div className="mt-8 flex w-full flex-col gap-2.5">
        <Button
          type="button"
          onClick={onPickCamera}
          className="h-12 w-full rounded-full text-base font-bold"
          style={{ boxShadow: "var(--shadow-fab)" }}
        >
          <Camera size={18} aria-hidden="true" />
          Tomar foto
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onPickGallery}
          className="h-12 w-full rounded-full text-sm font-semibold"
        >
          <ImageIcon size={16} aria-hidden="true" />
          Elegir de galería
        </Button>
        <button
          type="button"
          onClick={onWriteByHand}
          className="mt-2 inline-flex h-11 items-center justify-center gap-1.5 self-center rounded-full px-4 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PenLine size={14} aria-hidden="true" />
          Lo escribo a mano
        </button>
      </div>
    </div>
  );
}

// ─── Preview state ────────────────────────────────────────────────────────
function PreviewState({
  imageUrl,
  onRetake,
  onAnalyze,
}: {
  imageUrl: string;
  onRetake: () => void;
  onAnalyze: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-md px-4 pb-32 pt-4 md:px-0 md:py-10">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Foto cargada
      </div>
      <h1 className="mt-1 text-3xl font-bold leading-tight">
        ¿Se ve bien?
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Asegúrate de que el monto y la fecha sean legibles antes de continuar.
      </p>

      <div className="mt-5 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL, not optimisable */}
        <img
          src={imageUrl}
          alt="Vista previa del ticket"
          className="block max-h-[60vh] w-full object-contain bg-[oklch(0.94_0.005_95)] dark:bg-[oklch(0.22_0.005_95)]"
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pt-8 pb-[calc(env(safe-area-inset-bottom)+1rem)] md:relative md:inset-auto md:bottom-auto md:z-auto md:mt-6 md:bg-none md:px-0 md:pt-0 md:pb-0">
        <div className="mx-auto flex w-full max-w-md gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onRetake}
            className="h-12 flex-1 rounded-full text-sm font-semibold"
          >
            <RotateCcw size={16} aria-hidden="true" />
            Volver a tomar
          </Button>
          <Button
            type="button"
            onClick={onAnalyze}
            className="h-12 flex-[1.4] rounded-full text-sm font-bold"
            style={{ boxShadow: "var(--shadow-fab)" }}
          >
            Analizar ticket
            <ChevronRight size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Loading state ────────────────────────────────────────────────────────
function LoadingState({
  imageUrl,
  phase,
  onCancel,
}: {
  imageUrl: string;
  phase: LoadingPhase;
  onCancel: () => void;
}) {
  return (
    <div
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-start px-4 pb-12 pt-6 md:py-16"
      role="status"
      aria-live="polite"
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        Procesando
      </div>
      <h1 className="mt-1 text-3xl font-bold leading-tight">
        Leyendo el ticket…
      </h1>

      {/* Image with scan-line overlay. The scan-line is `motion-reduce:hidden`
          so users with reduced-motion preference see a still image — the
          textual progress steps below carry the load there. */}
      <div className="relative mt-6 w-full overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL, not optimisable */}
        <img
          src={imageUrl}
          alt=""
          aria-hidden="true"
          className="block max-h-[42vh] w-full object-contain bg-[oklch(0.94_0.005_95)] dark:bg-[oklch(0.22_0.005_95)]"
        />
        {/* Scanner sweep — thin gradient line, ~1.8s linear loop. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-full motion-reduce:hidden"
        >
          <div
            className="absolute inset-x-0 h-12 animate-lumi-scan"
            style={{
              background:
                "linear-gradient(180deg, transparent 0%, oklch(0.78 0.16 162 / 0.18) 45%, oklch(0.78 0.16 162 / 0.55) 50%, oklch(0.78 0.16 162 / 0.18) 55%, transparent 100%)",
            }}
          />
        </div>
      </div>

      {/* Step indicator — three pills that fill in sequence as `phase` ticks.
          Purely a UX device; not synced to actual OCR progress. */}
      <ol className="mt-6 flex w-full flex-col gap-2">
        {LOADING_STEPS.map((step, i) => {
          const active = i === phase;
          const done = i < phase;
          return (
            <li
              key={step}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-[13px] transition-colors",
                done
                  ? "border-transparent bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)]"
                  : active
                    ? "border-primary/40 bg-card text-foreground"
                    : "border-border bg-card text-muted-foreground",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full",
                  done
                    ? "bg-primary text-primary-foreground"
                    : active
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {done ? (
                  <Check size={12} strokeWidth={3} />
                ) : active ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <span className="text-[10px] font-bold tabular-nums">{i + 1}</span>
                )}
              </span>
              <span className={cn("flex-1 font-semibold", done && "line-through opacity-80")}>
                {step}
              </span>
            </li>
          );
        })}
      </ol>

      <Button
        type="button"
        variant="ghost"
        onClick={onCancel}
        className="mt-6 h-11 rounded-full text-[13px] font-semibold text-muted-foreground hover:text-foreground"
      >
        Cancelar
      </Button>
    </div>
  );
}

// ─── Failed state ─────────────────────────────────────────────────────────
function FailedState({
  onRetry,
  onRetake,
  onWriteByHand,
}: {
  onRetry: () => void;
  onRetake: () => void;
  onWriteByHand: () => void;
}) {
  return (
    <div
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 px-6 pb-12 text-center"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertTriangle size={28} aria-hidden="true" />
      </div>
      <div>
        <h1 className="text-3xl font-bold leading-tight">No pude leer el ticket</h1>
        <p className="mt-2 max-w-[30ch] text-sm text-muted-foreground">
          La imagen salió borrosa o no encontré los datos. Prueba con buena luz y enfoque.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <Button
          type="button"
          onClick={onRetry}
          className="h-12 w-full rounded-full text-sm font-bold"
          style={{ boxShadow: "var(--shadow-fab)" }}
        >
          <RotateCcw size={16} aria-hidden="true" />
          Reintentar
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onRetake}
          className="h-12 w-full rounded-full text-sm font-semibold"
        >
          <Camera size={16} aria-hidden="true" />
          Tomar otra foto
        </Button>
        <button
          type="button"
          onClick={onWriteByHand}
          className="mt-1 inline-flex h-11 items-center justify-center gap-1.5 self-center rounded-full px-4 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <PenLine size={14} aria-hidden="true" />
          Lo escribo a mano
        </button>
      </div>
    </div>
  );
}

// ─── Field row wrapper — handles confidence ring + label ──────────────────
function FieldRow({
  label,
  htmlFor,
  score,
  children,
}: {
  label: string;
  htmlFor?: string;
  score: number;
  children: React.ReactNode;
}) {
  const tone = toneFromScore(score);
  const ringClass = CONFIDENCE_COLORS[tone].ring;
  return (
    <div
      className={cn(
        "rounded-xl bg-card p-3.5 transition-colors",
        // Soft amber/red ring on medium/low to nudge the user toward verification.
        ringClass,
      )}
    >
      <div className="flex items-center justify-between gap-2 pb-1.5">
        <Label htmlFor={htmlFor} className="text-[12px] font-semibold text-foreground">
          {label}
        </Label>
        <ConfidenceDot score={score} />
      </div>
      {children}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────
// sessionStorage keys used by /share-target route handler when the OS
// share sheet hands us an image. Kept in sync with that route.
const SHARE_KEYS = {
  image: "lumi:share-target:image",
  mime: "lumi:share-target:mime",
  name: "lumi:share-target:name",
  ts: "lumi:share-target:ts",
} as const;

// Convert a data URL (data:image/png;base64,...) into a Blob → File pair so
// we can route it through the same handleFile() pipeline as a picker.
function dataUrlToFile(dataUrl: string, mime: string, name: string): File | null {
  try {
    const commaIdx = dataUrl.indexOf(",");
    if (commaIdx < 0) return null;
    const b64 = dataUrl.slice(commaIdx + 1);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], name || "shared-image", { type: mime || "image/jpeg" });
  } catch {
    return null;
  }
}

export default function ReceiptPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = React.useState<Status>("idle");

  // Image: stored as a blob URL so we never upload anywhere in this phase.
  // Revoked on unmount + on each re-pick to avoid memory leaks.
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);

  // Refs for the two hidden file inputs — one with `capture` (camera),
  // one without (gallery). Triggered programmatically by the idle/preview UIs.
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const galleryInputRef = React.useRef<HTMLInputElement>(null);

  // Form state — populated when the mock OCR "succeeds" and we transition
  // into the review state. Defaults keep TS happy before that transition.
  const [merchant, setMerchant] = React.useState(MOCK_OCR.merchant);
  const [amount, setAmount] = React.useState(MOCK_OCR.amount.toFixed(2));
  const [currency, setCurrency] = React.useState<Currency>(MOCK_OCR.currency);
  const [occurredAt, setOccurredAt] = React.useState(MOCK_OCR.occurred_at);
  const [categoryIcon, setCategoryIcon] = React.useState<string>(MOCK_OCR.suggested_category);
  const [accountId, setAccountId] = React.useState<AccountId>("bcp");

  // Loading phase ticks 0 → 1 → 2 every ~800ms while in the loading state.
  const [loadingPhase, setLoadingPhase] = React.useState<LoadingPhase>(0);

  // UI state
  const [isZoomOpen, setIsZoomOpen] = React.useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = React.useState(false);
  const [isAccountOpen, setIsAccountOpen] = React.useState(false);
  // Inline-confirm pattern (matches CategoryFormSheet's archive flow).
  // First click on Descartar arms; second click commits. Resets on any field
  // edit so the warning doesn't linger past the next user action.
  const [discardArmed, setDiscardArmed] = React.useState(false);
  // Whether any field was edited from the OCR-suggested defaults — controls
  // whether we ask for confirmation on Descartar.
  const [dirty, setDirty] = React.useState(false);

  // Cleanup blob URL on unmount. We also revoke when picking a new image
  // (see handleFile below) — never leak the previous one.
  React.useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
    // We intentionally only depend on the latest URL via closure capture in
    // handleFile's revoke; this effect runs once on unmount with the final URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Loading simulation — 2.5s total, three phases (~800ms each), then either
  // resolves to review or fails based on the dev mock counter. setTimeouts
  // are tracked + cleared on cancel/unmount so we don't transition a
  // stale component.
  React.useEffect(() => {
    if (status !== "loading") return;
    setLoadingPhase(0);
    const t1 = window.setTimeout(() => setLoadingPhase(1), 800);
    const t2 = window.setTimeout(() => setLoadingPhase(2), 1600);
    const t3 = window.setTimeout(() => {
      if (shouldMockFail()) {
        setStatus("failed");
      } else {
        // Reset form to OCR defaults so a fresh scan always starts clean.
        setMerchant(MOCK_OCR.merchant);
        setAmount(MOCK_OCR.amount.toFixed(2));
        setCurrency(MOCK_OCR.currency);
        setOccurredAt(MOCK_OCR.occurred_at);
        setCategoryIcon(MOCK_OCR.suggested_category);
        setAccountId("bcp");
        setDirty(false);
        setStatus("review");
      }
    }, 2500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [status]);

  // Reset the discard-confirm whenever a field changes — the warning was
  // about *this* state, not whatever the user does next.
  React.useEffect(() => {
    if (discardArmed) setDiscardArmed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchant, amount, currency, occurredAt, categoryIcon, accountId]);

  const markDirty = React.useCallback(() => setDirty(true), []);

  const handleFile = React.useCallback(
    (file: File | null | undefined) => {
      if (!file) return;
      // Revoke the previous URL before assigning a new one — leaking blob
      // URLs over a long session is real, and the GC won't clean them up.
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      const next = URL.createObjectURL(file);
      setImageUrl(next);
      setStatus("preview");
    },
    [imageUrl],
  );

  // Web Share Target intake — runs once on mount. The /share-target route
  // handler stashes the shared image (base64 data URL) in sessionStorage and
  // redirects here with ?fromShare=1. We pull it out, build a File, and
  // feed it into the normal preview pipeline. Errors flagged via
  // ?shareError=<code> surface as a toast and we drop into idle.
  React.useEffect(() => {
    const fromShare = searchParams.get("fromShare");
    const shareError = searchParams.get("shareError");

    if (shareError) {
      const messages: Record<string, string> = {
        "no-image": "No encontré ninguna imagen en lo que compartiste.",
        "not-image": "Solo puedo procesar imágenes (JPG, PNG, etc.).",
        "too-large": "La imagen es muy grande. El máximo es 10 MB.",
        "bad-request": "No pude leer lo que compartiste. Inténtalo de nuevo.",
      };
      toast.error(messages[shareError] ?? "No pude procesar lo compartido.");
      // Clean the URL so a refresh doesn't re-fire the toast.
      router.replace("/receipt");
      return;
    }

    if (fromShare !== "1") return;

    if (typeof window === "undefined") return;
    const dataUrl = window.sessionStorage.getItem(SHARE_KEYS.image);
    const mime = window.sessionStorage.getItem(SHARE_KEYS.mime) ?? "image/jpeg";
    const name = window.sessionStorage.getItem(SHARE_KEYS.name) ?? "shared-image";

    // Single-use payload: clear immediately so a manual refresh doesn't
    // resurrect a stale share.
    window.sessionStorage.removeItem(SHARE_KEYS.image);
    window.sessionStorage.removeItem(SHARE_KEYS.mime);
    window.sessionStorage.removeItem(SHARE_KEYS.name);
    window.sessionStorage.removeItem(SHARE_KEYS.ts);

    if (!dataUrl) {
      toast.error("No pude recuperar la imagen compartida.");
      router.replace("/receipt");
      return;
    }

    const file = dataUrlToFile(dataUrl, mime, name);
    if (!file) {
      toast.error("La imagen compartida estaba dañada.");
      router.replace("/receipt");
      return;
    }

    handleFile(file);
    router.replace("/receipt");
    // Mount-only intake — depending on handleFile would re-run after the
    // first ingestion (handleFile changes when imageUrl changes) and we'd
    // try to re-read an already-cleared sessionStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const triggerCamera = React.useCallback(() => {
    cameraInputRef.current?.click();
  }, []);

  const triggerGallery = React.useCallback(() => {
    galleryInputRef.current?.click();
  }, []);

  const handleAnalyze = React.useCallback(() => {
    setStatus("loading");
  }, []);

  const handleCancelLoading = React.useCallback(() => {
    setStatus("preview");
  }, []);

  const handleRetry = React.useCallback(() => {
    setStatus("loading");
  }, []);

  const handleWriteByHand = React.useCallback(() => {
    router.push("/capture");
  }, [router]);

  const handleAccept = React.useCallback(() => {
    toast.success("Guardado", {
      description: `${formatMoney(Number(amount.replace(",", ".")) || 0, currency)} en ${merchant}`,
    });
    window.setTimeout(() => {
      router.push("/dashboard");
    }, 800);
  }, [amount, currency, merchant, router]);

  const handleDiscard = React.useCallback(() => {
    if (dirty && !discardArmed) {
      setDiscardArmed(true);
      return;
    }
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
    setDirty(false);
    setDiscardArmed(false);
    setStatus("idle");
  }, [dirty, discardArmed, imageUrl]);

  // Hidden inputs — rendered always so the refs are available across states.
  const hiddenInputs = (
    <>
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0])}
        aria-hidden="true"
        tabIndex={-1}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0])}
        aria-hidden="true"
        tabIndex={-1}
      />
    </>
  );

  // ─── Render dispatch ──────────────────────────────────────────────────
  if (status === "idle") {
    return (
      <div className="relative min-h-dvh bg-background text-foreground">
        {hiddenInputs}
        <IdleState
          onPickCamera={triggerCamera}
          onPickGallery={triggerGallery}
          onWriteByHand={handleWriteByHand}
        />
      </div>
    );
  }

  if (status === "preview" && imageUrl) {
    return (
      <div className="relative min-h-dvh bg-background text-foreground">
        {hiddenInputs}
        <PreviewState
          imageUrl={imageUrl}
          onRetake={triggerCamera}
          onAnalyze={handleAnalyze}
        />
      </div>
    );
  }

  if (status === "loading" && imageUrl) {
    return (
      <div className="relative min-h-dvh bg-background text-foreground">
        {hiddenInputs}
        <LoadingState
          imageUrl={imageUrl}
          phase={loadingPhase}
          onCancel={handleCancelLoading}
        />
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="relative min-h-dvh bg-background text-foreground">
        {hiddenInputs}
        <FailedState
          onRetry={handleRetry}
          onRetake={triggerCamera}
          onWriteByHand={handleWriteByHand}
        />
      </div>
    );
  }

  // ─── Review state (the meat) ─────────────────────────────────────────
  const parsedAmount = Number(amount.replace(",", ".")) || 0;
  const account = MOCK_ACCOUNTS.find((a) => a.id === accountId) ?? MOCK_ACCOUNTS[0];
  const categoryLabel =
    CATEGORY_ICONS.find((c) => c.name === categoryIcon)?.label ?? "Otros";
  const CategoryIcon = getCategoryIcon(categoryIcon);

  return (
    <div className="relative min-h-dvh bg-background pb-36 text-foreground md:pb-0">
      {hiddenInputs}
      <div className="mx-auto w-full max-w-2xl px-4 md:px-8 md:py-8">
        {/* Receipt photo — small banner at the top so the user can sanity-check
            the OCR against the source without scrolling away. Tap → zoom. */}
        {imageUrl && (
          <div className="relative mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] md:mt-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL, not optimisable */}
            <img
              src={imageUrl}
              alt="Foto del ticket cargado"
              className="block h-[120px] w-full object-cover bg-[oklch(0.94_0.005_95)] dark:bg-[oklch(0.22_0.005_95)]"
            />
            <button
              type="button"
              onClick={() => setIsZoomOpen(true)}
              aria-label="Ver foto del ticket en grande"
              className="absolute bottom-2 right-2 inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground/85 px-3 text-[11px] font-semibold text-background backdrop-blur-sm transition-colors hover:bg-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Maximize2 size={12} aria-hidden="true" />
              Ver
            </button>
          </div>
        )}

        {/* Header copy */}
        <div className="pt-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Lo que leí del ticket
          </div>
          <h1 className="mt-1 text-3xl font-bold leading-tight">
            Revisa los datos
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Los campos marcados merecen una segunda mirada.
          </p>
        </div>

        {/* Form fields */}
        <Card className="mt-5 rounded-2xl border-border p-3 md:p-4">
          <div className="flex flex-col gap-2.5">
            {/* Comercio */}
            <FieldRow
              label="Comercio"
              htmlFor="receipt-merchant"
              score={MOCK_OCR.confidence.merchant}
            >
              <Input
                id="receipt-merchant"
                value={merchant}
                onChange={(e) => {
                  setMerchant(e.target.value.slice(0, 80));
                  markDirty();
                }}
                autoComplete="off"
                maxLength={80}
                className="h-11 border-0 bg-transparent px-0 text-base font-semibold shadow-none focus-visible:ring-0"
              />
            </FieldRow>

            {/* Monto + moneda */}
            <FieldRow
              label="Monto total"
              htmlFor="receipt-amount"
              score={MOCK_OCR.confidence.amount}
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="font-mono text-base font-semibold text-muted-foreground"
                >
                  {currency === "PEN" ? "S/" : "$"}
                </span>
                <Input
                  id="receipt-amount"
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value.replace(/[^0-9.,]/g, ""));
                    markDirty();
                  }}
                  onBlur={() => {
                    const n = Number(amount.replace(",", ".")) || 0;
                    setAmount(n.toFixed(2));
                  }}
                  className="h-11 flex-1 border-0 bg-transparent px-0 font-mono text-lg font-semibold tabular-nums shadow-none focus-visible:ring-0"
                />
                <RadioGroup
                  value={currency}
                  onValueChange={(v) => {
                    setCurrency(v as Currency);
                    markDirty();
                  }}
                  className="flex gap-1"
                >
                  {(["PEN", "USD"] as Currency[]).map((c) => (
                    <label
                      key={c}
                      className={cn(
                        "flex h-9 cursor-pointer items-center rounded-full border px-3 text-[12px] font-semibold transition-colors",
                        "has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring",
                        currency === c
                          ? "border-foreground bg-foreground text-background"
                          : "border-border bg-card text-muted-foreground hover:bg-muted",
                      )}
                    >
                      <RadioGroupItem value={c} className="sr-only" aria-label={c} />
                      {c}
                    </label>
                  ))}
                </RadioGroup>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Equivalente: {formatMoney(parsedAmount, currency)}
              </p>
            </FieldRow>

            {/* Fecha */}
            <FieldRow
              label="Fecha"
              htmlFor="receipt-date"
              score={MOCK_OCR.confidence.occurred_at}
            >
              <Input
                id="receipt-date"
                type="date"
                value={occurredAt}
                onChange={(e) => {
                  setOccurredAt(e.target.value || new Date().toISOString().slice(0, 10));
                  markDirty();
                }}
                className="h-11 border-0 bg-transparent px-0 text-base font-semibold shadow-none focus-visible:ring-0"
              />
            </FieldRow>

            {/* Categoría — opens drawer */}
            <FieldRow
              label="Categoría sugerida"
              score={MOCK_OCR.confidence.suggested_category}
            >
              <button
                type="button"
                onClick={() => setIsCategoryOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={isCategoryOpen}
                className="flex h-11 w-full items-center gap-3 rounded-lg text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)]"
                >
                  <CategoryIcon size={16} />
                </span>
                <span className="flex-1 text-base font-semibold">{categoryLabel}</span>
                <Badge variant="outline" className="h-7 rounded-full px-2 text-[11px] font-semibold">
                  cambiar
                </Badge>
                <ChevronRight size={16} aria-hidden="true" className="text-muted-foreground" />
              </button>
            </FieldRow>

            {/* Cuenta — opens drawer (no per-field confidence, OCR doesn't infer it) */}
            <div className="rounded-xl bg-card p-3.5">
              <div className="pb-1.5">
                <span className="text-[12px] font-semibold text-foreground">Cuenta</span>
              </div>
              <button
                type="button"
                onClick={() => setIsAccountOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={isAccountOpen}
                className="flex h-11 w-full items-center gap-3 rounded-lg text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex-1 text-base font-semibold">{account.label}</span>
                <Badge variant="outline" className="h-7 rounded-full px-2 text-[11px] font-semibold">
                  {account.currency}
                </Badge>
                <ChevronRight size={16} aria-hidden="true" className="text-muted-foreground" />
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* Sticky CTA bar — soft gradient backdrop so it floats above the form
          without a hard divider. On md+ it slots inline at the bottom of the
          page flow. */}
      <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pt-10 pb-[calc(env(safe-area-inset-bottom)+1rem)] md:relative md:inset-auto md:bottom-auto md:z-auto md:mx-auto md:mt-6 md:max-w-2xl md:bg-none md:px-8 md:pt-0">
        <div className="mx-auto flex w-full max-w-md flex-col gap-2 md:max-w-none md:flex-row">
          {discardArmed ? (
            // Inline confirm — first Descartar tap arms this row; the user can
            // still bail out via Cancelar. Same rhythm as CategoryFormSheet's
            // archive confirm. Lives inline (no modal) to keep flow calm.
            <div className="flex w-full items-center gap-2 rounded-full border border-destructive/40 bg-destructive/5 px-3 py-2">
              <span className="flex-1 text-[13px] font-semibold text-destructive">
                ¿Descartar el ticket?
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDiscardArmed(false)}
                className="h-9 rounded-full"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDiscard}
                className="h-9 rounded-full"
              >
                Descartar
              </Button>
            </div>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={handleDiscard}
                className="h-12 rounded-full text-sm font-semibold text-muted-foreground hover:text-destructive md:flex-1"
              >
                <Trash2 size={16} aria-hidden="true" />
                Descartar
              </Button>
              <Button
                type="button"
                onClick={handleAccept}
                className="h-12 rounded-full text-base font-bold md:flex-[2]"
                style={{ boxShadow: "var(--shadow-fab)" }}
              >
                <Check size={18} aria-hidden="true" />
                Aceptar y guardar
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Zoom modal — full-screen sheet, ESC-closeable + focus-trapped. */}
      <Sheet open={isZoomOpen} onOpenChange={setIsZoomOpen}>
        <SheetContent
          side="bottom"
          className="h-[100dvh] max-w-none border-0 bg-foreground/95 p-0 sm:max-w-none"
          showCloseButton={false}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Foto del ticket</SheetTitle>
            <SheetDescription>
              Vista ampliada del ticket. Pulsa ESC o el botón Cerrar para volver.
            </SheetDescription>
          </SheetHeader>
          <div className="relative flex h-full w-full items-center justify-center p-4">
            {imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- local blob URL, not optimisable
              <img
                src={imageUrl}
                alt="Foto del ticket, vista ampliada"
                className="max-h-full max-w-full rounded-lg object-contain"
              />
            )}
            <SheetClose
              render={
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Cerrar vista ampliada"
                  className="absolute right-4 top-4 h-11 w-11 rounded-full"
                />
              }
            >
              <X size={18} aria-hidden="true" />
            </SheetClose>
          </div>
        </SheetContent>
      </Sheet>

      {/* Category Drawer — same icon grid pattern as CategoryFormSheet's
          icon picker, but for SELECTION only (not creating a category). */}
      <Drawer open={isCategoryOpen} onOpenChange={setIsCategoryOpen}>
        <DrawerContent
          aria-describedby="receipt-category-desc"
          className="bg-background"
        >
          <DrawerHeader>
            <DrawerTitle>Elegir categoría</DrawerTitle>
            <DrawerDescription id="receipt-category-desc">
              Sugerencia: {CATEGORY_ICONS.find((c) => c.name === MOCK_OCR.suggested_category)?.label ?? "—"}
            </DrawerDescription>
          </DrawerHeader>
          <div className="grid grid-cols-4 gap-2 px-4 pb-2">
            {CATEGORY_ICONS.map(({ name, label, Icon }) => {
              const selected = categoryIcon === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    setCategoryIcon(name);
                    markDirty();
                    setIsCategoryOpen(false);
                  }}
                  aria-pressed={selected}
                  className={cn(
                    "flex min-h-[80px] flex-col items-center justify-center gap-1.5 rounded-2xl border p-2 text-center transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-foreground hover:bg-muted",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full",
                      selected ? "bg-background/20 text-current" : "bg-muted text-foreground",
                    )}
                  >
                    <Icon size={18} />
                  </span>
                  <span className="text-[11px] font-semibold leading-tight">{label}</span>
                </button>
              );
            })}
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="ghost" className="h-11 rounded-full">
                Cancelar
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Account Drawer — list selector (mock data; data-layer wiring later). */}
      <Drawer open={isAccountOpen} onOpenChange={setIsAccountOpen}>
        <DrawerContent
          aria-describedby="receipt-account-desc"
          className="bg-background"
        >
          <DrawerHeader>
            <DrawerTitle>Elegir cuenta</DrawerTitle>
            <DrawerDescription id="receipt-account-desc">
              ¿De dónde salió el dinero?
            </DrawerDescription>
          </DrawerHeader>
          <ul className="flex flex-col gap-1 px-2 pb-2">
            {MOCK_ACCOUNTS.map((a) => {
              const selected = accountId === a.id;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setAccountId(a.id);
                      markDirty();
                      setIsAccountOpen(false);
                    }}
                    aria-pressed={selected}
                    className={cn(
                      "flex h-14 w-full items-center gap-3 rounded-2xl px-3 text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected ? "bg-muted" : "hover:bg-muted",
                    )}
                  >
                    <span className="flex-1">
                      <span className="block text-[13px] font-semibold">{a.label}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {a.currency}
                      </span>
                    </span>
                    {selected && <Check size={16} aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="ghost" className="h-11 rounded-full">
                Cancelar
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

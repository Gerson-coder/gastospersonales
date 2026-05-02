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

"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
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
import {
  type Account,
  accountDisplayLabel,
  listAccounts,
} from "@/lib/data/accounts";
import { type Category, listCategories } from "@/lib/data/categories";
import {
  createTransaction,
  type TransactionKind,
} from "@/lib/data/transactions";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────
type Currency = "PEN" | "USD";
type Status = "idle" | "preview" | "loading" | "failed" | "review";

// Per-field confidence — moved from a single global score to one per editable
// row so the UI can highlight exactly which value the user should sanity-check.
//
// `kind` (gasto/ingreso) was added when we made the toggle editable: the OCR
// can't distinguish "I sent this Yape" from "someone shared this Yape with
// me", so the score for kind tracks the underlying extractor confidence —
// medium scores trigger the amber "review" ring on the toggle.
type FieldKey =
  | "merchant"
  | "amount"
  | "occurred_at"
  | "suggested_category"
  | "kind";
type ConfidenceMap = Record<FieldKey, number>;

type LoadingPhase = 0 | 1 | 2;

// ─── Initial form defaults ────────────────────────────────────────────────
// Used for: (a) the very first paint before any OCR has run, and (b) reset
// when the user picks a fresh image. The values are intentionally neutral
// rather than pretending the OCR has succeeded — the per-field "confidence
// alta" pills only show after the real OCR call returns.
const INITIAL_FORM: {
  merchant: string;
  amount: string;
  currency: Currency;
  occurred_at: () => string;
  category_icon: string;
} = {
  merchant: "",
  amount: "0.00",
  currency: "PEN",
  occurred_at: () => new Date().toISOString().slice(0, 10),
  // "shopping" reads as a generic catch-all; the user will almost always
  // pick something specific in the drawer. The OCR pipeline does NOT
  // infer category, so we keep this confidence low to nudge a review.
  category_icon: "shopping",
};

const INITIAL_CONFIDENCE: ConfidenceMap = {
  // Pre-OCR all confidences sit at 0 → grey rings; the form looks "to be
  // filled" rather than "trust me, I'm done".
  merchant: 0,
  amount: 0,
  occurred_at: 0,
  suggested_category: 0,
  kind: 0,
};

/**
 * Pick the user's account that best matches the OCR-classified source.
 *
 * Matching strategy — tries in order:
 *   1. By account `kind` (only "yape" / "plin" exist in AccountKind;
 *      "bbva" / "bcp" don't because those are real banks → kind = "bank").
 *   2. By case-insensitive `label` substring. This is how a user-named
 *      "BCP Soles" or "BBVA Continental" account gets matched without
 *      a dedicated kind. Multiple needles allow brand variants
 *      (BCP / Crédito, BBVA / Continental).
 *   3. Fallback to the user's first account.
 *
 * Returns null when the user has no accounts at all (caller must handle).
 */
function suggestAccountIdForSource(
  source: string,
  accounts: Account[],
): string | null {
  if (accounts.length === 0) return null;
  const matchByLabel = (...needles: string[]) =>
    accounts.find((a) =>
      needles.some((n) => a.label.toLowerCase().includes(n.toLowerCase())),
    );

  let match: Account | undefined;
  switch (source) {
    case "yape":
      match =
        accounts.find((a) => a.kind === "yape") ?? matchByLabel("yape");
      break;
    case "plin":
      match =
        accounts.find((a) => a.kind === "plin") ?? matchByLabel("plin");
      break;
    case "bbva":
      match = matchByLabel("bbva", "continental");
      break;
    case "bcp":
      match = matchByLabel("bcp", "crédito", "credito");
      break;
    default:
      match = undefined;
  }
  return (match ?? accounts[0]).id;
}

/**
 * Map an icon name (the picker UI value) to a real category id from the
 * user's category list. Strategy: prefer an exact `category.icon` match;
 * fall back to the first user/system category whose `kind` matches the
 * transaction kind; finally null (uncategorized).
 */
function mapIconToCategoryId(
  iconName: string,
  categories: Category[],
  kind: TransactionKind,
): string | null {
  const byIcon = categories.find(
    (c) => c.icon === iconName && c.kind === kind && !c.archived_at,
  );
  if (byIcon) return byIcon.id;
  const byKind = categories.find((c) => c.kind === kind && !c.archived_at);
  return byKind?.id ?? null;
}

// Pretty-print the OCR-classified source for use as a fallback merchant
// label when the receipt has no counterparty (e.g. a Yape with the name
// cropped). "yape" → "Yape", "bcp" → "BCP", etc.
function prettySourceName(source: string): string {
  switch (source) {
    case "yape":
      return "Yape";
    case "plin":
      return "Plin";
    case "bbva":
      return "BBVA";
    case "bcp":
      return "BCP";
    default:
      return "Comprobante";
  }
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

// ─── OCR API client helpers ───────────────────────────────────────────────
//
// Compress before upload so we don't push a 6 MB phone photo over the
// network. 1024×1024 JPEG q80 sits at ~150-300 KB for typical receipts
// and is enough resolution for OpenAI's vision model to read screenshot
// text. The model itself crops to 512×512 internally on `imageDetail:
// "low"`, so going higher than 1024 is wasted bytes.
async function compressImageToDataUrl(
  file: File,
  maxDim = 1024,
  quality = 0.8,
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(maxDim / bitmap.width, maxDim / bitmap.height, 1);
  const w = Math.max(1, Math.round(bitmap.width * ratio));
  const h = Math.max(1, Math.round(bitmap.height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas-2d-unavailable");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality),
  );
  if (!blob) throw new Error("canvas-toblob-failed");

  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("filereader-not-string"));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Mirror of the API route's response. Kept loose because the route can
// also send 4xx/5xx with a generic { error: string } that we render
// as a toast message.
type OcrApiResponse =
  | {
      ok: true;
      data: {
        receiptId: string;
        source: string;
        confidence: number;
        kind: "expense" | "income";
        amount: { minor: number; currency: Currency };
        occurredAt: string;
        counterparty?: { name: string; document?: string };
        reference?: string;
        memo?: string;
        rawText: string;
        modelUsed: string;
      };
      issues: Array<{ field: string; severity: string; message: string }>;
    }
  | {
      ok: false;
      error:
        | { kind: "INVALID_IMAGE"; message: string }
        | { kind: "MODEL_FAILURE"; retryable: boolean }
        | {
            kind: "LOW_CONFIDENCE";
            partial: {
              receiptId: string;
              source?: string;
              confidence?: number;
              kind?: "expense" | "income";
              amount?: { minor: number; currency: Currency };
              occurredAt?: string;
              counterparty?: { name: string; document?: string };
              rawText?: string;
              modelUsed?: string;
            };
          };
    };

function ReceiptPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = React.useState<Status>("idle");

  // Image: stored as a blob URL for preview AND as the original File for
  // the OCR upload pipeline. The blob URL is revoked on unmount + on each
  // re-pick; the File is replaced (no leak — refs go out of scope).
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [imageFile, setImageFile] = React.useState<File | null>(null);

  // Receipt id assigned by the API route once the image is persisted.
  // Saved into transactions.receipt_id when the user confirms (wiring
  // for that lives in the next phase — handleAccept).
  const [receiptId, setReceiptId] = React.useState<string | null>(null);

  // Per-field confidences. Start with grey rings (all zero) so the form
  // visually says "to be filled" until the real OCR call lands and
  // replaces the values wholesale.
  const [confidences, setConfidences] = React.useState<ConfidenceMap>(
    INITIAL_CONFIDENCE,
  );

  // Refs for the two hidden file inputs — one with `capture` (camera),
  // one without (gallery). Triggered programmatically by the idle/preview UIs.
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const galleryInputRef = React.useRef<HTMLInputElement>(null);

  // Form state. Defaults keep TS happy before the OCR transitions us into
  // the review state. Once OCR resolves, every field below is overwritten.
  const [merchant, setMerchant] = React.useState(INITIAL_FORM.merchant);
  const [amount, setAmount] = React.useState(INITIAL_FORM.amount);
  const [currency, setCurrency] = React.useState<Currency>(INITIAL_FORM.currency);
  const [occurredAt, setOccurredAt] = React.useState(INITIAL_FORM.occurred_at);
  const [categoryIcon, setCategoryIcon] = React.useState<string>(
    INITIAL_FORM.category_icon,
  );
  // Real account id (uuid). Populated from listAccounts() on mount; the
  // first account is the default until OCR routes to a source-matching
  // account via suggestAccountIdForSource.
  const [accountId, setAccountId] = React.useState<string | null>(null);
  // Transaction kind comes from the OCR result (Yape recibido → income,
  // everything else → expense). The user does NOT edit this in the form;
  // it travels through to handleAccept untouched.
  const [transactionKind, setTransactionKind] = React.useState<TransactionKind>(
    "expense",
  );

  // Real data loaded from Supabase on mount. Both list calls are gated by
  // SUPABASE_ENABLED inside their respective modules; if env is missing,
  // they return [] and the UI shows a helpful empty state.
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  // Save submission state: prevents double-tap on the green "Aceptar y
  // guardar" button while the network request is in flight.
  const [isSaving, setIsSaving] = React.useState(false);
  // After a successful save we surface a small inline "Guardado" banner
  // (same pattern as /capture) for ~900ms before navigating away. The
  // banner is friendlier than a toast and matches the rest of the app.
  const [saved, setSaved] = React.useState(false);

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

  // Load real accounts + categories on mount. Both calls are independent
  // and cheap (cached by Supabase auto-refetch) so we fire them in
  // parallel. If either fails we still let the user proceed — the form
  // just opens with a thinner picker, and handleAccept enforces a non-
  // empty account before submitting.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [accs, cats] = await Promise.all([
          listAccounts(),
          listCategories(),
        ]);
        if (cancelled) return;
        setAccounts(accs);
        setCategories(cats);
        // Default account = first available. OCR success may override
        // via suggestAccountIdForSource later.
        if (accs.length > 0 && !accountId) {
          setAccountId(accs[0].id);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("[receipt] load_data_failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Mount-only load. Subsequent OCR runs don't need a refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // OCR pipeline: ticks the 3-phase animation (cosmetic, ~2.4s) in
  // parallel with the real /api/ocr/extract call. We resolve either when
  // the API answers AND a 1.5s minimum has elapsed (so a cache-warm 600ms
  // response doesn't feel rushed), or after a 35s ceiling (covers mini +
  // optional 4o escalation with margin). On unmount/cancel we abort the
  // fetch and clear all timers so a stale response doesn't transition a
  // remounted component.
  React.useEffect(() => {
    if (status !== "loading") return;
    if (!imageFile) {
      // Loading was triggered without a file — bail to failed.
      setStatus("failed");
      return;
    }

    setLoadingPhase(0);
    const t1 = window.setTimeout(() => setLoadingPhase(1), 800);
    const t2 = window.setTimeout(() => setLoadingPhase(2), 1600);

    const minDelay = new Promise<void>((res) => window.setTimeout(res, 1500));
    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        const dataUrl = await compressImageToDataUrl(imageFile);

        const res = await fetch("/api/ocr/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: dataUrl }),
          signal: controller.signal,
        });

        // Wait for the minimum animation time before flipping state.
        await minDelay;
        if (cancelled) return;

        if (!res.ok && res.status !== 200) {
          let message = "No pude procesar la imagen.";
          try {
            const j = (await res.json()) as { error?: string };
            if (j.error) message = j.error;
          } catch {
            // body wasn't json — keep default message
          }
          toast.error(message);
          setStatus("failed");
          return;
        }

        const json = (await res.json()) as OcrApiResponse;

        if (json.ok) {
          const d = json.data;
          setReceiptId(d.receiptId);
          setMerchant(d.counterparty?.name ?? prettySourceName(d.source));
          setAmount((d.amount.minor / 100).toFixed(2));
          setCurrency(d.amount.currency);
          setOccurredAt(d.occurredAt.slice(0, 10));
          setTransactionKind(d.kind);
          // Suggest the account whose `kind` matches the classified
          // source. Yape/BBVA/BCP map directly; Plin and unknown keep
          // the user's default first account.
          const suggestion = suggestAccountIdForSource(d.source, accounts);
          if (suggestion) setAccountId(suggestion);
          // We don't infer category from OCR — keep current default but
          // signal low confidence so the user sees the "review this" cue.
          // Kind confidence is intentionally a notch lower than the
          // global score because the OCR can't tell whose phone the
          // screenshot came from (sent vs shared-by-someone-else).
          setConfidences({
            merchant: d.confidence,
            amount: d.confidence,
            occurred_at: d.confidence,
            suggested_category: 0.3,
            kind: Math.min(d.confidence, 0.75),
          });
          setDirty(false);
          setStatus("review");
          return;
        }

        // Error branches
        if (json.error.kind === "LOW_CONFIDENCE") {
          const p = json.error.partial;
          setReceiptId(p.receiptId);
          if (p.counterparty?.name) setMerchant(p.counterparty.name);
          else if (p.source) setMerchant(prettySourceName(p.source));
          if (p.amount) {
            setAmount((p.amount.minor / 100).toFixed(2));
            setCurrency(p.amount.currency);
          }
          if (p.occurredAt) setOccurredAt(p.occurredAt.slice(0, 10));
          if (p.kind) setTransactionKind(p.kind);
          if (p.source) {
            const suggestion = suggestAccountIdForSource(p.source, accounts);
            if (suggestion) setAccountId(suggestion);
          }
          const c = p.confidence ?? 0.4;
          setConfidences({
            merchant: c,
            amount: c,
            occurred_at: c,
            suggested_category: 0.2,
            kind: Math.min(c, 0.5),
          });
          setDirty(false);
          toast.warning("Revisa los datos. No estoy del todo seguro.");
          setStatus("review");
          return;
        }

        if (json.error.kind === "INVALID_IMAGE") {
          toast.error("La imagen no se pudo leer. Intenta con otra foto.");
          setStatus("failed");
          return;
        }

        // MODEL_FAILURE
        toast.error(
          json.error.retryable
            ? "El servicio no respondió. Reintenta en unos segundos."
            : "No pudimos procesar el ticket. Intenta otra imagen.",
        );
        setStatus("failed");
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.name === "AbortError") return;
        console.error("[receipt] ocr_call_failed", err);
        toast.error("No pude conectarme con el servicio. Intenta de nuevo.");
        setStatus("failed");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
    // imageFile is captured at loading start; we don't want to retrigger
    // when it changes mid-flight (e.g. user re-picks during the call).
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setImageFile(file);
      setReceiptId(null);
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

  const handleAccept = React.useCallback(async () => {
    if (isSaving) return;
    if (!accountId) {
      toast.error("Elige una cuenta antes de guardar.");
      setIsAccountOpen(true);
      return;
    }
    const numericAmount = Number(amount.replace(",", ".")) || 0;
    if (numericAmount <= 0) {
      toast.error("El monto debe ser mayor a cero.");
      return;
    }

    setIsSaving(true);
    try {
      const trimmedMerchant = merchant.trim();
      const categoryId = mapIconToCategoryId(
        categoryIcon,
        categories,
        transactionKind,
      );

      // Compose a stable noon-Lima `occurred_at` ISO so the dashboard's
      // by-day grouping doesn't oscillate on UTC/Lima crossings. The
      // form holds a YYYY-MM-DD; we anchor it at 12:00 Lima (= 17:00
      // UTC) to land in the same day everywhere.
      const occurredIso = `${occurredAt}T12:00:00-05:00`;

      await createTransaction({
        amount: numericAmount,
        currency,
        kind: transactionKind,
        accountId,
        categoryId,
        merchantId: null,
        note: trimmedMerchant.length > 0 ? trimmedMerchant : null,
        occurredAt: occurredIso,
        receiptId: receiptId ?? null,
      });

      // Show the inline "Guardado" banner, then navigate. 900ms is just
      // enough for the user to register the confirmation without
      // feeling stuck on the page.
      setSaved(true);
      window.setTimeout(() => {
        router.push("/dashboard");
      }, 900);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "No pudimos guardar el movimiento.";
      toast.error(message);
      setIsSaving(false);
    }
  }, [
    accountId,
    amount,
    categories,
    categoryIcon,
    currency,
    isSaving,
    merchant,
    occurredAt,
    receiptId,
    router,
    transactionKind,
  ]);

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
  // `account` may be null while `listAccounts` is still loading on a slow
  // network — the picker label below renders "Cargando..." in that case.
  const account = accounts.find((a) => a.id === accountId) ?? accounts[0] ?? null;
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
              score={confidences.merchant}
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
              score={confidences.amount}
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

            {/* Tipo (gasto/ingreso) — editable. The OCR pre-selects based
                on the receipt phrasing ("Yapeaste" → gasto, "Yape recibido"
                → ingreso) but the score is capped because it can't tell
                whose phone the screenshot came from (e.g. someone might
                share a "Yapeaste" by WhatsApp as proof they paid you,
                which is income from the recipient's perspective). */}
            <FieldRow label="Tipo" score={confidences.kind}>
              <RadioGroup
                value={transactionKind}
                onValueChange={(v) => {
                  setTransactionKind(v as TransactionKind);
                  markDirty();
                }}
                className="flex gap-2"
              >
                {(
                  [
                    { value: "expense", label: "Gasto", Icon: ArrowDownLeft },
                    { value: "income", label: "Ingreso", Icon: ArrowUpRight },
                  ] as const
                ).map(({ value, label, Icon }) => (
                  <label
                    key={value}
                    className={cn(
                      "flex h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border text-[13px] font-semibold transition-colors",
                      "has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring",
                      transactionKind === value
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card text-muted-foreground hover:bg-muted",
                    )}
                  >
                    <RadioGroupItem
                      value={value}
                      className="sr-only"
                      aria-label={label}
                    />
                    <Icon size={14} aria-hidden />
                    {label}
                  </label>
                ))}
              </RadioGroup>
            </FieldRow>

            {/* Fecha */}
            <FieldRow
              label="Fecha"
              htmlFor="receipt-date"
              score={confidences.occurred_at}
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
              score={confidences.suggested_category}
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
                <span className="flex-1 text-base font-semibold">
                  {account ? accountDisplayLabel(account) : "Cargando..."}
                </span>
                {account && (
                  <Badge variant="outline" className="h-7 rounded-full px-2 text-[11px] font-semibold">
                    {account.currency}
                  </Badge>
                )}
                <ChevronRight size={16} aria-hidden="true" className="text-muted-foreground" />
              </button>
            </div>
          </div>
        </Card>

        {/* Saved banner — same pattern as /capture: visually-hidden
            announcement + a calm inline card. Replaces the previous
            toast.success("Movimiento guardado.") which read jarringly
            against the rest of the app's quieter confirmations. */}
        <output
          role="status"
          aria-live="polite"
          className={cn(
            "mt-4 block transition-opacity duration-300",
            saved ? "opacity-100" : "pointer-events-none h-0 opacity-0",
          )}
        >
          {saved ? (
            <div className="flex items-center gap-3 rounded-2xl bg-foreground px-4 py-3 text-background shadow-[var(--shadow-float)]">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
              >
                <Check size={18} />
              </span>
              <span className="flex-1 text-[13px] font-semibold">Guardado</span>
            </div>
          ) : null}
        </output>
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
                disabled={isSaving || !accountId}
                className="h-12 rounded-full text-base font-bold md:flex-[2]"
                style={{ boxShadow: "var(--shadow-fab)" }}
              >
                {isSaving ? (
                  <Loader2 size={18} aria-hidden="true" className="animate-spin" />
                ) : (
                  <Check size={18} aria-hidden="true" />
                )}
                {isSaving ? "Guardando..." : "Aceptar y guardar"}
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
              Elige la que mejor describe el gasto.
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
            {accounts.length === 0 && (
              <li className="px-3 py-4 text-center text-[13px] text-muted-foreground">
                Aún no tienes cuentas. Crea una desde Cuentas.
              </li>
            )}
            {accounts.map((a) => {
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
                      <span className="block text-[13px] font-semibold">
                        {accountDisplayLabel(a)}
                      </span>
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

export default function ReceiptPage() {
  return (
    <Suspense fallback={null}>
      <ReceiptPageInner />
    </Suspense>
  );
}

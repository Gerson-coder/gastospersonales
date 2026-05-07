/**
 * Receipt OCR review route — Kane (Phase B: design-only, no backend)
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
  Banknote,
  Camera,
  Check,
  ChevronRight,
  CreditCard,
  Heart,
  Image as ImageIcon,
  Landmark,
  Loader2,
  Maximize2,
  PenLine,
  RotateCcw,
  Sparkles,
  Trash2,
  Wallet,
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
import { getCategoryIcon } from "@/lib/category-icons";
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
import { isOfflineError } from "@/lib/offline/cache";
import {
  enqueuePendingReceipt,
  listReadyReceipts,
  removePendingReceipt,
  type PendingReceiptRow,
} from "@/lib/offline/receipts";
import {
  checkExpenseBalance,
  BALANCE_GUARD_TITLE,
} from "@/lib/data/balances";
import { useAccountBalances } from "@/hooks/use-account-balances";
import { useActiveAccountId } from "@/hooks/use-active-account-id";
import { useActiveCurrency } from "@/hooks/use-active-currency";
import { ActionResultDrawer } from "@/components/kane/ActionResultDrawer";
import { AccountBrandIcon } from "@/components/kane/AccountBrandIcon";
import { MerchantPicker } from "@/components/kane/MerchantPicker";
import { accountChipBgClass } from "@/lib/account-brand-slug";
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
  category_id: string | null;
} = {
  merchant: "",
  amount: "0.00",
  currency: "PEN",
  occurred_at: () => new Date().toISOString().slice(0, 10),
  // null = no category selected. El picker muestra la lista REAL del user
  // (mismas categorías que ve en /capture); el OCR sólo pre-selecciona si
  // el `categoryHint` resuelve a una categoría que el user ya tiene.
  category_id: null,
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
 * Result of resolving an OCR-classified source to a user account.
 *
 * `matched`     — A real account corresponding to the detected source was
 *                 found. The caller auto-assigns it AND locks the picker
 *                 (the photo says "this is Yape" → no reason to let the
 *                 user pick something else).
 * `unsupported` — The OCR identified a known source (yape / plin / bbva /
 *                 bcp) but the user has no account for it. The caller
 *                 surfaces a fallback CTA "create a {source} account".
 * `unknown`     — The OCR could not classify the source (or returned
 *                 something we don't auto-route, e.g. "unknown"). The
 *                 caller leaves the picker open for the user to pick.
 */
type AccountMatchResult =
  | { kind: "matched"; accountId: string; sourceLabel: string }
  | { kind: "unsupported"; sourceLabel: string }
  | { kind: "unknown" };

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
 *
 * No fallback to the first account: if the OCR says "this is a Yape" but
 * the user has no Yape, we surface a CTA so they can create one — silently
 * routing the txn to a Soles checking account would mis-categorise the
 * movement and erode trust in the OCR flow.
 */
function suggestAccountIdForSource(
  source: string,
  accounts: Account[],
): AccountMatchResult {
  const matchByLabel = (...needles: string[]) =>
    accounts.find((a) =>
      needles.some((n) => a.label.toLowerCase().includes(n.toLowerCase())),
    );

  let match: Account | undefined;
  let sourceLabel: string | null = null;
  switch (source) {
    case "yape":
      match = accounts.find((a) => a.kind === "yape") ?? matchByLabel("yape");
      sourceLabel = "Yape";
      break;
    case "plin":
      match = accounts.find((a) => a.kind === "plin") ?? matchByLabel("plin");
      sourceLabel = "Plin";
      break;
    case "bbva":
      match = matchByLabel("bbva", "continental");
      sourceLabel = "BBVA";
      break;
    case "bcp":
      match = matchByLabel("bcp", "crédito", "credito");
      sourceLabel = "BCP";
      break;
    default:
      return { kind: "unknown" };
  }
  if (match) {
    return { kind: "matched", accountId: match.id, sourceLabel };
  }
  return { kind: "unsupported", sourceLabel };
}

/**
 * Mapea el `categoryHint` del OCR (slug conceptual) al nombre del icono
 * Lucide que las categorías del usuario usan en la DB. El downstream
 * `resolveCategoryIdFromHint` toma este icono y lo matchea contra las
 * categorías reales (incluyendo customs); si no encuentra una, devuelve
 * null y el user elige manualmente.
 *
 * Sin este mapper, el OCR pre-llenaba todo menos la categoría → el
 * user reportaba todos los gastos saliendo como "Sin categoría".
 */
function categoryHintToIconName(hint: string | undefined): string {
  switch (hint) {
    case "food":
      return "utensils-crossed";
    case "transport":
      return "car";
    case "groceries":
      return "shopping-cart";
    case "health":
      return "heart-pulse";
    case "fun":
      return "film";
    case "utilities":
      return "zap";
    case "education":
      return "graduation-cap";
    case "work":
      return "briefcase";
    default:
      return "";
  }
}

/**
 * Resuelve el `categoryHint` del OCR a un id de categoría real del user.
 * Estrategia: traducimos el hint a un nombre de icono Lucide y buscamos
 * la primera categoría (system o user-owned) cuyo `icon` matchee y cuyo
 * `kind` sea expense. Si no hay match, devolvemos null para que el user
 * elija manualmente — así el picker NUNCA pre-selecciona una categoría
 * "inventada" que no esté en su lista real.
 */
function resolveCategoryIdFromHint(
  hint: string | undefined,
  categories: Category[],
  kind: TransactionKind,
): string | null {
  const iconName = categoryHintToIconName(hint);
  if (!iconName) return null;
  const match = categories.find(
    (c) => c.icon === iconName && c.kind === kind && !c.archived_at,
  );
  return match?.id ?? null;
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
            className="absolute inset-x-0 h-12 animate-kane-scan"
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
  // score === 0 means "OCR did not analyze this field" (e.g. category,
  // which is always manual). Hide the ring + dot in that case so the
  // row reads as a plain editable field, not as "OCR is unsure".
  const hasScore = score > 0;
  const tone = toneFromScore(score);
  const ringClass = hasScore ? CONFIDENCE_COLORS[tone].ring : "";
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
        {hasScore ? <ConfidenceDot score={score} /> : null}
      </div>
      {children}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────
// sessionStorage keys used by /share-target route handler when the OS
// share sheet hands us an image. Kept in sync with that route.
const SHARE_KEYS = {
  image: "kane:share-target:image",
  mime: "kane:share-target:mime",
  name: "kane:share-target:name",
  ts: "kane:share-target:ts",
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
type OcrSuccessData = {
  receiptId: string;
  source: string;
  confidence: number;
  kind: "expense" | "income";
  amount: { minor: number; currency: Currency };
  occurredAt: string;
  counterparty?: { name: string; document?: string };
  reference?: string;
  memo?: string;
  destinationApp?: "yape" | "plin";
  categoryHint?: string;
  rawText: string;
  modelUsed: string;
};

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
        // The "Destino" row on Yape/Plin receipts. When present, this
        // wins over `source` for account suggestion (e.g. a Yape with
        // "Destino: Plin" should pre-select the user's Plin account).
        destinationApp?: "yape" | "plin";
        // Sugerencia de categoría conceptual del OCR (food/transport/
        // groceries/health/fun/utilities/education/work/other). El
        // frontend la mapea a un icono Lucide y luego a una categoría
        // real del user via mapIconToCategoryId.
        categoryHint?: string;
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
              destinationApp?: "yape" | "plin";
              categoryHint?: string;
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
  // Currency unificada con kane-prefs (mismo store que /capture y el
  // dashboard). Antes era useState local — si el OCR detectaba una
  // moneda distinta a la activa, la tx se insertaba en esa moneda pero
  // el dashboard la filtraba server-side por su `currency` activo, así
  // que quedaba invisible. Compartir el store evita el desfase y
  // garantiza que /dashboard muestre la moneda usada en el OCR.
  const { currency, setCurrency } = useActiveCurrency();
  const [occurredAt, setOccurredAt] = React.useState(INITIAL_FORM.occurred_at);
  // Setter del activeAccountId para sincronizar con el dashboard al
  // navegar — el carousel arranca en esta cuenta y `selectedAccountId`
  // queda alineado, lo que permite que la nueva tx OCR pase el filtro
  // de `recentTransactions` en useTransactionsWindow.
  const { setActiveAccountId } = useActiveAccountId();
  // NOTA: anteriormente guardabamos occurredAtIso (la HORA exacta del
  // receipt segun el OCR) para preservar la hora real del ticket. El
  // user pidio eliminarlo: la hora real del receipt es engañosa cuando
  // subis fotos varios dias despues, y pierde el orden cronologico
  // contra movimientos manuales. Ahora SIEMPRE usamos la fecha del
  // form (YYYY-MM-DD) + la hora ACTUAL del sistema al guardar. Ver
  // handleAccept.
  const [categoryId, setCategoryId] = React.useState<string | null>(
    INITIAL_FORM.category_id,
  );
  // Comercio seleccionado dentro de la categoría — opcional. Mismo
  // contrato que /capture: cuando cambia la categoría, reset a null
  // (los merchants están scoped por categoría).
  const [merchantId, setMerchantId] = React.useState<string | null>(null);
  // Real account id (uuid). Populated from listAccounts() on mount; the
  // first account is the default until OCR routes to a source-matching
  // account via suggestAccountIdForSource.
  const [accountId, setAccountId] = React.useState<string | null>(null);
  // Per-account balances for the active currency. Same shared hook as
  // /capture: refetches on currency switch so the OCR flow's saldo
  // guard always sees the right pool. A Yape (or any) account can't go
  // negative through this entry point either.
  const { balances, balancesLoaded } = useAccountBalances(currency);
  // Modal triggered when an OCR-captured amount would overdraft the
  // picked account. Same two-state contract as /capture: "empty"
  // (saldo <= 0) vs "insufficient" (saldo < amount).
  const [noBalanceOpen, setNoBalanceOpen] = React.useState(false);
  const [noBalanceReason, setNoBalanceReason] = React.useState<
    "empty" | "insufficient"
  >("empty");
  // Modal "no pudimos procesar la foto" — se abre cuando el OCR
  // devuelve INVALID_IMAGE o MODEL_FAILURE no-retryable (es decir,
  // cuando el modelo definitivamente no pudo leer la foto). El user
  // antes recibía solo un toast efímero y el flujo se quedaba en
  // status "failed" sin mas indicación de qué hacer. Ahora un modal
  // claro explica el problema y ofrece "Ingresar manualmente" → push
  // a /capture donde llena los datos a mano. MODEL_FAILURE retryable
  // (5xx, timeout) se sigue surfacing como toast — son transitorios y
  // un modal seria fricción innecesaria.
  const [unprocessableOpen, setUnprocessableOpen] = React.useState(false);
  const [unprocessableReason, setUnprocessableReason] = React.useState<
    "invalid_image" | "model_failure"
  >("model_failure");
  // Transaction kind: default "expense" (defensive — la mayoria de
  // tickets son gastos y NO queremos auto-clasificar un "Yape recibido"
  // como ingreso e inflar el saldo silenciosamente). El OCR result.kind
  // sigue ignorado por la misma razon — los extractores no son lo
  // suficientemente confiables para separar "te enviaron" de "enviaste".
  //
  // Pero el user PUEDE flipear el toggle a "income" cuando le yapearon
  // algo (ej: hermano me devolvio 50 soles). Caso real reportado.
  const [transactionKind, setTransactionKind] =
    React.useState<TransactionKind>("expense");

  // When the OCR firmly classifies the receipt source (yape / plin / bbva
  // / bcp) AND the user has a matching account, we pre-select it as a
  // SUGGESTION (no lock) — the user can still pick any other account,
  // including a shared one. Caso real PE: yo pago con Yape pero quiero
  // cargar el gasto a la cuenta compartida "Hogar" con mi pareja.
  // Mantenemos label + accountId para poder destacar la fila sugerida en
  // el drawer del picker. null = sin sugerencia.
  const [suggestedSource, setSuggestedSource] = React.useState<{
    label: string;
    accountId: string;
  } | null>(null);
  // Set when the OCR detected a known source but the user has no
  // matching account. The form blocks save and surfaces a CTA to create
  // the missing account. null = no missing-account warning.
  const [missingAccountSourceLabel, setMissingAccountSourceLabel] =
    React.useState<string | null>(null);

  // Real data loaded from Supabase on mount. Both list calls are gated by
  // SUPABASE_ENABLED inside their respective modules; if env is missing,
  // they return [] and the UI shows a helpful empty state.
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);

  // Lista de cuentas reordenada para el drawer del picker: la sugerida
  // por el OCR queda PRIMERA. Mantiene el orden original del resto para
  // no descolocar al user. El badge "Sugerida" en la fila aclara por
  // que esa cuenta esta arriba — y el drawer sigue mostrando todas las
  // demas para que pueda elegir cualquier cuenta (ej cuenta compartida).
  const orderedAccounts = React.useMemo(() => {
    if (!suggestedSource) return accounts;
    const idx = accounts.findIndex(
      (a) => a.id === suggestedSource.accountId,
    );
    if (idx <= 0) return accounts;
    const out = accounts.slice();
    const [picked] = out.splice(idx, 1);
    out.unshift(picked);
    return out;
  }, [accounts, suggestedSource]);
  // Fase 3: when the user enters /receipt and there's a queued receipt
  // already processed offline (status=ready), we load its image + OCR
  // result here. `pendingReceiptLocalId` is the queue row id we need
  // to remove on save; `pendingReceiptResult` is the cached OCR data
  // we'll apply to the form once accounts/categories are loaded.
  const [pendingReceiptLocalId, setPendingReceiptLocalId] = React.useState<
    string | null
  >(null);
  const [pendingReceiptResult, setPendingReceiptResult] =
    React.useState<OcrSuccessData | null>(null);
  // Save submission state: prevents double-tap on the green "Aceptar y
  // guardar" button while the network request is in flight.
  const [isSaving, setIsSaving] = React.useState(false);

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

  /**
   * Apply a successful OCR result to the form state. Extracted from the
   * OCR effect so the queued-receipt loader (Fase 3) can reuse it
   * without duplicating the auto-assign / category-hint logic.
   *
   * `transactionKind` is hardcoded to `"expense"` for the receipt
   * flow — see the state declaration. Account auto-assign uses
   * `destinationApp` (Yape with "Destino: Plin" pre-selects Plin)
   * with a 0.6 confidence floor.
   */
  const applyOcrSuccessData = React.useCallback(
    (d: OcrSuccessData, accs: Account[], cats: Category[]): void => {
      setReceiptId(d.receiptId);
      setMerchant(d.counterparty?.name ?? prettySourceName(d.source));
      setAmount((d.amount.minor / 100).toFixed(2));
      setCurrency(d.amount.currency);
      // Solo la FECHA (YYYY-MM-DD) del OCR — la hora la inyectamos
      // al guardar con la del sistema (ver handleAccept). Mantenemos
      // la fecha porque es relevante para ordenar y para que el user
      // vea "es el ticket de ayer/hoy".
      setOccurredAt(d.occurredAt.slice(0, 10));
      // Reset kind a "expense" en cada foto nueva — default conservador.
      // El user puede flipear a "income" con el toggle si la foto es de
      // un Yape recibido. No leemos d.kind del OCR (no confiable para
      // separar enviado vs recibido en P2P transfers).
      setTransactionKind("expense");

      const matchKey = d.destinationApp ?? d.source;
      if (d.confidence >= 0.6 && matchKey !== "unknown") {
        const result = suggestAccountIdForSource(matchKey, accs);
        if (result.kind === "matched") {
          // Pre-seleccionamos como sugerencia, NO como obligatorio. El
          // user puede cambiar a cualquier cuenta — incluso una cuenta
          // compartida. La sugerencia se destaca en el drawer (primera
          // posicion + badge) y como sub-line del picker.
          setAccountId(result.accountId);
          setSuggestedSource({
            label: result.sourceLabel,
            accountId: result.accountId,
          });
          setMissingAccountSourceLabel(null);
        } else if (result.kind === "unsupported") {
          setAccountId(null);
          setSuggestedSource(null);
          setMissingAccountSourceLabel(result.sourceLabel);
        } else {
          setSuggestedSource(null);
          setMissingAccountSourceLabel(null);
        }
      } else {
        setSuggestedSource(null);
        setMissingAccountSourceLabel(null);
      }

      // Hardcoded "expense" porque acabamos de resetear el kind arriba
      // — el state todavia no refleja el cambio en este mismo tick.
      // Las categorias de income son distintas; si el user flipea el
      // toggle despues, limpiamos categoryId en el handler.
      const hintCategoryId = resolveCategoryIdFromHint(
        d.categoryHint,
        cats,
        "expense",
      );
      if (hintCategoryId) {
        setCategoryId(hintCategoryId);
      }

      setConfidences({
        merchant: d.confidence,
        amount: d.confidence,
        occurred_at: d.confidence,
        suggested_category: hintCategoryId ? d.confidence : 0,
        kind: 0,
      });
      setDirty(false);
      setStatus("review");
    },
    [setCurrency],
  );

  /**
   * Fase 3 — load a queued receipt that was OCR-processed offline.
   * Runs once after accounts + categories arrive (so auto-assign has
   * the data it needs). We pick the OLDEST `ready` row; subsequent
   * ones surface again after the user reviews and saves this one.
   *
   * Skipped when the user is already in flight on something else
   * (share-target image, manual pick, in-progress review).
   */
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (accounts.length === 0 && categories.length === 0) return;
    if (imageFile || pendingReceiptLocalId) return;
    if (searchParams.get("fromShare") === "1") return;

    let cancelled = false;
    (async () => {
      try {
        const ready = await listReadyReceipts();
        if (cancelled || ready.length === 0) return;
        const next: PendingReceiptRow = ready[0];
        // Reconstitute the File from the stored data URL so the
        // existing image-preview + zoom UX works unchanged.
        const file = dataUrlToFile(next.imageDataUrl, next.mime, next.fileName);
        if (!file) {
          // Bad data — drop it so we don't spin on a corrupt row.
          await removePendingReceipt(next.localId);
          return;
        }
        const url = URL.createObjectURL(file);
        setImageUrl(url);
        setImageFile(file);
        setPendingReceiptLocalId(next.localId);
        setPendingReceiptResult(next.result as OcrSuccessData);
      } catch (err) {
        console.warn("[receipt] queue_loader_failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // accounts/categories drive the gating; once loaded, we only ever
    // run this branch when `imageFile` is empty so no infinite loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts.length, categories.length]);

  // Apply a queued OCR result when both the result AND the form
  // dependencies (accounts/categories) are ready. Two-stage to avoid
  // racing against the data load.
  React.useEffect(() => {
    if (!pendingReceiptResult) return;
    if (accounts.length === 0) return;
    applyOcrSuccessData(pendingReceiptResult, accounts, categories);
    // After applying we clear the staged result so editing the form
    // doesn't trigger reapplication on every dependency change.
    setPendingReceiptResult(null);
  }, [pendingReceiptResult, accounts, categories, applyOcrSuccessData]);

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
          // All the auto-assign / category-hint logic moved into
          // `applyOcrSuccessData` so the queued-receipt loader
          // (Fase 3) can reuse it.
          applyOcrSuccessData(json.data, accounts, categories);
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
          if (p.occurredAt) {
            setOccurredAt(p.occurredAt.slice(0, 10));
          }
          if (p.categoryHint) {
            const hintCategoryId = resolveCategoryIdFromHint(
              p.categoryHint,
              categories,
              transactionKind,
            );
            if (hintCategoryId) setCategoryId(hintCategoryId);
          }
          // transactionKind stays hardcoded to "expense" — we ignore
          // p.kind even on partials (see state declaration above).
          //
          // Auto-assign account only when the partial confidence is
          // ≥ 0.6 AND the source is firmly classified. The 0.4 default
          // for partials would have us routing on noise — better to let
          // the user pick.
          const c = p.confidence ?? 0.4;
          const matchKey = p.destinationApp ?? p.source;
          if (matchKey && matchKey !== "unknown" && c >= 0.6) {
            const result = suggestAccountIdForSource(matchKey, accounts);
            if (result.kind === "matched") {
              setAccountId(result.accountId);
              setSuggestedSource({
                label: result.sourceLabel,
                accountId: result.accountId,
              });
              setMissingAccountSourceLabel(null);
            } else if (result.kind === "unsupported") {
              setAccountId(null);
              setSuggestedSource(null);
              setMissingAccountSourceLabel(result.sourceLabel);
            } else {
              setSuggestedSource(null);
              setMissingAccountSourceLabel(null);
            }
          } else {
            setSuggestedSource(null);
            setMissingAccountSourceLabel(null);
          }
          setConfidences({
            merchant: c,
            amount: c,
            occurred_at: c,
            suggested_category: 0,
            kind: 0,
          });
          setDirty(false);
          toast.warning("Revisa los datos. No estoy del todo seguro.");
          setStatus("review");
          return;
        }

        if (json.error.kind === "INVALID_IMAGE") {
          setUnprocessableReason("invalid_image");
          setUnprocessableOpen(true);
          setStatus("failed");
          return;
        }

        // MODEL_FAILURE — los retryable (5xx, timeout) van por toast
        // porque son transitorios; el user reintenta y suele andar.
        // Los no-retryable (parse imposible, schema reject) abren el
        // modal "no pudimos procesar" con CTA a ingresar manualmente.
        if (json.error.retryable) {
          toast.error("El servicio no respondió. Reintenta en unos segundos.");
        } else {
          setUnprocessableReason("model_failure");
          setUnprocessableOpen(true);
        }
        setStatus("failed");
      } catch (err) {
        if (cancelled) return;
        if (err instanceof Error && err.name === "AbortError") return;
        // Offline path (Fase 3): the OCR call failed because of a
        // network error. Stash the (already-compressed) image in the
        // pending receipts queue so the sync engine can run OCR when
        // we're back online. The user gets a clear toast and lands
        // back at idle — capture flow stays interruption-free.
        if (isOfflineError(err) && imageFile) {
          try {
            const dataUrl = await compressImageToDataUrl(imageFile);
            await enqueuePendingReceipt({
              imageDataUrl: dataUrl,
              mime: imageFile.type || "image/jpeg",
              fileName: imageFile.name || "shared-image",
            });
            toast.success(
              "Boleta guardada. La procesaremos cuando vuelva la conexión.",
            );
            setStatus("idle");
            // Clear the image preview so the user lands on a clean
            // idle state ready for the next capture.
            if (imageUrl) URL.revokeObjectURL(imageUrl);
            setImageUrl(null);
            setImageFile(null);
            return;
          } catch (queueErr) {
            console.error("[receipt] offline_enqueue_failed", queueErr);
            // Fall through to the generic failure toast.
          }
        }
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
  }, [merchant, amount, currency, occurredAt, categoryId, accountId]);

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

    // Saldo guard — compartido con /capture via `checkExpenseBalance`.
    // El bug que motivo esto: el OCR de Yape llegaba con un monto, el
    // usuario tocaba "Aceptar y guardar" y el gasto se persistia aunque
    // dejara la cuenta sobregirada.
    const balanceCheck = checkExpenseBalance({
      kind: transactionKind,
      amount: numericAmount,
      accountId,
      balances,
      balancesLoaded,
    });
    if (!balanceCheck.ok) {
      setNoBalanceReason(balanceCheck.reason);
      setNoBalanceOpen(true);
      return;
    }

    setIsSaving(true);
    try {
      const trimmedMerchant = merchant.trim();
      // categoryId puede ser null = user no eligió + el hint del OCR no
      // matcheó ninguna categoría real. La tx queda uncategorized; el
      // dashboard la mete en el bucket "Otros".

      // FECHA del form (puede ser del OCR o editada por el user) +
      // HORA ACTUAL del sistema. Construimos un Date local con
      // year/month/day del input + horas/min/segs de ahora. toISOString
      // serializa a UTC manteniendo el instante. Asi:
      //   - Si subis un ticket de ayer ahora, queda "ayer a la hora
      //     actual" → ordena justo arriba de tus movimientos manuales
      //     de ayer si los registraste mas temprano.
      //   - Si subis un ticket de hoy, queda en el orden cronologico
      //     real con tus otros movimientos del dia.
      // El user explicitamente NO quiere la hora del OCR — fue fuente
      // de confusion (subis fotos dias despues y quedaba con la hora
      // de la compra original, no del momento de registro).
      const now = new Date();
      const [yearStr, monthStr, dayStr] = occurredAt.split("-");
      const localOccurred = new Date(
        Number(yearStr),
        Number(monthStr) - 1,
        Number(dayStr),
        now.getHours(),
        now.getMinutes(),
        now.getSeconds(),
        now.getMilliseconds(),
      );
      const occurredIso = localOccurred.toISOString();

      await createTransaction({
        amount: numericAmount,
        currency,
        kind: transactionKind,
        accountId,
        categoryId,
        merchantId,
        note: trimmedMerchant.length > 0 ? trimmedMerchant : null,
        occurredAt: occurredIso,
        receiptId: receiptId ?? null,
      });

      // ── Bug #recents-not-updating-after-OCR ────────────────────────
      // El flujo previo introducía un `setTimeout(900ms)` para mostrar
      // un banner "Guardado" antes de navegar. En PWA mobile standalone
      // ese timer caía en una ventana donde el SW podía pausar el JS
      // (background tab heuristics + page-transition throttling),
      // resultando en un push retrasado en el que el dashboard montaba
      // CON el realtime websocket dormido y el segment cache de Next 16
      // sirviendo el snapshot anterior. La transacción quedaba en la
      // DB pero el dashboard no refetcheaba hasta el próximo evento.
      //
      // /capture no tenía el problema porque su `router.push` corre
      // inmediatamente después del await — el dashboard remonta antes
      // de que el browser tenga oportunidad de cachear estado stale.
      //
      // Solución: alinear /receipt con /capture exactamente —
      //   1) toast.success() para el feedback inmediato (reemplaza el
      //      banner inline; el user ve el confirm aún en /receipt antes
      //      de que el push complete).
      //   2) sessionStorage flag — red de seguridad para el caso en que
      //      el dashboard remonte fresco sin haber escuchado el evento
      //      `tx:upserted` (lo lee el `useEffect` del dashboard en mount
      //      y dispara refetch). Síncrono, sobrevive a cualquier cache.
      //   3) emitTxUpserted() — ya disparado dentro de `createTransaction`,
      //      cubre el caso donde el dashboard ya esté montado.
      //   4) router.refresh() + router.push("/dashboard") — sin demora.
      // CRÍTICO — alinear el activeAccountId con la cuenta usada en el
      // OCR. /capture lo hace siempre antes de navegar al dashboard;
      // /receipt lo omitía y por eso el carousel del dashboard
      // aterrizaba en una cuenta antigua, dejando `selectedAccountId`
      // mal alineado. Esto hacía que el filter
      // `filteredRows = rows.filter(r => r.accountId === selectedAccountId)`
      // dentro de useTransactionsWindow excluyera la nueva tx OCR de
      // `recentTransactions` — el saldo total seguía actualizándose
      // (useAccountStats consume `rows` sin filtrar) pero la fila no
      // aparecía en "Últimos movimientos". Bug confirmado por 5
      // agentes investigadores en paralelo.
      setActiveAccountId(accountId);
      // Fase 3: drop the queued receipt now that the user committed.
      // Fire-and-forget — failure here would be cosmetic (the row
      // resurfaces on next /receipt mount, harmless).
      if (pendingReceiptLocalId) {
        void removePendingReceipt(pendingReceiptLocalId);
        setPendingReceiptLocalId(null);
      }
      try {
        window.sessionStorage.setItem("kane:tx-just-created", String(Date.now()));
      } catch {
        // private mode / quota — el push + el evento siguen cubriendo la mayoría.
      }
      // HARD NAVIGATION en lugar de router.push("/dashboard").
      //
      // Tres intentos previos de "router.push + invalidate cache" no
      // alcanzaron en mobile PWA porque el segment cache de App Router
      // se restauraba antes que el client-side refetch tomara la red.
      // window.location.assign hace full page load: el árbol de React
      // se desmonta, el App Router cache se descarta, el dashboard
      // remonta desde cero, y el `useEffect` lector del flag de
      // sessionStorage corre garantizado en el primer render —
      // disparando el refetch que sí ve la nueva transacción.
      //
      // Trade-off: ~300-800ms extra de page load vs ~50ms de soft
      // navigation. Para un flujo "guardé, quiero verlo", priorizamos
      // correctness sobre velocidad. /capture sigue con router.push
      // porque NO sube imagen y la red no se satura.
      window.location.assign("/dashboard");
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
    balances,
    balancesLoaded,
    categoryId,
    currency,
    isSaving,
    merchant,
    merchantId,
    occurredAt,
    pendingReceiptLocalId,
    receiptId,
    router,
    // Critico: cuando transactionKind paso de const a state (toggle
    // Gasto/Ingreso) el callback empezo a capturar el valor inicial
    // "expense" en su closure y NUNCA se actualizaba — los ingresos
    // se persistian como gastos. Agregar a deps lo arregla.
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
    // Fase 3: discard a queued receipt → drop it from the queue too.
    // The user explicitly chose not to register this expense; resurfacing
    // it on next /receipt mount would be hostile.
    if (pendingReceiptLocalId) {
      void removePendingReceipt(pendingReceiptLocalId);
      setPendingReceiptLocalId(null);
    }
  }, [dirty, discardArmed, imageUrl, pendingReceiptLocalId]);

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
      <div className="relative min-h-dvh bg-background text-foreground md:min-h-0 md:max-w-md md:mx-auto md:my-12 md:rounded-3xl md:border md:border-border md:bg-card md:shadow-[var(--shadow-card)] md:overflow-hidden">
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
      <div className="relative min-h-dvh bg-background text-foreground md:min-h-0 md:max-w-2xl md:mx-auto md:my-12 md:rounded-3xl md:border md:border-border md:bg-card md:shadow-[var(--shadow-card)] md:overflow-hidden">
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
      <div className="relative min-h-dvh bg-background text-foreground md:min-h-0 md:max-w-2xl md:mx-auto md:my-12 md:rounded-3xl md:border md:border-border md:bg-card md:shadow-[var(--shadow-card)] md:overflow-hidden">
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
      <div className="relative min-h-dvh bg-background text-foreground md:min-h-0 md:max-w-md md:mx-auto md:my-12 md:rounded-3xl md:border md:border-border md:bg-card md:shadow-[var(--shadow-card)] md:overflow-hidden">
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
  // categoryId === null means the user hasn't picked yet (OCR may
  // pre-seleccionar via hint si matchea una categoría real del user).
  // hasCategory drives the empty-state look in the picker row below.
  const selectedCategory =
    categoryId !== null
      ? categories.find((c) => c.id === categoryId) ?? null
      : null;
  const hasCategory = selectedCategory !== null;
  const categoryLabel = hasCategory
    ? selectedCategory.name
    : "Elegir categoría";
  const CategoryIcon = hasCategory
    ? getCategoryIcon(selectedCategory.icon)
    : null;
  // Picker drawer source — same as /capture: real user + system
  // categories from Supabase, filtered to expense-kind (OCR is hardcoded
  // a expense). Antes usábamos CATEGORY_ICONS (lista hardcoded de 16
  // iconos Lucide) y eso divergía de la lista que el user veía en
  // /capture: las categorías custom no aparecían y los nombres podían
  // ser distintos. Ahora ambos flows leen exactamente lo mismo.
  const pickerCategories = categories.filter(
    (c) => c.kind === transactionKind && !c.archived_at,
  );

  return (
    <div className="relative min-h-dvh bg-background pb-36 text-foreground md:pb-0">
      {hiddenInputs}
      {/* Desktop two-column layout: image left + form right */}
      <div className="mx-auto w-full max-w-6xl px-4 md:grid md:grid-cols-[2fr_3fr] md:items-start md:gap-8 md:px-8 md:py-8">

        {/* ── Left column: image (desktop only full view) ───────────────── */}
        {imageUrl && (
          <div className="md:sticky md:top-8">
            {/* Mobile: compact banner strip */}
            <div className="relative mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] md:mt-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL, not optimisable */}
              <img
                src={imageUrl}
                alt="Foto del ticket cargado"
                className="block h-[120px] w-full object-cover bg-[oklch(0.94_0.005_95)] dark:bg-[oklch(0.22_0.005_95)] md:h-auto md:max-h-[75vh] md:object-contain"
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
          </div>
        )}

        {/* ── Right column: header + form + CTA ────────────────────────── */}
        <div className="md:min-w-0">
        {/* Header copy */}
        <div className="pt-5 md:pt-0">
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

            {/* Tipo (Gasto / Ingreso) — toggle visible. Default expense
                porque la mayoria de tickets son gastos y no queremos
                inflar saldos silenciosamente. El user flipea a Ingreso
                cuando le yapearon algo (ej: hermano me devolvio 50
                soles). Mismo lenguaje visual que /capture: pill verde
                para income, rojo para expense. */}
            <FieldRow label="Tipo" score={0}>
              <div
                role="radiogroup"
                aria-label="Tipo de movimiento"
                className="inline-flex h-10 w-full max-w-[280px] items-center gap-0.5 rounded-full bg-muted p-0.5"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={transactionKind === "expense"}
                  onClick={() => {
                    if (transactionKind === "expense") return;
                    setTransactionKind("expense");
                    // Limpiar categoria — las de income son distintas
                    // (Trabajo, etc) y no queremos arrastrar una de
                    // expense a un ingreso.
                    setCategoryId(null);
                    markDirty();
                  }}
                  className={cn(
                    "inline-flex h-9 flex-1 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    transactionKind === "expense"
                      ? "bg-red-500/15 text-red-700 shadow-[var(--shadow-xs)] dark:bg-red-500/25 dark:text-red-200"
                      : "text-muted-foreground",
                  )}
                >
                  Gasto
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={transactionKind === "income"}
                  onClick={() => {
                    if (transactionKind === "income") return;
                    setTransactionKind("income");
                    setCategoryId(null);
                    markDirty();
                  }}
                  className={cn(
                    "inline-flex h-9 flex-1 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    transactionKind === "income"
                      ? "bg-emerald-500/15 text-emerald-700 shadow-[var(--shadow-xs)] dark:bg-emerald-500/25 dark:text-emerald-200"
                      : "text-muted-foreground",
                  )}
                >
                  Ingreso
                </button>
              </div>
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
                  const next =
                    e.target.value || new Date().toISOString().slice(0, 10);
                  setOccurredAt(next);
                  markDirty();
                }}
                className="h-11 border-0 bg-transparent px-0 text-base font-semibold shadow-none focus-visible:ring-0"
              />
            </FieldRow>

            {/* Categoría — opens drawer. Always manual: the OCR does
                NOT infer category because P2P transfers are too
                ambiguous (rent? friend payback? gift?). Empty state
                shows a dashed circle + "Elegir categoría" prompt
                until the user opens the drawer and picks one. */}
            <FieldRow
              label="Categoría"
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
                  className={cn(
                    "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full",
                    hasCategory
                      ? "bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)]"
                      : "border border-dashed border-border bg-transparent text-muted-foreground",
                  )}
                >
                  {CategoryIcon ? <CategoryIcon size={16} /> : null}
                </span>
                <span
                  className={cn(
                    "flex-1 text-base",
                    hasCategory
                      ? "font-semibold text-foreground"
                      : "font-medium text-muted-foreground",
                  )}
                >
                  {categoryLabel}
                </span>
                <ChevronRight size={16} aria-hidden="true" className="text-muted-foreground" />
              </button>
            </FieldRow>

            {/* Comercio dentro de la categoría — opcional. Mismo
                componente que /capture. Devuelve null cuando no hay
                categoría elegida o la categoría no tiene comercios
                visibles, así que no afecta el flujo cuando el user
                no quiere usarlo. Cuando elige uno, se persiste como
                `merchant_id` en la transacción. */}
            <MerchantPicker
              categoryId={categoryId}
              categoryName={selectedCategory?.name ?? null}
              value={merchantId}
              onChange={(id) => {
                setMerchantId(id);
                markDirty();
              }}
            />

            {/* Cuenta — dos hints contextuales sobre el OCR + UN picker
                clickeable siempre:
                  1. missingAccountSourceLabel: el OCR detectó la fuente
                     (Yape/Plin/BBVA/BCP) pero no hay cuenta del user que
                     matchee — hint amber para que elija manual.
                  2. suggestedSource (y selecciona la sugerida): sub-line
                     "Sugerida por la foto" con icono Sparkles. Cuando
                     el user cambia a otra cuenta, el sub-line desaparece
                     y arranca solo. Esto reemplaza el viejo lock con
                     candado — el user PUEDE elegir cualquier cuenta,
                     incluso una cuenta compartida con su pareja. */}
            {missingAccountSourceLabel && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-50/40 p-3 dark:border-amber-500/25 dark:bg-amber-500/10">
                <div className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  >
                    <AlertTriangle size={13} />
                  </span>
                  <p className="text-[12px] leading-relaxed text-foreground">
                    Detectamos <span className="font-semibold">{missingAccountSourceLabel}</span> en la foto. Elige a qué cuenta cargar este gasto.
                  </p>
                </div>
              </div>
            )}
            <div className="rounded-xl bg-card p-3.5">
              <div className="pb-1.5">
                <span className="text-[12px] font-semibold text-foreground">
                  Cuenta
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsAccountOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={isAccountOpen}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-semibold">
                    {account ? accountDisplayLabel(account) : "Cargando..."}
                  </span>
                  {suggestedSource &&
                  account &&
                  account.id === suggestedSource.accountId ? (
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                      <Sparkles
                        size={11}
                        aria-hidden="true"
                        className="text-primary"
                      />
                      Sugerida por la foto · puedes cambiarla
                    </span>
                  ) : null}
                </span>
                {account && (
                  <Badge
                    variant="outline"
                    className="h-7 rounded-full px-2 text-[11px] font-semibold"
                  >
                    {account.currency}
                  </Badge>
                )}
                <ChevronRight
                  size={16}
                  aria-hidden="true"
                  className="text-muted-foreground"
                />
              </button>
            </div>
          </div>
        </Card>

      {/* Sticky CTA bar — soft gradient backdrop so it floats above the form
          without a hard divider. On md+ it slots inline at the bottom of the
          right column. */}
      <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pt-10 pb-[calc(env(safe-area-inset-bottom)+1rem)] md:relative md:inset-auto md:bottom-auto md:z-auto md:mt-6 md:bg-none md:px-0 md:pt-0">
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
      </div>
      {/* /Right column */}
      </div>
      {/* /Outer grid */}

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

      {/* Category Drawer — fuente unificada con /capture. Renderiza las
          categorías reales del user (system + custom) cargadas desde
          Supabase, filtradas a kind=expense (el flujo OCR es siempre
          gasto). Antes mostraba CATEGORY_ICONS (lista hardcoded de
          iconos Lucide) y por eso la lista divergía entre captura
          manual y captura por foto. */}
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
          <div className="grid max-h-[65vh] grid-cols-3 gap-2 overflow-y-auto overscroll-contain px-4 pb-6">
            {pickerCategories.length === 0 ? (
              <p className="col-span-3 py-6 text-center text-[13px] text-muted-foreground">
                No tienes categorías de gasto. Crea una en Ajustes.
              </p>
            ) : (
              pickerCategories.map((c) => {
                const Icon = getCategoryIcon(c.icon);
                const selected = categoryId === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      // Cambio de categoría → reset del merchant
                      // (los comercios están scoped por categoría, un
                      // merchant de "Comida" no es válido en "Salud").
                      if (categoryId !== c.id) setMerchantId(null);
                      setCategoryId(c.id);
                      markDirty();
                      setIsCategoryOpen(false);
                    }}
                    aria-pressed={selected}
                    className={cn(
                      "flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-2xl border p-3 text-center transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "border-foreground bg-foreground text-background"
                        : "border-border bg-card text-foreground hover:bg-muted",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex h-10 w-10 items-center justify-center rounded-full",
                        selected
                          ? "bg-background/20 text-current"
                          : "bg-muted text-foreground",
                      )}
                    >
                      <Icon size={20} />
                    </span>
                    <span className="text-xs font-semibold leading-tight">
                      {c.name}
                    </span>
                  </button>
                );
              })
            )}
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

      {/* Account Drawer — list selector con icono + saldo + tipo, mismo
          patron visual que /capture para que el user reconozca la
          superficie. Cada fila muestra:
            - chip con AccountBrandIcon (logo del banco / yape / plin /
              fallback al icono del kind)
            - label + tipo (Efectivo / Tarjeta / Banco / Yape / Plin)
            - saldo formateado al lado derecho con tone segun positivo /
              cero / negativo
          Asi el user decide con la misma información que en capture. */}
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
          <ul className="flex max-h-[65vh] flex-col gap-1 overflow-y-auto overscroll-contain px-2 pb-2">
            {accounts.length === 0 && (
              <li className="px-3 py-4 text-center text-[13px] text-muted-foreground">
                Aún no tienes cuentas. Crea una desde Cuentas.
              </li>
            )}
            {orderedAccounts.map((a) => {
              const selected = accountId === a.id;
              const isSuggested =
                suggestedSource?.accountId === a.id;
              const balance = balances[a.id] ?? 0;
              const balanceTone =
                !balancesLoaded
                  ? "text-muted-foreground"
                  : balance > 0
                    ? "text-foreground"
                    : balance < 0
                      ? "text-destructive"
                      : "text-muted-foreground";
              const KindIcon =
                a.kind === "cash"
                  ? Banknote
                  : a.kind === "card"
                    ? CreditCard
                    : a.kind === "yape" || a.kind === "plin"
                      ? Wallet
                      : Landmark;
              const kindLabel =
                a.kind === "cash"
                  ? "Efectivo"
                  : a.kind === "card"
                    ? "Tarjeta"
                    : a.kind === "yape"
                      ? "Yape"
                      : a.kind === "plin"
                        ? "Plin"
                        : "Cuenta bancaria";
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
                    aria-label={`${accountDisplayLabel(a)}, ${kindLabel}, saldo ${formatMoney(balance, a.currency)}`}
                    className={cn(
                      "flex h-16 w-full items-center gap-3 rounded-2xl px-3 text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected ? "bg-muted ring-1 ring-foreground/15" : "hover:bg-muted",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-foreground",
                        accountChipBgClass(a.label),
                      )}
                    >
                      <AccountBrandIcon
                        label={a.label}
                        fallback={<KindIcon size={16} />}
                        size={20}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-semibold">
                          {accountDisplayLabel(a)}
                        </span>
                        {isSuggested ? (
                          <span
                            aria-label="Sugerida por la foto"
                            className="inline-flex h-[18px] flex-shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 text-[10px] font-bold uppercase tracking-wider text-primary"
                          >
                            <Sparkles size={9} aria-hidden="true" />
                            Sugerida
                          </span>
                        ) : null}
                        {a.sharedWithPartner ? (
                          <span
                            aria-label="Cuenta compartida"
                            className="inline-flex h-[18px] flex-shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-500/30 dark:text-emerald-400 dark:ring-emerald-500/40"
                          >
                            <Heart
                              size={10}
                              aria-hidden="true"
                              strokeWidth={2.6}
                              className="fill-emerald-600 text-emerald-600 dark:fill-emerald-400 dark:text-emerald-400"
                            />
                            Compartida
                          </span>
                        ) : null}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {kindLabel}
                      </span>
                    </span>
                    <span className="ml-2 flex flex-col items-end">
                      <span className="flex items-center gap-1">
                        {selected ? (
                          <Check
                            size={12}
                            aria-hidden="true"
                            strokeWidth={2.5}
                            className="text-foreground"
                          />
                        ) : null}
                        {balancesLoaded ? (
                          <span
                            className={cn(
                              "text-[13px] font-semibold tabular-nums whitespace-nowrap",
                              balanceTone,
                            )}
                            style={{ fontFeatureSettings: '"tnum","lnum"' }}
                          >
                            {formatMoney(balance, a.currency)}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            …
                          </span>
                        )}
                      </span>
                      <span className="mt-0.5 text-[10px] uppercase tracking-[0.05em] text-muted-foreground/80">
                        {balancesLoaded && balance <= 0 ? "sin saldo" : "saldo"}
                      </span>
                    </span>
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

      {/* Saldo guard — bloquea persistir un gasto OCR que dejaria la
          cuenta sobregirada. Misma copy que el Drawer de /capture para
          que el usuario reconozca el patron. Para abonar saldo el user
          va a /accounts manualmente; el flujo inline-abono de capture es
          mas pesado y por ahora no lo replicamos aca. */}
      <ActionResultDrawer
        open={noBalanceOpen}
        onOpenChange={setNoBalanceOpen}
        tone="warning"
        title={BALANCE_GUARD_TITLE[noBalanceReason]}
        description={
          noBalanceReason === "empty"
            ? "Esta cuenta no tiene saldo para realizar esta operación. Abona saldo desde Cuentas o elige otra cuenta."
            : "El monto del gasto supera el saldo de esta cuenta. Abona saldo desde Cuentas o elige otra cuenta."
        }
        closeLabel="Entendido"
      />

      {/* Modal "no pudimos procesar la foto" — se abre con
          INVALID_IMAGE o MODEL_FAILURE no-retryable. Da al user 2
          opciones: cerrar el modal (queda en /receipt y puede tomar
          otra foto), o "Ingresar manualmente" que navega a /capture
          para llenar los datos a mano sin OCR. El status del receipt
          queda en "failed" hasta que cierre o reintente. */}
      <Drawer open={unprocessableOpen} onOpenChange={setUnprocessableOpen}>
        <DrawerContent
          aria-describedby="receipt-unprocessable-desc"
          className="bg-background"
        >
          <DrawerHeader className="text-center">
            <div
              aria-hidden="true"
              className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[oklch(0.94_0.05_70)] text-[oklch(0.45_0.14_70)] dark:bg-[oklch(0.30_0.06_70)] dark:text-[oklch(0.85_0.14_70)]"
            >
              <AlertTriangle size={28} aria-hidden strokeWidth={2.4} />
            </div>
            <DrawerTitle className="font-sans not-italic text-lg font-semibold">
              No pudimos procesar la foto
            </DrawerTitle>
            <DrawerDescription
              id="receipt-unprocessable-desc"
              className="text-[13px] leading-relaxed"
            >
              {unprocessableReason === "invalid_image"
                ? "La imagen no se pudo leer. Verifica que esté enfocada y bien iluminada, o ingresa los datos de forma manual."
                : "No logramos extraer los datos de esta foto. Puedes reintentar con otra imagen o ingresar los datos de forma manual."}
            </DrawerDescription>
          </DrawerHeader>
          <div className="flex flex-col gap-2 px-4 pb-6">
            <Button
              type="button"
              onClick={() => {
                setUnprocessableOpen(false);
                router.push("/capture");
              }}
              className="h-11 w-full rounded-xl text-[14px] font-semibold"
            >
              Ingresar manualmente
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setUnprocessableOpen(false)}
              className="h-11 w-full rounded-xl text-[14px] font-semibold"
            >
              Reintentar con otra foto
            </Button>
          </div>
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

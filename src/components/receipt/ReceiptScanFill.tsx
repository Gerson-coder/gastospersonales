/**
 * ReceiptScanFill — review-screen skeleton that fills in progressively
 * as SSE `partial` events arrive from the OCR pipeline.
 *
 * Replaces the old "spinner + 3 cosmetic step pills" loading screen. The
 * user watches their data appear in the SAME layout they're about to
 * edit. No fake progress, no hardcoded timers — every change on screen
 * is driven by a real backend event consumed in `receipt/page.tsx`.
 *
 * UX details that matter:
 *   - Image stays visible at the top (compact, not full-screen) so the
 *     user keeps the receipt context while values fly in.
 *   - Each field has a per-row skeleton bar at the same width as the
 *     value will land at, so the layout doesn't shift.
 *   - When new partial events arrive in quick succession we stagger the
 *     reveal ~80ms apart — backend can batch, but the UI shouldn't.
 *   - Reduced-motion users (prefers-reduced-motion: reduce) get instant
 *     swaps with no fade/translate. We use `motion-safe:` Tailwind
 *     variants so the no-motion path is the default.
 *   - When `classified` lands, we badge the source (Yape / Plin / BCP /
 *     BBVA / generic) in the corner so the user knows we identified the
 *     receipt before the data arrives.
 */
"use client";

import * as React from "react";
import { Loader2, Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  OcrPartialField,
  OcrStage,
  OcrStreamSource,
} from "@/lib/ocr/stream-events";

// ─── Types ────────────────────────────────────────────────────────────────
export type ScanFillStage = "idle" | OcrStage;

export type ScanFillField = {
  value: unknown;
  confidence: number;
};

export type ScanFillFields = Partial<Record<OcrPartialField, ScanFillField>>;

export type ReceiptScanFillProps = {
  imageUrl: string;
  onCancel: () => void;
  /** Latest `stage` event from the SSE stream. `idle` while we wait for
   *  the first event so the indicator doesn't lie about progress. */
  stage: ScanFillStage;
  /** Set as soon as the classifier event lands. */
  classified?: { source: OcrStreamSource; confidence: number } | null;
  /** Sparse map: keys present once their `partial` event has arrived. */
  fields: ScanFillFields;
  /** Optional soft banner — shown when an `error` event interrupts the
   *  stream. We keep the partial fields visible so the user can edit
   *  whatever was extracted before the failure. */
  errorBanner?: string | null;
};

// Per-source label + tailwind palette for the badge in the corner. Mirrors
// `prettySourceName` in receipt/page.tsx but local so we don't pull a
// page-private helper into a component dependency.
const SOURCE_LABEL: Record<OcrStreamSource, string> = {
  yape: "Yape",
  plin: "Plin",
  bcp: "BCP",
  bbva: "BBVA",
  generic: "Comprobante",
  unknown: "Comprobante",
};

// ─── Confidence helpers (mirrored from page.tsx) ──────────────────────────
type ConfidenceTone = "high" | "medium" | "low";

function toneFromScore(score: number): ConfidenceTone {
  if (score >= 0.85) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

const CONFIDENCE_RING: Record<ConfidenceTone, string> = {
  high: "",
  medium: "ring-1 ring-inset ring-[oklch(0.65_0.16_70)]/30",
  low: "ring-1 ring-inset ring-destructive/35",
};

// ─── Stagger queue ────────────────────────────────────────────────────────
//
// When the backend emits multiple `partial` events in the same tick (e.g.
// batched after the extractor finishes), we don't want them ALL appearing
// in the same frame — that defeats the point of progressive fill. This
// hook watches the incoming `fields` prop and reveals new keys ~80ms
// apart so the user perceives a stream of arrivals.
//
// The queue is keyed by field name so re-revealing the SAME field (e.g.
// retry) doesn't double-stagger. We treat fields as monotonic: once
// revealed, they stay revealed for the lifetime of this mount.
const STAGGER_MS = 80;

function useStaggeredReveal(fields: ScanFillFields): Set<OcrPartialField> {
  const [revealed, setRevealed] = React.useState<Set<OcrPartialField>>(
    () => new Set(),
  );
  const queueRef = React.useRef<OcrPartialField[]>([]);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const incoming = (Object.keys(fields) as OcrPartialField[]).filter(
      (k) => !revealed.has(k) && !queueRef.current.includes(k),
    );
    if (incoming.length === 0) return;

    queueRef.current.push(...incoming);

    const drain = () => {
      const next = queueRef.current.shift();
      if (!next) {
        timerRef.current = null;
        return;
      }
      setRevealed((prev) => {
        if (prev.has(next)) return prev;
        const out = new Set(prev);
        out.add(next);
        return out;
      });
      if (queueRef.current.length > 0) {
        timerRef.current = setTimeout(drain, STAGGER_MS);
      } else {
        timerRef.current = null;
      }
    };

    if (timerRef.current === null) {
      // Reveal the first new field on the next paint so the user
      // actually sees the transition (synchronous setState would
      // batch with the parent and skip the fade).
      timerRef.current = setTimeout(drain, 0);
    }
    // Intentional: we want this to react ONLY to the keys present in
    // `fields`. Including `revealed` would re-loop on every reveal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields]);

  React.useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  return revealed;
}

// ─── Pieces ───────────────────────────────────────────────────────────────

/** Skeleton bar rendered until a field's partial value arrives. The width
 *  matches the eventual content so the layout doesn't shift on reveal. */
function SkeletonBar({ widthClass }: { widthClass: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "h-5 rounded-md bg-muted animate-pulse",
        widthClass,
      )}
    />
  );
}

/** Wraps a value as it arrives. Fades in + slides up 4px on motion-safe;
 *  motion-reduce users get an instant swap. */
function FieldReveal({
  revealed,
  children,
}: {
  revealed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "transition-all duration-200 ease-out",
        // Default (motion-reduce) → no transform, no opacity change.
        "motion-safe:opacity-0 motion-safe:translate-y-1",
        revealed && "motion-safe:opacity-100 motion-safe:translate-y-0",
      )}
    >
      {children}
    </div>
  );
}

/** Single field row: label + (skeleton | value). The confidence ring
 *  appears only once the value lands so the skeleton state stays calm. */
function ScanFieldRow({
  label,
  widthClass,
  revealed,
  confidence,
  children,
}: {
  label: string;
  widthClass: string;
  revealed: boolean;
  confidence: number | null;
  children: React.ReactNode;
}) {
  const ringClass =
    revealed && confidence !== null
      ? CONFIDENCE_RING[toneFromScore(confidence)]
      : "";
  return (
    <div className={cn("rounded-xl bg-card p-3.5 transition-colors", ringClass)}>
      <div className="pb-1.5">
        <span className="text-[12px] font-semibold text-foreground">{label}</span>
      </div>
      {revealed ? (
        <FieldReveal revealed>{children}</FieldReveal>
      ) : (
        <SkeletonBar widthClass={widthClass} />
      )}
    </div>
  );
}

// ─── Stage label ──────────────────────────────────────────────────────────

const STAGE_LABEL: Record<ScanFillStage, string> = {
  idle: "Iniciando…",
  compressing: "Preparando imagen…",
  uploading: "Enviando…",
  classifying: "Identificando…",
  extracting: "Analizando…",
  validating: "Validando datos…",
  persisting: "Guardando…",
};

// ─── Value formatters ─────────────────────────────────────────────────────
function formatAmount(value: unknown, currencyHint: unknown): string {
  // `partial` ships `value` as `unknown` per the protocol — the backend
  // sends an Amount object for `amount` and a string for `currency`. We
  // accept both shapes defensively because the protocol allows the
  // extractor to evolve without breaking the consumer.
  let minor: number | null = null;
  let currency: string | null = null;
  if (
    typeof value === "object" &&
    value !== null &&
    "minor" in value &&
    typeof (value as { minor: unknown }).minor === "number"
  ) {
    minor = (value as { minor: number }).minor;
    if (
      "currency" in value &&
      typeof (value as { currency: unknown }).currency === "string"
    ) {
      currency = (value as { currency: string }).currency;
    }
  } else if (typeof value === "number") {
    minor = Math.round(value * 100);
  }
  if (typeof currencyHint === "string") currency = currencyHint;

  if (minor === null) return "—";
  const major = minor / 100;
  const symbol = currency === "USD" ? "$" : "S/";
  return `${symbol} ${major.toFixed(2)}`;
}

function formatDate(value: unknown): string {
  if (typeof value !== "string") return "—";
  // Backend sends ISO 8601. We render YYYY-MM-DD because the review
  // form's input is `type="date"` and that's the keyboard the user
  // sees once the form materialises.
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatKind(value: unknown): string {
  return value === "income" ? "Ingreso" : "Gasto";
}

function formatString(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "—";
}

// ─── Component ────────────────────────────────────────────────────────────
export function ReceiptScanFill({
  imageUrl,
  onCancel,
  stage,
  classified,
  fields,
  errorBanner,
}: ReceiptScanFillProps) {
  const revealed = useStaggeredReveal(fields);

  const merchant = fields.merchant;
  const amount = fields.amount;
  const currency = fields.currency;
  const date = fields.date;
  const kind = fields.kind;
  const category = fields.category;

  // Source badge — always-on once the classifier fires. The badge stays
  // through the rest of the run so the user has a stable identifier.
  const sourceLabel = classified ? SOURCE_LABEL[classified.source] : null;

  return (
    <div
      className="mx-auto w-full max-w-md px-4 pb-32 pt-4 md:px-0 md:py-10"
      role="status"
      aria-live="polite"
    >
      {/* Header — stage indicator + source badge */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Lectura en curso
          </div>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold leading-tight md:text-3xl">
            <span
              aria-hidden="true"
              className="inline-flex h-2 w-2 flex-shrink-0 rounded-full bg-primary motion-safe:animate-pulse"
            />
            {STAGE_LABEL[stage] ?? "Analizando…"}
          </h1>
        </div>
        {sourceLabel ? (
          <FieldReveal revealed>
            <Badge
              variant="secondary"
              className="h-7 gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 text-[11px] font-bold uppercase tracking-wider text-primary"
            >
              <Sparkles size={11} aria-hidden="true" />
              {sourceLabel}
            </Badge>
          </FieldReveal>
        ) : null}
      </div>

      {/* Soft error banner — appears mid-stream when an `error` event
          breaks extraction. We keep the partial fields visible so the
          user can edit whatever was extracted before the failure. */}
      {errorBanner ? (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-amber-500/30 bg-amber-50/40 px-3.5 py-2.5 text-[12px] leading-relaxed text-foreground dark:border-amber-500/25 dark:bg-amber-500/10"
        >
          {errorBanner}
        </div>
      ) : null}

      {/* Compact image preview — keep the receipt visible so the user
          retains context while the data fills in. Smaller than the
          old loading screen because attention is on the form below. */}
      <div className="relative mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL, not optimisable */}
        <img
          src={imageUrl}
          alt=""
          aria-hidden="true"
          className="block h-[140px] w-full object-cover bg-[oklch(0.94_0.005_95)] dark:bg-[oklch(0.22_0.005_95)] md:h-[200px]"
        />
        {/* Soft scan sweep — purely decorative, hidden under reduce-motion. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 motion-reduce:hidden"
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

      {/* Skeleton-fill form. Same layout as the review form so the
          transition into review state is visually a no-op. */}
      <Card className="mt-4 rounded-2xl border-border p-3 md:p-4">
        <div className="flex flex-col gap-2.5">
          {/* Comercio — wide skeleton (~60%). */}
          <ScanFieldRow
            label="Comercio"
            widthClass="w-3/5"
            revealed={revealed.has("merchant")}
            confidence={merchant?.confidence ?? null}
          >
            <p className="text-base font-semibold text-foreground">
              {formatString(merchant?.value)}
            </p>
          </ScanFieldRow>

          {/* Monto — medium skeleton (~40%). */}
          <ScanFieldRow
            label="Monto total"
            widthClass="w-2/5"
            revealed={revealed.has("amount")}
            confidence={amount?.confidence ?? null}
          >
            <p className="font-mono text-lg font-semibold tabular-nums text-foreground">
              {formatAmount(amount?.value, currency?.value)}
            </p>
          </ScanFieldRow>

          {/* Tipo — narrow skeleton (~30%). */}
          <ScanFieldRow
            label="Tipo"
            widthClass="w-1/3"
            revealed={revealed.has("kind")}
            confidence={kind?.confidence ?? null}
          >
            <p className="text-sm font-semibold uppercase tracking-wide text-foreground">
              {formatKind(kind?.value)}
            </p>
          </ScanFieldRow>

          {/* Fecha — narrow skeleton (~30%). */}
          <ScanFieldRow
            label="Fecha"
            widthClass="w-[30%]"
            revealed={revealed.has("date")}
            confidence={date?.confidence ?? null}
          >
            <p className="text-base font-semibold text-foreground">
              {formatDate(date?.value)}
            </p>
          </ScanFieldRow>

          {/* Categoría — medium skeleton (~50%). */}
          <ScanFieldRow
            label="Categoría"
            widthClass="w-1/2"
            revealed={revealed.has("category")}
            confidence={category?.confidence ?? null}
          >
            <p className="text-base font-medium text-muted-foreground">
              {formatString(category?.value)}
            </p>
          </ScanFieldRow>

          {/* Cuenta — placeholder while we wait for `destinationApp`
              (which drives account auto-suggest). The page handles the
              actual account picker once review state mounts. */}
          <ScanFieldRow
            label="Cuenta"
            widthClass="w-1/2"
            revealed={revealed.has("destinationApp")}
            confidence={fields.destinationApp?.confidence ?? null}
          >
            <p className="text-base font-medium text-muted-foreground">
              {formatString(fields.destinationApp?.value)}
            </p>
          </ScanFieldRow>
        </div>
      </Card>

      {/* Cancel — pinned to the bottom on mobile, inline on md+. The
          parent owns the AbortController; tapping here aborts the
          fetch + resets to preview. */}
      <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pt-8 pb-[calc(env(safe-area-inset-bottom)+1rem)] md:relative md:inset-auto md:bottom-auto md:z-auto md:mt-6 md:bg-none md:px-0 md:pt-0">
        <div className="mx-auto flex w-full max-w-md justify-center">
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            className="h-11 rounded-full px-6 text-[13px] font-semibold text-muted-foreground hover:text-foreground"
          >
            <Loader2
              size={14}
              aria-hidden="true"
              className="motion-safe:animate-spin motion-reduce:hidden"
            />
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Receipt OCR review route — Lumi
 *
 * Mock OCR: hardcoded extracted fields the user reviews and confirms.
 * Pre-Batch C — no real OCR yet. Pre-Batch B — money is `number` (not BIGINT).
 *
 * NOTE: Currently a public preview route. When Batch D wires the (protected)
 * group, this file moves there. The route lives under (tabs) so the
 * tabs layout (wired by orchestrator) can share chrome.
 */

// TODO: replace inline money formatting with formatMoney from @/lib/money once Batch B lands.
// TODO: migrate `amount` from `number` (en pesos) to `bigint` minor units once Batch B
//       brings `amount_minor: BIGINT` end-to-end. tsconfig target is ES2017 today; bump
//       to ES2020 in the same batch to allow bigint literals.

"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronRight,
  Loader2,
  Maximize2,
  Pencil,
  Trash2,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
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
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────
type Currency = "PEN" | "USD";
type Status = "idle" | "loading" | "failed" | "review";
type Confidence = "high" | "medium" | "low";

type CategoryId =
  | "food"
  | "transport"
  | "market"
  | "health"
  | "fun"
  | "utilities"
  | "home"
  | "edu"
  | "work"
  | "other";

type AccountId = "bcp" | "bbva" | "cash" | "yape";

// ─── Mock OCR result ───────────────────────────────────────────────────────
// NOTE: amount is `number` for now (pesos as decimal). Migration to BIGINT
// minor units (centavos) is tracked in the Batch B TODO at the top of this file.
const MOCK_OCR = {
  merchant: "Cineplanet",
  amount: 80.0,
  currency: "PEN" as Currency,
  occurred_at: "2026-04-25", // stable: avoid Date.now() in mock to dodge hydration mismatches
  suggested_category: "fun" as CategoryId,
  confidence: 0.86,
};

const CATEGORY_LABEL: Record<CategoryId, string> = {
  food: "Comida",
  transport: "Transporte",
  market: "Mercado",
  health: "Salud",
  fun: "Ocio",
  utilities: "Servicios",
  home: "Hogar",
  edu: "Educación",
  work: "Trabajo",
  other: "Otros",
};

const CATEGORY_ORDER: CategoryId[] = [
  "food",
  "transport",
  "market",
  "fun",
  "utilities",
  "home",
  "health",
  "edu",
  "work",
  "other",
];

const ACCOUNT_LABEL: Record<AccountId, string> = {
  bcp: "BCP Soles",
  bbva: "BBVA Soles",
  yape: "Yape",
  cash: "Efectivo",
};

const ACCOUNT_ORDER: AccountId[] = ["bcp", "bbva", "yape", "cash"];

// ─── Money formatting ─────────────────────────────────────────────────────
// TODO: replace with formatMoney from @/lib/money once Batch B lands.
function formatMoney(amount: number, currency: Currency = "PEN"): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ─── Confidence helper ────────────────────────────────────────────────────
function confidenceFromScore(score: number): Confidence {
  if (score >= 0.8) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

const CONFIDENCE_COPY: Record<Confidence, { label: string; hint: string }> = {
  high: { label: "Confianza alta", hint: "Lo leí bien — revisá nomás." },
  medium: { label: "Confianza media", hint: "Revisá un par de campos." },
  low: { label: "Confianza baja", hint: "Te conviene corregir antes de guardar." },
};

// ─── Receipt placeholder (pure SVG, unique pattern id) ────────────────────
// FIX: source `ReceiptScreen.jsx` had `id="grain"` which collides with any
// other SVG using the same id on the page. All SVG ids here are prefixed
// `lumi-receipt-` so this page is safe to mount alongside others.
function ReceiptPlaceholder({
  scale = 1,
  className,
  ariaLabel = "Foto del ticket cargado",
}: {
  scale?: number;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <svg
      viewBox="0 0 320 600"
      preserveAspectRatio="xMidYMid slice"
      className={cn("h-full w-full", className)}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <pattern
          id="lumi-receipt-grain"
          patternUnits="userSpaceOnUse"
          width="4"
          height="4"
        >
          <rect width="4" height="4" fill="oklch(0.94 0.005 95)" />
          <circle cx="1" cy="1" r="0.4" fill="oklch(0.85 0.005 95)" opacity="0.5" />
        </pattern>
        <linearGradient
          id="lumi-receipt-fade"
          x1="0"
          x2="0"
          y1="0"
          y2="1"
        >
          <stop offset="0%" stopColor="oklch(0.94 0.005 95)" stopOpacity="0" />
          <stop offset="100%" stopColor="var(--background)" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <rect width="320" height="600" fill="url(#lumi-receipt-grain)" />
      <text
        x="50%"
        y="80"
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize={14 * scale}
        fontWeight="700"
        fill="oklch(0.30 0.005 95)"
      >
        CINEPLANET
      </text>
      <text
        x="50%"
        y="100"
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize={9 * scale}
        fill="oklch(0.40 0.005 95)"
      >
        PLAZA NORTE — LIMA
      </text>
      <line
        x1="20"
        y1="120"
        x2="300"
        y2="120"
        stroke="oklch(0.50 0.005 95)"
        strokeDasharray="2 2"
      />
      {[
        ["ENTRADA 2D", "S/ 60.00"],
        ["CANCHITA M", "S/ 14.00"],
        ["GASEOSA", "S/  6.00"],
      ].map(([k, v], i) => (
        <g key={k}>
          <text
            x="22"
            y={150 + i * 22}
            fontFamily="var(--font-mono)"
            fontSize={10 * scale}
            fill="oklch(0.30 0.005 95)"
          >
            {k}
          </text>
          <text
            x="298"
            y={150 + i * 22}
            textAnchor="end"
            fontFamily="var(--font-mono)"
            fontSize={10 * scale}
            fill="oklch(0.30 0.005 95)"
          >
            {v}
          </text>
        </g>
      ))}
      <line
        x1="20"
        y1="220"
        x2="300"
        y2="220"
        stroke="oklch(0.50 0.005 95)"
        strokeDasharray="2 2"
      />
      <text
        x="22"
        y="244"
        fontFamily="var(--font-mono)"
        fontSize={11 * scale}
        fontWeight="700"
        fill="oklch(0.20 0.005 95)"
      >
        TOTAL
      </text>
      <text
        x="298"
        y="244"
        textAnchor="end"
        fontFamily="var(--font-mono)"
        fontSize={11 * scale}
        fontWeight="700"
        fill="oklch(0.20 0.005 95)"
      >
        S/ 80.00
      </text>
      <text
        x="50%"
        y="290"
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize={9 * scale}
        fill="oklch(0.45 0.005 95)"
      >
        25/04/2026
      </text>
      <rect width="320" height="600" fill="url(#lumi-receipt-fade)" />
    </svg>
  );
}

// ─── Confidence indicator (color + icon + text — not color-only) ──────────
function ConfidenceMeter({ level }: { level: Confidence }) {
  const Icon = level === "high" ? Check : level === "medium" ? AlertTriangle : X;
  const colorVar =
    level === "high"
      ? "var(--color-confidence-high)"
      : level === "medium"
        ? "var(--color-confidence-medium)"
        : "var(--color-confidence-low)";
  const fgVar =
    level === "high"
      ? "var(--color-success-foreground)"
      : level === "medium"
        ? "var(--color-warning-foreground)"
        : "var(--primary-foreground)";
  const copy = CONFIDENCE_COPY[level];

  return (
    <div
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold"
      style={{ background: colorVar, color: fgVar }}
      role="status"
      aria-live="polite"
    >
      <Icon size={14} aria-hidden="true" strokeWidth={2.5} />
      <span>{copy.label}</span>
    </div>
  );
}

// ─── Loading state ────────────────────────────────────────────────────────
function LoadingState() {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6"
      role="status"
      aria-live="polite"
    >
      <Loader2 size={32} className="animate-spin text-primary" aria-hidden="true" />
      <div className="text-center">
        <h1 className="text-lg font-semibold">Leyendo el ticket…</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Esto suele tardar un par de segundos.
        </p>
      </div>
    </div>
  );
}

// ─── Failed state ─────────────────────────────────────────────────────────
function FailedState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background px-6"
      role="status"
      aria-live="polite"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle size={28} aria-hidden="true" />
      </div>
      <div className="text-center">
        <h1 className="text-lg font-semibold">No pude leer el ticket</h1>
        <p className="mt-1 max-w-[28ch] text-sm text-muted-foreground">
          La foto salió borrosa o muy oscura. Probá de nuevo con buena luz.
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" className="min-h-11">
          <Camera size={16} aria-hidden="true" /> Tomar otra foto
        </Button>
        <Button onClick={onRetry} className="min-h-11">
          Reintentar
        </Button>
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────
// useSearchParams() forces client-side bailout during static prerender — wrap
// in <Suspense> so the build can statically prerender the surrounding shell
// and only the search-param-dependent content streams.
export default function ReceiptPage() {
  return (
    <React.Suspense fallback={null}>
      <ReceiptContent />
    </React.Suspense>
  );
}

function ReceiptContent() {
  const params = useSearchParams();
  // ?status=loading | failed lets design-review preview the alternate states.
  const queryStatus = params?.get("status");
  const initialStatus: Status =
    queryStatus === "loading" || queryStatus === "failed" || queryStatus === "idle"
      ? (queryStatus as Status)
      : "review";

  const [status, setStatus] = React.useState<Status>(initialStatus);

  // Form state — pre-filled from MOCK_OCR.
  const [merchant, setMerchant] = React.useState(MOCK_OCR.merchant);
  const [amount, setAmount] = React.useState(MOCK_OCR.amount.toFixed(2));
  const [currency, setCurrency] = React.useState<Currency>(MOCK_OCR.currency);
  const [occurredAt, setOccurredAt] = React.useState(MOCK_OCR.occurred_at);
  const [categoryId, setCategoryId] = React.useState<CategoryId>(
    MOCK_OCR.suggested_category,
  );
  const [accountId, setAccountId] = React.useState<AccountId>("bcp");
  const [note, setNote] = React.useState("");

  // UI state
  const [isZoomOpen, setIsZoomOpen] = React.useState(false);
  const [isCategoryOpen, setIsCategoryOpen] = React.useState(false);
  const [isDiscardOpen, setIsDiscardOpen] = React.useState(false);
  const [savedToast, setSavedToast] = React.useState<string | null>(null);

  const confidence = confidenceFromScore(MOCK_OCR.confidence);
  const parsedAmount = Number(amount.replace(",", ".")) || 0;

  if (status === "loading") return <LoadingState />;
  if (status === "failed") return <FailedState onRetry={() => setStatus("review")} />;
  if (status === "idle") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-6 text-center text-sm text-muted-foreground">
        Sin ticket cargado.
      </div>
    );
  }

  const handleAccept = () => {
    // TODO: wire to mutation in Batch C (createTransactionFromReceipt).
    setSavedToast(`Guardado: ${formatMoney(parsedAmount, currency)} en ${CATEGORY_LABEL[categoryId]}`);
  };

  const handleDiscard = () => {
    setIsDiscardOpen(false);
    // TODO: navigate back / clear capture state once router wiring lands.
    setStatus("idle");
  };

  return (
    <div className="relative min-h-dvh bg-background pb-32 text-foreground md:pb-0">
      <div className="mx-auto w-full max-w-2xl md:px-8 md:py-8">
        {/* Receipt photo — tap to zoom */}
        <div className="relative md:rounded-3xl md:border md:border-border md:overflow-hidden md:shadow-card">
          <button
            type="button"
            onClick={() => setIsZoomOpen(true)}
            aria-label="Ver foto del ticket completa"
            className="relative block h-[220px] w-full overflow-hidden bg-[oklch(0.94_0.005_95)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:rounded-2xl"
          >
            <ReceiptPlaceholder />
            <span className="absolute bottom-3 right-3 inline-flex h-7 items-center gap-1.5 rounded-full bg-foreground/80 px-2.5 text-[11px] font-semibold text-background backdrop-blur-sm">
              <Maximize2 size={12} aria-hidden="true" />
              Ver completo
            </span>
          </button>
          <div className="absolute right-4 top-4">
            <ConfidenceMeter level={confidence} />
          </div>
        </div>

        {/* Header copy */}
        <div className="px-5 pt-5 md:px-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            Lo que leí
          </div>
          <h1 className="mt-1 font-display text-3xl italic leading-tight">
            Revisá los datos
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {CONFIDENCE_COPY[confidence].hint}
          </p>
        </div>

        {/* Form card */}
        <Card className="mx-4 mt-5 rounded-2xl border-border p-5 md:mx-0">
          {/* Comercio */}
          <div className="space-y-1.5">
            <Label htmlFor="receipt-merchant">Comercio</Label>
            <Input
              id="receipt-merchant"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              autoComplete="off"
              className="min-h-11"
            />
          </div>

          <Separator className="my-5" />

          {/* Monto + moneda */}
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="receipt-amount">Monto total</Label>
              <Input
                id="receipt-amount"
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) =>
                  setAmount(e.target.value.replace(/[^0-9.,]/g, ""))
                }
                aria-describedby="receipt-amount-help"
                className="min-h-11 font-mono tabular-nums text-lg"
              />
              <p
                id="receipt-amount-help"
                className="text-[11px] text-muted-foreground"
              >
                Formato: {formatMoney(parsedAmount, currency)}
              </p>
            </div>
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Moneda</legend>
              <RadioGroup
                value={currency}
                onValueChange={(v) => setCurrency(v as Currency)}
                className="flex gap-2"
              >
                {(["PEN", "USD"] as Currency[]).map((c) => (
                  <label
                    key={c}
                    className={cn(
                      "flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 text-sm font-semibold",
                      "has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring",
                      currency === c && "border-primary bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)]",
                    )}
                  >
                    <RadioGroupItem value={c} aria-label={c} />
                    <span aria-hidden="true">{c === "PEN" ? "S/" : "$"}</span>
                    <span>{c}</span>
                  </label>
                ))}
              </RadioGroup>
            </fieldset>
          </div>

          <Separator className="my-5" />

          {/* Fecha */}
          <div className="space-y-1.5 md:max-w-xs">
            <Label htmlFor="receipt-date">Fecha</Label>
            <Input
              id="receipt-date"
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="min-h-11"
            />
          </div>

          <Separator className="my-5" />

          {/* Categoría */}
          <div className="space-y-1.5">
            <Label>Categoría sugerida</Label>
            <div className="flex items-center gap-2">
              <Badge
                className="min-h-11 rounded-full px-3.5 text-sm"
                style={{
                  background: "var(--color-primary-soft)",
                  color: "var(--color-primary-soft-foreground)",
                }}
              >
                {CATEGORY_LABEL[categoryId]}
              </Badge>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsCategoryOpen(true)}
                className="min-h-11 text-primary"
              >
                cambiar
                <ChevronRight size={14} aria-hidden="true" />
              </Button>
            </div>
          </div>

          <Separator className="my-5" />

          {/* Cuenta */}
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Cuenta</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cuenta">
              {ACCOUNT_ORDER.map((id) => {
                const selected = accountId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setAccountId(id)}
                    className={cn(
                      "min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected
                        ? "border-primary bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)]"
                        : "border-border bg-card text-foreground hover:bg-muted",
                    )}
                  >
                    {ACCOUNT_LABEL[id]}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <Separator className="my-5" />

          {/* Nota */}
          <div className="space-y-1.5">
            <Label htmlFor="receipt-note">Nota (opcional)</Label>
            <textarea
              id="receipt-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-[120px]"
              placeholder="ej. Salida con Sofi"
            />
          </div>
        </Card>

        {/* Status preview helpers (dev affordance — visible only on this preview route) */}
        <div className="mx-4 mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground md:mx-0">
          <span className="font-semibold uppercase tracking-wide">Vista previa:</span>
          <button
            type="button"
            onClick={() => setStatus("loading")}
            className="underline underline-offset-2 hover:text-foreground"
          >
            loading
          </button>
          <button
            type="button"
            onClick={() => setStatus("failed")}
            className="underline underline-offset-2 hover:text-foreground"
          >
            failed
          </button>
        </div>

        {savedToast && (
          <div
            className="mx-4 mt-3 rounded-xl border border-[var(--color-confidence-high)] bg-[var(--color-primary-soft)] px-4 py-3 text-sm font-semibold text-[var(--color-primary-soft-foreground)] md:mx-0"
            role="status"
            aria-live="polite"
          >
            {savedToast}
          </div>
        )}
      </div>

      {/* Sticky action row */}
      <div
        className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-md md:relative md:inset-auto md:bottom-auto md:z-auto md:mx-auto md:mt-8 md:max-w-2xl md:border-0 md:bg-transparent md:px-8 md:py-0 md:backdrop-blur-none"
        style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex w-full max-w-[640px] gap-2 md:max-w-none">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setIsDiscardOpen(true)}
            aria-label="Descartar ticket"
            className="h-12 w-12 text-destructive hover:bg-destructive/10"
          >
            <Trash2 size={18} aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            // TODO: open full edit screen once Batch C wires per-field editing.
            onClick={() => {
              /* no-op — see TODO above */
            }}
            className="h-12 flex-1"
          >
            <Pencil size={16} aria-hidden="true" />
            Editar más
          </Button>
          <Button
            type="button"
            onClick={handleAccept}
            className="h-12 flex-[2] text-base font-bold"
          >
            <Check size={18} aria-hidden="true" />
            Aceptar y guardar
          </Button>
        </div>
      </div>

      {/* Zoom modal — Sheet handles role=dialog, focus trap, ESC-to-close.
          FIX: source had a non-wired close button; this one is wired (SheetClose). */}
      <Sheet open={isZoomOpen} onOpenChange={setIsZoomOpen}>
        <SheetContent
          side="bottom"
          className="h-[100dvh] max-w-none border-0 bg-foreground/95 p-0 sm:max-w-none"
          showCloseButton={false}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Foto del ticket</SheetTitle>
            <SheetDescription>
              Vista ampliada del ticket. Pulsá ESC o el botón Cerrar para volver.
            </SheetDescription>
          </SheetHeader>
          <div className="relative flex h-full w-full items-center justify-center p-4">
            <div className="relative aspect-[320/420] w-full max-w-[420px] overflow-hidden rounded-lg bg-[oklch(0.94_0.005_95)]">
              <ReceiptPlaceholder
                scale={1.2}
                ariaLabel="Foto del ticket cargado, vista ampliada"
              />
            </div>
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

      {/* Category Drawer */}
      <Drawer open={isCategoryOpen} onOpenChange={setIsCategoryOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Elegir categoría</DrawerTitle>
            <DrawerDescription>
              Sugerí: {CATEGORY_LABEL[MOCK_OCR.suggested_category]}
            </DrawerDescription>
          </DrawerHeader>
          <div className="grid grid-cols-2 gap-2 px-4 sm:grid-cols-3">
            {CATEGORY_ORDER.map((id) => {
              const selected = categoryId === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setCategoryId(id);
                    setIsCategoryOpen(false);
                  }}
                  className={cn(
                    "flex min-h-11 items-center justify-center rounded-xl border px-3 py-3 text-sm font-semibold",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "border-primary bg-[var(--color-primary-soft)] text-[var(--color-primary-soft-foreground)]"
                      : "border-border bg-card hover:bg-muted",
                  )}
                  aria-pressed={selected}
                >
                  {CATEGORY_LABEL[id]}
                </button>
              );
            })}
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button variant="ghost" className="min-h-11">
                Cancelar
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {/* Discard confirmation. Sheet's underlying primitive is role=dialog;
          we promote it to alertdialog semantics for screen readers. */}
      <Sheet open={isDiscardOpen} onOpenChange={setIsDiscardOpen}>
        <SheetContent
          side="bottom"
          role="alertdialog"
          aria-labelledby="discard-title"
          aria-describedby="discard-desc"
          className="rounded-t-2xl border-t pb-6"
          showCloseButton={false}
        >
          <SheetHeader>
            <SheetTitle id="discard-title">¿Descartar el ticket?</SheetTitle>
            <SheetDescription id="discard-desc">
              Vas a perder los datos leídos. Esto no se puede deshacer.
            </SheetDescription>
          </SheetHeader>
          <SheetFooter className="flex-row gap-2">
            <SheetClose
              render={
                <Button variant="ghost" className="min-h-11 flex-1">
                  Cancelar
                </Button>
              }
            />
            <Button
              variant="destructive"
              onClick={handleDiscard}
              className="min-h-11 flex-1"
            >
              Descartar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

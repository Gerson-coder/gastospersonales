import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import { createClient } from "@/lib/supabase/server";
import type { Currency } from "@/lib/supabase/types";

/**
 * POST /api/reports/monthly
 *
 * Body: { year: number, month: number (1-12), currency: "PEN" | "USD" }
 *
 * Generates a PDF monthly statement for the authenticated user filtered
 * by currency. Server-side rendering uses pdf-lib (no headless browser),
 * which is safe to run on Vercel serverless. The route is `force-dynamic`
 * + `runtime: "nodejs"` because we use Buffer/Uint8Array and call
 * Supabase with cookies.
 *
 * Response:
 *   200 → application/pdf attachment ("kane-reporte-{year}-{month}.pdf")
 *   400 → invalid body
 *   401 → no session
 *   500 → unexpected
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Kane brand green (matches the rgb(0.16, 0.5, 0.36) reference). Used
// only for accents — wordmark, dividers, totals — to keep the PDF
// minimalist and printable in B/W without losing structure.
const KANE_GREEN = rgb(0.16, 0.5, 0.36);
const TEXT = rgb(0.13, 0.13, 0.13);
const MUTED = rgb(0.45, 0.45, 0.45);
const HAIRLINE = rgb(0.85, 0.85, 0.85);

const PAGE_W = 595;
const PAGE_H = 842; // A4 portrait
const MARGIN_X = 40;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 56;

const MAX_TABLE_ROWS = 50;

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const LIMA_TZ = "America/Lima";

interface RawTransaction {
  id: string;
  occurred_at: string;
  amount_minor: number;
  kind: "expense" | "income";
  categories: { name: string } | null;
  accounts: { name: string } | null;
  merchants: { name: string } | null;
  note: string | null;
}

// ─── Money / dates ────────────────────────────────────────────────────────

function symbolFor(currency: Currency): string {
  return currency === "PEN" ? "S/" : "$";
}

function formatMoney(amountMinor: number, currency: Currency): string {
  const major = amountMinor / 100;
  const formatted = new Intl.NumberFormat("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(major));
  return `${symbolFor(currency)} ${formatted}`;
}

function limaParts(date: Date): { y: string; m: string; d: string; hh: string; mm: string } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: LIMA_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);
  const get = (t: string): string => fmt.find((p) => p.type === t)?.value ?? "00";
  let hh = get("hour");
  if (hh === "24") hh = "00";
  return { y: get("year"), m: get("month"), d: get("day"), hh, mm: get("minute") };
}

function formatTxRowDate(iso: string): string {
  const p = limaParts(new Date(iso));
  return `${p.d}/${p.m}/${p.y}`;
}

function formatGenerationDate(date: Date): string {
  const p = limaParts(date);
  const monthIdx = parseInt(p.m, 10) - 1;
  return `${parseInt(p.d, 10)} de ${MONTHS_ES[monthIdx].toLowerCase()} de ${p.y}, ${p.hh}:${p.mm}`;
}

// ─── PDF helpers ──────────────────────────────────────────────────────────

interface DrawCtx {
  page: PDFPage;
  doc: PDFDocument;
  y: number;
  font: PDFFont;
  bold: PDFFont;
}

function newPage(ctx: DrawCtx): void {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - MARGIN_TOP;
}

function ensureSpace(ctx: DrawCtx, needed: number): void {
  if (ctx.y - needed < MARGIN_BOTTOM) newPage(ctx);
}

/** Truncate text to fit within `maxWidth` (no wrapping — used for table cells). */
function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const ellipsis = "…";
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(out + ellipsis, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return out + ellipsis;
}

// ─── Route ────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión expirada." }, { status: 401 });
  }

  let body: { year?: unknown; month?: unknown; currency?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const year = Number(body.year);
  const month = Number(body.month);
  const currency = body.currency;
  if (
    !Number.isInteger(year) || year < 2000 || year > 2100 ||
    !Number.isInteger(month) || month < 1 || month > 12 ||
    (currency !== "PEN" && currency !== "USD")
  ) {
    return NextResponse.json(
      { error: "Parámetros inválidos. Se esperan year, month (1-12) y currency." },
      { status: 400 },
    );
  }

  // ── Fetch profile name + transactions for the month ──────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, display_name")
    .eq("id", user.id)
    .maybeSingle();

  const userName =
    profile?.full_name?.trim() ||
    profile?.display_name?.trim() ||
    "Usuario";

  // Inclusive lower bound, exclusive upper bound — covers the full
  // calendar month regardless of timezone offset (the DB stores UTC).
  // Using ISO at boundary midnights matches how the rest of the app
  // queries period ranges.
  const fromISO = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const toISO = new Date(Date.UTC(year, month, 1)).toISOString();

  const { data: txs, error: txErr } = await supabase
    .from("transactions")
    .select(
      "id, occurred_at, amount_minor, kind, note, categories(name), accounts(name), merchants(name)",
    )
    .is("archived_at", null)
    .eq("currency", currency)
    .gte("occurred_at", fromISO)
    .lt("occurred_at", toISO)
    .order("occurred_at", { ascending: false });

  if (txErr) {
    return NextResponse.json(
      { error: "No pudimos generar el reporte. Intenta de nuevo." },
      { status: 500 },
    );
  }

  const transactions = (txs ?? []) as unknown as RawTransaction[];

  // ── Build totals + top categories ────────────────────────────────────
  let totalIncome = 0;
  let totalExpense = 0;
  const byCategory = new Map<string, number>();
  for (const t of transactions) {
    const amt = Number(t.amount_minor) || 0;
    if (t.kind === "income") {
      totalIncome += amt;
    } else {
      totalExpense += amt;
      const name = t.categories?.name ?? "Sin categoría";
      byCategory.set(name, (byCategory.get(name) ?? 0) + amt);
    }
  }
  const balance = totalIncome - totalExpense;
  const topCategories = Array.from(byCategory.entries())
    .map(([name, amt]) => ({ name, amount: amt }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // ── Build PDF ────────────────────────────────────────────────────────
  const doc = await PDFDocument.create();
  doc.setTitle(`Kane — Reporte ${MONTHS_ES[month - 1]} ${year}`);
  doc.setAuthor("Kane");
  doc.setCreator("Kane");

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const ctx: DrawCtx = {
    page: doc.addPage([PAGE_W, PAGE_H]),
    doc,
    y: PAGE_H - MARGIN_TOP,
    font,
    bold,
  };

  const monthLabel = `${MONTHS_ES[month - 1]} ${year}`;
  const generatedAt = formatGenerationDate(new Date());

  // Header — wordmark + report meta
  ctx.page.drawText("Kane", {
    x: MARGIN_X, y: ctx.y, font: bold, size: 22, color: KANE_GREEN,
  });
  ctx.page.drawText(`Generado el ${generatedAt}`, {
    x: MARGIN_X, y: ctx.y - 16, font, size: 9, color: MUTED,
  });
  ctx.y -= 36;
  ctx.page.drawText(`Reporte de movimientos — ${monthLabel}`, {
    x: MARGIN_X, y: ctx.y, font: bold, size: 14, color: TEXT,
  });
  ctx.y -= 24;
  ctx.page.drawLine({
    start: { x: MARGIN_X, y: ctx.y },
    end: { x: PAGE_W - MARGIN_X, y: ctx.y },
    thickness: 0.6, color: HAIRLINE,
  });
  ctx.y -= 22;

  // Greeting
  ctx.page.drawText(`Hola, ${userName}.`, {
    x: MARGIN_X, y: ctx.y, font, size: 11, color: TEXT,
  });
  ctx.y -= 28;

  if (transactions.length === 0) {
    ctx.page.drawText(`Sin movimientos en ${monthLabel}.`, {
      x: MARGIN_X, y: ctx.y, font, size: 11, color: MUTED,
    });
    ctx.y -= 24;
  } else {
    // ── Resumen card ────────────────────────────────────────────────
    drawCard(ctx, "Resumen del mes", (cardY) => {
      const labelSize = 9;
      const valueSize = 13;
      const colW = (PAGE_W - MARGIN_X * 2 - 32) / 3;
      const baseX = MARGIN_X + 16;

      const cells: { label: string; value: string; color: ReturnType<typeof rgb> }[] = [
        { label: "Ingresos", value: formatMoney(totalIncome, currency), color: KANE_GREEN },
        { label: "Gastos", value: formatMoney(totalExpense, currency), color: TEXT },
        { label: "Balance", value: `${balance < 0 ? "− " : ""}${formatMoney(balance, currency)}`, color: balance < 0 ? rgb(0.7, 0.15, 0.15) : KANE_GREEN },
      ];
      cells.forEach((c, i) => {
        const x = baseX + i * colW;
        ctx.page.drawText(c.label.toUpperCase(), {
          x, y: cardY - 18, font, size: labelSize, color: MUTED,
        });
        ctx.page.drawText(c.value, {
          x, y: cardY - 38, font: bold, size: valueSize, color: c.color,
        });
      });
      return 60;
    });

    // ── Top categorías ──────────────────────────────────────────────
    if (topCategories.length > 0 && totalExpense > 0) {
      drawCard(ctx, "Top categorías", (cardY) => {
        const rowH = 16;
        let yy = cardY - 18;
        topCategories.forEach((c) => {
          const pct = totalExpense > 0 ? (c.amount / totalExpense) * 100 : 0;
          const nameTrunc = truncate(c.name, font, 10, 280);
          ctx.page.drawText(nameTrunc, {
            x: MARGIN_X + 16, y: yy, font, size: 10, color: TEXT,
          });
          const amtStr = formatMoney(c.amount, currency);
          const pctStr = `${pct.toFixed(1)}%`;
          // Right-aligned amount + percent.
          const pctW = font.widthOfTextAtSize(pctStr, 10);
          ctx.page.drawText(pctStr, {
            x: PAGE_W - MARGIN_X - 16 - pctW,
            y: yy, font, size: 10, color: MUTED,
          });
          const amtW = bold.widthOfTextAtSize(amtStr, 10);
          ctx.page.drawText(amtStr, {
            x: PAGE_W - MARGIN_X - 16 - pctW - 12 - amtW,
            y: yy, font: bold, size: 10, color: TEXT,
          });
          yy -= rowH;
        });
        return 18 + topCategories.length * rowH + 4;
      });
    }

    // ── Tabla de transacciones ──────────────────────────────────────
    drawTransactionsTable(ctx, transactions, currency);
  }

  // Footer on every page (drawn once at end across all pages)
  drawFooter(doc, font);

  const bytes = await doc.save();

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="kane-reporte-${year}-${String(month).padStart(2, "0")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

// ─── Drawing primitives ───────────────────────────────────────────────────

function drawCard(
  ctx: DrawCtx,
  title: string,
  drawBody: (cardTopY: number) => number, // returns body height in points
): void {
  const titleSize = 9;
  const padTop = 14;
  const minBody = 60;
  ensureSpace(ctx, padTop + minBody + 12);

  const startY = ctx.y;
  ctx.page.drawText(title.toUpperCase(), {
    x: MARGIN_X + 16, y: startY - padTop, font: ctx.font, size: titleSize, color: MUTED,
  });
  const bodyTop = startY - padTop - 8;
  const bodyHeight = drawBody(bodyTop);

  const totalH = padTop + 8 + bodyHeight + 12;
  // Card border (drawn after content so we know exact height).
  ctx.page.drawRectangle({
    x: MARGIN_X, y: startY - totalH, width: PAGE_W - MARGIN_X * 2, height: totalH,
    borderColor: HAIRLINE, borderWidth: 0.6,
    color: rgb(1, 1, 1), opacity: 0,
  });
  ctx.y = startY - totalH - 14;
}

function drawTransactionsTable(
  ctx: DrawCtx,
  transactions: RawTransaction[],
  currency: Currency,
): void {
  const headerH = 22;
  const rowH = 18;
  const totalCount = transactions.length;
  const visible = transactions.slice(0, MAX_TABLE_ROWS);
  const overflow = totalCount - visible.length;

  // Column layout (x positions + widths). Date | Comercio | Categoría | Cuenta | Monto
  const innerW = PAGE_W - MARGIN_X * 2;
  const cols = [
    { key: "date", label: "Fecha", w: 70 },
    { key: "merchant", label: "Comercio", w: 150 },
    { key: "category", label: "Categoría", w: 110 },
    { key: "account", label: "Cuenta", w: 100 },
    { key: "amount", label: "Monto", w: innerW - (70 + 150 + 110 + 100), align: "right" as const },
  ];

  const drawHeader = () => {
    ensureSpace(ctx, headerH + rowH);
    ctx.page.drawText("Movimientos del mes", {
      x: MARGIN_X, y: ctx.y, font: ctx.bold, size: 11, color: TEXT,
    });
    ctx.y -= 16;
    let cx = MARGIN_X;
    cols.forEach((c) => {
      const isAmount = c.key === "amount";
      const tx = isAmount ? cx + c.w - ctx.font.widthOfTextAtSize(c.label.toUpperCase(), 8) : cx;
      ctx.page.drawText(c.label.toUpperCase(), {
        x: tx, y: ctx.y, font: ctx.font, size: 8, color: MUTED,
      });
      cx += c.w;
    });
    ctx.y -= 6;
    ctx.page.drawLine({
      start: { x: MARGIN_X, y: ctx.y },
      end: { x: PAGE_W - MARGIN_X, y: ctx.y },
      thickness: 0.6, color: HAIRLINE,
    });
    ctx.y -= 14;
  };

  drawHeader();

  visible.forEach((t) => {
    if (ctx.y - rowH < MARGIN_BOTTOM) {
      newPage(ctx);
      drawHeader();
    }
    const date = formatTxRowDate(t.occurred_at);
    const merchant = t.merchants?.name ?? t.note ?? "—";
    const category = t.categories?.name ?? "—";
    const account = t.accounts?.name ?? "—";
    const sign = t.kind === "expense" ? "− " : "+ ";
    const amount = `${sign}${formatMoney(Number(t.amount_minor) || 0, currency)}`;

    let cx = MARGIN_X;
    const cells = [date, merchant, category, account];
    cells.forEach((text, i) => {
      const c = cols[i];
      ctx.page.drawText(truncate(text, ctx.font, 9.5, c.w - 6), {
        x: cx, y: ctx.y, font: ctx.font, size: 9.5, color: TEXT,
      });
      cx += c.w;
    });
    const amtCol = cols[4];
    const amtW = ctx.bold.widthOfTextAtSize(amount, 9.5);
    ctx.page.drawText(amount, {
      x: cx + amtCol.w - amtW, y: ctx.y, font: ctx.bold, size: 9.5,
      color: t.kind === "expense" ? TEXT : KANE_GREEN,
    });
    ctx.y -= rowH;
  });

  if (overflow > 0) {
    ensureSpace(ctx, 20);
    ctx.y -= 4;
    ctx.page.drawText(`y ${overflow} ${overflow === 1 ? "movimiento" : "movimientos"} más en este mes`, {
      x: MARGIN_X, y: ctx.y, font: ctx.font, size: 9, color: MUTED,
    });
    ctx.y -= 16;
  }
}

function drawFooter(doc: PDFDocument, font: PDFFont): void {
  const generatedAt = formatGenerationDate(new Date());
  const line1 = `Generado por Kane el ${generatedAt}`;
  const line2 = "Este reporte refleja los movimientos registrados en la app, no constituye un documento oficial.";
  const pages = doc.getPages();
  pages.forEach((p, idx) => {
    p.drawLine({
      start: { x: MARGIN_X, y: 44 },
      end: { x: PAGE_W - MARGIN_X, y: 44 },
      thickness: 0.4, color: HAIRLINE,
    });
    p.drawText(line1, { x: MARGIN_X, y: 30, font, size: 8, color: MUTED });
    p.drawText(line2, { x: MARGIN_X, y: 18, font, size: 7.5, color: MUTED });
    const pageStr = `Página ${idx + 1} de ${pages.length}`;
    const w = font.widthOfTextAtSize(pageStr, 8);
    p.drawText(pageStr, { x: PAGE_W - MARGIN_X - w, y: 30, font, size: 8, color: MUTED });
  });
}

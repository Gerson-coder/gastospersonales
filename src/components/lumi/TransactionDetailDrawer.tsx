/**
 * TransactionDetailDrawer — bottom-sheet modal that shows the full
 * detail of a single transaction. Opens on tap on a movement row;
 * long-press still opens the existing TransactionActionSheet
 * (Editar / Eliminar) so the two interactions don't collide.
 *
 * The drawer is a read-only display surface. All fields are derived
 * from the `TransactionView` row passed in — same shape /movements
 * already paginates, no extra fetch.
 *
 * Reusable across surfaces (movements list today; dashboard recent
 * list eligible once it consumes `TransactionView` directly instead
 * of its current `RecentRowItem` shape).
 */
"use client";

import * as React from "react";
import {
  Wallet,
  Tag,
  CalendarClock,
  StickyNote,
  Store,
  Landmark,
} from "lucide-react";

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { AccountBrandIcon } from "@/components/lumi/AccountBrandIcon";
import { accountChipBgClass } from "@/lib/account-brand-slug";
import { formatMoney } from "@/lib/money";
import { formatLimaTime } from "@/lib/format-tx-date";
import { cn } from "@/lib/utils";
import type { TransactionView } from "@/lib/data/transactions";

export type TransactionDetailDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When `null` the drawer renders nothing — caller controls open
   *  state. Pattern matches TransactionActionSheet so /movements can
   *  keep its existing `actionSheetTx`-style state for both. */
  transaction: TransactionView | null;
};

// es-PE long-date formatter — "sábado, 2 de mayo de 2026". Pinned to
// America/Lima for the same reason every other Lumi date helper is
// (see `format-tx-date.ts`): timestamps cross the UTC day boundary
// at 19:00 Lima and a naive parser would shift the displayed day.
// Allocated once at module scope; Intl formatters are not free.
const LIMA_LONG_DATE = new Intl.DateTimeFormat("es-PE", {
  timeZone: "America/Lima",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function formatLongDate(occurredAt: string): string {
  const raw = LIMA_LONG_DATE.format(new Date(occurredAt));
  // es-PE returns "sábado, 2 de mayo de 2026" lowercased. Capitalize
  // the first letter so it reads as a proper title in the drawer
  // header without forcing a CSS text-transform that would shout the
  // whole string.
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

type DetailRowProps = {
  Icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  label: string;
  value: React.ReactNode;
};

function DetailRow({ Icon, label, value }: DetailRowProps) {
  return (
    <div className="flex items-start gap-3 py-3">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
      >
        <Icon size={15} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase leading-none tracking-[0.05em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-[14px] font-medium leading-snug text-foreground break-words">
          {value}
        </p>
      </div>
    </div>
  );
}

export function TransactionDetailDrawer({
  open,
  onOpenChange,
  transaction,
}: TransactionDetailDrawerProps) {
  // Mounting Drawer with `open=true` and `transaction=null` would
  // render an empty sheet for a frame on close. Bailing here keeps
  // the unmount path clean.
  if (!transaction) return null;

  const t = transaction;
  const isIncome = t.kind === "income";
  const sign = isIncome ? "+ " : "− ";
  const amountText = `${sign}${formatMoney(t.amount * 100, t.currency)}`;
  const titleText =
    t.merchantName ?? t.categoryName ?? (isIncome ? "Ingreso" : "Gasto");

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        aria-describedby="tx-detail-desc"
        className="bg-background"
      >
        <DrawerHeader className="text-center">
          {/* Avatar — account brand for income (matches the row's
              icon language) or merchant logo for expense, falling
              back to a neutral chip when neither is available. */}
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center">
            {isIncome && t.accountName ? (
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-14 w-14 items-center justify-center overflow-hidden rounded-full text-foreground",
                  accountChipBgClass(t.accountName),
                )}
              >
                <AccountBrandIcon
                  label={t.accountName}
                  fallback={<Landmark size={24} />}
                />
              </span>
            ) : t.merchantLogoSlug ? (
              <span
                aria-hidden="true"
                className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-muted"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVGs in /public */}
                <img
                  src={`/logos/merchants/${t.merchantLogoSlug}.svg`}
                  alt=""
                  aria-hidden="true"
                  loading="lazy"
                  className="h-full w-full object-contain"
                />
              </span>
            ) : (
              <span
                aria-hidden="true"
                className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground"
              >
                <Store size={24} aria-hidden />
              </span>
            )}
          </div>
          <DrawerTitle className="font-sans not-italic text-lg font-semibold">
            {titleText}
          </DrawerTitle>
          <DrawerDescription
            id="tx-detail-desc"
            className={cn(
              "mt-1 text-2xl font-bold tabular-nums tracking-tight",
              isIncome
                ? "text-[oklch(0.45_0.16_162)] dark:text-[oklch(0.85_0.14_162)]"
                : "text-destructive",
            )}
            style={{ fontFeatureSettings: '"tnum","lnum"' }}
          >
            {amountText}
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 pb-2">
          <div className="divide-y divide-border rounded-2xl border border-border bg-card px-3">
            <DetailRow
              Icon={Wallet}
              label="Cuenta"
              value={t.accountName ?? "Sin cuenta"}
            />
            {t.kind === "expense" ? (
              <DetailRow
                Icon={Tag}
                label="Categoría"
                value={t.categoryName ?? "Sin categoría"}
              />
            ) : null}
            {t.merchantName && t.kind === "expense" ? (
              <DetailRow
                Icon={Store}
                label="Comercio"
                value={t.merchantName}
              />
            ) : null}
            <DetailRow
              Icon={CalendarClock}
              label="Fecha y hora"
              value={
                <>
                  {formatLongDate(t.occurredAt)}
                  <span className="ml-1 text-muted-foreground">
                    · {formatLimaTime(t.occurredAt)}
                  </span>
                </>
              }
            />
            {t.note && t.note.trim().length > 0 ? (
              <DetailRow
                Icon={StickyNote}
                label="Nota"
                value={t.note}
              />
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-2 px-4 pb-6 pt-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-foreground text-[14px] font-semibold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Cerrar
          </button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export default TransactionDetailDrawer;

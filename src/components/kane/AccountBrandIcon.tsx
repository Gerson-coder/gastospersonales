/**
 * AccountBrandIcon — picks between a hand-prepared brand SVG and the
 * generic kind icon (Wallet / Landmark / CreditCard) that the data layer
 * already attaches to every Account.
 *
 * Mirrors the MerchantAvatar pattern: try the SVG, fall back transparently
 * on 404 / load error so a typo or missing asset never breaks the row.
 *
 *   <AccountBrandIcon
 *     label={account.label}
 *     fallback={<account.Icon size={14} />}
 *     size={14}
 *   />
 *
 * The `label` is matched against `accountBrandSlug` — see that file for
 * how to register a new brand once you've dropped the SVG into
 * `public/logos/banks/`.
 */
"use client";

import * as React from "react";

import { accountBrandSlug } from "@/lib/account-brand-slug";

export type AccountBrandIconProps = {
  label: string;
  fallback: React.ReactNode;
  /**
   * @deprecated Kept for backwards-compat at older callsites — ignored.
   *   The icon fills its parent (`h-full w-full object-contain`) so the
   *   chip controls the visual size. Wordmark logos (BCP, BBVA, Saga
   *   Falabella) need that to render legibly; explicit pixel sizes
   *   letterboxed them inside an oversized chip and they read tiny.
   */
  size?: number;
  className?: string;
};

export function AccountBrandIcon({
  label,
  fallback,
  className,
}: AccountBrandIconProps) {
  const slug = accountBrandSlug(label);
  const [failed, setFailed] = React.useState(false);
  // Reset the broken-image flag whenever the slug changes — a different
  // brand is a different asset and deserves a fresh load attempt.
  React.useEffect(() => {
    setFailed(false);
  }, [slug]);

  if (!slug || failed) {
    return <>{fallback}</>;
  }

  return (
    // Plain <img> over Next/Image — these are tiny static SVGs in /public,
    // no responsive variants needed, and avoiding the loader keeps bundle
    // and config simpler. Same approach as MerchantAvatar. Fills the
    // parent chip so wordmark logos read at the size the user expects.
    // eslint-disable-next-line @next/next/no-img-element -- tiny static SVGs in /public
    <img
      src={`/logos/banks/${slug}.svg`}
      alt=""
      aria-hidden="true"
      loading="lazy"
      className={
        className
          ? `h-full w-full object-contain ${className}`
          : "h-full w-full object-contain"
      }
      onError={() => setFailed(true)}
    />
  );
}

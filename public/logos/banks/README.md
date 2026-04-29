# Account brand logos

Drop hand-prepared SVGs here, named `{slug}.svg` (kebab-case).

The mapping from "account label as the user typed it" to "filename stem"
lives at `src/lib/account-brand-slug.ts` — add an entry there once the
SVG is in place.

## Currently registered slugs

- `bcp.svg`
- `interbank.svg`
- `bbva.svg`
- `scotiabank.svg`
- `banbif.svg`
- `pichincha.svg`
- `yape.svg`
- `plin.svg`

## Adding a new brand

1. Optimize the SVG (no embedded raster, no inline scripts, viewBox set,
   width/height removed so CSS sizing works).
2. Save as `public/logos/banks/{slug}.svg`.
3. Register the slug in `src/lib/account-brand-slug.ts`:
   ```ts
   const BRAND_LABEL_TO_SLUG: Record<string, string> = {
     // ...existing
     "mi-banco": "mi-banco",
   };
   ```
   The KEY must be the diacritic-stripped, lowercased, trimmed account
   label as it appears in the DB.

## Where the logos render

- Account picker drawer in `/capture` (small 20px chip).
- Account list rows in `/accounts` (medium 22px chip).

Missing or 404 logos fall back to the Lucide kind icon (Wallet /
Landmark / CreditCard) — the UI never breaks on a typo.

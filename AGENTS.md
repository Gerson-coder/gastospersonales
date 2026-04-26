# gastospersonales — Agent Instructions

## What This Is

A personal finance PWA for tracking expenses and income. Optimized for fast mobile capture (registering an expense from the cinema in 3 taps) with AI-assisted receipt OCR. Multi-tenant from day 1 — currently in personal testing, will be sold to friends and the general public.

## Tech Stack

- **Framework**: Next.js 16 (App Router, React 19, TypeScript strict)
- **UI**: shadcn/ui (Radix primitives, Tailwind CSS v4, `cn()` utility)
- **Icons**: Lucide React
- **Styling**: Tailwind CSS v4 with oklch design tokens
- **Backend / DB / Auth / Realtime / Storage**: Supabase (Postgres + RLS from day 1)
- **OCR**: OpenAI API (GPT-4o-mini with vision) for receipt scanning
- **PWA**: installable on mobile home screen, offline-capable for capture
- **Deployment**: Vercel (frontend) + Supabase (managed)
- **Node**: 24+

## Commands

- `npm run dev` — Start dev server
- `npm run build` — Production build
- `npm run lint` — ESLint check
- `npm run typecheck` — TypeScript check
- `npm run check` — Run lint + typecheck + build

## Code Style

- TypeScript strict mode, no `any`
- Named exports, PascalCase components, camelCase utils
- Tailwind utility classes, no inline styles
- 2-space indentation
- Mobile-first responsive design

## MVP Scope (v1)

- Quick expense/income capture with category
- Custom categories per user
- Dashboard: by-category breakdown, monthly evolution, balance
- Multiple accounts (cash / card / bank)
- Receipt OCR via OpenAI → autocomplete transaction
- Multi-currency (PEN + USD, simple)
- Realtime updates via Supabase Realtime

## Out of MVP

- v1.5: recurring transactions, per-category budgets, CSV/Excel export
- v2: notifications and reminders

## Architecture Principles

- **Multi-tenant from day 1** — all tables include `user_id`, RLS policies enforce isolation. Never bypass RLS.
- **Auth before data** — every data operation goes through an authenticated Supabase client.
- **Mobile-first UX** — capture flow must work in 3 taps or fewer.
- **Async OCR** — receipt scanning happens server-side via API route, never blocks UI. When traffic grows, move to a queue (Inngest / Trigger.dev / Supabase Edge Functions) — design for it now, implement when needed.
- **Cost discipline on OCR** — default model is GPT-4o-mini. Escalate to GPT-4o only on retry / low-confidence parses.
- **Transactions mapper centralized** — all DB ↔ UI shape conversion lives in `src/lib/data/transactions.ts`. Do NOT read `amount_minor` outside this module; consume rows via `toView()` / write via `toInsertPayload()`.
- **Active currency** — persisted in `lumi-prefs` localStorage; consume via `useActiveCurrency()`. Filters Movements/Insights/Dashboard reads.
- **Realtime scope** — only `/dashboard` subscribes to `transactions` changes (debounced 250ms). Pro plan caps at ~200 concurrent connections — keep this tight.
- **Edit transaction flow** — navigate to `/capture?edit=<id>`; the same Capture screen handles create + update via `upsertTransaction()`.

## Data Model (high-level, refined in /sdd-spec)

- `users` (managed by Supabase Auth)
- `accounts` (per user: cash, card, bank, etc.)
- `categories` (per user, customizable)
- `merchants` (per user + system seeds, with avatar metadata)
- `transactions` (expense / income, linked to account + category + optional merchant; soft-delete via `archived_at`)
- `receipts` (uploaded image + OCR result + linked transaction)

## SDD Workflow

This project uses Spec-Driven Development with **engram** as the persistence backend (no `openspec/` directory). Project context, change proposals, specs, designs, and tasks are stored in engram under topic keys like `sdd-init/gastospersonales` and `sdd/<change-name>/<artifact>`.

When asked to start a change, use `/sdd-new <change-name>` — the orchestrator handles the dependency graph (proposal → specs + design → tasks → apply → verify → archive).

## Project Structure

```
src/
  app/              # Next.js routes
  components/       # React components
    ui/             # shadcn/ui primitives
  lib/
    utils.ts        # cn() utility
    supabase/       # Supabase clients (server + browser)
  types/            # TypeScript interfaces
  hooks/            # Custom React hooks
public/
  icons/            # PWA icons
  manifest.json     # PWA manifest (added during MVP setup)
```

## Important Notes

- The codebase started from `ai-website-cloner-template` for fast scaffolding (Next.js 16 + shadcn/ui + Tailwind v4 base). The cloner-specific tooling has been removed — this is a fresh app.
- When adding components, prefer shadcn/ui primitives via `npx shadcn@latest add <component>`. Don't reinvent.
- Receipt OCR API key (`OPENAI_API_KEY`) is server-side only — never expose to the client.
- Supabase service role key is server-side only — client uses anon key with RLS.
- Transactions persist to Supabase with cursor pagination on `/movements` (page size 50), realtime-debounced refetch on `/dashboard`, soft-delete + Sonner undo on long-press, and PEN/USD currency switch mounted from `AppHeader` actionsBefore. See `src/lib/data/transactions.ts` for the canonical mapper.

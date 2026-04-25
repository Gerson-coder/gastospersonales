# gastospersonales

Personal finance PWA — track expenses and income with quick mobile capture and AI-assisted receipt OCR.

> **Status**: pre-MVP. Initial scaffolding done; SDD planning phase next.

## What it does

- Capture an expense or income in 3 taps from your phone (e.g. at the cinema, register what you spent right there).
- Auto-fill transactions by snapping a photo of a receipt — OpenAI vision extracts merchant, amount, date and suggests a category.
- See your money in real time: by-category breakdown, monthly evolution, balance across multiple accounts.
- Installable on mobile home screen as a PWA.
- Multi-tenant from day 1 — currently in personal testing, planned for sale to wider audience.

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 + TypeScript strict |
| UI | shadcn/ui + Tailwind CSS v4 (oklch tokens) |
| Backend / DB / Auth / Realtime / Storage | Supabase (Postgres + RLS) |
| OCR | OpenAI API (GPT-4o-mini with vision) |
| Hosting | Vercel (frontend) + Supabase (managed) |
| Node | 24+ |

## Roadmap

### MVP v1 (in progress)
- [ ] Quick expense/income capture with custom categories
- [ ] Dashboard: by-category, monthly evolution, balance
- [ ] Multiple accounts (cash / card / bank)
- [ ] Receipt OCR via OpenAI vision
- [ ] Multi-currency (PEN + USD)
- [ ] Realtime sync via Supabase Realtime
- [ ] PWA installable on mobile

### v1.5
- [ ] Recurring transactions (salary, subscriptions)
- [ ] Per-category budgets
- [ ] CSV / Excel export

### v2
- [ ] Notifications and reminders

## Getting Started

```bash
npm install
cp .env.example .env.local   # fill in Supabase + OpenAI keys
npm run dev
```

## Commands

```bash
npm run dev         # start dev server
npm run build       # production build
npm run lint        # ESLint check
npm run typecheck   # TypeScript check
npm run check       # lint + typecheck + build
```

## Project Structure

```
src/
  app/              # Next.js routes
  components/       # React components (ui/ holds shadcn primitives)
  lib/              # utils, Supabase clients
  types/            # TypeScript interfaces
  hooks/            # Custom React hooks
public/             # static assets, PWA manifest, icons
.github/workflows/  # CI (lint + typecheck + build)
AGENTS.md           # instructions for AI coding agents
```

## SDD (Spec-Driven Development)

This project uses SDD with engram as the persistence backend. Change proposals and specs live in engram under topic keys like `sdd/<change-name>/<artifact>`. To start a change, run `/sdd-new <change-name>`.

## License

UNLICENSED — private project.

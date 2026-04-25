-- 00001_schema.sql
-- mvp-foundations: tables, indexes, base extensions.
-- Money is always stored as (amount_minor BIGINT, currency CHAR(3)). Never floats.
-- Soft-delete via `archived_at` — no DELETE policy from the app.

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------- profiles ----------
create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  default_currency  char(3) not null default 'PEN'
                    check (default_currency in ('PEN','USD')),
  locale            text not null default 'es-PE',
  timezone          text not null default 'America/Lima',
  display_name      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------- accounts ----------
create table public.accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  type        text not null check (type in ('cash','card','bank')),
  currency    char(3) not null check (currency in ('PEN','USD')),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index accounts_user_idx on public.accounts(user_id);

-- ---------- categories ----------
-- user_id IS NULL → system category, visible to all authenticated users.
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete cascade,
  name        text not null,
  kind        text not null check (kind in ('expense','income')),
  color       text,
  icon        text,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- Unique per (user-or-system, name, kind) for non-archived rows.
-- The coalesce sentinel uuid lets system categories share the same uniqueness namespace.
create unique index categories_user_name_kind_uniq
  on public.categories (
    coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    name,
    kind
  )
  where archived_at is null;
create index categories_user_idx on public.categories(user_id);

-- ---------- receipts ----------
-- Declared before transactions so the transactions FK to receipts resolves.
create table public.receipts (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references public.profiles(id) on delete cascade,
  image_path                  text not null,
  ocr_status                  text not null default 'pending'
                              check (ocr_status in ('pending','processing','completed','failed')),
  ocr_raw                     jsonb,
  parsed_merchant             text,
  parsed_total_minor          bigint,
  parsed_currency             char(3) check (parsed_currency in ('PEN','USD')),
  parsed_occurred_at          timestamptz,
  parsed_category_suggestion  text,
  confidence                  numeric(3,2),
  linked_transaction_id       uuid,
  error_message               text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index receipts_user_status_idx on public.receipts(user_id, ocr_status);
create index receipts_user_created_idx on public.receipts(user_id, created_at desc);

-- ---------- transactions ----------
create table public.transactions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  account_id         uuid not null references public.accounts(id) on delete restrict,
  category_id        uuid references public.categories(id) on delete set null,
  kind               text not null check (kind in ('expense','income')),
  amount_minor       bigint not null check (amount_minor > 0),
  currency           char(3) not null check (currency in ('PEN','USD')),
  occurred_at        timestamptz not null default now(),
  note               text,
  source             text not null default 'manual' check (source in ('manual','ocr')),
  receipt_id         uuid references public.receipts(id) on delete set null,
  transfer_group_id  uuid,
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index transactions_user_occurred_idx
  on public.transactions(user_id, occurred_at desc);
create index transactions_user_category_occurred_idx
  on public.transactions(user_id, category_id, occurred_at desc);
create index transactions_user_account_occurred_idx
  on public.transactions(user_id, account_id, occurred_at desc);
create index transactions_category_idx on public.transactions(category_id);

-- Back-link: receipts.linked_transaction_id → transactions.id.
alter table public.receipts
  add constraint receipts_linked_tx_fk
  foreign key (linked_transaction_id)
  references public.transactions(id) on delete set null;

-- ---------- exchange_rates ----------
create table public.exchange_rates (
  date  date    not null,
  base  char(3) not null,
  quote char(3) not null,
  rate  numeric(20,8) not null,
  primary key (date, base, quote)
);

-- ---------- allowed_emails ----------
create table public.allowed_emails (
  email      citext primary key,
  invited_by uuid references public.profiles(id) on delete set null,
  note       text,
  created_at timestamptz not null default now()
);

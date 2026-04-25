-- 00005_seed_allowed_emails.sql
-- Bootstrap the allowlist with the project owner so the first signup works.
-- Idempotent — running this on top of an existing seed is safe.

insert into public.allowed_emails (email, note)
values ('gersonherrerach@gmail.com', 'project owner — bootstrap')
on conflict do nothing;

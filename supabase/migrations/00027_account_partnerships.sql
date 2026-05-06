-- 00027_account_partnerships.sql
-- Cuenta compartida con pareja (1 partner por cuenta en v1).
--
-- Modelo de datos:
--   - accounts.shared_with_partner: bool flag, set automaticamente
--     cuando se acepta una invitacion. Habilita los joins de RLS.
--   - account_partnerships: una fila por (account, partner). El owner
--     NO esta en esta tabla — accounts.user_id sigue siendo el owner.
--     Unique por account_id => 1 partner por cuenta en v1.
--   - account_invitations: codigo corto de invitacion compartible por
--     link. Expira en 7 dias, una sola aceptacion.
--
-- Acceso:
--   - El partner puede ver/editar/insertar transactions sobre la
--     cuenta compartida (RLS extendida).
--   - El partner puede ver/editar commitments cuyo account_id apunta
--     a la cuenta compartida (recibos del hogar).
--   - Categorias, presupuestos, templates, metas y cuentas privadas
--     siguen aislados al user_id de cada uno.
--
-- Funciones SECURITY DEFINER:
--   - accept_account_invitation(code): el partner acepta. Crea la
--     partnership, marca la cuenta shared_with_partner = true, y
--     marca la invitacion accepted.
--   - revoke_partnership(account_id): owner saca al partner.
--     Borra la partnership y desmarca shared_with_partner.
--   - leave_partnership(account_id): partner se sale solo.

-- ============================================================
-- 1. Schema
-- ============================================================

alter table public.accounts
  add column shared_with_partner boolean not null default false;

create table public.account_partnerships (
  account_id      uuid not null references public.accounts(id) on delete cascade,
  partner_user_id uuid not null references auth.users(id) on delete cascade,
  invited_at      timestamptz not null default now(),
  joined_at       timestamptz not null default now(),
  primary key (account_id, partner_user_id)
);

-- 1 partner por cuenta en v1. Si el user quiere cambiar de pareja,
-- primero revoca al actual.
create unique index account_partnerships_one_per_account
  on public.account_partnerships (account_id);

-- Hot path: "que cuentas comparto con otros" (lookup desde el lado del partner).
create index account_partnerships_partner_idx
  on public.account_partnerships (partner_user_id);

create table public.account_invitations (
  id            uuid primary key default gen_random_uuid(),
  account_id    uuid not null references public.accounts(id) on delete cascade,
  invited_by    uuid not null references auth.users(id) on delete cascade,
  -- Codigo corto pero hard-to-guess para meter en el link de invitacion.
  -- Generado client-side con crypto.randomUUID + slice, validado unique.
  code          text not null unique check (length(code) >= 8 and length(code) <= 64),
  created_at    timestamptz not null default now(),
  -- Las invitaciones expiran en 7 dias por seguridad — un link viejo
  -- no debe abrir acceso aunque sea valido en otros aspectos.
  expires_at    timestamptz not null default (now() + interval '7 days'),
  accepted_by   uuid references auth.users(id),
  accepted_at   timestamptz,
  -- Si el inviter cambia de opinion antes de que se acepte.
  revoked_at    timestamptz
);

-- Hot path: validar un code en el accept flow.
create index account_invitations_code_active_idx
  on public.account_invitations (code)
  where accepted_at is null and revoked_at is null;

-- Para que el inviter pueda listar sus invitaciones pendientes.
create index account_invitations_account_idx
  on public.account_invitations (account_id);

-- ============================================================
-- 2. RLS — accounts (extender select para incluir cuentas compartidas)
-- ============================================================

drop policy if exists accounts_select_own on public.accounts;
create policy accounts_select_own_or_partner on public.accounts
  for select using (
    auth.uid() = user_id
    OR (
      shared_with_partner = true
      AND exists (
        select 1 from public.account_partnerships
        where account_partnerships.account_id = accounts.id
          and account_partnerships.partner_user_id = auth.uid()
      )
    )
  );

-- INSERT/UPDATE de accounts siguen igual: solo el owner.
-- (El partner no puede renombrar la cuenta ni archivarla.)

-- ============================================================
-- 3. RLS — transactions (extender 3 policies)
-- ============================================================

-- Helper macro repetido — aceptamos la duplicacion porque postgres
-- no tiene "shared lambdas" para policy bodies y queremos que cada
-- policy sea autocontenida y legible.

drop policy if exists transactions_select_own on public.transactions;
create policy transactions_select_own_or_partner on public.transactions
  for select using (
    auth.uid() = user_id
    OR exists (
      select 1
      from public.accounts a
      inner join public.account_partnerships p on p.account_id = a.id
      where a.id = transactions.account_id
        and a.shared_with_partner = true
        and p.partner_user_id = auth.uid()
    )
  );

drop policy if exists transactions_insert_own on public.transactions;
create policy transactions_insert_own_or_partner on public.transactions
  for insert with check (
    -- El user_id del row sigue siendo el del que inserta (cada partner
    -- crea sus propias rows). Solo cambiamos el chequeo del account.
    auth.uid() = user_id
    AND (
      exists (
        select 1 from public.accounts
        where id = transactions.account_id
          and user_id = auth.uid()
      )
      OR exists (
        select 1
        from public.accounts a
        inner join public.account_partnerships p on p.account_id = a.id
        where a.id = transactions.account_id
          and a.shared_with_partner = true
          and p.partner_user_id = auth.uid()
      )
    )
  );

drop policy if exists transactions_update_own on public.transactions;
create policy transactions_update_own_or_partner on public.transactions
  for update using (
    auth.uid() = user_id
    OR exists (
      select 1
      from public.accounts a
      inner join public.account_partnerships p on p.account_id = a.id
      where a.id = transactions.account_id
        and a.shared_with_partner = true
        and p.partner_user_id = auth.uid()
    )
  ) with check (
    auth.uid() = user_id
    OR exists (
      select 1
      from public.accounts a
      inner join public.account_partnerships p on p.account_id = a.id
      where a.id = transactions.account_id
        and a.shared_with_partner = true
        and p.partner_user_id = auth.uid()
    )
  );

-- ============================================================
-- 4. RLS — commitments (extender select y update; insert sigue igual)
-- ============================================================
-- Solo si el commitment tiene account_id no-null Y esa cuenta es
-- compartida, el partner puede verlo/editarlo. Commitments sin
-- account_id (puntuales sin cuenta asociada) siguen privados al
-- creator.

drop policy if exists commitments_select_own on public.commitments;
create policy commitments_select_own_or_partner_account on public.commitments
  for select using (
    auth.uid() = user_id
    OR (
      account_id is not null
      AND exists (
        select 1
        from public.accounts a
        inner join public.account_partnerships p on p.account_id = a.id
        where a.id = commitments.account_id
          and a.shared_with_partner = true
          and p.partner_user_id = auth.uid()
      )
    )
  );

drop policy if exists commitments_update_own on public.commitments;
create policy commitments_update_own_or_partner_account on public.commitments
  for update using (
    auth.uid() = user_id
    OR (
      account_id is not null
      AND exists (
        select 1
        from public.accounts a
        inner join public.account_partnerships p on p.account_id = a.id
        where a.id = commitments.account_id
          and a.shared_with_partner = true
          and p.partner_user_id = auth.uid()
      )
    )
  ) with check (
    auth.uid() = user_id
    OR (
      account_id is not null
      AND exists (
        select 1
        from public.accounts a
        inner join public.account_partnerships p on p.account_id = a.id
        where a.id = commitments.account_id
          and a.shared_with_partner = true
          and p.partner_user_id = auth.uid()
      )
    )
  );

-- INSERT de commitments sigue igual (commitments_insert_own): cada
-- partner crea sus propios commitments con su user_id. Si referencia
-- una cuenta compartida, el otro partner los va a ver via SELECT.

-- ============================================================
-- 5. RLS — account_partnerships
-- ============================================================
-- Lectura: owner de la cuenta + partner pueden ver la fila.
-- Escritura: solo via SECURITY DEFINER functions abajo. El INSERT
-- directo desde el partner fallaria porque no es owner; el flow de
-- accept_account_invitation salta ese check.

alter table public.account_partnerships enable row level security;

create policy account_partnerships_select on public.account_partnerships
  for select using (
    auth.uid() = partner_user_id
    OR exists (
      select 1 from public.accounts
      where id = account_partnerships.account_id
        and user_id = auth.uid()
    )
  );

-- INSERT: solo el owner puede insertar manualmente (por completitud,
-- aunque el flow normal va por la function SECURITY DEFINER).
create policy account_partnerships_insert_owner on public.account_partnerships
  for insert with check (
    exists (
      select 1 from public.accounts
      where id = account_id and user_id = auth.uid()
    )
  );

-- DELETE: owner puede sacar al partner; partner puede salirse solo.
-- (Borrar via DELETE en lugar de soft-delete porque la fila no tiene
-- valor historico — la cuenta vuelve al owner como si nada.)
create policy account_partnerships_delete on public.account_partnerships
  for delete using (
    auth.uid() = partner_user_id
    OR exists (
      select 1 from public.accounts
      where id = account_partnerships.account_id
        and user_id = auth.uid()
    )
  );

-- ============================================================
-- 6. RLS — account_invitations
-- ============================================================
-- El inviter ve sus propias invitaciones. El que tiene el code lo
-- valida via SECURITY DEFINER (no necesita SELECT directo).

alter table public.account_invitations enable row level security;

create policy account_invitations_select_own on public.account_invitations
  for select using (auth.uid() = invited_by);

create policy account_invitations_insert_own on public.account_invitations
  for insert with check (
    auth.uid() = invited_by
    AND exists (
      select 1 from public.accounts
      where id = account_id and user_id = auth.uid()
    )
  );

-- UPDATE solo para revocar (set revoked_at). El accept lo hace la
-- SECURITY DEFINER function, no via RLS directa.
create policy account_invitations_revoke_own on public.account_invitations
  for update using (auth.uid() = invited_by)
            with check (auth.uid() = invited_by);

-- ============================================================
-- 7. SECURITY DEFINER functions
-- ============================================================

-- Acepta una invitacion: el partner pega el code en /settings y
-- esta function valida + crea la partnership + marca la cuenta como
-- compartida + marca la invitacion como aceptada. Atomico.
create or replace function public.accept_account_invitation(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation account_invitations%rowtype;
begin
  -- Auth check (SECURITY DEFINER bypasses RLS but auth.uid() works).
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  -- Buscar invitacion valida.
  select * into v_invitation
  from account_invitations
  where code = p_code
    and accepted_at is null
    and revoked_at is null
    and expires_at > now()
  limit 1;

  if not found then
    raise exception 'invitacion invalida o expirada' using errcode = 'P0002';
  end if;

  -- No puedo aceptar mi propia invitacion (seria yo = partner de mi cuenta).
  if v_invitation.invited_by = auth.uid() then
    raise exception 'no puedes aceptar tu propia invitacion' using errcode = 'P0003';
  end if;

  -- 1 partner por cuenta. Si ya hay uno, el nuevo no puede entrar
  -- aunque tenga el code valido (defensa por si el owner mando el
  -- mismo link a 2 personas).
  if exists (
    select 1 from account_partnerships where account_id = v_invitation.account_id
  ) then
    raise exception 'esta cuenta ya tiene una pareja vinculada' using errcode = 'P0004';
  end if;

  -- Crear partnership.
  insert into account_partnerships (account_id, partner_user_id)
  values (v_invitation.account_id, auth.uid());

  -- Marcar invitacion aceptada.
  update account_invitations
  set accepted_by = auth.uid(),
      accepted_at = now()
  where id = v_invitation.id;

  -- Habilitar la flag de cuenta compartida (si aun no estaba).
  update accounts
  set shared_with_partner = true
  where id = v_invitation.account_id;

  return v_invitation.account_id;
end;
$$;

grant execute on function public.accept_account_invitation(text) to authenticated;

-- Owner saca al partner. Borra la partnership y desmarca la flag.
create or replace function public.revoke_account_partnership(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  -- Solo el owner puede revocar.
  if not exists (
    select 1 from accounts where id = p_account_id and user_id = auth.uid()
  ) then
    raise exception 'no eres el dueno de esta cuenta' using errcode = 'P0005';
  end if;

  delete from account_partnerships where account_id = p_account_id;

  update accounts
  set shared_with_partner = false
  where id = p_account_id;

  -- Tambien revocar invitaciones pendientes de esta cuenta para que
  -- el link viejo no pueda usarse despues.
  update account_invitations
  set revoked_at = now()
  where account_id = p_account_id
    and accepted_at is null
    and revoked_at is null;
end;
$$;

grant execute on function public.revoke_account_partnership(uuid) to authenticated;

-- Partner se sale solo (sin necesitar permiso del owner).
create or replace function public.leave_account_partnership(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'unauthenticated' using errcode = 'P0001';
  end if;

  delete from account_partnerships
  where account_id = p_account_id
    and partner_user_id = auth.uid();

  -- Si despues de borrar no queda ningun partner, desmarcar la flag.
  -- (En v1 hay 1 partner max, asi que esto siempre desmarca; lo dejo
  -- igual con el if not exists para que el dia que soportemos N
  -- partners siga siendo correcto.)
  if not exists (
    select 1 from account_partnerships where account_id = p_account_id
  ) then
    update accounts
    set shared_with_partner = false
    where id = p_account_id;
  end if;
end;
$$;

grant execute on function public.leave_account_partnership(uuid) to authenticated;

-- 00031_account_counterpart_info.sql
-- Function para resolver "el otro" de una cuenta compartida sin que la
-- UI tenga que ramificar owner vs partner ni hacer dos queries
-- distintas. Devuelve siempre el counterpart desde el punto de vista
-- del caller:
--
--   - Si auth.uid() es el owner → counterpart = partner
--   - Si auth.uid() es el partner → counterpart = owner
--
-- get_account_partner_info (00030) sigue siendo util cuando la UI YA
-- sabe que el caller es el owner y solo quiere data del partner; esta
-- es la version simetrica para cualquier participante.
--
-- SECURITY DEFINER porque cruza profiles (RLS profiles_select_own no
-- deja al partner leer el row del owner ni viceversa). Exposicion
-- minima: solo el full_name/display_name del otro, gated por
-- pertenencia al partnership.

create or replace function public.get_account_counterpart_info(p_account_id uuid)
returns table (
  counterpart_user_id uuid,
  counterpart_name text
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_partner_id uuid;
begin
  -- Owner de la cuenta.
  select user_id into v_owner_id
  from accounts
  where id = p_account_id;

  if v_owner_id is null then
    return;
  end if;

  -- Partner (puede no existir si la cuenta no esta compartida todavia).
  select partner_user_id into v_partner_id
  from account_partnerships
  where account_id = p_account_id
  limit 1;

  -- Solo el owner o el partner pueden pedir esta info. Si auth.uid()
  -- no es ninguno de los dos, devolvemos nada (la UI lo trata como
  -- "no compartida" / "sin info").
  if auth.uid() is null then
    return;
  end if;
  if auth.uid() <> v_owner_id and auth.uid() <> v_partner_id then
    return;
  end if;

  -- Resolver el "otro" segun el caller.
  if auth.uid() = v_owner_id then
    -- Soy owner → quiero ver el nombre del partner.
    if v_partner_id is null then
      return;  -- cuenta sin compartir todavia
    end if;
    return query
    select
      v_partner_id,
      coalesce(pr.full_name, pr.display_name, 'Tu pareja') as counterpart_name
    from profiles pr
    where pr.id = v_partner_id
    limit 1;
  else
    -- Soy partner → quiero ver el nombre del owner.
    return query
    select
      v_owner_id,
      coalesce(pr.full_name, pr.display_name, 'El dueño') as counterpart_name
    from profiles pr
    where pr.id = v_owner_id
    limit 1;
  end if;
end;
$$;

grant execute on function public.get_account_counterpart_info(uuid) to authenticated;

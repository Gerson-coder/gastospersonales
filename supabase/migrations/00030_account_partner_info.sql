-- 00030_account_partner_info.sql
-- Function para que la UI del owner pueda mostrar "Compartida con
-- {nombre del partner}" en el badge sin tener que SELECT la fila de
-- profiles del partner (la RLS de profiles_select_own no lo
-- permite).
--
-- SECURITY DEFINER bypassa RLS de profiles. La exposicion es
-- minima: solo full_name del partner, gated por ser miembro del
-- partnership (auth.uid() = partner_user_id O auth.uid() = owner
-- de la cuenta).

create or replace function public.get_account_partner_info(p_account_id uuid)
returns table (
  partner_user_id uuid,
  partner_name text,
  joined_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  -- Solo el owner o el partner pueden pedir esta info.
  if not (
    public.user_owns_account(p_account_id)
    OR exists (
      select 1 from account_partnerships
      where account_id = p_account_id
        and partner_user_id = auth.uid()
    )
  ) then
    return;
  end if;

  return query
  select
    p.partner_user_id,
    coalesce(pr.full_name, pr.display_name, 'Tu pareja') as partner_name,
    p.joined_at
  from account_partnerships p
  left join profiles pr on pr.id = p.partner_user_id
  where p.account_id = p_account_id
  limit 1;
end;
$$;

grant execute on function public.get_account_partner_info(uuid) to authenticated;

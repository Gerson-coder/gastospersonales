-- 00028_invitation_preview.sql
-- Preview metadata de una invitacion sin tener que aceptarla.
-- Devuelve: nombre de la cuenta + nombre del inviter + expires_at.
--
-- Para que el partner pueda ver "quien me invita y a que cuenta"
-- antes de tappear "Aceptar" sin esa info la UX se siente phishy.
-- La RLS de account_invitations no permite SELECT al partner
-- (solo al invited_by), asi que necesitamos esta function
-- SECURITY DEFINER para exponer un subset minimo bajo control.
--
-- Granted a authenticated + anon. La exposicion es limitada:
-- solo info para decidir aceptar, gated por conocer el code (que
-- es un secreto compartido por canal privado por el inviter).

create or replace function public.preview_account_invitation(p_code text)
returns table (
  account_name text,
  inviter_name text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    a.name as account_name,
    coalesce(p.full_name, p.display_name, 'Alguien') as inviter_name,
    i.expires_at
  from account_invitations i
  inner join accounts a on a.id = i.account_id
  left join profiles p on p.id = i.invited_by
  where i.code = p_code
    and i.accepted_at is null
    and i.revoked_at is null
    and i.expires_at > now()
  limit 1;
end;
$$;

grant execute on function public.preview_account_invitation(text) to authenticated;
-- Tambien anonymous: el partner que recibe el link por WhatsApp y
-- aun no tiene sesion en Kane puede ver el preview antes de
-- decidir si crearse cuenta.
grant execute on function public.preview_account_invitation(text) to anon;

begin;

alter table public.partner_team_invitations
  add column if not exists can_manage_hotels boolean not null default false;

comment on column public.partner_team_invitations.can_manage_hotels is
  'Records whether the invitation disclosed and grants scoped draft-property, room, rate, and future-inventory access.';

-- Migration 054 temporarily enabled hotel management for memberships that had
-- accepted an integration-scoped invitation. Require a newly disclosed
-- invitation before restoring the expanded capability.
update public.partner_team_members
set can_manage_hotels = false,
    updated_at = now()
where status = 'active'
  and can_manage_hotels
  and member_role in ('general_manager', 'revenue_manager', 'sales_manager');

create or replace function public.accept_partner_team_invitation(p_invitation_id uuid)
returns table (partner_id uuid, member_role text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_invitation public.partner_team_invitations;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));
  if v_email = '' then
    raise exception 'Authenticated email is unavailable' using errcode = '42501';
  end if;

  select invitation.*
  into v_invitation
  from public.partner_team_invitations as invitation
  where invitation.id = p_invitation_id
  for update;

  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if v_invitation.status <> 'pending' then
    raise exception 'Invitation is no longer pending' using errcode = '22023';
  end if;
  if v_invitation.expires_at <= now() then
    update public.partner_team_invitations as invitation
    set status = 'expired', updated_at = now()
    where invitation.id = v_invitation.id;
    raise exception 'Invitation has expired' using errcode = '22023';
  end if;
  if lower(v_invitation.email) <> v_email then
    raise exception 'Invitation email does not match the signed-in account'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.partners as partner
    where partner.id = v_invitation.partner_id and partner.status = 'approved'
  ) then
    raise exception 'Partner account is not approved' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles as profile
    where profile.id = auth.uid() and profile.role <> 'admin'
  ) then
    raise exception 'A non-admin account is required' using errcode = '42501';
  end if;

  update public.profiles as profile
  set role = 'partner'::public.user_role
  where profile.id = auth.uid();

  insert into public.partner_team_members (
    partner_id, user_id, member_role, status,
    can_manage_integrations, can_manage_hotels, created_by, updated_at
  ) values (
    v_invitation.partner_id, auth.uid(), v_invitation.member_role, 'active',
    true, v_invitation.can_manage_hotels, v_invitation.created_by, now()
  )
  on conflict (partner_id, user_id) do update
  set member_role = excluded.member_role,
      status = 'active',
      can_manage_integrations = true,
      can_manage_hotels = excluded.can_manage_hotels,
      updated_at = now();

  update public.partner_team_invitations as invitation
  set status = 'accepted',
      accepted_by = auth.uid(),
      accepted_at = now(),
      updated_at = now()
  where invitation.id = v_invitation.id;

  return query
  select v_invitation.partner_id, v_invitation.member_role;
end;
$$;

revoke all on function public.accept_partner_team_invitation(uuid)
  from public, anon, service_role;
grant execute on function public.accept_partner_team_invitation(uuid) to authenticated;

commit;

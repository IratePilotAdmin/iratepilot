begin;

create table if not exists public.partner_team_access_events (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete restrict,
  event_type text not null check (event_type in (
    'invitation_revoked', 'member_disabled'
  )),
  invitation_id uuid references public.partner_team_invitations(id) on delete restrict,
  member_id uuid references public.partner_team_members(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (
    (event_type = 'invitation_revoked' and invitation_id is not null and member_id is null)
    or (event_type = 'member_disabled' and member_id is not null and invitation_id is null)
  )
);

comment on table public.partner_team_access_events is
  'Immutable owner/admin audit events for partner integration-access revocation.';

create index if not exists partner_team_access_events_partner_idx
  on public.partner_team_access_events (partner_id, created_at desc);

alter table public.partner_team_access_events enable row level security;

drop policy if exists "Partner owners view access events" on public.partner_team_access_events;
create policy "Partner owners view access events"
  on public.partner_team_access_events for select to authenticated
  using (exists (
    select 1 from public.partners
    where partners.id = partner_team_access_events.partner_id
      and partners.owner_id = auth.uid()
  ));

drop policy if exists "Admins view access events" on public.partner_team_access_events;
create policy "Admins view access events"
  on public.partner_team_access_events for select to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));

revoke all on table public.partner_team_access_events from anon, authenticated;
grant select on table public.partner_team_access_events to authenticated;

create or replace function public.list_own_partner_team_members()
returns table (
  member_id uuid,
  member_email text,
  member_role text,
  member_status text,
  can_manage_integrations boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    partner_team_members.id,
    lower(coalesce(auth.users.email, '')),
    partner_team_members.member_role,
    partner_team_members.status,
    partner_team_members.can_manage_integrations,
    partner_team_members.updated_at
  from public.partner_team_members
  join public.partners on partners.id = partner_team_members.partner_id
  join auth.users on auth.users.id = partner_team_members.user_id
  where partners.owner_id = auth.uid()
    and partners.status = 'approved'
  order by partner_team_members.updated_at desc, partner_team_members.id;
$$;

create or replace function public.revoke_own_partner_team_invitation(p_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner_id uuid;
begin
  select partner_team_invitations.partner_id
  into v_partner_id
  from public.partner_team_invitations
  join public.partners on partners.id = partner_team_invitations.partner_id
  where partner_team_invitations.id = p_invitation_id
    and partner_team_invitations.status = 'pending'
    and partners.owner_id = auth.uid()
    and partners.status = 'approved'
  for update of partner_team_invitations;

  if v_partner_id is null then
    return false;
  end if;

  update public.partner_team_invitations
  set status = 'revoked', updated_at = now()
  where id = p_invitation_id;

  insert into public.partner_team_access_events (
    partner_id, event_type, invitation_id, actor_id
  ) values (
    v_partner_id, 'invitation_revoked', p_invitation_id, auth.uid()
  );
  return true;
end;
$$;

create or replace function public.disable_own_partner_team_member(p_member_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partner_id uuid;
begin
  select partner_team_members.partner_id
  into v_partner_id
  from public.partner_team_members
  join public.partners on partners.id = partner_team_members.partner_id
  where partner_team_members.id = p_member_id
    and partner_team_members.status = 'active'
    and partner_team_members.can_manage_integrations
    and partners.owner_id = auth.uid()
    and partners.status = 'approved'
  for update of partner_team_members;

  if v_partner_id is null then
    return false;
  end if;

  update public.partner_team_members
  set status = 'disabled',
      can_manage_integrations = false,
      updated_at = now()
  where id = p_member_id;

  insert into public.partner_team_access_events (
    partner_id, event_type, member_id, actor_id
  ) values (
    v_partner_id, 'member_disabled', p_member_id, auth.uid()
  );
  return true;
end;
$$;

revoke all on function public.list_own_partner_team_members()
  from public, anon, service_role;
grant execute on function public.list_own_partner_team_members() to authenticated;
revoke all on function public.revoke_own_partner_team_invitation(uuid)
  from public, anon, service_role;
grant execute on function public.revoke_own_partner_team_invitation(uuid) to authenticated;
revoke all on function public.disable_own_partner_team_member(uuid)
  from public, anon, service_role;
grant execute on function public.disable_own_partner_team_member(uuid) to authenticated;

commit;

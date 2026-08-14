begin;

create table if not exists public.partner_team_invitations (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  email text not null check (
    email = lower(trim(email))
    and length(email) between 3 and 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  member_role text not null check (member_role in (
    'general_manager', 'revenue_manager', 'sales_manager'
  )),
  status text not null default 'pending' check (status in (
    'pending', 'accepted', 'revoked', 'expired'
  )),
  created_by uuid not null references public.profiles(id) on delete restrict,
  accepted_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (
    (status = 'accepted' and accepted_by is not null and accepted_at is not null)
    or (status <> 'accepted' and accepted_at is null)
  )
);

comment on table public.partner_team_invitations is
  'Email-bound partner-team invitations. No bearer token or credential is stored; acceptance requires a matching authenticated email.';

create unique index if not exists partner_team_invitations_pending_email_idx
  on public.partner_team_invitations (partner_id, email)
  where status = 'pending';
create index if not exists partner_team_invitations_expiry_idx
  on public.partner_team_invitations (status, expires_at);

alter table public.partner_team_invitations enable row level security;

drop policy if exists "Partner owners view team invitations" on public.partner_team_invitations;
create policy "Partner owners view team invitations"
  on public.partner_team_invitations for select to authenticated
  using (exists (
    select 1 from public.partners
    where partners.id = partner_team_invitations.partner_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ));

drop policy if exists "Partner owners create team invitations" on public.partner_team_invitations;
create policy "Partner owners create team invitations"
  on public.partner_team_invitations for insert to authenticated
  with check (
    status = 'pending'
    and created_by = auth.uid()
    and accepted_by is null
    and accepted_at is null
    and expires_at > now()
    and expires_at <= now() + interval '8 days'
    and exists (
      select 1 from public.partners
      where partners.id = partner_team_invitations.partner_id
        and partners.owner_id = auth.uid()
        and partners.status = 'approved'
    )
  );

drop policy if exists "Admins manage team invitations" on public.partner_team_invitations;
create policy "Admins manage team invitations"
  on public.partner_team_invitations for all to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));

revoke all on table public.partner_team_invitations from anon;
grant select, insert on table public.partner_team_invitations to authenticated;

create or replace function public.expire_own_partner_team_invitations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.partner_team_invitations
  set status = 'expired', updated_at = now()
  where status = 'pending'
    and expires_at <= now()
    and exists (
      select 1 from public.partners
      where partners.id = partner_team_invitations.partner_id
        and partners.owner_id = auth.uid()
        and partners.status = 'approved'
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.accept_partner_team_invitation(p_invitation_id uuid)
returns table (partner_id uuid, member_role text)
language plpgsql
security definer
set search_path = public
as $$
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

  select *
  into v_invitation
  from public.partner_team_invitations
  where id = p_invitation_id
  for update;

  if not found then
    raise exception 'Invitation not found' using errcode = 'P0002';
  end if;
  if v_invitation.status <> 'pending' then
    raise exception 'Invitation is no longer pending' using errcode = '22023';
  end if;
  if v_invitation.expires_at <= now() then
    update public.partner_team_invitations
    set status = 'expired', updated_at = now()
    where id = v_invitation.id;
    raise exception 'Invitation has expired' using errcode = '22023';
  end if;
  if lower(v_invitation.email) <> v_email then
    raise exception 'Invitation email does not match the signed-in account'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.partners
    where id = v_invitation.partner_id and status = 'approved'
  ) then
    raise exception 'Partner account is not approved' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role <> 'admin'
  ) then
    raise exception 'A non-admin account is required' using errcode = '42501';
  end if;

  update public.profiles
  set role = 'partner'::public.user_role
  where id = auth.uid();

  insert into public.partner_team_members (
    partner_id, user_id, member_role, status,
    can_manage_integrations, created_by, updated_at
  ) values (
    v_invitation.partner_id, auth.uid(), v_invitation.member_role, 'active',
    true, v_invitation.created_by, now()
  )
  on conflict (partner_id, user_id) do update
  set member_role = excluded.member_role,
      status = 'active',
      can_manage_integrations = true,
      updated_at = now();

  update public.partner_team_invitations
  set status = 'accepted',
      accepted_by = auth.uid(),
      accepted_at = now(),
      updated_at = now()
  where id = v_invitation.id;

  return query
  select v_invitation.partner_id, v_invitation.member_role;
end;
$$;

revoke all on function public.accept_partner_team_invitation(uuid)
  from public, anon, service_role;
grant execute on function public.accept_partner_team_invitation(uuid) to authenticated;
revoke all on function public.expire_own_partner_team_invitations()
  from public, anon, service_role;
grant execute on function public.expire_own_partner_team_invitations() to authenticated;

commit;

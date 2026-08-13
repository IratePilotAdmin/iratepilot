begin;

create table if not exists public.partner_team_members (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null check (member_role in (
    'general_manager', 'revenue_manager', 'sales_manager'
  )),
  status text not null default 'active' check (status in ('active', 'disabled')),
  can_manage_integrations boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_id, user_id)
);

comment on table public.partner_team_members is
  'Admin-provisioned partner-team RBAC. Phase 46 adds no invitation or automatic activation path.';
comment on column public.partner_team_members.can_manage_integrations is
  'Allows non-secret PMS/CRS declaration work only; never grants admin certification or live-traffic controls.';

create index if not exists partner_team_members_user_access_idx
  on public.partner_team_members (user_id, status, can_manage_integrations);

alter table public.partner_team_members enable row level security;

drop policy if exists "Team members view own access" on public.partner_team_members;
create policy "Team members view own access"
  on public.partner_team_members for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Partner owners view team access" on public.partner_team_members;
create policy "Partner owners view team access"
  on public.partner_team_members for select to authenticated
  using (exists (
    select 1 from public.partners
    where partners.id = partner_team_members.partner_id
      and partners.owner_id = auth.uid()
  ));

drop policy if exists "Admins manage partner team access" on public.partner_team_members;
create policy "Admins manage partner team access"
  on public.partner_team_members for all to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));

revoke all on table public.partner_team_members from anon;
grant select, insert, update, delete on table public.partner_team_members to authenticated;

create or replace function public.can_manage_partner_integrations(p_partner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.partners
    where partners.id = p_partner_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ) or exists (
    select 1
    from public.partner_team_members
    join public.partners on partners.id = partner_team_members.partner_id
    join public.profiles on profiles.id = partner_team_members.user_id
    where partner_team_members.partner_id = p_partner_id
      and partner_team_members.user_id = auth.uid()
      and partner_team_members.status = 'active'
      and partner_team_members.can_manage_integrations
      and partners.status = 'approved'
      and profiles.role = 'partner'
  );
$$;

create or replace function public.resolve_partner_integration_access()
returns table (resolved_partner_id uuid, access_role text)
language sql
stable
security definer
set search_path = public
as $$
  select candidate.partner_id, candidate.access_role
  from (
    select partners.id as partner_id, 'owner'::text as access_role, 0 as priority
    from public.partners
    where partners.owner_id = auth.uid()
      and partners.status = 'approved'
    union all
    select partner_team_members.partner_id,
      partner_team_members.member_role as access_role,
      1 as priority
    from public.partner_team_members
    join public.partners on partners.id = partner_team_members.partner_id
    join public.profiles on profiles.id = partner_team_members.user_id
    where partner_team_members.user_id = auth.uid()
      and partner_team_members.status = 'active'
      and partner_team_members.can_manage_integrations
      and partners.status = 'approved'
      and profiles.role = 'partner'
  ) as candidate
  order by candidate.priority, candidate.partner_id
  limit 1;
$$;

revoke all on function public.can_manage_partner_integrations(uuid)
  from public, anon, service_role;
grant execute on function public.can_manage_partner_integrations(uuid) to authenticated;
revoke all on function public.resolve_partner_integration_access()
  from public, anon, service_role;
grant execute on function public.resolve_partner_integration_access() to authenticated;

drop policy if exists "Partner integration managers view properties" on public.properties;
create policy "Partner integration managers view properties"
  on public.properties for select to authenticated
  using (public.can_manage_partner_integrations(partner_id));

drop policy if exists "Partners view own SynXis requests" on public.property_synxis_onboarding_requests;
create policy "Partner integration managers view SynXis requests"
  on public.property_synxis_onboarding_requests for select to authenticated
  using (exists (
    select 1 from public.properties
    where properties.id = property_synxis_onboarding_requests.property_id
      and public.can_manage_partner_integrations(properties.partner_id)
  ));

drop policy if exists "Partners create own SynXis requests" on public.property_synxis_onboarding_requests;
create policy "Partner integration managers create SynXis requests"
  on public.property_synxis_onboarding_requests for insert to authenticated
  with check (
    connection_status = 'vendor_approval_pending'
    and last_validated_at is null
    and requested_by = auth.uid()
    and hotel_authorized
    and exists (
      select 1 from public.properties
      where properties.id = property_synxis_onboarding_requests.property_id
        and public.can_manage_partner_integrations(properties.partner_id)
    )
  );

drop policy if exists "Partners update pending SynXis requests" on public.property_synxis_onboarding_requests;
create policy "Partner integration managers update pending SynXis requests"
  on public.property_synxis_onboarding_requests for update to authenticated
  using (
    connection_status = 'vendor_approval_pending'
    and exists (
      select 1 from public.properties
      where properties.id = property_synxis_onboarding_requests.property_id
        and public.can_manage_partner_integrations(properties.partner_id)
    )
  )
  with check (
    connection_status = 'vendor_approval_pending'
    and last_validated_at is null
    and requested_by = auth.uid()
    and hotel_authorized
    and exists (
      select 1 from public.properties
      where properties.id = property_synxis_onboarding_requests.property_id
        and public.can_manage_partner_integrations(properties.partner_id)
    )
  );

commit;

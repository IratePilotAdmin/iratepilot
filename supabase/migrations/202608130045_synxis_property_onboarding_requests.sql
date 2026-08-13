begin;

create table if not exists public.property_synxis_onboarding_requests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  synxis_hotel_id text not null check (
    length(trim(synxis_hotel_id)) between 1 and 120
    and synxis_hotel_id ~ '^[A-Za-z0-9._:/-]+$'
  ),
  requester_role text not null check (requester_role in (
    'hotel_owner', 'general_manager', 'revenue_manager', 'sales_manager'
  )),
  hotel_authorized boolean not null check (hotel_authorized),
  connection_status text not null default 'vendor_approval_pending' check (connection_status in (
    'vendor_approval_pending', 'mapping_pending', 'certification_pending',
    'ready', 'disabled'
  )),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  last_validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id)
);

comment on table public.property_synxis_onboarding_requests is
  'Non-secret, per-property requests to onboard an authorized hotel to Sabre SynXis CRS. Credentials are prohibited.';
comment on column public.property_synxis_onboarding_requests.requester_role is
  'Hotel representative role declared by the authenticated partner account; this is not delegated account authorization.';

create index if not exists property_synxis_onboarding_status_idx
  on public.property_synxis_onboarding_requests (connection_status, updated_at desc);

alter table public.property_synxis_onboarding_requests enable row level security;

drop policy if exists "Partners view own SynXis requests" on public.property_synxis_onboarding_requests;
create policy "Partners view own SynXis requests"
  on public.property_synxis_onboarding_requests for select to authenticated
  using (exists (
    select 1
    from public.properties
    join public.partners on partners.id = properties.partner_id
    where properties.id = property_synxis_onboarding_requests.property_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ));

drop policy if exists "Partners create own SynXis requests" on public.property_synxis_onboarding_requests;
create policy "Partners create own SynXis requests"
  on public.property_synxis_onboarding_requests for insert to authenticated
  with check (
    connection_status = 'vendor_approval_pending'
    and last_validated_at is null
    and requested_by = auth.uid()
    and hotel_authorized
    and exists (
      select 1
      from public.properties
      join public.partners on partners.id = properties.partner_id
      where properties.id = property_synxis_onboarding_requests.property_id
        and partners.owner_id = auth.uid()
        and partners.status = 'approved'
    )
  );

drop policy if exists "Partners update pending SynXis requests" on public.property_synxis_onboarding_requests;
create policy "Partners update pending SynXis requests"
  on public.property_synxis_onboarding_requests for update to authenticated
  using (
    connection_status = 'vendor_approval_pending'
    and exists (
      select 1
      from public.properties
      join public.partners on partners.id = properties.partner_id
      where properties.id = property_synxis_onboarding_requests.property_id
        and partners.owner_id = auth.uid()
        and partners.status = 'approved'
    )
  )
  with check (
    connection_status = 'vendor_approval_pending'
    and last_validated_at is null
    and requested_by = auth.uid()
    and hotel_authorized
    and exists (
      select 1
      from public.properties
      join public.partners on partners.id = properties.partner_id
      where properties.id = property_synxis_onboarding_requests.property_id
        and partners.owner_id = auth.uid()
        and partners.status = 'approved'
    )
  );

drop policy if exists "Admins manage SynXis property requests" on public.property_synxis_onboarding_requests;
create policy "Admins manage SynXis property requests"
  on public.property_synxis_onboarding_requests for all to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));

revoke all on table public.property_synxis_onboarding_requests from anon;
grant select, insert, update on table public.property_synxis_onboarding_requests to authenticated;

commit;

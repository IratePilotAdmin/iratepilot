begin;

create table if not exists public.property_pms_connections (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  provider_id text not null check (provider_id in (
    'oracle-opera', 'hilton-pep', 'hilton-onq', 'marriott-fosse',
    'marriott-fs-pms', 'hotelkey', 'oracle-opera-5', 'infor-hms',
    'agilysys-pms', 'planet-protel', 'mews', 'stayntouch', 'cloudbeds',
    'sihot', 'rms-cloud', 'maestro-pms', 'apaleo', 'shiji-pms',
    'guestline', 'ezee-absolute', 'clock-pms-plus', 'hotelogix'
  )),
  external_property_code text not null check (
    length(trim(external_property_code)) between 1 and 120
  ),
  connection_status text not null default 'declared' check (connection_status in (
    'declared', 'credentials_pending', 'sandbox', 'validated', 'active', 'disabled'
  )),
  last_validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id)
);

comment on table public.property_pms_connections is
  'Non-secret PMS declarations and validation state. API credentials must remain in server-side environment configuration.';

create index if not exists property_pms_connections_provider_idx
  on public.property_pms_connections (provider_id, connection_status);

alter table public.property_pms_connections enable row level security;

drop policy if exists "Partners view own PMS connection" on public.property_pms_connections;
create policy "Partners view own PMS connection"
  on public.property_pms_connections for select to authenticated
  using (exists (
    select 1
    from public.properties
    join public.partners on partners.id = properties.partner_id
    where properties.id = property_pms_connections.property_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ));

drop policy if exists "Partners declare own PMS connection" on public.property_pms_connections;
create policy "Partners declare own PMS connection"
  on public.property_pms_connections for insert to authenticated
  with check (
    connection_status in ('declared', 'credentials_pending')
    and last_validated_at is null
    and exists (
      select 1
      from public.properties
      join public.partners on partners.id = properties.partner_id
      where properties.id = property_pms_connections.property_id
        and partners.owner_id = auth.uid()
        and partners.status = 'approved'
    )
  );

drop policy if exists "Partners update own PMS declaration" on public.property_pms_connections;
create policy "Partners update own PMS declaration"
  on public.property_pms_connections for update to authenticated
  using (exists (
    select 1
    from public.properties
    join public.partners on partners.id = properties.partner_id
    where properties.id = property_pms_connections.property_id
      and partners.owner_id = auth.uid()
      and partners.status = 'approved'
  ))
  with check (
    connection_status in ('declared', 'credentials_pending')
    and last_validated_at is null
    and exists (
      select 1
      from public.properties
      join public.partners on partners.id = properties.partner_id
      where properties.id = property_pms_connections.property_id
        and partners.owner_id = auth.uid()
        and partners.status = 'approved'
    )
  );

drop policy if exists "Admins manage PMS connections" on public.property_pms_connections;
create policy "Admins manage PMS connections"
  on public.property_pms_connections for all to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));

revoke all on table public.property_pms_connections from anon;
grant select, insert, update on table public.property_pms_connections to authenticated;

commit;

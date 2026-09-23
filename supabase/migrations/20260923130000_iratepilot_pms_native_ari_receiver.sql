begin;

-- Inbound PMS -> iRatePilot.com availability/rate receiver. Connections and
-- mappings are installed disabled. The web runtime verifies HMAC with the
-- encrypted secret, then calls the service-only atomic apply function below.
create table public.irp_pms_native_ari_connections (
  connection_id text primary key check (connection_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  property_id uuid not null references public.properties(id) on delete cascade,
  pms_property_id text not null check (length(trim(pms_property_id)) between 1 and 128),
  secret_ciphertext text not null check (length(secret_ciphertext) > 20),
  secret_initialization_vector text not null check (length(secret_initialization_vector) > 10),
  secret_authentication_tag text not null check (length(secret_authentication_tag) > 10),
  secret_key_version integer not null default 1 check (secret_key_version > 0),
  enabled boolean not null default false,
  latest_source_version bigint not null default 0 check (latest_source_version between 0 and 9007199254740991),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (property_id, connection_id)
);

create table public.irp_pms_native_ari_mappings (
  connection_id text not null references public.irp_pms_native_ari_connections(connection_id) on delete cascade,
  pms_room_type_id text not null check (pms_room_type_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  pms_rate_plan_id text not null check (pms_rate_plan_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  ota_room_id uuid not null references public.rooms(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (connection_id, pms_room_type_id, pms_rate_plan_id),
  unique (connection_id, ota_room_id)
);

create table public.irp_pms_native_ari_events (
  connection_id text not null references public.irp_pms_native_ari_connections(connection_id) on delete cascade,
  event_id text not null check (event_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  source_version bigint not null check (source_version between 1 and 9007199254740991),
  payload_digest text not null check (payload_digest ~ '^[a-f0-9]{64}$'),
  generated_at timestamptz not null,
  received_at timestamptz not null default now(),
  primary key (connection_id, event_id),
  unique (connection_id, source_version)
);

create table public.irp_pms_native_ari_audit (
  id bigint generated always as identity primary key,
  connection_id text not null references public.irp_pms_native_ari_connections(connection_id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('configuration_saved','enabled','disabled')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

alter table public.irp_pms_native_ari_connections enable row level security;
alter table public.irp_pms_native_ari_mappings enable row level security;
alter table public.irp_pms_native_ari_events enable row level security;
alter table public.irp_pms_native_ari_audit enable row level security;
revoke all on public.irp_pms_native_ari_connections, public.irp_pms_native_ari_mappings,
  public.irp_pms_native_ari_events, public.irp_pms_native_ari_audit from public, anon, authenticated;
grant select, insert, update, delete on public.irp_pms_native_ari_connections,
  public.irp_pms_native_ari_mappings to service_role;
grant select, insert on public.irp_pms_native_ari_events to service_role;
grant select, insert on public.irp_pms_native_ari_audit to service_role;
grant usage, select on sequence public.irp_pms_native_ari_audit_id_seq to service_role;

create function public.irp_pms_apply_native_ari(
  p_connection text,
  p_event text,
  p_source_version bigint,
  p_payload_digest text,
  p_generated_at timestamptz,
  p_updates jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.irp_pms_native_ari_connections%rowtype;
  prior public.irp_pms_native_ari_events%rowtype;
  item jsonb;
  mapped_room uuid;
  stay_day date;
  sellable integer;
  outstanding integer;
  update_count integer;
begin
  if p_connection is null or p_connection !~ '^[A-Za-z0-9_-]{1,80}$'
     or p_event is null or p_event !~ '^[A-Za-z0-9_-]{1,128}$'
     or p_source_version is null or p_source_version not between 1 and 9007199254740991
     or p_payload_digest is null or p_payload_digest !~ '^[a-f0-9]{64}$'
     or p_generated_at is null or p_generated_at > clock_timestamp() + interval '5 minutes'
     or p_updates is null or jsonb_typeof(p_updates) <> 'array' then
    raise exception 'Invalid ARI envelope' using errcode = '22023';
  end if;
  update_count := jsonb_array_length(p_updates);
  if update_count not between 1 and 366 then
    raise exception 'Invalid ARI update count' using errcode = '22023';
  end if;

  select * into c from public.irp_pms_native_ari_connections
   where connection_id = p_connection for update;
  if not found or not c.enabled then
    raise exception 'ARI connection disabled' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.properties p join public.partners h on h.id = p.partner_id
     where p.id = c.property_id and p.active and h.status = 'approved'
  ) then raise exception 'OTA property is not active' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.irp_pms_outbox_connections source
     where source.property_id = c.property_id and source.connection_id = p_connection
       and source.pms_property_id = c.pms_property_id and source.enabled
  ) then raise exception 'PMS reservation synchronization is not enabled for this property' using errcode = '42501'; end if;

  select * into prior from public.irp_pms_native_ari_events
   where connection_id = p_connection and event_id = p_event for update;
  if found then
    if prior.event_id = p_event and prior.source_version = p_source_version
       and prior.payload_digest = p_payload_digest then
      return jsonb_build_object('outcome', 'duplicate');
    end if;
    raise exception 'ARI event conflict' using errcode = '23505';
  end if;
  if exists(select 1 from public.irp_pms_native_ari_events
    where connection_id = p_connection and source_version = p_source_version) then
    raise exception 'ARI source version conflict' using errcode = '23505';
  end if;
  if p_source_version <= c.latest_source_version then
    raise exception 'ARI source version is stale' using errcode = '23505';
  end if;

  for item in select value from jsonb_array_elements(p_updates) loop
    if jsonb_typeof(item) <> 'object'
       or exists(select 1 from jsonb_object_keys(item) k where k not in
         ('date','roomTypeId','ratePlanId','available','rateMinor','currency','minimumStay','maximumStay','restrictions'))
       or (select count(*) from jsonb_object_keys(item)) <> 9
       or coalesce(item->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or coalesce(item->>'roomTypeId','') !~ '^[A-Za-z0-9_-]{1,128}$'
       or coalesce(item->>'ratePlanId','') !~ '^[A-Za-z0-9_-]{1,128}$'
       or coalesce(item->>'available','') !~ '^[0-9]+$'
       or (item->>'available')::numeric not between 0 and 500
       or coalesce(item->>'rateMinor','') !~ '^[0-9]+$'
       or (item->>'rateMinor')::numeric not between 2500 and 2500000
       or item->>'currency' <> 'USD'
       or item->>'minimumStay' <> '1'
       or item->'maximumStay' <> 'null'::jsonb
       or jsonb_typeof(item->'restrictions') <> 'array'
       or jsonb_array_length(item->'restrictions') <> 0 then
      raise exception 'Invalid or unsupported ARI update' using errcode = '22023';
    end if;

    stay_day := (item->>'date')::date;
    if stay_day < current_date or stay_day > current_date + 366 then
      raise exception 'ARI date outside sellable window' using errcode = '22023';
    end if;
    select m.ota_room_id into mapped_room
      from public.irp_pms_native_ari_mappings m
      join public.rooms r on r.id = m.ota_room_id and r.property_id = c.property_id and r.active
     where m.connection_id = p_connection
       and m.pms_room_type_id = item->>'roomTypeId'
       and m.pms_rate_plan_id = item->>'ratePlanId';
    if mapped_room is null then raise exception 'ARI room or rate mapping missing' using errcode = '23503'; end if;

    -- Lock inventory before taking a fresh statement snapshot of undelivered
    -- OTA reservations. This preserves marketplace holds that the PMS has not
    -- acknowledged yet and serializes against concurrent booking decrements.
    perform 1 from public.inventory where room_id = mapped_room and stay_date = stay_day for update;
    select count(*)::integer into outstanding
      from public.bookings b
      join public.irp_pms_booking_versions v on v.booking_id = b.id
      join public.irp_pms_outbox o on o.booking_id = v.booking_id and o.source_version = v.version
     where b.property_id = c.property_id and b.room_id = mapped_room
       and b.status in ('pending','confirmed') and b.check_in <= stay_day and b.check_out > stay_day
       and o.property_id = c.property_id and o.connection_id = p_connection and o.state <> 'delivered';
    sellable := greatest(0, (item->>'available')::integer - outstanding);
    insert into public.inventory(room_id, stay_date, available_units, rate)
      values(mapped_room, stay_day, sellable, (item->>'rateMinor')::numeric / 100)
    on conflict(room_id, stay_date) do update set
      available_units = excluded.available_units,
      rate = excluded.rate;
  end loop;

  insert into public.irp_pms_native_ari_events(connection_id,event_id,source_version,payload_digest,generated_at)
   values(p_connection,p_event,p_source_version,p_payload_digest,p_generated_at);
  update public.irp_pms_native_ari_connections
   set latest_source_version = p_source_version, updated_at = now()
   where connection_id = p_connection;
  return jsonb_build_object('outcome','applied');
end;
$$;

create function public.irp_pms_save_native_ari_connection(
  p_actor uuid,
  p_connection text,
  p_property uuid,
  p_pms_property text,
  p_secret_ciphertext text,
  p_secret_iv text,
  p_secret_tag text,
  p_secret_key_version integer,
  p_mappings jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  existing public.irp_pms_native_ari_connections%rowtype;
  item jsonb;
  mapping_count integer;
begin
  if p_actor is null or not exists(select 1 from public.profiles where id=p_actor and role='admin') then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  if p_connection is null or p_connection !~ '^[A-Za-z0-9_-]{1,80}$'
     or p_property is null or p_pms_property is null or length(trim(p_pms_property)) not between 1 and 128
     or p_secret_ciphertext is null or length(p_secret_ciphertext) not between 21 and 8192
     or p_secret_iv is null or length(p_secret_iv) not between 11 and 128
     or p_secret_tag is null or length(p_secret_tag) not between 11 and 128
     or p_secret_key_version is null or p_secret_key_version < 1
     or p_mappings is null or jsonb_typeof(p_mappings) <> 'array' then
    raise exception 'Invalid native ARI connection configuration' using errcode = '22023';
  end if;
  mapping_count := jsonb_array_length(p_mappings);
  if mapping_count not between 1 and 200 then
    raise exception 'Native ARI needs 1 to 200 explicit mappings' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.properties p join public.partners h on h.id = p.partner_id
     where p.id = p_property and p.active and h.status = 'approved'
  ) then raise exception 'Property is not active and approved' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.irp_pms_outbox_connections source
     where source.property_id = p_property and source.connection_id = p_connection
       and source.pms_property_id = p_pms_property and source.enabled
  ) then raise exception 'Matching PMS reservation connection must be enabled first' using errcode = '42501'; end if;

  select * into existing from public.irp_pms_native_ari_connections
   where connection_id = p_connection for update;
  if found and existing.property_id <> p_property then
    raise exception 'A native ARI connection cannot move between properties' using errcode = '23505';
  end if;
  if found and existing.pms_property_id <> p_pms_property
     and exists(select 1 from public.irp_pms_native_ari_events where connection_id = p_connection) then
    raise exception 'A used native ARI connection cannot change PMS property identity' using errcode = '23505';
  end if;

  for item in select value from jsonb_array_elements(p_mappings) loop
    if jsonb_typeof(item) <> 'object'
       or (select count(*) from jsonb_object_keys(item)) <> 3
       or exists(select 1 from jsonb_object_keys(item) k where k not in ('roomTypeId','ratePlanId','otaRoomId'))
       or coalesce(item->>'roomTypeId','') !~ '^[A-Za-z0-9_-]{1,128}$'
       or coalesce(item->>'ratePlanId','') !~ '^[A-Za-z0-9_-]{1,128}$'
       or coalesce(item->>'otaRoomId','') !~ '^[0-9a-fA-F-]{36}$' then
      raise exception 'Invalid native ARI mapping' using errcode = '22023';
    end if;
    if not exists(select 1 from public.rooms where id = (item->>'otaRoomId')::uuid
      and property_id = p_property and active) then
      raise exception 'Mapped marketplace room must belong to this active property' using errcode = '23503';
    end if;
  end loop;

  insert into public.irp_pms_native_ari_connections(
    connection_id,property_id,pms_property_id,secret_ciphertext,secret_initialization_vector,
    secret_authentication_tag,secret_key_version,enabled)
  values(p_connection,p_property,p_pms_property,p_secret_ciphertext,p_secret_iv,
    p_secret_tag,p_secret_key_version,false)
  on conflict(connection_id) do update set
    pms_property_id = excluded.pms_property_id,
    secret_ciphertext = excluded.secret_ciphertext,
    secret_initialization_vector = excluded.secret_initialization_vector,
    secret_authentication_tag = excluded.secret_authentication_tag,
    secret_key_version = excluded.secret_key_version,
    enabled = false,
    updated_at = now();

  delete from public.irp_pms_native_ari_mappings where connection_id = p_connection;
  insert into public.irp_pms_native_ari_mappings(connection_id,pms_room_type_id,pms_rate_plan_id,ota_room_id)
    select p_connection, x.value->>'roomTypeId', x.value->>'ratePlanId', (x.value->>'otaRoomId')::uuid
      from jsonb_array_elements(p_mappings) as x(value);
  insert into public.irp_pms_native_ari_audit(connection_id,actor_id,action,details)
    values(p_connection,p_actor,'configuration_saved',jsonb_build_object(
      'property_id',p_property,
      'pms_property_id',p_pms_property,
      'mapping_count',mapping_count,
      'previously_enabled',coalesce(existing.enabled,false),
      'enabled',false
    ));
  return jsonb_build_object('connectionId',p_connection,'enabled',false,'mappingCount',mapping_count);
end;
$$;

create function public.irp_pms_set_native_ari_connection_enabled(
  p_actor uuid,
  p_connection text,
  p_enabled boolean
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  c public.irp_pms_native_ari_connections%rowtype;
  mapping_count integer;
  invalid_room_count integer;
begin
  if p_actor is null or not exists(select 1 from public.profiles where id=p_actor and role='admin') then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  if p_connection is null or p_connection !~ '^[A-Za-z0-9_-]{1,80}$' or p_enabled is null then
    raise exception 'Invalid native ARI activation request' using errcode = '22023';
  end if;

  select * into c from public.irp_pms_native_ari_connections
   where connection_id=p_connection for update;
  if not found then raise exception 'Native ARI connection not found' using errcode = 'P0002'; end if;

  if p_enabled then
    if not exists (
      select 1 from public.properties p join public.partners h on h.id=p.partner_id
       where p.id=c.property_id and p.active and h.status='approved'
    ) then raise exception 'Property is not active and approved' using errcode = '42501'; end if;
    if not exists (
      select 1 from public.irp_pms_outbox_connections s
       where s.connection_id=p_connection and s.property_id=c.property_id
         and s.pms_property_id=c.pms_property_id and s.enabled
    ) then raise exception 'Matching PMS reservation connection must be enabled first' using errcode = '42501'; end if;
    select count(*),count(*) filter(where r.id is null or not r.active or r.property_id<>c.property_id)
      into mapping_count,invalid_room_count
      from public.irp_pms_native_ari_mappings m
      left join public.rooms r on r.id=m.ota_room_id
     where m.connection_id=p_connection;
    if mapping_count<1 or invalid_room_count>0 then
      raise exception 'At least one valid active property room mapping is required' using errcode = '23503';
    end if;
  end if;

  update public.irp_pms_native_ari_connections set enabled=p_enabled,updated_at=now()
   where connection_id=p_connection;
  insert into public.irp_pms_native_ari_audit(connection_id,actor_id,action,details)
    values(p_connection,p_actor,case when p_enabled then 'enabled' else 'disabled' end,
      jsonb_build_object('property_id',c.property_id,'pms_property_id',c.pms_property_id,'enabled',p_enabled));
  return jsonb_build_object('connectionId',p_connection,'enabled',p_enabled,'updatedAt',now());
end;
$$;

revoke all on function public.irp_pms_apply_native_ari(text,text,bigint,text,timestamptz,jsonb)
  from public, anon, authenticated;
grant execute on function public.irp_pms_apply_native_ari(text,text,bigint,text,timestamptz,jsonb)
  to service_role;
revoke all on function public.irp_pms_save_native_ari_connection(uuid,text,uuid,text,text,text,text,integer,jsonb)
  from public, anon, authenticated;
grant execute on function public.irp_pms_save_native_ari_connection(uuid,text,uuid,text,text,text,text,integer,jsonb)
  to service_role;
revoke all on function public.irp_pms_set_native_ari_connection_enabled(uuid,text,boolean)
  from public, anon, authenticated;
grant execute on function public.irp_pms_set_native_ari_connection_enabled(uuid,text,boolean)
  to service_role;

commit;

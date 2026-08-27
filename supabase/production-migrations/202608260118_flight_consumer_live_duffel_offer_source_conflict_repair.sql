begin;

-- Gate 118 is a repair-only gate. Migration 105's record RPC used an
-- unqualified ON CONFLICT inference target whose first name collides with a
-- RETURNS TABLE output variable in PL/pgSQL. PostgreSQL therefore raises
-- 42702 before any source evidence can be recorded. This forward repair
-- changes no evidence rows and grants no provider or downstream authority.

do $prerequisite$
declare
  v_row_security boolean;
  v_force_row_security boolean;
begin
  if to_regclass(
      'public.flight_consumer_live_duffel_offer_sources'
    ) is null
    or to_regclass(
      'public.flight_consumer_live_duffel_shopping_attempts'
    ) is null
    or to_regprocedure(
      'public.record_flight_consumer_live_duffel_offer_sources_v1(uuid,text,text,jsonb)'
    ) is null
    or to_regprocedure(
      'public.list_flight_consumer_live_duffel_pending_offer_sources_v1(uuid,text,text)'
    ) is null
    or to_regprocedure(
      'public.complete_flight_consumer_live_duffel_shopping_attempt_v1(uuid,integer,text,integer,text,integer,integer)'
    ) is null
    or to_regprocedure('extensions.digest(bytea,text)') is null
    or to_regprocedure('auth.role()') is null then
    raise exception
      'Flight Consumer Live Duffel offer-source repair requires reviewed 101/102/105 prerequisites';
  end if;

  select catalog_class.relrowsecurity, catalog_class.relforcerowsecurity
    into v_row_security, v_force_row_security
    from pg_catalog.pg_class as catalog_class
   where catalog_class.oid =
     'public.flight_consumer_live_duffel_offer_sources'::regclass;
  if not coalesce(v_row_security, false)
    or not coalesce(v_force_row_security, false) then
    raise exception
      'Flight Consumer Live Duffel offer-source repair requires forced RLS';
  end if;
end;
$prerequisite$;

-- Constraint discovery, validation, and rename are serialized against all
-- concurrent writers. The lock is held until this migration commits.
lock table public.flight_consumer_live_duffel_shopping_attempts,
  public.flight_consumer_live_duffel_offer_sources
  in access exclusive mode;

do $stabilize_constraint$
declare
  v_relation oid :=
    'public.flight_consumer_live_duffel_offer_sources'::regclass;
  v_attempt_attnum smallint;
  v_offer_attnum smallint;
  v_exact_count integer;
  v_existing_name text;
  v_stable_name constant text :=
    'flight_consumer_duffel_offer_source_attempt_offer_uniq';
begin
  select attribute.attnum::smallint into v_attempt_attnum
    from pg_catalog.pg_attribute as attribute
   where attribute.attrelid = v_relation
     and attribute.attname = 'source_shopping_attempt_id'
     and attribute.attnum > 0
     and not attribute.attisdropped;
  select attribute.attnum::smallint into v_offer_attnum
    from pg_catalog.pg_attribute as attribute
   where attribute.attrelid = v_relation
     and attribute.attname = 'offer_id_sha256'
     and attribute.attnum > 0
     and not attribute.attisdropped;
  if v_attempt_attnum is null or v_offer_attnum is null then
    raise exception
      'Flight Consumer Live Duffel offer-source repair columns are unavailable';
  end if;

  select count(*)::integer, min(constraint_record.conname::text)
    into v_exact_count, v_existing_name
    from pg_catalog.pg_constraint as constraint_record
    join pg_catalog.pg_index as index_record
      on index_record.indexrelid = constraint_record.conindid
     and index_record.indrelid = v_relation
   where constraint_record.conrelid = v_relation
     and constraint_record.contype = 'u'
     and not constraint_record.condeferrable
     and not constraint_record.condeferred
     and constraint_record.conkey =
       array[v_attempt_attnum, v_offer_attnum]::smallint[]
     and index_record.indisunique
     and index_record.indisvalid
     and index_record.indisready
     and index_record.indpred is null
     and index_record.indexprs is null;
  if v_exact_count is distinct from 1 or v_existing_name is null then
    raise exception
      'Flight Consumer Live Duffel offer-source exact unique constraint is unavailable';
  end if;

  if exists (
    select 1
      from pg_catalog.pg_constraint as constraint_record
     where constraint_record.conrelid = v_relation
       and constraint_record.conname = v_stable_name
       and constraint_record.conname <> v_existing_name
  ) then
    raise exception
      'Flight Consumer Live Duffel offer-source stable constraint name is occupied';
  end if;

  if v_existing_name <> v_stable_name then
    execute format(
      'alter table public.flight_consumer_live_duffel_offer_sources rename constraint %I to %I',
      v_existing_name,
      v_stable_name
    );
  end if;

  if not exists (
    select 1
      from pg_catalog.pg_constraint as constraint_record
      join pg_catalog.pg_index as index_record
        on index_record.indexrelid = constraint_record.conindid
       and index_record.indrelid = v_relation
     where constraint_record.conrelid = v_relation
       and constraint_record.conname = v_stable_name
       and constraint_record.contype = 'u'
       and not constraint_record.condeferrable
       and not constraint_record.condeferred
       and constraint_record.conkey =
         array[v_attempt_attnum, v_offer_attnum]::smallint[]
       and index_record.indisunique
       and index_record.indisvalid
       and index_record.indisready
       and index_record.indpred is null
       and index_record.indexprs is null
  ) then
    raise exception
      'Flight Consumer Live Duffel offer-source stable constraint validation failed';
  end if;
end;
$stabilize_constraint$;

-- Refuse the migration rather than invent evidence for any already-succeeded
-- attempt whose exact source set cannot be derived from the locked 101/105
-- state. Zero-offer successes are safely bindable to the deterministic empty
-- set; non-zero successes require a complete single-scope/single-response set.
do $validate_succeeded_history$
begin
  if exists (
    select 1
      from public.flight_consumer_live_duffel_shopping_attempts as attempt
     where attempt.operation = 'create_offer_request'
       and attempt.attempt_state = 'succeeded'
       and (
         attempt.attempt_revision <> 2
         or attempt.terminal_response_sha256 is null
         or attempt.offer_count is null
         or (select count(*)::integer
               from public.flight_consumer_live_duffel_offer_sources as source
              where source.source_shopping_attempt_id = attempt.id)
           is distinct from attempt.offer_count
         or exists (
           select 1
             from public.flight_consumer_live_duffel_offer_sources as source
            where source.source_shopping_attempt_id = attempt.id
              and (
                source.source_shopping_execution_scope_sha256
                  is distinct from attempt.execution_scope_sha256
                or source.source_response_sha256
                  is distinct from attempt.terminal_response_sha256
              )
         )
       )
  ) then
    raise exception
      'Flight Consumer Live Duffel succeeded offer-source history cannot be safely bound';
  end if;
end;
$validate_succeeded_history$;

create table public.flight_consumer_live_duffel_offer_source_batches (
  source_shopping_attempt_id uuid not null,
  source_shopping_execution_scope_sha256 text not null
    check (source_shopping_execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  source_response_sha256 text not null
    check (source_response_sha256 ~ '^[0-9a-f]{64}$'),
  source_offer_count integer not null
    check (source_offer_count between 0 and 1000),
  source_set_sha256 text not null
    check (source_set_sha256 ~ '^[0-9a-f]{64}$'),
  source_batch_receipt_sha256 text not null
    check (source_batch_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  provider_dispatch_authorized boolean not null default false
    check (not provider_dispatch_authorized),
  consumer_exposure_authorized boolean not null default false
    check (not consumer_exposure_authorized),
  order_authorized boolean not null default false check (not order_authorized),
  stripe_dispatch_authorized boolean not null default false
    check (not stripe_dispatch_authorized),
  booking_authorized boolean not null default false
    check (not booking_authorized),
  payment_authorized boolean not null default false
    check (not payment_authorized),
  capture_authorized boolean not null default false
    check (not capture_authorized),
  refund_authorized boolean not null default false
    check (not refund_authorized),
  settlement_authorized boolean not null default false
    check (not settlement_authorized),
  ticketing_authorized boolean not null default false
    check (not ticketing_authorized),
  servicing_authorized boolean not null default false
    check (not servicing_authorized),
  consumer_release_enabled boolean not null default false
    check (not consumer_release_enabled),
  blind_retry_authorized boolean not null default false
    check (not blind_retry_authorized),
  recorded_at timestamptz not null default clock_timestamp(),
  constraint flight_consumer_duffel_source_batch_pkey
    primary key (source_shopping_attempt_id),
  constraint flight_consumer_duffel_source_batch_attempt_fkey
    foreign key (source_shopping_attempt_id)
    references public.flight_consumer_live_duffel_shopping_attempts(id)
    on delete restrict,
  constraint flight_consumer_duffel_source_batch_receipt_uniq
    unique (source_batch_receipt_sha256),
  check (source_set_sha256 <> source_batch_receipt_sha256)
);

alter table public.flight_consumer_live_duffel_offer_source_batches
  enable row level security;
alter table public.flight_consumer_live_duffel_offer_source_batches
  force row level security;
revoke all on table public.flight_consumer_live_duffel_offer_source_batches
  from public, anon, authenticated, service_role;

create function public.refuse_flight_consumer_live_duffel_offer_source_batch_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $refuse_flight_consumer_live_duffel_offer_source_batch_mutation_v1$
begin
  raise exception
    'Flight Consumer Live Duffel offer-source batch evidence is immutable';
end;
$refuse_flight_consumer_live_duffel_offer_source_batch_mutation_v1$;

create trigger flight_consumer_live_duffel_offer_source_batches_immutable
before update or delete on
  public.flight_consumer_live_duffel_offer_source_batches
for each row execute function
  public.refuse_flight_consumer_live_duffel_offer_source_batch_mutation_v1();

-- Backfill only the safely validated succeeded history while both parent and
-- child tables remain ACCESS EXCLUSIVE locked.
with source_sets as (
  select attempt.id as source_shopping_attempt_id,
         attempt.execution_scope_sha256,
         attempt.terminal_response_sha256 as source_response_sha256,
         attempt.offer_count as source_offer_count,
         coalesce(string_agg(
           source.offer_id_sha256 || ':'
           || source.source_offer_evidence_sha256 || ':'
           || to_char(
             source.expires_at at time zone 'UTC',
             'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
           ),
           ',' order by source.offer_id_sha256
         ), '') as source_set_payload
    from public.flight_consumer_live_duffel_shopping_attempts as attempt
    left join public.flight_consumer_live_duffel_offer_sources as source
      on source.source_shopping_attempt_id = attempt.id
   where attempt.operation = 'create_offer_request'
     and attempt.attempt_state = 'succeeded'
   group by attempt.id, attempt.execution_scope_sha256,
            attempt.terminal_response_sha256, attempt.offer_count
), source_set_digests as (
  select source_set.*,
         encode(extensions.digest(
           convert_to(
             'iratepilot:flight-consumer-production:duffel-live:offer-source-set:v1',
             'UTF8'
           ) || decode('00', 'hex')
             || convert_to(source_set.source_set_payload, 'UTF8'),
           'sha256'
         ), 'hex') as source_set_sha256
    from source_sets as source_set
)
insert into public.flight_consumer_live_duffel_offer_source_batches (
  source_shopping_attempt_id,
  source_shopping_execution_scope_sha256,
  source_response_sha256,
  source_offer_count,
  source_set_sha256,
  source_batch_receipt_sha256
)
select source_set.source_shopping_attempt_id,
       source_set.execution_scope_sha256,
       source_set.source_response_sha256,
       source_set.source_offer_count,
       source_set.source_set_sha256,
       encode(extensions.digest(
         convert_to(
           'iratepilot:flight-consumer-production:duffel-live:offer-source-batch-receipt:v1',
           'UTF8'
         ) || decode('00', 'hex') || convert_to(
           source_set.source_shopping_attempt_id::text || ':'
           || source_set.execution_scope_sha256 || ':'
           || source_set.source_response_sha256 || ':'
           || source_set.source_offer_count::text || ':'
           || source_set.source_set_sha256,
           'UTF8'
         ),
         'sha256'
       ), 'hex')
  from source_set_digests as source_set;

do $validate_succeeded_backfill$
begin
  if (select count(*)
        from public.flight_consumer_live_duffel_offer_source_batches)
      is distinct from (
        select count(*)
          from public.flight_consumer_live_duffel_shopping_attempts as attempt
         where attempt.operation = 'create_offer_request'
           and attempt.attempt_state = 'succeeded'
      ) then
    raise exception
      'Flight Consumer Live Duffel succeeded offer-source backfill is incomplete';
  end if;
end;
$validate_succeeded_backfill$;

create or replace function public.record_flight_consumer_live_duffel_offer_sources_v1(
  p_source_shopping_attempt_id uuid,
  p_source_shopping_execution_scope_sha256 text,
  p_source_response_sha256 text,
  p_sources jsonb
)
returns table (
  source_shopping_attempt_id uuid,
  recorded_source_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $record_flight_consumer_live_duffel_offer_sources_v1$
declare
  v_attempt public.flight_consumer_live_duffel_shopping_attempts;
  v_source jsonb;
  v_expires_at timestamptz;
  v_offer_id_sha256 text;
  v_evidence_sha256 text;
  v_expected_count integer;
  v_recorded_count integer;
  v_recorded_source public.flight_consumer_live_duffel_offer_sources;
  v_source_set_payload text;
  v_source_set_sha256 text;
  v_batch_receipt_sha256 text;
  v_batch public.flight_consumer_live_duffel_offer_source_batches;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live Duffel offer sources are service-role only';
  end if;
  if p_source_shopping_attempt_id is null
    or p_source_shopping_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_source_response_sha256 !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(p_sources) is distinct from 'array'
    or jsonb_array_length(p_sources) > 1000 then
    raise exception 'Flight Consumer Live Duffel offer source envelope is invalid';
  end if;

  select * into v_attempt
    from public.flight_consumer_live_duffel_shopping_attempts as attempt
   where attempt.id = p_source_shopping_attempt_id
     and attempt.execution_scope_sha256 =
       p_source_shopping_execution_scope_sha256
   for update;
  if not found
    or v_attempt.operation is distinct from 'create_offer_request'
    or v_attempt.attempt_state is distinct from 'dispatching'
    or v_attempt.attempt_revision is distinct from 1 then
    raise exception 'Flight Consumer Live Duffel offer source parent is not recordable';
  end if;

  v_expected_count := jsonb_array_length(p_sources);
  for v_source in select value from jsonb_array_elements(p_sources)
  loop
    if jsonb_typeof(v_source) is distinct from 'object'
      or (select array_agg(key order by key)
            from jsonb_object_keys(v_source) as key)
        is distinct from array['expiresAt', 'offerIdSha256']::text[] then
      raise exception 'Flight Consumer Live Duffel offer source item is invalid';
    end if;
    v_offer_id_sha256 := v_source ->> 'offerIdSha256';
    if v_offer_id_sha256 !~ '^[0-9a-f]{64}$'
      or (v_source ->> 'expiresAt') is null then
      raise exception 'Flight Consumer Live Duffel offer source item is invalid';
    end if;
    begin
      v_expires_at := (v_source ->> 'expiresAt')::timestamptz;
    exception when others then
      raise exception 'Flight Consumer Live Duffel offer source expiry is invalid';
    end;
    v_evidence_sha256 := encode(extensions.digest(
      convert_to(
        'iratepilot:flight-consumer-production:duffel-live:offer-source-evidence:v1',
        'UTF8'
      ) || decode('00', 'hex') || convert_to(
        p_source_shopping_attempt_id::text || ':'
        || p_source_shopping_execution_scope_sha256 || ':'
        || p_source_response_sha256 || ':'
        || v_offer_id_sha256 || ':'
        || to_char(
          v_expires_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        ),
        'UTF8'
      ),
      'sha256'
    ), 'hex');

    insert into public.flight_consumer_live_duffel_offer_sources (
      source_shopping_attempt_id,
      source_shopping_execution_scope_sha256,
      source_response_sha256,
      offer_id_sha256,
      source_offer_evidence_sha256,
      expires_at
    ) values (
      p_source_shopping_attempt_id,
      p_source_shopping_execution_scope_sha256,
      p_source_response_sha256,
      v_offer_id_sha256,
      v_evidence_sha256,
      v_expires_at
    ) on conflict on constraint
      flight_consumer_duffel_offer_source_attempt_offer_uniq
      do nothing;

    select * into v_recorded_source
      from public.flight_consumer_live_duffel_offer_sources as recorded
     where recorded.source_shopping_attempt_id =
       p_source_shopping_attempt_id
       and recorded.offer_id_sha256 = v_offer_id_sha256
     for share;
    if not found
      or v_recorded_source.source_shopping_execution_scope_sha256
        is distinct from p_source_shopping_execution_scope_sha256
      or v_recorded_source.source_response_sha256
        is distinct from p_source_response_sha256
      or v_recorded_source.offer_id_sha256
        is distinct from v_offer_id_sha256
      or v_recorded_source.source_offer_evidence_sha256
        is distinct from v_evidence_sha256
      or v_recorded_source.expires_at is distinct from v_expires_at then
      raise exception 'Flight Consumer Live Duffel offer source collision';
    end if;
  end loop;

  select count(*)::integer into v_recorded_count
    from public.flight_consumer_live_duffel_offer_sources as source
   where source.source_shopping_attempt_id = p_source_shopping_attempt_id
     and source.source_shopping_execution_scope_sha256 =
       p_source_shopping_execution_scope_sha256
     and source.source_response_sha256 = p_source_response_sha256;
  if v_recorded_count is distinct from v_expected_count
    or exists (
      select 1
        from public.flight_consumer_live_duffel_offer_sources as source
       where source.source_shopping_attempt_id = p_source_shopping_attempt_id
         and (
           source.source_shopping_execution_scope_sha256 is distinct from
             p_source_shopping_execution_scope_sha256
           or source.source_response_sha256 is distinct from
             p_source_response_sha256
         )
    ) then
    raise exception 'Flight Consumer Live Duffel offer source collision';
  end if;

  select coalesce(string_agg(
           source.offer_id_sha256 || ':'
           || source.source_offer_evidence_sha256 || ':'
           || to_char(
             source.expires_at at time zone 'UTC',
             'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
           ),
           ',' order by source.offer_id_sha256
         ), '')
    into v_source_set_payload
    from public.flight_consumer_live_duffel_offer_sources as source
   where source.source_shopping_attempt_id = p_source_shopping_attempt_id;
  v_source_set_sha256 := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:duffel-live:offer-source-set:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(v_source_set_payload, 'UTF8'),
    'sha256'
  ), 'hex');
  v_batch_receipt_sha256 := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:duffel-live:offer-source-batch-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(
      p_source_shopping_attempt_id::text || ':'
      || p_source_shopping_execution_scope_sha256 || ':'
      || p_source_response_sha256 || ':'
      || v_recorded_count::text || ':'
      || v_source_set_sha256,
      'UTF8'
    ),
    'sha256'
  ), 'hex');

  insert into public.flight_consumer_live_duffel_offer_source_batches (
    source_shopping_attempt_id,
    source_shopping_execution_scope_sha256,
    source_response_sha256,
    source_offer_count,
    source_set_sha256,
    source_batch_receipt_sha256
  ) values (
    p_source_shopping_attempt_id,
    p_source_shopping_execution_scope_sha256,
    p_source_response_sha256,
    v_recorded_count,
    v_source_set_sha256,
    v_batch_receipt_sha256
  ) on conflict on constraint flight_consumer_duffel_source_batch_pkey
    do nothing;

  select * into v_batch
    from public.flight_consumer_live_duffel_offer_source_batches as batch
   where batch.source_shopping_attempt_id = p_source_shopping_attempt_id
   for share;
  if not found
    or v_batch.source_shopping_execution_scope_sha256
      is distinct from p_source_shopping_execution_scope_sha256
    or v_batch.source_response_sha256
      is distinct from p_source_response_sha256
    or v_batch.source_offer_count is distinct from v_recorded_count
    or v_batch.source_set_sha256 is distinct from v_source_set_sha256
    or v_batch.source_batch_receipt_sha256
      is distinct from v_batch_receipt_sha256
    or v_batch.provider_dispatch_authorized
    or v_batch.consumer_exposure_authorized
    or v_batch.order_authorized
    or v_batch.stripe_dispatch_authorized
    or v_batch.booking_authorized
    or v_batch.payment_authorized
    or v_batch.capture_authorized
    or v_batch.refund_authorized
    or v_batch.settlement_authorized
    or v_batch.ticketing_authorized
    or v_batch.servicing_authorized
    or v_batch.consumer_release_enabled
    or v_batch.blind_retry_authorized then
    raise exception 'Flight Consumer Live Duffel offer source batch collision';
  end if;

  return query select p_source_shopping_attempt_id, v_recorded_count;
end;
$record_flight_consumer_live_duffel_offer_sources_v1$;

create function public.guard_flight_consumer_live_duffel_shopping_success_sources_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $guard_flight_consumer_live_duffel_shopping_success_sources_v1$
declare
  v_batch public.flight_consumer_live_duffel_offer_source_batches;
  v_source_count integer;
  v_source_set_payload text;
  v_source_set_sha256 text;
  v_batch_receipt_sha256 text;
begin
  if new.operation = 'create_offer_request'
    and new.attempt_state = 'succeeded' then
    if old.attempt_state <> 'dispatching'
      or old.attempt_revision <> 1 then
      if old.attempt_state <> 'succeeded'
        or old.attempt_revision <> 2
        or old.execution_scope_sha256
          is distinct from new.execution_scope_sha256
        or old.terminal_response_sha256
          is distinct from new.terminal_response_sha256
        or old.offer_count is distinct from new.offer_count then
        raise exception
          'Flight Consumer Live Duffel shopping success transition is invalid';
      end if;
    end if;

    select * into v_batch
      from public.flight_consumer_live_duffel_offer_source_batches as batch
     where batch.source_shopping_attempt_id = new.id
     for share;
    select count(*)::integer,
           coalesce(string_agg(
             source.offer_id_sha256 || ':'
             || source.source_offer_evidence_sha256 || ':'
             || to_char(
               source.expires_at at time zone 'UTC',
               'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
             ),
             ',' order by source.offer_id_sha256
           ), '')
      into v_source_count, v_source_set_payload
      from public.flight_consumer_live_duffel_offer_sources as source
     where source.source_shopping_attempt_id = new.id;
    v_source_set_sha256 := encode(extensions.digest(
      convert_to(
        'iratepilot:flight-consumer-production:duffel-live:offer-source-set:v1',
        'UTF8'
      ) || decode('00', 'hex') || convert_to(v_source_set_payload, 'UTF8'),
      'sha256'
    ), 'hex');
    v_batch_receipt_sha256 := encode(extensions.digest(
      convert_to(
        'iratepilot:flight-consumer-production:duffel-live:offer-source-batch-receipt:v1',
        'UTF8'
      ) || decode('00', 'hex') || convert_to(
        new.id::text || ':' || new.execution_scope_sha256 || ':'
        || new.terminal_response_sha256 || ':'
        || v_source_count::text || ':' || v_source_set_sha256,
        'UTF8'
      ),
      'sha256'
    ), 'hex');

    if v_batch.source_shopping_attempt_id is null
      or v_batch.source_shopping_execution_scope_sha256
        is distinct from new.execution_scope_sha256
      or v_batch.source_response_sha256
        is distinct from new.terminal_response_sha256
      or v_batch.source_offer_count is distinct from new.offer_count
      or v_batch.source_offer_count is distinct from v_source_count
      or v_batch.source_set_sha256 is distinct from v_source_set_sha256
      or v_batch.source_batch_receipt_sha256
        is distinct from v_batch_receipt_sha256
      or exists (
        select 1
          from public.flight_consumer_live_duffel_offer_sources as source
         where source.source_shopping_attempt_id = new.id
           and (
             source.source_shopping_execution_scope_sha256
               is distinct from new.execution_scope_sha256
             or source.source_response_sha256
               is distinct from new.terminal_response_sha256
           )
      )
      or v_batch.provider_dispatch_authorized
      or v_batch.consumer_exposure_authorized
      or v_batch.order_authorized
      or v_batch.stripe_dispatch_authorized
      or v_batch.booking_authorized
      or v_batch.payment_authorized
      or v_batch.capture_authorized
      or v_batch.refund_authorized
      or v_batch.settlement_authorized
      or v_batch.ticketing_authorized
      or v_batch.servicing_authorized
      or v_batch.consumer_release_enabled
      or v_batch.blind_retry_authorized then
      raise exception
        'Flight Consumer Live Duffel shopping success source evidence is incomplete';
    end if;
  end if;
  return new;
end;
$guard_flight_consumer_live_duffel_shopping_success_sources_v1$;

create trigger flight_consumer_live_duffel_shopping_success_sources_guard
before update on public.flight_consumer_live_duffel_shopping_attempts
for each row execute function
  public.guard_flight_consumer_live_duffel_shopping_success_sources_v1();

create or replace function public.list_flight_consumer_live_duffel_pending_offer_sources_v1(
  p_source_shopping_attempt_id uuid,
  p_source_shopping_execution_scope_sha256 text,
  p_source_response_sha256 text
)
returns table (
  source_id uuid,
  offer_id_sha256 text,
  source_offer_evidence_sha256 text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $list_flight_consumer_live_duffel_pending_offer_sources_v1$
declare
  v_attempt public.flight_consumer_live_duffel_shopping_attempts;
  v_batch public.flight_consumer_live_duffel_offer_source_batches;
  v_count integer;
  v_source_set_payload text;
  v_source_set_sha256 text;
  v_batch_receipt_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    or p_source_shopping_attempt_id is null
    or p_source_shopping_execution_scope_sha256 is null
    or p_source_response_sha256 is null
    or p_source_shopping_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_source_response_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight Consumer Live pending offer-source inspection is invalid';
  end if;
  select * into v_attempt
    from public.flight_consumer_live_duffel_shopping_attempts as attempt
   where attempt.id = p_source_shopping_attempt_id
     and attempt.execution_scope_sha256 =
       p_source_shopping_execution_scope_sha256
   for share;
  if not found or v_attempt.operation <> 'create_offer_request'
    or v_attempt.attempt_state <> 'dispatching'
    or v_attempt.attempt_revision <> 1 then
    raise exception 'Flight Consumer Live pending offer-source attempt is invalid';
  end if;

  select * into v_batch
    from public.flight_consumer_live_duffel_offer_source_batches as batch
   where batch.source_shopping_attempt_id = p_source_shopping_attempt_id
   for share;
  select count(*)::integer,
         coalesce(string_agg(
           source.offer_id_sha256 || ':'
           || source.source_offer_evidence_sha256 || ':'
           || to_char(
             source.expires_at at time zone 'UTC',
             'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
           ),
           ',' order by source.offer_id_sha256
         ), '')
    into v_count, v_source_set_payload
    from public.flight_consumer_live_duffel_offer_sources as source
   where source.source_shopping_attempt_id = p_source_shopping_attempt_id;
  v_source_set_sha256 := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:duffel-live:offer-source-set:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(v_source_set_payload, 'UTF8'),
    'sha256'
  ), 'hex');
  v_batch_receipt_sha256 := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:duffel-live:offer-source-batch-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(
      p_source_shopping_attempt_id::text || ':'
      || p_source_shopping_execution_scope_sha256 || ':'
      || p_source_response_sha256 || ':' || v_count::text || ':'
      || v_source_set_sha256,
      'UTF8'
    ),
    'sha256'
  ), 'hex');
  if v_batch.source_shopping_attempt_id is null
    or v_batch.source_shopping_execution_scope_sha256
      is distinct from p_source_shopping_execution_scope_sha256
    or v_batch.source_response_sha256
      is distinct from p_source_response_sha256
    or v_batch.source_offer_count is distinct from v_count
    or v_batch.source_set_sha256 is distinct from v_source_set_sha256
    or v_batch.source_batch_receipt_sha256
      is distinct from v_batch_receipt_sha256
    or exists (
      select 1
        from public.flight_consumer_live_duffel_offer_sources as source
       where source.source_shopping_attempt_id = p_source_shopping_attempt_id
         and (
           source.source_shopping_execution_scope_sha256
             is distinct from p_source_shopping_execution_scope_sha256
           or source.source_response_sha256
             is distinct from p_source_response_sha256
         )
    )
    or v_batch.provider_dispatch_authorized
    or v_batch.consumer_exposure_authorized
    or v_batch.order_authorized
    or v_batch.stripe_dispatch_authorized
    or v_batch.booking_authorized
    or v_batch.payment_authorized
    or v_batch.capture_authorized
    or v_batch.refund_authorized
    or v_batch.settlement_authorized
    or v_batch.ticketing_authorized
    or v_batch.servicing_authorized
    or v_batch.consumer_release_enabled
    or v_batch.blind_retry_authorized then
    raise exception 'Flight Consumer Live pending offer-source set is invalid';
  end if;

  return query
  select source.id, source.offer_id_sha256,
         source.source_offer_evidence_sha256, source.expires_at
    from public.flight_consumer_live_duffel_offer_sources as source
   where source.source_shopping_attempt_id = p_source_shopping_attempt_id
     and source.source_shopping_execution_scope_sha256 =
       p_source_shopping_execution_scope_sha256
     and source.source_response_sha256 = p_source_response_sha256
   order by source.offer_id_sha256;
end;
$list_flight_consumer_live_duffel_pending_offer_sources_v1$;

alter function public.record_flight_consumer_live_duffel_offer_sources_v1(
  uuid, text, text, jsonb
) owner to postgres;
alter function public.refuse_flight_consumer_live_duffel_offer_source_batch_mutation_v1()
  owner to postgres;
alter function public.guard_flight_consumer_live_duffel_shopping_success_sources_v1()
  owner to postgres;
alter function public.list_flight_consumer_live_duffel_pending_offer_sources_v1(
  uuid, text, text
) owner to postgres;

revoke all on function public.record_flight_consumer_live_duffel_offer_sources_v1(
  uuid, text, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function
  public.refuse_flight_consumer_live_duffel_offer_source_batch_mutation_v1()
  from public, anon, authenticated, service_role;
revoke all on function
  public.guard_flight_consumer_live_duffel_shopping_success_sources_v1()
  from public, anon, authenticated, service_role;
revoke all on function
  public.list_flight_consumer_live_duffel_pending_offer_sources_v1(
    uuid, text, text
  ) from public, anon, authenticated, service_role;

grant execute on function public.record_flight_consumer_live_duffel_offer_sources_v1(
  uuid, text, text, jsonb
) to service_role;
grant execute on function
  public.list_flight_consumer_live_duffel_pending_offer_sources_v1(
    uuid, text, text
  ) to service_role;

comment on table public.flight_consumer_live_duffel_offer_source_batches is
  'Immutable forced-RLS digest header for one exact Gate 101/105 response, including the zero-offer set. It is service-role hidden and grants no provider or downstream authority.';
comment on function public.record_flight_consumer_live_duffel_offer_sources_v1(
  uuid, text, text, jsonb
) is
  'Service-role-only exact source recorder repaired by Gate 118. It binds every row and one immutable response header, including zero offers, without provider or downstream authority.';
comment on function
  public.guard_flight_consumer_live_duffel_shopping_success_sources_v1() is
  'Before-update guard that refuses a Gate 101 success unless its immutable Gate 118 header and complete Gate 105 source set exactly bind the terminal response and offer count.';
comment on function
  public.list_flight_consumer_live_duffel_pending_offer_sources_v1(
    uuid, text, text
  ) is
  'Service-role-only Gate 116 source list repaired by Gate 118. It requires the exact immutable response header, including for an empty source set.';

commit;

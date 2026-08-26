begin;

-- Authenticated Duffel test-mode consumer Preview foundation. This migration
-- does not enable a capability, relax the kill switch, dispatch HTTP, store a
-- provider payload in plaintext, or authorize Production.
do $flight_consumer_preview_prerequisite$
begin
  if to_regclass('public.flight_runtime_controls') is null
    or to_regclass('public.flight_provider_request_attempts') is null
    or to_regclass('public.flight_orders') is null
    or to_regprocedure(
      'public.complete_flight_provider_request_attempt(uuid,integer,text,smallint,text,bigint,text)'
    ) is null
    or to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'Flight consumer Preview foundation requires migrations 068 through 073';
  end if;
end;
$flight_consumer_preview_prerequisite$;

-- The pre-existing bound_payment_* identity is the customer-facing payment
-- processor (Stripe). Provider settlement is deliberately independent: Duffel
-- Balance settles the provider after a Stripe test payment has been captured.
alter table public.flight_runtime_controls
  add column bound_provider_settlement_processor_code text check (
    bound_provider_settlement_processor_code is null
    or bound_provider_settlement_processor_code ~ '^[a-z][a-z0-9_]{1,31}$'
  ),
  add column bound_provider_settlement_account_sha256 text check (
    bound_provider_settlement_account_sha256 is null
    or bound_provider_settlement_account_sha256 ~ '^[0-9a-f]{64}$'
  ),
  add column bound_provider_settlement_environment text check (
    bound_provider_settlement_environment is null
    or bound_provider_settlement_environment in ('test', 'live')
  ),
  add column bound_provider_settlement_source_sha256 text check (
    bound_provider_settlement_source_sha256 is null
    or bound_provider_settlement_source_sha256 ~ '^[0-9a-f]{64}$'
  ),
  add column bound_provider_settlement_adapter_version_sha256 text check (
    bound_provider_settlement_adapter_version_sha256 is null
    or bound_provider_settlement_adapter_version_sha256 ~ '^[0-9a-f]{64}$'
  );

alter table public.flight_runtime_control_receipts
  add column bound_provider_settlement_processor_code text,
  add column bound_provider_settlement_account_sha256 text,
  add column bound_provider_settlement_environment text,
  add column bound_provider_settlement_source_sha256 text,
  add column bound_provider_settlement_adapter_version_sha256 text;

-- NOT VALID permits this schema migration to land while a previously reviewed
-- rehearsal control row is still active. PostgreSQL enforces the constraint on
-- every later insert/update, so the next activation must atomically supply the
-- complete split settlement identity and a fresh execution scope.
alter table public.flight_runtime_controls
  add constraint flight_runtime_controls_provider_settlement_dependency_check
  check (
    (
      bound_provider_settlement_processor_code is null
      and bound_provider_settlement_account_sha256 is null
      and bound_provider_settlement_environment is null
      and bound_provider_settlement_source_sha256 is null
      and bound_provider_settlement_adapter_version_sha256 is null
      and not order_enabled
    )
    or (
      bound_provider_settlement_processor_code is not null
      and bound_provider_settlement_account_sha256 is not null
      and bound_provider_settlement_environment is not null
      and bound_provider_settlement_source_sha256 is not null
      and bound_provider_settlement_adapter_version_sha256 is not null
      and (
        (provider_sandbox_traffic_enabled
          and bound_provider_settlement_environment = 'test')
        or (provider_live_traffic_enabled
          and bound_provider_settlement_environment = 'live')
      )
    )
  ) not valid;

create or replace function public.protect_flight_runtime_controls()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $flight_runtime_control_guard$
declare
  v_binding_changed boolean;
begin
  if new.control_key is distinct from old.control_key then
    raise exception 'Flight runtime control identity is immutable';
  end if;
  if new.updated_by is null or not exists (
    select 1 from public.profiles
     where id = new.updated_by
       and role = 'admin'
  ) then
    raise exception 'A platform administrator must authorize flight runtime control changes';
  end if;
  if auth.uid() is null or new.updated_by <> auth.uid() then
    raise exception 'Flight runtime control actor must match the authenticated administrator';
  end if;
  if new.activation_evidence_sha256 is null
    or new.activation_evidence_sha256 is not distinct from old.activation_evidence_sha256 then
    raise exception 'Fresh flight activation evidence is required for every runtime control change';
  end if;
  v_binding_changed :=
    new.bound_environment is distinct from old.bound_environment
    or new.bound_project_ref is distinct from old.bound_project_ref
    or new.bound_database_name is distinct from old.bound_database_name
    or new.bound_session_user is distinct from old.bound_session_user
    or new.bound_provider_code is distinct from old.bound_provider_code
    or new.bound_provider_account_sha256 is distinct from old.bound_provider_account_sha256
    or new.bound_point_of_sale is distinct from old.bound_point_of_sale
    or new.bound_content_scope_sha256 is distinct from old.bound_content_scope_sha256
    or new.bound_adapter_version_sha256 is distinct from old.bound_adapter_version_sha256
    or new.bound_payment_processor_code is distinct from old.bound_payment_processor_code
    or new.bound_payment_account_sha256 is distinct from old.bound_payment_account_sha256
    or new.bound_payment_environment is distinct from old.bound_payment_environment
    or new.bound_payment_source_sha256 is distinct from old.bound_payment_source_sha256
    or new.bound_payment_adapter_version_sha256
      is distinct from old.bound_payment_adapter_version_sha256
    or new.bound_provider_settlement_processor_code
      is distinct from old.bound_provider_settlement_processor_code
    or new.bound_provider_settlement_account_sha256
      is distinct from old.bound_provider_settlement_account_sha256
    or new.bound_provider_settlement_environment
      is distinct from old.bound_provider_settlement_environment
    or new.bound_provider_settlement_source_sha256
      is distinct from old.bound_provider_settlement_source_sha256
    or new.bound_provider_settlement_adapter_version_sha256
      is distinct from old.bound_provider_settlement_adapter_version_sha256;
  if v_binding_changed
    = (new.bound_execution_scope_sha256 is not distinct from old.bound_execution_scope_sha256) then
    raise exception 'Flight execution scope must change if and only if a bound identity changes';
  end if;
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$flight_runtime_control_guard$;

create or replace function public.record_flight_runtime_control_receipt()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $flight_runtime_control_receipt$
begin
  insert into public.flight_runtime_control_receipts (
    control_key, changed_by, changed_at, previous_activation_evidence_sha256,
    activation_evidence_sha256, execution_kill_switch_engaged,
    synthetic_execution_enabled, provider_sandbox_traffic_enabled,
    provider_live_traffic_enabled, shopping_enabled, order_enabled,
    payment_enabled, ticketing_enabled, servicing_enabled,
    provider_events_enabled, production_release_enabled, bound_environment,
    bound_project_ref, bound_database_name, bound_session_user,
    bound_provider_code, bound_provider_account_sha256, bound_point_of_sale,
    bound_content_scope_sha256, bound_adapter_version_sha256,
    bound_payment_processor_code, bound_payment_account_sha256,
    bound_payment_environment, bound_payment_source_sha256,
    bound_payment_adapter_version_sha256,
    bound_provider_settlement_processor_code,
    bound_provider_settlement_account_sha256,
    bound_provider_settlement_environment,
    bound_provider_settlement_source_sha256,
    bound_provider_settlement_adapter_version_sha256,
    bound_execution_scope_sha256
  ) values (
    new.control_key, new.updated_by, new.updated_at, old.activation_evidence_sha256,
    new.activation_evidence_sha256, new.execution_kill_switch_engaged,
    new.synthetic_execution_enabled, new.provider_sandbox_traffic_enabled,
    new.provider_live_traffic_enabled, new.shopping_enabled, new.order_enabled,
    new.payment_enabled, new.ticketing_enabled, new.servicing_enabled,
    new.provider_events_enabled, new.production_release_enabled, new.bound_environment,
    new.bound_project_ref, new.bound_database_name, new.bound_session_user,
    new.bound_provider_code, new.bound_provider_account_sha256, new.bound_point_of_sale,
    new.bound_content_scope_sha256, new.bound_adapter_version_sha256,
    new.bound_payment_processor_code, new.bound_payment_account_sha256,
    new.bound_payment_environment, new.bound_payment_source_sha256,
    new.bound_payment_adapter_version_sha256,
    new.bound_provider_settlement_processor_code,
    new.bound_provider_settlement_account_sha256,
    new.bound_provider_settlement_environment,
    new.bound_provider_settlement_source_sha256,
    new.bound_provider_settlement_adapter_version_sha256,
    new.bound_execution_scope_sha256
  );
  return new;
end;
$flight_runtime_control_receipt$;

create or replace function public.flight_runtime_capability_enabled(
  p_execution_mode text,
  p_capability text,
  p_provider_code text default null,
  p_processor_code text default null,
  p_execution_scope_sha256 text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $flight_runtime_capability$
declare
  v_control public.flight_runtime_controls;
  v_session_environment text := current_setting('app.flight_environment', true);
  v_session_project_ref text := current_setting('app.flight_project_ref', true);
  v_session_authorized text := current_setting('app.flight_execution_authorized', true);
  v_session_evidence text := current_setting('app.flight_activation_evidence_sha256', true);
begin
  if p_capability not in ('shopping', 'order', 'payment', 'ticketing', 'servicing', 'provider_event')
    or p_execution_mode not in ('synthetic', 'test', 'live') then
    return false;
  end if;

  select * into v_control
    from public.flight_runtime_controls
   where control_key = 'global';
  if not found
    or v_control.execution_kill_switch_engaged
    or v_control.activation_evidence_sha256 is null
    or v_control.bound_environment is null
    or v_control.bound_project_ref is null
    or v_control.bound_database_name is null
    or v_control.bound_session_user is null
    or v_control.bound_execution_scope_sha256 is null
    or p_execution_scope_sha256 is distinct from v_control.bound_execution_scope_sha256
    or v_control.updated_by is null
    or not exists (
      select 1 from public.profiles
       where id = v_control.updated_by and role = 'admin'
    )
    or not exists (
      select 1
        from public.flight_runtime_control_receipts as receipt
       where receipt.control_key = v_control.control_key
         and receipt.changed_by = v_control.updated_by
         and receipt.changed_at = v_control.updated_at
         and receipt.activation_evidence_sha256 = v_control.activation_evidence_sha256
         and receipt.execution_kill_switch_engaged = v_control.execution_kill_switch_engaged
         and receipt.synthetic_execution_enabled = v_control.synthetic_execution_enabled
         and receipt.provider_sandbox_traffic_enabled = v_control.provider_sandbox_traffic_enabled
         and receipt.provider_live_traffic_enabled = v_control.provider_live_traffic_enabled
         and receipt.shopping_enabled = v_control.shopping_enabled
         and receipt.order_enabled = v_control.order_enabled
         and receipt.payment_enabled = v_control.payment_enabled
         and receipt.ticketing_enabled = v_control.ticketing_enabled
         and receipt.servicing_enabled = v_control.servicing_enabled
         and receipt.provider_events_enabled = v_control.provider_events_enabled
         and receipt.production_release_enabled = v_control.production_release_enabled
         and receipt.bound_environment is not distinct from v_control.bound_environment
         and receipt.bound_project_ref is not distinct from v_control.bound_project_ref
         and receipt.bound_database_name is not distinct from v_control.bound_database_name
         and receipt.bound_session_user is not distinct from v_control.bound_session_user
         and receipt.bound_provider_code is not distinct from v_control.bound_provider_code
         and receipt.bound_provider_account_sha256
           is not distinct from v_control.bound_provider_account_sha256
         and receipt.bound_point_of_sale is not distinct from v_control.bound_point_of_sale
         and receipt.bound_content_scope_sha256
           is not distinct from v_control.bound_content_scope_sha256
         and receipt.bound_adapter_version_sha256
           is not distinct from v_control.bound_adapter_version_sha256
         and receipt.bound_payment_processor_code
           is not distinct from v_control.bound_payment_processor_code
         and receipt.bound_payment_account_sha256
           is not distinct from v_control.bound_payment_account_sha256
         and receipt.bound_payment_environment
           is not distinct from v_control.bound_payment_environment
         and receipt.bound_payment_source_sha256
           is not distinct from v_control.bound_payment_source_sha256
         and receipt.bound_payment_adapter_version_sha256
           is not distinct from v_control.bound_payment_adapter_version_sha256
         and receipt.bound_provider_settlement_processor_code
           is not distinct from v_control.bound_provider_settlement_processor_code
         and receipt.bound_provider_settlement_account_sha256
           is not distinct from v_control.bound_provider_settlement_account_sha256
         and receipt.bound_provider_settlement_environment
           is not distinct from v_control.bound_provider_settlement_environment
         and receipt.bound_provider_settlement_source_sha256
           is not distinct from v_control.bound_provider_settlement_source_sha256
         and receipt.bound_provider_settlement_adapter_version_sha256
           is not distinct from v_control.bound_provider_settlement_adapter_version_sha256
         and receipt.bound_execution_scope_sha256
           is not distinct from v_control.bound_execution_scope_sha256
    )
    or v_session_authorized is distinct from 'true'
    or v_session_environment is distinct from v_control.bound_environment
    or v_session_project_ref is distinct from v_control.bound_project_ref
    or v_session_evidence is distinct from v_control.activation_evidence_sha256
    or current_database()::text is distinct from v_control.bound_database_name
    or session_user::text is distinct from v_control.bound_session_user then
    return false;
  end if;
  if p_execution_mode = 'synthetic' and not v_control.synthetic_execution_enabled then
    return false;
  end if;
  if p_execution_mode = 'synthetic' and p_capability <> 'shopping' then
    return false;
  end if;
  if p_execution_mode = 'synthetic'
    and p_provider_code is not null and p_provider_code <> 'synthetic' then
    return false;
  end if;
  if p_execution_mode = 'test' and not v_control.provider_sandbox_traffic_enabled then
    return false;
  end if;
  if p_execution_mode = 'live'
    and not (v_control.provider_live_traffic_enabled and v_control.production_release_enabled) then
    return false;
  end if;
  if p_execution_mode in ('test', 'live') and (
    v_control.bound_provider_code is null
    or v_control.bound_provider_account_sha256 is null
    or v_control.bound_point_of_sale is null
    or v_control.bound_content_scope_sha256 is null
    or v_control.bound_adapter_version_sha256 is null
    or (p_provider_code is not null and p_provider_code <> v_control.bound_provider_code)
  ) then
    return false;
  end if;
  if p_capability = 'payment' and (
    v_control.bound_payment_processor_code is null
    or v_control.bound_payment_account_sha256 is null
    or v_control.bound_payment_environment is distinct from p_execution_mode
    or v_control.bound_payment_source_sha256 is null
    or v_control.bound_payment_adapter_version_sha256 is null
    or (p_processor_code is not null
      and p_processor_code <> v_control.bound_payment_processor_code)
  ) then
    return false;
  end if;

  return case p_capability
    when 'shopping' then v_control.shopping_enabled
    when 'order' then v_control.order_enabled
    when 'payment' then v_control.payment_enabled
    when 'ticketing' then v_control.ticketing_enabled
    when 'servicing' then v_control.servicing_enabled
    when 'provider_event' then v_control.provider_events_enabled
    else false
  end;
end;
$flight_runtime_capability$;

create function public.get_flight_consumer_preview_runtime_authority_v1()
returns table (
  version text,
  authorized boolean,
  control_key text,
  execution_mode text,
  execution_kill_switch_engaged boolean,
  synthetic_execution_enabled boolean,
  provider_sandbox_traffic_enabled boolean,
  provider_live_traffic_enabled boolean,
  shopping_enabled boolean,
  order_enabled boolean,
  payment_enabled boolean,
  ticketing_enabled boolean,
  servicing_enabled boolean,
  provider_events_enabled boolean,
  production_release_enabled boolean,
  bound_environment text,
  bound_project_ref text,
  bound_database_name text,
  bound_session_user text,
  bound_provider_code text,
  bound_provider_account_sha256 text,
  bound_point_of_sale text,
  bound_content_scope_sha256 text,
  bound_adapter_version_sha256 text,
  bound_payment_processor_code text,
  bound_payment_account_sha256 text,
  bound_payment_environment text,
  bound_payment_source_sha256 text,
  bound_payment_adapter_version_sha256 text,
  bound_provider_settlement_processor_code text,
  bound_provider_settlement_account_sha256 text,
  bound_provider_settlement_environment text,
  bound_provider_settlement_source_sha256 text,
  bound_provider_settlement_adapter_version_sha256 text,
  bound_execution_scope_sha256 text,
  activation_evidence_sha256 text,
  runtime_control_receipt_sha256 text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $flight_consumer_preview_authority$
declare
  v_control public.flight_runtime_controls;
  v_receipt public.flight_runtime_control_receipts;
  v_receipt_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight consumer Preview runtime authority is service-role only';
  end if;

  select * into v_control
    from public.flight_runtime_controls
   where flight_runtime_controls.control_key = 'global';
  if not found
    or v_control.execution_kill_switch_engaged
    or v_control.synthetic_execution_enabled
    or not v_control.provider_sandbox_traffic_enabled
    or v_control.provider_live_traffic_enabled
    or not v_control.shopping_enabled
    or not v_control.order_enabled
    or not v_control.payment_enabled
    or not v_control.ticketing_enabled
    or v_control.servicing_enabled
    or not v_control.provider_events_enabled
    or v_control.production_release_enabled
    or v_control.bound_environment is distinct from 'preview'
    or v_control.bound_project_ref is distinct from 'eiqmdldjnedqgbtoozqa'
    or v_control.bound_database_name is distinct from current_database()::text
    or v_control.bound_session_user is distinct from session_user::text
    or v_control.bound_provider_code is distinct from 'duffel'
    or v_control.bound_point_of_sale is distinct from 'US'
    or v_control.bound_provider_account_sha256 is null
    or v_control.bound_provider_account_sha256 !~ '^[0-9a-f]{64}$'
    or v_control.bound_content_scope_sha256 is null
    or v_control.bound_content_scope_sha256 !~ '^[0-9a-f]{64}$'
    or v_control.bound_adapter_version_sha256 is null
    or v_control.bound_adapter_version_sha256 !~ '^[0-9a-f]{64}$'
    or v_control.bound_payment_processor_code is distinct from 'stripe'
    or v_control.bound_payment_environment is distinct from 'test'
    or v_control.bound_payment_account_sha256 is null
    or v_control.bound_payment_account_sha256 !~ '^[0-9a-f]{64}$'
    or v_control.bound_payment_source_sha256 is null
    or v_control.bound_payment_source_sha256 !~ '^[0-9a-f]{64}$'
    or v_control.bound_payment_adapter_version_sha256 is null
    or v_control.bound_payment_adapter_version_sha256 !~ '^[0-9a-f]{64}$'
    or v_control.bound_provider_settlement_processor_code is distinct from 'duffel_balance'
    or v_control.bound_provider_settlement_environment is distinct from 'test'
    or v_control.bound_provider_settlement_account_sha256 is null
    or v_control.bound_provider_settlement_account_sha256 !~ '^[0-9a-f]{64}$'
    or v_control.bound_provider_settlement_source_sha256 is null
    or v_control.bound_provider_settlement_source_sha256 !~ '^[0-9a-f]{64}$'
    or v_control.bound_provider_settlement_adapter_version_sha256 is null
    or v_control.bound_provider_settlement_adapter_version_sha256 !~ '^[0-9a-f]{64}$'
    or v_control.bound_execution_scope_sha256 is null
    or v_control.bound_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or v_control.activation_evidence_sha256 is null
    or v_control.activation_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or v_control.updated_by is null
    or not exists (
      select 1 from public.profiles
       where profiles.id = v_control.updated_by and profiles.role = 'admin'
    ) then
    raise exception 'Flight consumer Preview runtime authority is disabled or incorrectly bound';
  end if;

  select receipt.* into v_receipt
    from public.flight_runtime_control_receipts as receipt
   where receipt.control_key = v_control.control_key
     and receipt.changed_by = v_control.updated_by
     and receipt.changed_at = v_control.updated_at
     and receipt.activation_evidence_sha256 = v_control.activation_evidence_sha256
     and receipt.execution_kill_switch_engaged = v_control.execution_kill_switch_engaged
     and receipt.synthetic_execution_enabled = v_control.synthetic_execution_enabled
     and receipt.provider_sandbox_traffic_enabled = v_control.provider_sandbox_traffic_enabled
     and receipt.provider_live_traffic_enabled = v_control.provider_live_traffic_enabled
     and receipt.shopping_enabled = v_control.shopping_enabled
     and receipt.order_enabled = v_control.order_enabled
     and receipt.payment_enabled = v_control.payment_enabled
     and receipt.ticketing_enabled = v_control.ticketing_enabled
     and receipt.servicing_enabled = v_control.servicing_enabled
     and receipt.provider_events_enabled = v_control.provider_events_enabled
     and receipt.production_release_enabled = v_control.production_release_enabled
     and receipt.bound_environment is not distinct from v_control.bound_environment
     and receipt.bound_project_ref is not distinct from v_control.bound_project_ref
     and receipt.bound_database_name is not distinct from v_control.bound_database_name
     and receipt.bound_session_user is not distinct from v_control.bound_session_user
     and receipt.bound_provider_code is not distinct from v_control.bound_provider_code
     and receipt.bound_provider_account_sha256
       is not distinct from v_control.bound_provider_account_sha256
     and receipt.bound_point_of_sale is not distinct from v_control.bound_point_of_sale
     and receipt.bound_content_scope_sha256
       is not distinct from v_control.bound_content_scope_sha256
     and receipt.bound_adapter_version_sha256
       is not distinct from v_control.bound_adapter_version_sha256
     and receipt.bound_payment_processor_code
       is not distinct from v_control.bound_payment_processor_code
     and receipt.bound_payment_account_sha256
       is not distinct from v_control.bound_payment_account_sha256
     and receipt.bound_payment_environment
       is not distinct from v_control.bound_payment_environment
     and receipt.bound_payment_source_sha256
       is not distinct from v_control.bound_payment_source_sha256
     and receipt.bound_payment_adapter_version_sha256
       is not distinct from v_control.bound_payment_adapter_version_sha256
     and receipt.bound_provider_settlement_processor_code
       is not distinct from v_control.bound_provider_settlement_processor_code
     and receipt.bound_provider_settlement_account_sha256
       is not distinct from v_control.bound_provider_settlement_account_sha256
     and receipt.bound_provider_settlement_environment
       is not distinct from v_control.bound_provider_settlement_environment
     and receipt.bound_provider_settlement_source_sha256
       is not distinct from v_control.bound_provider_settlement_source_sha256
     and receipt.bound_provider_settlement_adapter_version_sha256
       is not distinct from v_control.bound_provider_settlement_adapter_version_sha256
     and receipt.bound_execution_scope_sha256
       is not distinct from v_control.bound_execution_scope_sha256
   order by receipt.changed_at desc, receipt.id desc
   limit 1;
  if not found then
    raise exception 'Flight consumer Preview runtime control lacks an exact append-only receipt';
  end if;

  v_receipt_sha256 := encode(
    extensions.digest(
      convert_to(
        'iratepilot.flight.runtime-control-receipt.v1' || chr(10)
          || to_jsonb(v_receipt)::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );

  return query select
    'flight-consumer-preview-runtime-authority-v1'::text,
    true,
    v_control.control_key,
    'test'::text,
    v_control.execution_kill_switch_engaged,
    v_control.synthetic_execution_enabled,
    v_control.provider_sandbox_traffic_enabled,
    v_control.provider_live_traffic_enabled,
    v_control.shopping_enabled,
    v_control.order_enabled,
    v_control.payment_enabled,
    v_control.ticketing_enabled,
    v_control.servicing_enabled,
    v_control.provider_events_enabled,
    v_control.production_release_enabled,
    v_control.bound_environment,
    v_control.bound_project_ref,
    v_control.bound_database_name,
    v_control.bound_session_user,
    v_control.bound_provider_code,
    v_control.bound_provider_account_sha256,
    v_control.bound_point_of_sale,
    v_control.bound_content_scope_sha256,
    v_control.bound_adapter_version_sha256,
    v_control.bound_payment_processor_code,
    v_control.bound_payment_account_sha256,
    v_control.bound_payment_environment,
    v_control.bound_payment_source_sha256,
    v_control.bound_payment_adapter_version_sha256,
    v_control.bound_provider_settlement_processor_code,
    v_control.bound_provider_settlement_account_sha256,
    v_control.bound_provider_settlement_environment,
    v_control.bound_provider_settlement_source_sha256,
    v_control.bound_provider_settlement_adapter_version_sha256,
    v_control.bound_execution_scope_sha256,
    v_control.activation_evidence_sha256,
    v_receipt_sha256;
end;
$flight_consumer_preview_authority$;

-- Durable Duffel evidence is an encrypted AES-256-GCM envelope only. The raw
-- offer JSON and decrypted provider identifiers never enter PostgreSQL.
create table public.flight_offer_evidence_vault (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  search_id uuid not null,
  offer_id uuid not null,
  provider_code text not null default 'duffel' check (provider_code = 'duffel'),
  execution_mode text not null default 'test' check (execution_mode = 'test'),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  stage text not null check (stage in ('initial', 'refreshed')),
  predecessor_receipt_sha256 text,
  observed_at timestamptz not null,
  retention_expires_at timestamptz not null,
  raw_body_sha256 text not null check (raw_body_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_sha256 text not null check (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  snapshot_sha256 text not null check (snapshot_sha256 ~ '^[0-9a-f]{64}$'),
  record_sha256 text not null check (record_sha256 ~ '^[0-9a-f]{64}$'),
  receipt_sha256 text not null unique check (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  key_version text not null check (
    key_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
  ),
  iv_base64url text not null check (
    iv_base64url ~ '^[A-Za-z0-9_-]+$' and char_length(iv_base64url) = 16
  ),
  auth_tag_base64url text not null check (
    auth_tag_base64url ~ '^[A-Za-z0-9_-]+$' and char_length(auth_tag_base64url) = 22
  ),
  ciphertext_base64url text not null check (
    ciphertext_base64url ~ '^[A-Za-z0-9_-]+$'
    and char_length(ciphertext_base64url) between 16 and 2100000
  ),
  aad_sha256 text not null check (aad_sha256 ~ '^[0-9a-f]{64}$'),
  record_hmac_sha256 text not null check (record_hmac_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  unique (execution_scope_sha256, offer_id, stage, record_sha256),
  foreign key (predecessor_receipt_sha256)
    references public.flight_offer_evidence_vault(receipt_sha256) on delete restrict,
  foreign key (search_id, customer_id)
    references public.flight_searches(id, customer_id) on delete restrict,
  foreign key (offer_id, search_id)
    references public.flight_offers(id, search_id) on delete restrict,
  check (
    (stage = 'initial' and predecessor_receipt_sha256 is null)
    or (stage = 'refreshed' and predecessor_receipt_sha256 is not null)
  ),
  check (observed_at <= created_at + interval '5 minutes'),
  check (retention_expires_at > observed_at),
  check (retention_expires_at <= observed_at + interval '7 days')
);

create index flight_offer_evidence_vault_retention_idx
  on public.flight_offer_evidence_vault (retention_expires_at);
create index flight_offer_evidence_vault_offer_stage_idx
  on public.flight_offer_evidence_vault (offer_id, stage, observed_at desc);

-- Passenger data uses a separate encrypted envelope and opaque fp_* reference.
-- Tombstones preserve audit/FK identity while irreversibly removing ciphertext.
create table public.flight_secure_pii_records (
  secure_pii_record_ref text primary key check (
    secure_pii_record_ref ~ '^fp_[A-Za-z0-9_-]{16,200}$'
  ),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  order_id uuid not null,
  execution_mode text not null default 'test' check (execution_mode = 'test'),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  traveler_type text not null check (
    traveler_type in ('adult', 'child', 'infant_in_seat', 'infant_on_lap')
  ),
  pii_record_sha256 text not null check (pii_record_sha256 ~ '^[0-9a-f]{64}$'),
  pii_authority_receipt_sha256 text not null unique check (
    pii_authority_receipt_sha256 ~ '^[0-9a-f]{64}$'
  ),
  key_version text not null check (
    key_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
  ),
  iv_base64url text check (
    iv_base64url is null
    or (iv_base64url ~ '^[A-Za-z0-9_-]+$' and char_length(iv_base64url) = 16)
  ),
  auth_tag_base64url text check (
    auth_tag_base64url is null
    or (auth_tag_base64url ~ '^[A-Za-z0-9_-]+$' and char_length(auth_tag_base64url) = 22)
  ),
  ciphertext_base64url text check (
    ciphertext_base64url is null
    or (
      ciphertext_base64url ~ '^[A-Za-z0-9_-]+$'
      and char_length(ciphertext_base64url) between 16 and 6000
    )
  ),
  aad_sha256 text not null check (aad_sha256 ~ '^[0-9a-f]{64}$'),
  pii_hmac_sha256 text not null check (pii_hmac_sha256 ~ '^[0-9a-f]{64}$'),
  retention_expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  unique (secure_pii_record_ref, execution_mode, execution_scope_sha256),
  foreign key (order_id, customer_id)
    references public.flight_orders(id, customer_id) on delete restrict,
  check (retention_expires_at > created_at),
  check (retention_expires_at <= created_at + interval '7 days'),
  check (
    (deleted_at is null
      and iv_base64url is not null
      and auth_tag_base64url is not null
      and ciphertext_base64url is not null)
    or (deleted_at is not null
      and iv_base64url is null
      and auth_tag_base64url is null
      and ciphertext_base64url is null)
  ),
  check (deleted_at is null or deleted_at >= created_at)
);

create index flight_secure_pii_records_retention_idx
  on public.flight_secure_pii_records (retention_expires_at)
  where deleted_at is null;

alter table public.flight_passenger_refs
  add constraint flight_passenger_refs_secure_pii_record_fk
  foreign key (secure_pii_record_ref, execution_mode, execution_scope_sha256)
  references public.flight_secure_pii_records (
    secure_pii_record_ref, execution_mode, execution_scope_sha256
  ) on delete restrict not valid;

create function public.store_flight_offer_evidence_v1(
  p_customer_id uuid,
  p_search_id uuid,
  p_offer_id uuid,
  p_execution_scope_sha256 text,
  p_stage text,
  p_predecessor_receipt_sha256 text,
  p_observed_at timestamptz,
  p_retention_expires_at timestamptz,
  p_raw_body_sha256 text,
  p_evidence_sha256 text,
  p_snapshot_sha256 text,
  p_record_sha256 text,
  p_receipt_sha256 text,
  p_key_version text,
  p_iv_base64url text,
  p_auth_tag_base64url text,
  p_ciphertext_base64url text,
  p_aad_sha256 text,
  p_record_hmac_sha256 text
)
returns table (decision text, evidence_id uuid, receipt_sha256 text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $store_flight_offer_evidence$
declare
  v_existing public.flight_offer_evidence_vault;
  v_inserted public.flight_offer_evidence_vault;
  v_predecessor public.flight_offer_evidence_vault;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight offer evidence vault is service-role only';
  end if;
  if p_stage not in ('initial', 'refreshed') then
    raise exception 'Flight offer evidence stage is invalid';
  end if;
  if not exists (
    select 1
      from public.flight_searches as search
      join public.flight_offers as offer on offer.search_id = search.id
     where search.id = p_search_id
       and search.customer_id = p_customer_id
       and search.execution_mode = 'test'
       and search.execution_scope_sha256 = p_execution_scope_sha256
       and offer.id = p_offer_id
       and offer.provider_code = 'duffel'
       and offer.execution_mode = 'test'
       and offer.execution_scope_sha256 = p_execution_scope_sha256
  ) then
    raise exception 'Flight offer evidence owner, offer, or execution scope does not match';
  end if;

  select * into v_existing
    from public.flight_offer_evidence_vault as evidence
   where evidence.receipt_sha256 = p_receipt_sha256;
  if found then
    if v_existing.customer_id is distinct from p_customer_id
      or v_existing.search_id is distinct from p_search_id
      or v_existing.offer_id is distinct from p_offer_id
      or v_existing.execution_scope_sha256 is distinct from p_execution_scope_sha256
      or v_existing.stage is distinct from p_stage
      or v_existing.predecessor_receipt_sha256
        is distinct from p_predecessor_receipt_sha256
      or v_existing.observed_at is distinct from p_observed_at
      or v_existing.retention_expires_at is distinct from p_retention_expires_at
      or v_existing.raw_body_sha256 is distinct from p_raw_body_sha256
      or v_existing.evidence_sha256 is distinct from p_evidence_sha256
      or v_existing.snapshot_sha256 is distinct from p_snapshot_sha256
      or v_existing.record_sha256 is distinct from p_record_sha256
      or v_existing.key_version is distinct from p_key_version
      or v_existing.iv_base64url is distinct from p_iv_base64url
      or v_existing.auth_tag_base64url is distinct from p_auth_tag_base64url
      or v_existing.ciphertext_base64url is distinct from p_ciphertext_base64url
      or v_existing.aad_sha256 is distinct from p_aad_sha256
      or v_existing.record_hmac_sha256 is distinct from p_record_hmac_sha256 then
      raise exception 'Flight offer evidence receipt collision';
    end if;
    return query select 'replay'::text, v_existing.id, v_existing.receipt_sha256;
    return;
  end if;

  if p_stage = 'initial' and p_predecessor_receipt_sha256 is not null then
    raise exception 'Initial flight offer evidence cannot have a predecessor';
  end if;
  if p_stage = 'refreshed' then
    select * into v_predecessor
      from public.flight_offer_evidence_vault as evidence
     where evidence.receipt_sha256 = p_predecessor_receipt_sha256;
    if not found
      or v_predecessor.customer_id is distinct from p_customer_id
      or v_predecessor.search_id is distinct from p_search_id
      or v_predecessor.offer_id is distinct from p_offer_id
      or v_predecessor.execution_scope_sha256 is distinct from p_execution_scope_sha256
      or v_predecessor.retention_expires_at is distinct from p_retention_expires_at
      or p_observed_at < v_predecessor.observed_at then
      raise exception 'Refreshed flight offer evidence predecessor does not match';
    end if;
  end if;

  insert into public.flight_offer_evidence_vault (
    customer_id, search_id, offer_id, provider_code, execution_mode,
    execution_scope_sha256, stage, predecessor_receipt_sha256,
    observed_at, retention_expires_at, raw_body_sha256, evidence_sha256,
    snapshot_sha256, record_sha256, receipt_sha256, key_version,
    iv_base64url, auth_tag_base64url, ciphertext_base64url,
    aad_sha256, record_hmac_sha256
  ) values (
    p_customer_id, p_search_id, p_offer_id, 'duffel', 'test',
    p_execution_scope_sha256, p_stage, p_predecessor_receipt_sha256,
    p_observed_at, p_retention_expires_at, p_raw_body_sha256, p_evidence_sha256,
    p_snapshot_sha256, p_record_sha256, p_receipt_sha256, p_key_version,
    p_iv_base64url, p_auth_tag_base64url, p_ciphertext_base64url,
    p_aad_sha256, p_record_hmac_sha256
  ) returning * into v_inserted;

  return query select 'created'::text, v_inserted.id, v_inserted.receipt_sha256;
exception
  when unique_violation then
    raise exception 'Flight offer evidence identity already exists with different authority';
end;
$store_flight_offer_evidence$;

create function public.load_flight_offer_evidence_v1(
  p_receipt_sha256 text,
  p_customer_id uuid,
  p_execution_scope_sha256 text
)
returns table (
  evidence_id uuid,
  customer_id uuid,
  search_id uuid,
  offer_id uuid,
  stage text,
  predecessor_receipt_sha256 text,
  observed_at timestamptz,
  retention_expires_at timestamptz,
  raw_body_sha256 text,
  evidence_sha256 text,
  snapshot_sha256 text,
  record_sha256 text,
  receipt_sha256 text,
  key_version text,
  iv_base64url text,
  auth_tag_base64url text,
  ciphertext_base64url text,
  aad_sha256 text,
  record_hmac_sha256 text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $load_flight_offer_evidence$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight offer evidence vault is service-role only';
  end if;
  return query
  select evidence.id, evidence.customer_id, evidence.search_id, evidence.offer_id,
    evidence.stage, evidence.predecessor_receipt_sha256, evidence.observed_at,
    evidence.retention_expires_at, evidence.raw_body_sha256, evidence.evidence_sha256,
    evidence.snapshot_sha256, evidence.record_sha256, evidence.receipt_sha256,
    evidence.key_version, evidence.iv_base64url, evidence.auth_tag_base64url,
    evidence.ciphertext_base64url, evidence.aad_sha256, evidence.record_hmac_sha256
    from public.flight_offer_evidence_vault as evidence
   where evidence.receipt_sha256 = p_receipt_sha256
     and evidence.customer_id = p_customer_id
     and evidence.execution_scope_sha256 = p_execution_scope_sha256
     and evidence.execution_mode = 'test'
     and evidence.retention_expires_at > clock_timestamp();
end;
$load_flight_offer_evidence$;

create function public.purge_expired_flight_offer_evidence_v1(
  p_before timestamptz default clock_timestamp()
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public
as $purge_flight_offer_evidence$
declare
  v_batch_deleted bigint;
  v_total_deleted bigint := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight offer evidence purge is service-role only';
  end if;
  if p_before > clock_timestamp() then
    raise exception 'Flight offer evidence purge cannot delete before a future time';
  end if;
  -- Delete only expired leaves. Repeating leaf-first lets an entirely expired
  -- chain drain in one call while an unexpired descendant protects every
  -- ancestor and can never cause a self-FK failure or premature deletion.
  loop
    with expired_leaves as (
      select evidence.id
        from public.flight_offer_evidence_vault as evidence
       where evidence.retention_expires_at <= p_before
         and not exists (
           select 1 from public.flight_offer_evidence_vault as successor
            where successor.predecessor_receipt_sha256 = evidence.receipt_sha256
         )
       order by evidence.retention_expires_at, evidence.id
       limit 1000
    )
    delete from public.flight_offer_evidence_vault as evidence
     using expired_leaves
     where evidence.id = expired_leaves.id;
    get diagnostics v_batch_deleted = row_count;
    v_total_deleted := v_total_deleted + v_batch_deleted;
    exit when v_batch_deleted = 0;
  end loop;
  return v_total_deleted;
end;
$purge_flight_offer_evidence$;

create function public.store_flight_secure_pii_record_v1(
  p_secure_pii_record_ref text,
  p_customer_id uuid,
  p_order_id uuid,
  p_execution_scope_sha256 text,
  p_traveler_type text,
  p_pii_record_sha256 text,
  p_pii_authority_receipt_sha256 text,
  p_retention_expires_at timestamptz,
  p_key_version text,
  p_iv_base64url text,
  p_auth_tag_base64url text,
  p_ciphertext_base64url text,
  p_aad_sha256 text,
  p_pii_hmac_sha256 text
)
returns table (decision text, secure_pii_record_ref text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $store_flight_secure_pii$
declare
  v_existing public.flight_secure_pii_records;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight secure PII vault is service-role only';
  end if;
  if not exists (
    select 1 from public.flight_orders as flight_order
     where flight_order.id = p_order_id
       and flight_order.customer_id = p_customer_id
       and flight_order.execution_mode = 'test'
       and flight_order.execution_scope_sha256 = p_execution_scope_sha256
       and flight_order.status in ('pending_payment', 'payment_authorized')
  ) or not exists (
    select 1 from public.flight_runtime_controls as control
     where control.control_key = 'global'
       and control.bound_environment = 'preview'
       and control.bound_project_ref = 'eiqmdldjnedqgbtoozqa'
       and control.bound_execution_scope_sha256 = p_execution_scope_sha256
  ) then
    raise exception 'Flight secure PII customer or execution scope is unavailable';
  end if;

  select * into v_existing
    from public.flight_secure_pii_records as pii
   where pii.secure_pii_record_ref = p_secure_pii_record_ref;
  if found then
    if v_existing.deleted_at is not null
      or v_existing.customer_id is distinct from p_customer_id
      or v_existing.order_id is distinct from p_order_id
      or v_existing.execution_scope_sha256 is distinct from p_execution_scope_sha256
      or v_existing.traveler_type is distinct from p_traveler_type
      or v_existing.pii_record_sha256 is distinct from p_pii_record_sha256
      or v_existing.pii_authority_receipt_sha256
        is distinct from p_pii_authority_receipt_sha256
      or v_existing.retention_expires_at is distinct from p_retention_expires_at
      or v_existing.key_version is distinct from p_key_version
      or v_existing.iv_base64url is distinct from p_iv_base64url
      or v_existing.auth_tag_base64url is distinct from p_auth_tag_base64url
      or v_existing.ciphertext_base64url is distinct from p_ciphertext_base64url
      or v_existing.aad_sha256 is distinct from p_aad_sha256
      or v_existing.pii_hmac_sha256 is distinct from p_pii_hmac_sha256 then
      raise exception 'Flight secure PII reference collision';
    end if;
    return query select 'replay'::text, v_existing.secure_pii_record_ref;
    return;
  end if;

  insert into public.flight_secure_pii_records (
    secure_pii_record_ref, customer_id, order_id, execution_mode, execution_scope_sha256,
    traveler_type, pii_record_sha256, pii_authority_receipt_sha256,
    key_version, iv_base64url, auth_tag_base64url, ciphertext_base64url,
    aad_sha256, pii_hmac_sha256, retention_expires_at
  ) values (
    p_secure_pii_record_ref, p_customer_id, p_order_id, 'test', p_execution_scope_sha256,
    p_traveler_type, p_pii_record_sha256, p_pii_authority_receipt_sha256,
    p_key_version, p_iv_base64url, p_auth_tag_base64url, p_ciphertext_base64url,
    p_aad_sha256, p_pii_hmac_sha256, p_retention_expires_at
  );
  return query select 'created'::text, p_secure_pii_record_ref;
exception
  when unique_violation then
    raise exception 'Flight secure PII authority already belongs to another record';
end;
$store_flight_secure_pii$;

create function public.load_flight_secure_pii_record_v1(
  p_secure_pii_record_ref text,
  p_customer_id uuid,
  p_execution_scope_sha256 text
)
returns table (
  secure_pii_record_ref text,
  customer_id uuid,
  order_id uuid,
  execution_scope_sha256 text,
  traveler_type text,
  pii_record_sha256 text,
  pii_authority_receipt_sha256 text,
  retention_expires_at timestamptz,
  key_version text,
  iv_base64url text,
  auth_tag_base64url text,
  ciphertext_base64url text,
  aad_sha256 text,
  pii_hmac_sha256 text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $load_flight_secure_pii$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight secure PII vault is service-role only';
  end if;
  return query
  select pii.secure_pii_record_ref, pii.customer_id, pii.order_id,
    pii.execution_scope_sha256,
    pii.traveler_type, pii.pii_record_sha256, pii.pii_authority_receipt_sha256,
    pii.retention_expires_at, pii.key_version, pii.iv_base64url,
    pii.auth_tag_base64url, pii.ciphertext_base64url,
    pii.aad_sha256, pii.pii_hmac_sha256
    from public.flight_secure_pii_records as pii
   where pii.secure_pii_record_ref = p_secure_pii_record_ref
     and pii.customer_id = p_customer_id
     and pii.execution_mode = 'test'
     and pii.execution_scope_sha256 = p_execution_scope_sha256
     and pii.deleted_at is null
     and pii.retention_expires_at > clock_timestamp();
end;
$load_flight_secure_pii$;

create function public.tombstone_flight_secure_pii_record_v1(
  p_secure_pii_record_ref text,
  p_customer_id uuid,
  p_execution_scope_sha256 text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $tombstone_flight_secure_pii$
declare
  v_deleted boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight secure PII vault is service-role only';
  end if;
  if exists (
    select 1
      from public.flight_passenger_refs as passenger
      join public.flight_orders as flight_order on flight_order.id = passenger.order_id
     where passenger.secure_pii_record_ref = p_secure_pii_record_ref
       and passenger.execution_mode = 'test'
       and passenger.execution_scope_sha256 = p_execution_scope_sha256
       and flight_order.customer_id = p_customer_id
       and flight_order.status in ('pending_payment', 'payment_authorized', 'order_creating')
  ) then
    raise exception 'Flight secure PII cannot be deleted during an active order dispatch';
  end if;
  update public.flight_secure_pii_records as pii
     set iv_base64url = null,
         auth_tag_base64url = null,
         ciphertext_base64url = null,
         deleted_at = clock_timestamp()
   where pii.secure_pii_record_ref = p_secure_pii_record_ref
     and pii.customer_id = p_customer_id
     and pii.execution_mode = 'test'
     and pii.execution_scope_sha256 = p_execution_scope_sha256
     and pii.deleted_at is null;
  v_deleted := found;
  return v_deleted;
end;
$tombstone_flight_secure_pii$;

create function public.validate_flight_secure_pii_reference_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $validate_flight_secure_pii$
declare
  v_customer_id uuid;
begin
  select flight_order.customer_id into v_customer_id
    from public.flight_orders as flight_order
   where flight_order.id = new.order_id;
  if v_customer_id is null or not exists (
    select 1 from public.flight_secure_pii_records as pii
     where pii.secure_pii_record_ref = new.secure_pii_record_ref
       and pii.customer_id = v_customer_id
       and pii.order_id = new.order_id
       and pii.execution_mode = new.execution_mode
       and pii.execution_scope_sha256 = new.execution_scope_sha256
       and pii.traveler_type = new.traveler_type
       and pii.pii_record_sha256 = new.pii_record_sha256
       and pii.deleted_at is null
       and pii.retention_expires_at > clock_timestamp()
  ) then
    raise exception 'Active owner-bound encrypted flight PII evidence is required';
  end if;
  return new;
end;
$validate_flight_secure_pii$;

create trigger flight_passenger_refs_secure_pii_guard
before insert or update of order_id, execution_mode, execution_scope_sha256,
  traveler_type, secure_pii_record_ref, pii_record_sha256
on public.flight_passenger_refs
for each row execute function public.validate_flight_secure_pii_reference_v1();

-- Link the digest-only provider journal to the durable consumer aggregate.
-- Version NULL is the exact legacy 069/070 shape. Version 1 is owner-linked,
-- and a consumer create_order can have only one attempt for its entire life.
alter table public.flight_provider_request_attempts
  add column consumer_flow_version smallint check (
    consumer_flow_version is null or consumer_flow_version = 1
  ),
  add column customer_id uuid,
  add column search_id uuid,
  add column offer_id uuid,
  add column order_id uuid,
  add column offer_evidence_receipt_sha256 text check (
    offer_evidence_receipt_sha256 is null
    or offer_evidence_receipt_sha256 ~ '^[0-9a-f]{64}$'
  ),
  add column payment_binding_receipt_sha256 text check (
    payment_binding_receipt_sha256 is null
    or payment_binding_receipt_sha256 ~ '^[0-9a-f]{64}$'
  ),
  add column provider_settlement_binding_receipt_sha256 text check (
    provider_settlement_binding_receipt_sha256 is null
    or provider_settlement_binding_receipt_sha256 ~ '^[0-9a-f]{64}$'
  );

alter table public.flight_provider_request_attempts
  add constraint flight_provider_request_attempts_consumer_link_check
  check (
    (
      consumer_flow_version is null
      and customer_id is null
      and search_id is null
      and offer_id is null
      and order_id is null
      and offer_evidence_receipt_sha256 is null
      and payment_binding_receipt_sha256 is null
      and provider_settlement_binding_receipt_sha256 is null
    )
    or (
      consumer_flow_version = 1
      and customer_id is not null
      and search_id is not null
      and (
        (operation = 'create_offer_request'
          and offer_id is null and order_id is null
          and offer_evidence_receipt_sha256 is null
          and payment_binding_receipt_sha256 is null
          and provider_settlement_binding_receipt_sha256 is null)
        or (operation in ('retrieve_offer', 'list_orders_by_offer')
          and offer_id is not null and order_id is null
          and payment_binding_receipt_sha256 is null
          and provider_settlement_binding_receipt_sha256 is null)
        or (operation = 'create_order'
          and offer_id is not null and order_id is not null
          and offer_evidence_receipt_sha256 is not null
          and payment_binding_receipt_sha256 is not null
          and provider_settlement_binding_receipt_sha256 is not null)
      )
    )
  );

alter table public.flight_provider_request_attempts
  add constraint flight_provider_request_attempts_customer_fk
    foreign key (customer_id) references public.profiles(id) on delete restrict not valid,
  add constraint flight_provider_request_attempts_search_customer_fk
    foreign key (search_id, customer_id)
    references public.flight_searches(id, customer_id) on delete restrict not valid,
  add constraint flight_provider_request_attempts_offer_search_fk
    foreign key (offer_id, search_id)
    references public.flight_offers(id, search_id) on delete restrict not valid,
  add constraint flight_provider_request_attempts_order_customer_fk
    foreign key (order_id, customer_id)
    references public.flight_orders(id, customer_id) on delete restrict not valid,
  add constraint flight_provider_request_attempts_consumer_order_offer_check
    check (consumer_flow_version is null or order_id is null or (
      operation = 'create_order' and offer_id is not null
    )) not valid;

create unique index flight_provider_request_attempts_consumer_order_uidx
  on public.flight_provider_request_attempts (order_id)
  where consumer_flow_version = 1 and operation = 'create_order';

create index flight_provider_request_attempts_consumer_search_idx
  on public.flight_provider_request_attempts (customer_id, search_id, prepared_at desc)
  where consumer_flow_version = 1;

create or replace function public.protect_flight_provider_request_attempt()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $flight_provider_attempt_guard$
begin
  if tg_op = 'DELETE' then
    raise exception 'Flight provider request-attempt evidence is append-preserving';
  end if;

  if new.id is distinct from old.id
    or new.tenant_id is distinct from old.tenant_id
    or new.commerce_id is distinct from old.commerce_id
    or new.operation is distinct from old.operation
    or new.provider_code is distinct from old.provider_code
    or new.execution_mode is distinct from old.execution_mode
    or new.execution_scope_sha256 is distinct from old.execution_scope_sha256
    or new.activation_evidence_sha256 is distinct from old.activation_evidence_sha256
    or new.adapter_version_sha256 is distinct from old.adapter_version_sha256
    or new.adapter_source_sha256 is distinct from old.adapter_source_sha256
    or new.provider_account_sha256 is distinct from old.provider_account_sha256
    or new.point_of_sale_sha256 is distinct from old.point_of_sale_sha256
    or new.content_scope_sha256 is distinct from old.content_scope_sha256
    or new.provider_binding_receipt_sha256
      is distinct from old.provider_binding_receipt_sha256
    or new.request_plan_sha256 is distinct from old.request_plan_sha256
    or new.request_sha256 is distinct from old.request_sha256
    or new.request_body_sha256 is distinct from old.request_body_sha256
    or new.operation_authority_receipt_sha256
      is distinct from old.operation_authority_receipt_sha256
    or new.dispatch_not_after is distinct from old.dispatch_not_after
    or new.retry_authorized is distinct from old.retry_authorized
    or new.prepared_at is distinct from old.prepared_at
    or new.consumer_flow_version is distinct from old.consumer_flow_version
    or new.customer_id is distinct from old.customer_id
    or new.search_id is distinct from old.search_id
    or new.offer_id is distinct from old.offer_id
    or new.order_id is distinct from old.order_id
    or new.offer_evidence_receipt_sha256
      is distinct from old.offer_evidence_receipt_sha256
    or new.payment_binding_receipt_sha256
      is distinct from old.payment_binding_receipt_sha256
    or new.provider_settlement_binding_receipt_sha256
      is distinct from old.provider_settlement_binding_receipt_sha256 then
    raise exception 'Flight provider request-attempt identity is immutable';
  end if;

  if new.revision <> old.revision + 1 then
    raise exception 'Flight provider request-attempt revision must advance by exact CAS';
  end if;
  if old.state = 'prepared' and new.state = 'dispatching' then
    if new.dispatch_started_at is null
      or new.completed_at is not null
      or new.terminal_http_status is not null
      or new.terminal_response_sha256 is not null
      or new.terminal_response_bytes is not null
      or new.terminal_receipt_sha256 is not null then
      raise exception 'Prepared-to-dispatching transition evidence is malformed';
    end if;
    return new;
  end if;
  if old.state = 'prepared' and new.state = 'blocked' then
    if new.dispatch_started_at is not null
      or new.completed_at is null
      or new.terminal_http_status is not null
      or new.terminal_response_sha256 is not null
      or new.terminal_response_bytes is not null
      or new.terminal_receipt_sha256 is null then
      raise exception 'Prepared-to-blocked transition evidence is malformed';
    end if;
    return new;
  end if;
  if old.state = 'dispatching'
    and new.state in ('succeeded', 'failed', 'ambiguous') then
    if new.dispatch_started_at is distinct from old.dispatch_started_at
      or new.completed_at is null
      or new.terminal_receipt_sha256 is null then
      raise exception 'Dispatch terminal transition evidence is malformed';
    end if;
    return new;
  end if;
  raise exception 'Flight provider request-attempt transition is not authorized';
end;
$flight_provider_attempt_guard$;

create function public.begin_flight_consumer_search_v1(
  p_key_sha256 text,
  p_request_sha256 text,
  p_request_fingerprint_sha256 text,
  p_journey_type text,
  p_origin_iata text,
  p_destination_iata text,
  p_departure_date date,
  p_return_date date,
  p_cabin text,
  p_adult_count smallint,
  p_child_count smallint,
  p_infant_in_seat_count smallint,
  p_infant_on_lap_count smallint,
  p_expires_at timestamptz
)
returns table (decision text, search_id uuid, search_status text)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $begin_flight_consumer_search$
declare
  v_actor uuid := auth.uid();
  v_control public.flight_runtime_controls;
  v_idempotency public.flight_idempotency_records;
  v_search public.flight_searches;
  v_response_sha256 text;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or v_actor is null then
    raise exception 'Flight consumer search requires an authenticated customer';
  end if;
  select * into v_control
    from public.flight_runtime_controls
   where control_key = 'global'
   for share;
  if not found
    or v_control.execution_kill_switch_engaged
    or v_control.synthetic_execution_enabled
    or not v_control.provider_sandbox_traffic_enabled
    or v_control.provider_live_traffic_enabled
    or not v_control.shopping_enabled
    or v_control.bound_environment is distinct from 'preview'
    or v_control.bound_project_ref is distinct from 'eiqmdldjnedqgbtoozqa'
    or v_control.bound_database_name is distinct from current_database()::text
    or v_control.bound_session_user is distinct from session_user::text
    or v_control.bound_provider_code is distinct from 'duffel'
    or v_control.bound_execution_scope_sha256 is null
    or v_control.bound_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or v_control.activation_evidence_sha256 is null
    or v_control.activation_evidence_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight consumer Preview shopping authority is disabled';
  end if;

  perform set_config('app.flight_environment', v_control.bound_environment, true);
  perform set_config('app.flight_project_ref', v_control.bound_project_ref, true);
  perform set_config('app.flight_execution_authorized', 'true', true);
  perform set_config(
    'app.flight_activation_evidence_sha256', v_control.activation_evidence_sha256, true
  );
  if not public.flight_runtime_capability_enabled(
    'test', 'shopping', 'duffel', null, v_control.bound_execution_scope_sha256
  ) then
    raise exception 'Flight consumer Preview shopping receipt is unavailable';
  end if;

  select * into v_idempotency
    from public.flight_idempotency_records as idempotency
   where idempotency.execution_scope_sha256 = v_control.bound_execution_scope_sha256
     and idempotency.execution_mode = 'test'
     and idempotency.scope = 'search'
     and idempotency.key_sha256 = p_key_sha256
   for update;
  if found then
    if v_idempotency.request_sha256 is distinct from p_request_sha256
      or v_idempotency.status <> 'succeeded'
      or v_idempotency.resource_type <> 'flight_search' then
      raise exception 'Flight consumer search idempotency key conflicts or is unresolved';
    end if;
    select * into v_search
      from public.flight_searches as search
     where search.id = v_idempotency.resource_id
       and search.customer_id = v_actor;
    if not found then
      raise exception 'Flight consumer search replay does not belong to the actor';
    end if;
    return query select 'replay'::text, v_search.id, v_search.status;
    return;
  end if;

  v_now := clock_timestamp();
  insert into public.flight_idempotency_records (
    scope, execution_mode, execution_scope_sha256, key_sha256, request_sha256,
    status, locked_until, created_at, updated_at
  ) values (
    'search', 'test', v_control.bound_execution_scope_sha256,
    p_key_sha256, p_request_sha256, 'in_progress', v_now + interval '5 minutes',
    v_now, v_now
  ) returning * into v_idempotency;

  insert into public.flight_searches (
    customer_id, request_fingerprint_sha256, execution_mode,
    execution_scope_sha256, journey_type, origin_iata, destination_iata,
    departure_date, return_date, cabin, adult_count, child_count,
    infant_in_seat_count, infant_on_lap_count, status, expires_at,
    created_at, updated_at
  ) values (
    v_actor, p_request_fingerprint_sha256, 'test',
    v_control.bound_execution_scope_sha256, p_journey_type,
    upper(p_origin_iata), upper(p_destination_iata), p_departure_date,
    p_return_date, p_cabin, p_adult_count, p_child_count,
    p_infant_in_seat_count, p_infant_on_lap_count, 'created', p_expires_at,
    v_now, v_now
  ) returning * into v_search;

  v_response_sha256 := encode(
    extensions.digest(
      convert_to(
        jsonb_build_object(
          'domain', 'iratepilot.flight.consumer-search.v1',
          'search_id', v_search.id::text,
          'customer_id', v_actor::text,
          'request_sha256', p_request_sha256,
          'request_fingerprint_sha256', p_request_fingerprint_sha256,
          'execution_scope_sha256', v_control.bound_execution_scope_sha256
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  update public.flight_idempotency_records
     set response_sha256 = v_response_sha256,
         resource_type = 'flight_search',
         resource_id = v_search.id,
         status = 'succeeded',
         locked_until = greatest(locked_until, v_now + interval '5 minutes')
   where id = v_idempotency.id;

  return query select 'created'::text, v_search.id, v_search.status;
exception
  when unique_violation then
    raise exception 'Flight consumer search identity already exists with different authority';
end;
$begin_flight_consumer_search$;

create function public.prepare_flight_consumer_duffel_order_attempt_v1(
  p_order_id uuid,
  p_offer_evidence_receipt_sha256 text,
  p_request_plan_sha256 text,
  p_request_sha256 text,
  p_request_body_sha256 text,
  p_adapter_source_sha256 text,
  p_provider_binding_receipt_sha256 text,
  p_payment_binding_receipt_sha256 text,
  p_provider_settlement_binding_receipt_sha256 text,
  p_operation_authority_receipt_sha256 text,
  p_dispatch_not_after timestamptz
)
returns table (
  decision text,
  attempt_id uuid,
  attempt_revision integer,
  attempt_state text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $prepare_flight_consumer_order$
declare
  v_control public.flight_runtime_controls;
  v_order public.flight_orders;
  v_search public.flight_searches;
  v_reprice public.flight_reprice_receipts;
  v_payment public.flight_payments;
  v_evidence public.flight_offer_evidence_vault;
  v_attempt public.flight_provider_request_attempts;
  v_point_of_sale_sha256 text;
  v_now timestamptz;
  v_expected_travelers integer;
  v_actual_travelers integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight consumer Duffel order preparation is service-role only';
  end if;
  select * into v_order
    from public.flight_orders as flight_order
   where flight_order.id = p_order_id
   for update;
  if not found then
    raise exception 'Flight consumer order is unavailable';
  end if;

  select * into v_attempt
    from public.flight_provider_request_attempts as attempt
   where attempt.order_id = p_order_id
     and attempt.consumer_flow_version = 1
     and attempt.operation = 'create_order'
   for update;
  if found then
    if v_attempt.offer_evidence_receipt_sha256
        is distinct from p_offer_evidence_receipt_sha256
      or v_attempt.request_plan_sha256 is distinct from p_request_plan_sha256
      or v_attempt.request_sha256 is distinct from p_request_sha256
      or v_attempt.request_body_sha256 is distinct from p_request_body_sha256
      or v_attempt.adapter_source_sha256 is distinct from p_adapter_source_sha256
      or v_attempt.provider_binding_receipt_sha256
        is distinct from p_provider_binding_receipt_sha256
      or v_attempt.payment_binding_receipt_sha256
        is distinct from p_payment_binding_receipt_sha256
      or v_attempt.provider_settlement_binding_receipt_sha256
        is distinct from p_provider_settlement_binding_receipt_sha256
      or v_attempt.operation_authority_receipt_sha256
        is distinct from p_operation_authority_receipt_sha256
      or v_attempt.dispatch_not_after is distinct from p_dispatch_not_after then
      raise exception 'Flight consumer order already has a different provider attempt';
    end if;
    return query select 'replay'::text, v_attempt.id, v_attempt.revision, v_attempt.state;
    return;
  end if;

  if v_order.execution_mode <> 'test'
    or v_order.provider_code <> 'duffel'
    or v_order.status <> 'payment_authorized'
    or v_order.provider_order_ref_sha256 is not null then
    raise exception 'Flight consumer order is not ready for its one provider attempt';
  end if;
  select * into v_control
    from public.flight_runtime_controls
   where control_key = 'global'
   for update;
  if not found
    or v_control.execution_kill_switch_engaged
    or v_control.synthetic_execution_enabled
    or not v_control.provider_sandbox_traffic_enabled
    or v_control.provider_live_traffic_enabled
    or not v_control.shopping_enabled
    or not v_control.order_enabled
    or not v_control.payment_enabled
    or not v_control.ticketing_enabled
    or v_control.servicing_enabled
    or not v_control.provider_events_enabled
    or v_control.production_release_enabled
    or v_control.bound_environment is distinct from 'preview'
    or v_control.bound_project_ref is distinct from 'eiqmdldjnedqgbtoozqa'
    or v_control.bound_database_name is distinct from current_database()::text
    or v_control.bound_session_user is distinct from session_user::text
    or v_control.bound_provider_code is distinct from 'duffel'
    or v_control.bound_payment_processor_code is distinct from 'stripe'
    or v_control.bound_payment_environment is distinct from 'test'
    or v_control.bound_provider_settlement_processor_code is distinct from 'duffel_balance'
    or v_control.bound_provider_settlement_environment is distinct from 'test'
    or v_control.bound_execution_scope_sha256 is distinct from v_order.execution_scope_sha256 then
    raise exception 'Flight consumer Preview split payment/settlement authority is disabled';
  end if;

  perform set_config('app.flight_environment', v_control.bound_environment, true);
  perform set_config('app.flight_project_ref', v_control.bound_project_ref, true);
  perform set_config('app.flight_execution_authorized', 'true', true);
  perform set_config(
    'app.flight_activation_evidence_sha256', v_control.activation_evidence_sha256, true
  );
  perform set_config('app.flight_adapter_source_sha256', p_adapter_source_sha256, true);
  perform set_config(
    'app.flight_provider_binding_receipt_sha256', p_provider_binding_receipt_sha256, true
  );
  perform set_config(
    'app.flight_customer_payment_binding_receipt_sha256',
    p_payment_binding_receipt_sha256,
    true
  );
  perform set_config(
    'app.flight_provider_settlement_binding_receipt_sha256',
    p_provider_settlement_binding_receipt_sha256,
    true
  );
  perform set_config(
    'app.flight_request_authority_receipt_sha256',
    p_operation_authority_receipt_sha256,
    true
  );
  if not public.flight_runtime_capability_enabled(
      'test', 'order', 'duffel', null, v_order.execution_scope_sha256
    ) or not public.flight_runtime_capability_enabled(
      'test', 'payment', 'duffel', 'stripe', v_order.execution_scope_sha256
    ) or not public.flight_runtime_capability_enabled(
      'test', 'ticketing', 'duffel', null, v_order.execution_scope_sha256
    ) then
    raise exception 'Flight consumer order, Stripe payment, or ticketing receipt is unavailable';
  end if;

  select * into v_search
    from public.flight_searches as search
   where search.id = v_order.search_id
     and search.customer_id = v_order.customer_id
     and search.execution_mode = 'test'
     and search.execution_scope_sha256 = v_order.execution_scope_sha256
   for share;
  select * into v_reprice
    from public.flight_reprice_receipts as reprice
   where reprice.id = v_order.reprice_receipt_id
     and reprice.offer_id = v_order.offer_id
     and reprice.execution_mode = 'test'
     and reprice.execution_scope_sha256 = v_order.execution_scope_sha256
   for share;
  select * into v_payment
    from public.flight_payments as payment
   where payment.order_id = v_order.id
     and payment.execution_mode = 'test'
     and payment.execution_scope_sha256 = v_order.execution_scope_sha256
     and payment.processor_code = 'stripe'
     and payment.currency = v_order.currency
     and payment.authorized_cents = v_order.total_cents
     and payment.captured_cents = v_order.total_cents
     and payment.refunded_cents = 0
     and payment.status = 'captured'
   for share;
  select * into v_evidence
    from public.flight_offer_evidence_vault as evidence
   where evidence.receipt_sha256 = p_offer_evidence_receipt_sha256
     and evidence.customer_id = v_order.customer_id
     and evidence.search_id = v_order.search_id
     and evidence.offer_id = v_order.offer_id
     and evidence.execution_mode = 'test'
     and evidence.execution_scope_sha256 = v_order.execution_scope_sha256
     and evidence.provider_code = 'duffel'
     and evidence.stage = 'refreshed'
     and evidence.retention_expires_at > clock_timestamp()
   for share;
  if v_search.id is null or v_reprice.id is null or v_payment.id is null
    or v_evidence.id is null
    or v_reprice.status not in ('confirmed', 'price_changed')
    or v_reprice.expires_at <= clock_timestamp()
    or (v_reprice.status = 'price_changed' and (
      v_reprice.customer_accepted_by is distinct from v_order.customer_id
      or v_reprice.customer_acceptance_version is distinct from 1
      or v_reprice.customer_accepted_currency is distinct from v_order.currency
      or v_reprice.customer_accepted_total_cents is distinct from v_order.total_cents
    )) then
    raise exception 'Flight consumer order lacks current reprice, payment, or offer evidence';
  end if;

  v_expected_travelers := v_search.adult_count + v_search.child_count
    + v_search.infant_in_seat_count + v_search.infant_on_lap_count;
  select count(*) into v_actual_travelers
    from public.flight_passenger_refs as passenger
    join public.flight_secure_pii_records as pii
      on pii.secure_pii_record_ref = passenger.secure_pii_record_ref
     and pii.execution_mode = passenger.execution_mode
     and pii.execution_scope_sha256 = passenger.execution_scope_sha256
   where passenger.order_id = v_order.id
     and passenger.execution_mode = 'test'
     and passenger.execution_scope_sha256 = v_order.execution_scope_sha256
     and pii.customer_id = v_order.customer_id
     and pii.traveler_type = passenger.traveler_type
     and pii.pii_record_sha256 = passenger.pii_record_sha256
     and pii.deleted_at is null
     and pii.retention_expires_at > clock_timestamp();
  if v_actual_travelers <> v_expected_travelers then
    raise exception 'Flight consumer order lacks exact active encrypted passenger evidence';
  end if;

  v_now := clock_timestamp();
  if p_dispatch_not_after <= v_now
    or p_dispatch_not_after > v_now + interval '5 minutes' then
    raise exception 'Flight consumer order dispatch deadline is invalid';
  end if;
  v_point_of_sale_sha256 := encode(
    extensions.digest(convert_to(v_control.bound_point_of_sale, 'UTF8'), 'sha256'),
    'hex'
  );
  insert into public.flight_provider_request_attempts (
    tenant_id, commerce_id, operation, provider_code, execution_mode,
    execution_scope_sha256, activation_evidence_sha256,
    adapter_version_sha256, adapter_source_sha256,
    provider_account_sha256, point_of_sale_sha256, content_scope_sha256,
    provider_binding_receipt_sha256, request_plan_sha256, request_sha256,
    request_body_sha256, operation_authority_receipt_sha256,
    dispatch_not_after, state, revision, retry_authorized, prepared_at,
    consumer_flow_version, customer_id, search_id, offer_id, order_id,
    offer_evidence_receipt_sha256, payment_binding_receipt_sha256,
    provider_settlement_binding_receipt_sha256
  ) values (
    'customer:' || v_order.customer_id::text,
    'order:' || v_order.id::text,
    'create_order', 'duffel', 'test', v_order.execution_scope_sha256,
    v_control.activation_evidence_sha256, v_control.bound_adapter_version_sha256,
    p_adapter_source_sha256, v_control.bound_provider_account_sha256,
    v_point_of_sale_sha256, v_control.bound_content_scope_sha256,
    p_provider_binding_receipt_sha256, p_request_plan_sha256, p_request_sha256,
    p_request_body_sha256, p_operation_authority_receipt_sha256,
    p_dispatch_not_after, 'prepared', 0, false, v_now,
    1, v_order.customer_id, v_order.search_id, v_order.offer_id, v_order.id,
    p_offer_evidence_receipt_sha256, p_payment_binding_receipt_sha256,
    p_provider_settlement_binding_receipt_sha256
  ) returning * into v_attempt;

  update public.flight_orders
     set status = 'order_creating'
   where id = v_order.id and status = 'payment_authorized';
  if not found then
    raise exception 'Flight consumer order transition CAS failed';
  end if;
  return query select 'prepared'::text, v_attempt.id, v_attempt.revision, v_attempt.state;
exception
  when unique_violation then
    raise exception 'Flight consumer order already has a provider request identity';
end;
$prepare_flight_consumer_order$;

create function public.claim_flight_consumer_duffel_order_attempt_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_adapter_source_sha256 text,
  p_provider_binding_receipt_sha256 text,
  p_payment_binding_receipt_sha256 text,
  p_provider_settlement_binding_receipt_sha256 text,
  p_operation_authority_receipt_sha256 text
)
returns table (attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $claim_flight_consumer_order$
declare
  v_attempt public.flight_provider_request_attempts;
  v_control public.flight_runtime_controls;
  v_order public.flight_orders;
  v_payment public.flight_payments;
  v_evidence public.flight_offer_evidence_vault;
  v_point_of_sale_sha256 text;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight consumer Duffel order dispatch claim is service-role only';
  end if;
  select * into v_attempt
    from public.flight_provider_request_attempts as attempt
   where attempt.id = p_attempt_id
   for update;
  if not found
    or v_attempt.consumer_flow_version <> 1
    or v_attempt.operation <> 'create_order'
    or v_attempt.provider_code <> 'duffel'
    or v_attempt.execution_mode <> 'test'
    or v_attempt.order_id is null
    or v_attempt.state <> 'prepared'
    or v_attempt.revision <> p_expected_revision then
    raise exception 'Flight consumer Duffel order dispatch CAS failed';
  end if;
  select * into v_order
    from public.flight_orders as flight_order
   where flight_order.id = v_attempt.order_id
     and flight_order.customer_id = v_attempt.customer_id
     and flight_order.search_id = v_attempt.search_id
     and flight_order.offer_id = v_attempt.offer_id
   for update;
  if not found
    or v_order.status <> 'order_creating'
    or v_order.execution_mode <> 'test'
    or v_order.provider_code <> 'duffel'
    or v_order.provider_order_ref_sha256 is not null then
    raise exception 'Flight consumer order changed before provider dispatch';
  end if;
  select * into v_control
    from public.flight_runtime_controls
   where control_key = 'global'
   for update;
  if not found
    or v_control.execution_kill_switch_engaged
    or v_control.synthetic_execution_enabled
    or not v_control.provider_sandbox_traffic_enabled
    or v_control.provider_live_traffic_enabled
    or not v_control.shopping_enabled
    or not v_control.order_enabled
    or not v_control.payment_enabled
    or not v_control.ticketing_enabled
    or v_control.servicing_enabled
    or not v_control.provider_events_enabled
    or v_control.production_release_enabled
    or v_control.bound_environment is distinct from 'preview'
    or v_control.bound_project_ref is distinct from 'eiqmdldjnedqgbtoozqa'
    or v_control.bound_database_name is distinct from current_database()::text
    or v_control.bound_session_user is distinct from session_user::text
    or v_control.bound_provider_code is distinct from 'duffel'
    or v_control.bound_payment_processor_code is distinct from 'stripe'
    or v_control.bound_payment_environment is distinct from 'test'
    or v_control.bound_provider_settlement_processor_code is distinct from 'duffel_balance'
    or v_control.bound_provider_settlement_environment is distinct from 'test'
    or v_control.bound_execution_scope_sha256
      is distinct from v_attempt.execution_scope_sha256
    or v_control.activation_evidence_sha256
      is distinct from v_attempt.activation_evidence_sha256
    or v_control.bound_adapter_version_sha256
      is distinct from v_attempt.adapter_version_sha256
    or v_control.bound_provider_account_sha256
      is distinct from v_attempt.provider_account_sha256
    or v_control.bound_content_scope_sha256
      is distinct from v_attempt.content_scope_sha256 then
    raise exception 'Flight consumer Preview authority changed before provider dispatch';
  end if;

  perform set_config('app.flight_environment', v_control.bound_environment, true);
  perform set_config('app.flight_project_ref', v_control.bound_project_ref, true);
  perform set_config('app.flight_execution_authorized', 'true', true);
  perform set_config(
    'app.flight_activation_evidence_sha256', v_control.activation_evidence_sha256, true
  );
  perform set_config('app.flight_adapter_source_sha256', p_adapter_source_sha256, true);
  perform set_config(
    'app.flight_provider_binding_receipt_sha256', p_provider_binding_receipt_sha256, true
  );
  perform set_config(
    'app.flight_customer_payment_binding_receipt_sha256',
    p_payment_binding_receipt_sha256,
    true
  );
  perform set_config(
    'app.flight_provider_settlement_binding_receipt_sha256',
    p_provider_settlement_binding_receipt_sha256,
    true
  );
  perform set_config(
    'app.flight_request_authority_receipt_sha256',
    p_operation_authority_receipt_sha256,
    true
  );
  if p_adapter_source_sha256 is distinct from v_attempt.adapter_source_sha256
    or p_provider_binding_receipt_sha256
      is distinct from v_attempt.provider_binding_receipt_sha256
    or p_payment_binding_receipt_sha256
      is distinct from v_attempt.payment_binding_receipt_sha256
    or p_provider_settlement_binding_receipt_sha256
      is distinct from v_attempt.provider_settlement_binding_receipt_sha256
    or p_operation_authority_receipt_sha256
      is distinct from v_attempt.operation_authority_receipt_sha256 then
    raise exception 'Flight consumer opaque receipt digests changed before provider dispatch';
  end if;
  if not public.flight_runtime_capability_enabled(
      'test', 'order', 'duffel', null, v_attempt.execution_scope_sha256
    ) or not public.flight_runtime_capability_enabled(
      'test', 'payment', 'duffel', 'stripe', v_attempt.execution_scope_sha256
    ) or not public.flight_runtime_capability_enabled(
      'test', 'ticketing', 'duffel', null, v_attempt.execution_scope_sha256
    ) then
    raise exception 'Flight consumer order, Stripe payment, or ticketing authority changed';
  end if;
  v_point_of_sale_sha256 := encode(
    extensions.digest(convert_to(v_control.bound_point_of_sale, 'UTF8'), 'sha256'),
    'hex'
  );
  if v_point_of_sale_sha256 is distinct from v_attempt.point_of_sale_sha256 then
    raise exception 'Flight consumer point-of-sale binding changed before provider dispatch';
  end if;

  select * into v_payment
    from public.flight_payments as payment
   where payment.order_id = v_order.id
     and payment.execution_mode = 'test'
     and payment.execution_scope_sha256 = v_order.execution_scope_sha256
     and payment.processor_code = 'stripe'
     and payment.currency = v_order.currency
     and payment.authorized_cents = v_order.total_cents
     and payment.captured_cents = v_order.total_cents
     and payment.refunded_cents = 0
     and payment.status = 'captured'
   for share;
  select * into v_evidence
    from public.flight_offer_evidence_vault as evidence
   where evidence.receipt_sha256 = v_attempt.offer_evidence_receipt_sha256
     and evidence.customer_id = v_order.customer_id
     and evidence.search_id = v_order.search_id
     and evidence.offer_id = v_order.offer_id
     and evidence.execution_scope_sha256 = v_order.execution_scope_sha256
     and evidence.stage = 'refreshed'
     and evidence.retention_expires_at > clock_timestamp()
   for share;
  if v_payment.id is null or v_evidence.id is null
    or (
      select count(*)
        from public.flight_passenger_refs as passenger
       where passenger.order_id = v_order.id
    ) <> (
      select search.adult_count + search.child_count
        + search.infant_in_seat_count + search.infant_on_lap_count
        from public.flight_searches as search
       where search.id = v_order.search_id
         and search.customer_id = v_order.customer_id
    )
    or exists (
      select 1 from public.flight_passenger_refs as passenger
       where passenger.order_id = v_order.id
         and not exists (
           select 1 from public.flight_secure_pii_records as pii
            where pii.secure_pii_record_ref = passenger.secure_pii_record_ref
              and pii.order_id = v_order.id
              and pii.customer_id = v_order.customer_id
              and pii.execution_mode = passenger.execution_mode
              and pii.execution_scope_sha256 = passenger.execution_scope_sha256
              and pii.traveler_type = passenger.traveler_type
              and pii.pii_record_sha256 = passenger.pii_record_sha256
              and pii.deleted_at is null
              and pii.retention_expires_at > clock_timestamp()
         )
    ) then
    raise exception 'Captured payment or encrypted provider/passenger evidence changed';
  end if;

  v_now := clock_timestamp();
  if v_attempt.dispatch_not_after <= v_now then
    raise exception 'Flight consumer Duffel order dispatch authority expired';
  end if;
  update public.flight_provider_request_attempts
     set state = 'dispatching',
         revision = revision + 1,
         dispatch_started_at = v_now
   where id = v_attempt.id
     and state = 'prepared'
     and revision = p_expected_revision
  returning * into v_attempt;
  if not found then
    raise exception 'Flight consumer Duffel order dispatch CAS failed';
  end if;
  return query select v_attempt.id, v_attempt.revision, v_attempt.state;
end;
$claim_flight_consumer_order$;

alter table public.flight_offer_evidence_vault enable row level security;
alter table public.flight_offer_evidence_vault force row level security;
alter table public.flight_secure_pii_records enable row level security;
alter table public.flight_secure_pii_records force row level security;

-- No role receives direct vault access. Only narrowly scoped SECURITY DEFINER
-- RPCs can store/load encrypted envelopes or apply retention deletion.
revoke all on table public.flight_offer_evidence_vault
  from public, anon, authenticated, service_role;
revoke all on table public.flight_secure_pii_records
  from public, anon, authenticated, service_role;

revoke all on function public.get_flight_consumer_preview_runtime_authority_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.store_flight_offer_evidence_v1(
  uuid, uuid, uuid, text, text, text, timestamptz, timestamptz,
  text, text, text, text, text, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.load_flight_offer_evidence_v1(text, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.purge_expired_flight_offer_evidence_v1(timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.store_flight_secure_pii_record_v1(
  text, uuid, uuid, text, text, text, text, timestamptz,
  text, text, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.load_flight_secure_pii_record_v1(text, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.tombstone_flight_secure_pii_record_v1(text, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.validate_flight_secure_pii_reference_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.begin_flight_consumer_search_v1(
  text, text, text, text, text, text, date, date, text,
  smallint, smallint, smallint, smallint, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.prepare_flight_consumer_duffel_order_attempt_v1(
  uuid, text, text, text, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.claim_flight_consumer_duffel_order_attempt_v1(
  uuid, integer, text, text, text, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.get_flight_consumer_preview_runtime_authority_v1()
  to service_role;
grant execute on function public.store_flight_offer_evidence_v1(
  uuid, uuid, uuid, text, text, text, timestamptz, timestamptz,
  text, text, text, text, text, text, text, text, text, text, text
) to service_role;
grant execute on function public.load_flight_offer_evidence_v1(text, uuid, text)
  to service_role;
grant execute on function public.purge_expired_flight_offer_evidence_v1(timestamptz)
  to service_role;
grant execute on function public.store_flight_secure_pii_record_v1(
  text, uuid, uuid, text, text, text, text, timestamptz,
  text, text, text, text, text, text
) to service_role;
grant execute on function public.load_flight_secure_pii_record_v1(text, uuid, text)
  to service_role;
grant execute on function public.tombstone_flight_secure_pii_record_v1(text, uuid, text)
  to service_role;
grant execute on function public.begin_flight_consumer_search_v1(
  text, text, text, text, text, text, date, date, text,
  smallint, smallint, smallint, smallint, timestamptz
) to authenticated;
grant execute on function public.prepare_flight_consumer_duffel_order_attempt_v1(
  uuid, text, text, text, text, text, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.claim_flight_consumer_duffel_order_attempt_v1(
  uuid, integer, text, text, text, text, text
) to service_role;

comment on table public.flight_offer_evidence_vault is
  'Service-role-only AES-256-GCM Duffel test offer evidence. Never plaintext provider JSON or credentials.';
comment on table public.flight_secure_pii_records is
  'Service-role-only AES-256-GCM passenger PII envelopes and tombstones. Never plaintext passenger data.';
comment on column public.flight_secure_pii_records.pii_authority_receipt_sha256 is
  'Opaque keyed authority digest; not a raw passenger-data hash.';
comment on column public.flight_provider_request_attempts.payment_binding_receipt_sha256 is
  'Opaque order/payment-scoped Stripe binding receipt for consumer Preview dispatch.';
comment on column public.flight_provider_request_attempts.provider_settlement_binding_receipt_sha256 is
  'Opaque order/request-scoped Duffel Balance settlement binding receipt for consumer Preview dispatch.';
comment on function public.get_flight_consumer_preview_runtime_authority_v1() is
  'Returns one sanitized, digest-only authority row only for an exact receipted Preview/Duffel/Stripe/Duffel-Balance control binding.';
comment on function public.begin_flight_consumer_search_v1(
  text, text, text, text, text, text, date, date, text,
  smallint, smallint, smallint, smallint, timestamptz
) is 'Creates or exactly replays one authenticated customer-owned test search and its durable idempotency evidence.';
comment on function public.prepare_flight_consumer_duffel_order_attempt_v1(
  uuid, text, text, text, text, text, text, text, text, text, timestamptz
) is 'Atomically prepares the only Duffel create-order attempt after captured Stripe payment, fresh reprice/offer evidence, active encrypted PII, and split runtime bindings.';
comment on function public.claim_flight_consumer_duffel_order_attempt_v1(
  uuid, integer, text, text, text, text, text
) is 'Final exact CAS immediately before the one allowed Duffel test create-order HTTP dispatch; this function performs no HTTP.';

commit;

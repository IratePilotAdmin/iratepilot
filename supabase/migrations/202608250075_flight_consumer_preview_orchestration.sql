begin;

-- Authenticated Consumer Preview orchestration only. This migration remains
-- test-mode, Preview-project bound, default-off, and incapable of authorizing
-- Production or live provider traffic by itself.
do $flight_consumer_preview_075_dependencies$
begin
  if to_regclass('public.flight_offer_evidence_vault') is null
    or to_regclass('public.flight_secure_pii_records') is null
    or to_regclass('public.flight_provider_request_attempts') is null
    or to_regprocedure(
      'public.get_flight_consumer_preview_runtime_authority_v1()'
    ) is null
    or to_regprocedure(
      'public.complete_flight_provider_request_attempt(uuid,integer,text,smallint,text,bigint,text)'
    ) is null then
    raise exception 'Flight Consumer Preview orchestration requires migrations 068 through 074';
  end if;
  if to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'Flight Consumer Preview orchestration requires reviewed SHA-256 support';
  end if;
end;
$flight_consumer_preview_075_dependencies$;

-- Refreshed provider evidence is useful only when it is tied to the exact
-- durable reprice receipt consumed by an order. Initial evidence has no such
-- receipt. NOT VALID preserves a fail-closed upgrade path if a non-orchestrated
-- 074 rehearsal wrote refreshed evidence before this migration was reviewed.
alter table public.flight_offer_evidence_vault
  add column reprice_receipt_id uuid,
  add column local_offer_id text;

alter table public.flight_offer_evidence_vault
  add constraint flight_offer_evidence_vault_reprice_fk
    foreign key (reprice_receipt_id, offer_id)
    references public.flight_reprice_receipts(id, offer_id)
    on delete restrict not valid,
  add constraint flight_offer_evidence_vault_reprice_stage_check
    check (
      (stage = 'initial' and reprice_receipt_id is null)
      or (stage = 'refreshed' and reprice_receipt_id is not null)
    ) not valid,
  add constraint flight_offer_evidence_vault_local_offer_check
    check (
      local_offer_id is not null
      and local_offer_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
    ) not valid;

create unique index flight_offer_evidence_vault_reprice_uidx
  on public.flight_offer_evidence_vault (reprice_receipt_id)
  where stage = 'refreshed';

create function public.bind_flight_offer_evidence_local_id_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $bind_flight_offer_evidence_local_id$
declare
  v_predecessor_local_offer_id text;
begin
  if tg_op = 'UPDATE' then
    if new.local_offer_id is distinct from old.local_offer_id then
      raise exception 'Flight evidence local offer identity is immutable';
    end if;
    return new;
  end if;
  if new.local_offer_id is null then
    new.local_offer_id := new.offer_id::text;
  end if;
  if new.stage = 'refreshed' then
    select evidence.local_offer_id into v_predecessor_local_offer_id
      from public.flight_offer_evidence_vault as evidence
     where evidence.receipt_sha256 = new.predecessor_receipt_sha256;
    if v_predecessor_local_offer_id is null
      or new.local_offer_id is distinct from v_predecessor_local_offer_id then
      raise exception 'Refreshed evidence local offer identity must match its predecessor';
    end if;
  end if;
  return new;
end;
$bind_flight_offer_evidence_local_id$;

create trigger flight_offer_evidence_local_id_guard
before insert or update of local_offer_id, predecessor_receipt_sha256
on public.flight_offer_evidence_vault
for each row execute function public.bind_flight_offer_evidence_local_id_v1();

alter table public.flight_orders
  add column consumer_flow_version smallint check (
    consumer_flow_version is null or consumer_flow_version = 1
  );

create unique index flight_orders_consumer_reprice_uidx
  on public.flight_orders (reprice_receipt_id)
  where consumer_flow_version = 1;

create unique index flight_provider_attempt_consumer_search_uidx
  on public.flight_provider_request_attempts (search_id)
  where consumer_flow_version = 1 and operation = 'create_offer_request';

create unique index flight_provider_attempt_consumer_reprice_uidx
  on public.flight_provider_request_attempts (offer_id)
  where consumer_flow_version = 1 and operation = 'retrieve_offer';

alter table public.flight_provider_request_attempts
  drop constraint flight_provider_request_attempts_consumer_link_check,
  drop constraint flight_provider_request_attempts_consumer_order_offer_check;

alter table public.flight_provider_request_attempts
  add column consumer_idempotency_key_sha256 text check (
    consumer_idempotency_key_sha256 is null
    or consumer_idempotency_key_sha256 ~ '^[0-9a-f]{64}$'
  ),
  add column consumer_idempotency_request_sha256 text check (
    consumer_idempotency_request_sha256 is null
    or consumer_idempotency_request_sha256 ~ '^[0-9a-f]{64}$'
  );

alter table public.flight_provider_request_attempts
  add constraint flight_provider_request_attempts_consumer_link_check
  check (
    (
      consumer_flow_version is null
      and customer_id is null and search_id is null and offer_id is null
      and order_id is null and offer_evidence_receipt_sha256 is null
      and payment_binding_receipt_sha256 is null
      and provider_settlement_binding_receipt_sha256 is null
      and consumer_idempotency_key_sha256 is null
      and consumer_idempotency_request_sha256 is null
    )
    or (
      consumer_flow_version = 1
      and customer_id is not null and search_id is not null
      and (
        (operation = 'create_offer_request'
          and offer_id is null and order_id is null
          and offer_evidence_receipt_sha256 is null
          and payment_binding_receipt_sha256 is null
          and provider_settlement_binding_receipt_sha256 is null
          and consumer_idempotency_key_sha256 is null
          and consumer_idempotency_request_sha256 is null)
        or (operation = 'retrieve_offer'
          and offer_id is not null and order_id is null
          and offer_evidence_receipt_sha256 is not null
          and payment_binding_receipt_sha256 is null
          and provider_settlement_binding_receipt_sha256 is null
          and consumer_idempotency_key_sha256 is not null
          and consumer_idempotency_request_sha256 is not null)
        or (operation = 'list_orders_by_offer'
          and offer_id is not null
          and payment_binding_receipt_sha256 is null
          and provider_settlement_binding_receipt_sha256 is null)
        or (operation = 'create_order'
          and offer_id is not null and order_id is not null
          and offer_evidence_receipt_sha256 is not null
          and payment_binding_receipt_sha256 is not null
          and provider_settlement_binding_receipt_sha256 is not null
          and consumer_idempotency_key_sha256 is null
          and consumer_idempotency_request_sha256 is null)
      )
    )
  ),
  add constraint flight_provider_request_attempts_consumer_order_offer_check
  check (
    consumer_flow_version is null or order_id is null
    or (operation in ('create_order', 'list_orders_by_offer') and offer_id is not null)
  ) not valid;

-- A digest-only Stripe operation journal. No card data, client secret, raw
-- processor object, HTTP body, URL, header, or credential is permitted here.
create table public.flight_payment_operation_attempts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  order_id uuid not null,
  payment_id uuid,
  operation text not null check (operation in ('create_intent', 'capture', 'refund')),
  processor_code text not null default 'stripe' check (processor_code = 'stripe'),
  execution_mode text not null default 'test' check (execution_mode = 'test'),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  processor_account_sha256 text not null check (processor_account_sha256 ~ '^[0-9a-f]{64}$'),
  processor_environment text not null default 'test' check (processor_environment = 'test'),
  processor_source_sha256 text not null check (processor_source_sha256 ~ '^[0-9a-f]{64}$'),
  processor_adapter_version_sha256 text not null
    check (processor_adapter_version_sha256 ~ '^[0-9a-f]{64}$'),
  payment_binding_receipt_sha256 text not null
    check (payment_binding_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  adapter_source_sha256 text not null check (adapter_source_sha256 ~ '^[0-9a-f]{64}$'),
  operation_authority_receipt_sha256 text not null
    check (operation_authority_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key_sha256 text not null check (idempotency_key_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_request_sha256 text not null
    check (idempotency_request_sha256 ~ '^[0-9a-f]{64}$'),
  request_plan_sha256 text not null check (request_plan_sha256 ~ '^[0-9a-f]{64}$'),
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  request_body_sha256 text not null check (request_body_sha256 ~ '^[0-9a-f]{64}$'),
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  dispatch_not_after timestamptz not null,
  state text not null default 'prepared'
    check (state in ('prepared', 'dispatching', 'succeeded', 'failed', 'ambiguous', 'blocked')),
  revision integer not null default 0 check (revision between 0 and 2),
  processor_object_ref_ciphertext text,
  processor_object_ref_sha256 text check (
    processor_object_ref_sha256 is null
    or processor_object_ref_sha256 ~ '^[0-9a-f]{64}$'
  ),
  prepared_at timestamptz not null default clock_timestamp(),
  dispatch_started_at timestamptz,
  completed_at timestamptz,
  terminal_http_status smallint check (
    terminal_http_status is null or terminal_http_status between 100 and 599
  ),
  terminal_response_sha256 text check (
    terminal_response_sha256 is null or terminal_response_sha256 ~ '^[0-9a-f]{64}$'
  ),
  terminal_response_bytes bigint check (
    terminal_response_bytes is null or terminal_response_bytes between 0 and 1048576
  ),
  terminal_receipt_sha256 text check (
    terminal_receipt_sha256 is null or terminal_receipt_sha256 ~ '^[0-9a-f]{64}$'
  ),
  foreign key (order_id, customer_id)
    references public.flight_orders(id, customer_id) on delete restrict,
  foreign key (payment_id) references public.flight_payments(id) on delete restrict,
  unique (order_id, operation),
  unique (execution_scope_sha256, operation, idempotency_key_sha256),
  unique (terminal_receipt_sha256),
  check (
    (operation = 'create_intent' and payment_id is null)
    or (operation in ('capture', 'refund') and payment_id is not null)
    or (operation = 'create_intent' and state = 'succeeded' and payment_id is not null)
  ),
  check (
    (processor_object_ref_ciphertext is null and processor_object_ref_sha256 is null)
    or (
      processor_object_ref_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$'
      and processor_object_ref_sha256 is not null
    )
  ),
  check (dispatch_not_after > prepared_at),
  check (
    (state = 'prepared' and revision = 0
      and dispatch_started_at is null and completed_at is null
      and terminal_http_status is null and terminal_response_sha256 is null
      and terminal_response_bytes is null and terminal_receipt_sha256 is null)
    or (state = 'dispatching' and revision = 1
      and dispatch_started_at is not null and completed_at is null
      and terminal_http_status is null and terminal_response_sha256 is null
      and terminal_response_bytes is null and terminal_receipt_sha256 is null)
    or (state = 'blocked' and revision = 1
      and dispatch_started_at is null and completed_at is not null
      and terminal_http_status is null and terminal_response_sha256 is null
      and terminal_response_bytes is null and terminal_receipt_sha256 is not null)
    or (state = 'succeeded' and revision = 2
      and dispatch_started_at is not null and completed_at is not null
      and terminal_http_status between 200 and 299
      and terminal_response_sha256 is not null and terminal_response_bytes is not null
      and terminal_receipt_sha256 is not null)
    or (state = 'failed' and revision = 2
      and dispatch_started_at is not null and completed_at is not null
      and terminal_http_status between 300 and 599
      and terminal_response_sha256 is not null and terminal_response_bytes is not null
      and terminal_receipt_sha256 is not null)
    or (state = 'ambiguous' and revision = 2
      and dispatch_started_at is not null and completed_at is not null
      and terminal_http_status is null and terminal_response_sha256 is null
      and terminal_response_bytes is null and terminal_receipt_sha256 is not null)
  ),
  check (dispatch_started_at is null or dispatch_started_at >= prepared_at),
  check (completed_at is null or completed_at >= prepared_at)
);

create index flight_payment_operation_attempts_state_idx
  on public.flight_payment_operation_attempts (state, prepared_at);

-- Exactly one encrypted Duffel order response envelope may be attached to the
-- single consumer create-order attempt. PostgreSQL never receives plaintext.
create table public.flight_order_response_evidence_vault (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique
    references public.flight_provider_request_attempts(id) on delete restrict,
  order_id uuid not null,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  execution_mode text not null default 'test' check (execution_mode = 'test'),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  provider_response_sha256 text not null check (provider_response_sha256 ~ '^[0-9a-f]{64}$'),
  evidence_receipt_sha256 text not null unique check (evidence_receipt_sha256 ~ '^[0-9a-f]{64}$'),
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
  ciphertext_sha256 text not null check (ciphertext_sha256 ~ '^[0-9a-f]{64}$'),
  retention_expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  foreign key (order_id, customer_id)
    references public.flight_orders(id, customer_id) on delete restrict,
  check (retention_expires_at > created_at),
  check (retention_expires_at <= created_at + interval '7 days'),
  check (deleted_at is null or deleted_at >= created_at)
);

create index flight_order_response_evidence_retention_idx
  on public.flight_order_response_evidence_vault (retention_expires_at)
  where deleted_at is null;

-- Verified webhook ingress is digest-only. Signature material and raw provider
-- payloads remain outside PostgreSQL.
create table public.flight_consumer_webhook_ledger (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('stripe', 'duffel')),
  execution_mode text not null default 'test' check (execution_mode = 'test'),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  event_id_sha256 text not null check (event_id_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_sha256 text not null check (idempotency_sha256 ~ '^[0-9a-f]{64}$'),
  event_type text not null check (event_type in (
    'payment_intent.requires_action', 'payment_intent.amount_capturable_updated',
    'payment_intent.payment_failed', 'payment_intent.canceled',
    'payment_intent.succeeded', 'charge.refunded',
    'order.created', 'order.updated', 'order.cancelled', 'order.ticketed'
  )),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  semantic_sha256 text not null check (semantic_sha256 ~ '^[0-9a-f]{64}$'),
  verification_receipt_sha256 text not null
    check (verification_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  order_id uuid references public.flight_orders(id) on delete restrict,
  payment_id uuid references public.flight_payments(id) on delete restrict,
  provider_attempt_id uuid
    references public.flight_provider_request_attempts(id) on delete restrict,
  state text not null default 'verified'
    check (state in ('verified', 'processing', 'processed', 'duplicate', 'blocked', 'failed')),
  revision integer not null default 0 check (revision between 0 and 2),
  occurred_at timestamptz not null,
  verified_at timestamptz not null default clock_timestamp(),
  processing_started_at timestamptz,
  completed_at timestamptz,
  outcome_sha256 text check (
    outcome_sha256 is null or outcome_sha256 ~ '^[0-9a-f]{64}$'
  ),
  unique (execution_scope_sha256, source, event_id_sha256),
  unique (execution_scope_sha256, source, idempotency_sha256),
  check (
    (source = 'stripe' and event_type in (
      'payment_intent.requires_action', 'payment_intent.amount_capturable_updated',
      'payment_intent.payment_failed', 'payment_intent.canceled',
      'payment_intent.succeeded', 'charge.refunded'
    ))
    or (source = 'duffel' and event_type in (
      'order.created', 'order.updated', 'order.cancelled', 'order.ticketed'
    ))
  ),
  check (
    (state = 'verified' and revision = 0
      and processing_started_at is null and completed_at is null and outcome_sha256 is null)
    or (state = 'processing' and revision = 1
      and processing_started_at is not null and completed_at is null and outcome_sha256 is null)
    or (state in ('processed', 'duplicate', 'blocked', 'failed') and revision = 2
      and processing_started_at is not null and completed_at is not null
      and outcome_sha256 is not null)
  ),
  check (occurred_at <= verified_at + interval '5 minutes'),
  check (processing_started_at is null or processing_started_at >= verified_at),
  check (completed_at is null or completed_at >= processing_started_at)
);

create index flight_consumer_webhook_ledger_state_idx
  on public.flight_consumer_webhook_ledger (state, verified_at);

create unique index flight_reconciliation_consumer_ambiguous_open_uidx
  on public.flight_reconciliation_cases (order_id)
  where case_type = 'ambiguous_order' and status <> 'resolved';

-- Internal runtime assertion. It intentionally returns no secret and is never
-- executable by an API role. Every public orchestration RPC rechecks the same
-- exact Preview/test/provider/customer-payment/provider-settlement authority.
create function public.assert_flight_consumer_preview_runtime_v1(
  p_execution_scope_sha256 text,
  p_capability text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $assert_flight_consumer_preview_runtime$
declare
  v_control public.flight_runtime_controls;
begin
  if coalesce(auth.role(), '') not in ('service_role', 'authenticated') then
    raise exception 'Flight Consumer Preview runtime is unavailable';
  end if;
  select * into v_control
    from public.flight_runtime_controls as control
   where control.control_key = 'global';
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
    or v_control.bound_payment_processor_code is distinct from 'stripe'
    or v_control.bound_payment_environment is distinct from 'test'
    or v_control.bound_provider_settlement_processor_code is distinct from 'duffel_balance'
    or v_control.bound_provider_settlement_environment is distinct from 'test'
    or v_control.bound_execution_scope_sha256 is distinct from p_execution_scope_sha256
    or p_execution_scope_sha256 is null
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_capability not in ('shopping', 'order', 'payment', 'ticketing', 'provider_event')
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
    ) then
    raise exception 'Flight Consumer Preview runtime authority is disabled or stale';
  end if;
  perform set_config('app.flight_environment', v_control.bound_environment, true);
  perform set_config('app.flight_project_ref', v_control.bound_project_ref, true);
  perform set_config('app.flight_execution_authorized', 'true', true);
  perform set_config(
    'app.flight_activation_evidence_sha256', v_control.activation_evidence_sha256, true
  );
  if not public.flight_runtime_capability_enabled(
    'test', p_capability,
    case when p_capability = 'payment' then 'duffel' else 'duffel' end,
    case when p_capability = 'payment' then 'stripe' else null end,
    p_execution_scope_sha256
  ) then
    raise exception 'Flight Consumer Preview capability receipt is unavailable';
  end if;
end;
$assert_flight_consumer_preview_runtime$;

create function public.flight_jsonb_has_exact_keys_v1(
  p_value jsonb,
  p_keys text[]
)
returns boolean
language sql
immutable
security definer
set search_path = pg_catalog
as $flight_jsonb_has_exact_keys$
  select jsonb_typeof(p_value) = 'object'
    and p_value ?& p_keys
    and not exists (
      select 1 from jsonb_object_keys(p_value) as supplied(key)
       where not (supplied.key = any(p_keys))
    )
$flight_jsonb_has_exact_keys$;

create function public.protect_flight_payment_operation_attempt_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $protect_flight_payment_operation_attempt$
begin
  if tg_op = 'DELETE' then
    raise exception 'Flight payment operation evidence is append-preserving';
  end if;
  if new.id is distinct from old.id
    or new.customer_id is distinct from old.customer_id
    or new.order_id is distinct from old.order_id
    or new.operation is distinct from old.operation
    or new.processor_code is distinct from old.processor_code
    or new.execution_mode is distinct from old.execution_mode
    or new.execution_scope_sha256 is distinct from old.execution_scope_sha256
    or new.processor_account_sha256 is distinct from old.processor_account_sha256
    or new.processor_environment is distinct from old.processor_environment
    or new.processor_source_sha256 is distinct from old.processor_source_sha256
    or new.processor_adapter_version_sha256
      is distinct from old.processor_adapter_version_sha256
    or new.payment_binding_receipt_sha256
      is distinct from old.payment_binding_receipt_sha256
    or new.adapter_source_sha256 is distinct from old.adapter_source_sha256
    or new.operation_authority_receipt_sha256
      is distinct from old.operation_authority_receipt_sha256
    or new.idempotency_key_sha256 is distinct from old.idempotency_key_sha256
    or new.idempotency_request_sha256 is distinct from old.idempotency_request_sha256
    or new.request_plan_sha256 is distinct from old.request_plan_sha256
    or new.request_sha256 is distinct from old.request_sha256
    or new.request_body_sha256 is distinct from old.request_body_sha256
    or new.amount_cents is distinct from old.amount_cents
    or new.currency is distinct from old.currency
    or new.dispatch_not_after is distinct from old.dispatch_not_after
    or new.prepared_at is distinct from old.prepared_at then
    raise exception 'Flight payment operation identity is immutable';
  end if;
  if new.revision <> old.revision + 1 then
    raise exception 'Flight payment operation revision must advance by exact CAS';
  end if;
  if old.payment_id is not null and new.payment_id is distinct from old.payment_id then
    raise exception 'Flight payment operation payment binding is immutable';
  end if;
  if old.processor_object_ref_sha256 is not null and (
    new.processor_object_ref_sha256 is distinct from old.processor_object_ref_sha256
    or new.processor_object_ref_ciphertext
      is distinct from old.processor_object_ref_ciphertext
  ) then
    raise exception 'Flight processor object reference is immutable after binding';
  end if;
  if old.state = 'prepared' and new.state = 'dispatching' then
    if new.dispatch_started_at is null or new.completed_at is not null
      or new.terminal_receipt_sha256 is not null
      or new.payment_id is distinct from old.payment_id
      or new.processor_object_ref_sha256 is distinct from old.processor_object_ref_sha256 then
      raise exception 'Prepared Stripe operation claim evidence is malformed';
    end if;
    return new;
  end if;
  if old.state = 'prepared' and new.state = 'blocked' then
    if new.dispatch_started_at is not null or new.completed_at is null
      or new.terminal_receipt_sha256 is null
      or new.payment_id is distinct from old.payment_id
      or new.processor_object_ref_sha256 is distinct from old.processor_object_ref_sha256 then
      raise exception 'Blocked Stripe operation evidence is malformed';
    end if;
    return new;
  end if;
  if old.state = 'dispatching'
    and new.state in ('succeeded', 'failed', 'ambiguous') then
    if new.completed_at is null or new.terminal_receipt_sha256 is null then
      raise exception 'Terminal Stripe operation evidence is incomplete';
    end if;
    if new.state <> 'succeeded' and (
      new.payment_id is distinct from old.payment_id
      or new.processor_object_ref_sha256 is distinct from old.processor_object_ref_sha256
    ) then
      raise exception 'Failed or ambiguous Stripe operation cannot bind an object';
    end if;
    if new.state = 'succeeded' and new.operation = 'create_intent' and (
      new.payment_id is null or new.processor_object_ref_sha256 is null
    ) then
      raise exception 'Successful Stripe intent creation requires exact object binding';
    end if;
    return new;
  end if;
  raise exception 'Flight payment operation transition is not authorized';
end;
$protect_flight_payment_operation_attempt$;

create trigger flight_payment_operation_attempts_transition_guard
before update or delete on public.flight_payment_operation_attempts
for each row execute function public.protect_flight_payment_operation_attempt_v1();

create function public.protect_flight_consumer_webhook_ledger_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $protect_flight_consumer_webhook_ledger$
begin
  if tg_op = 'DELETE' then
    raise exception 'Flight webhook ledger is append-preserving';
  end if;
  if to_jsonb(new) - array[
    'state', 'revision', 'processing_started_at', 'completed_at', 'outcome_sha256'
  ] is distinct from to_jsonb(old) - array[
    'state', 'revision', 'processing_started_at', 'completed_at', 'outcome_sha256'
  ] then
    raise exception 'Flight webhook verified identity is immutable';
  end if;
  if new.revision <> old.revision + 1 then
    raise exception 'Flight webhook revision must advance by exact CAS';
  end if;
  if old.state = 'verified' and new.state = 'processing'
    and new.processing_started_at is not null
    and new.completed_at is null and new.outcome_sha256 is null then
    return new;
  end if;
  if old.state = 'processing'
    and new.state in ('processed', 'duplicate', 'blocked', 'failed')
    and new.processing_started_at = old.processing_started_at
    and new.completed_at is not null and new.outcome_sha256 is not null then
    return new;
  end if;
  raise exception 'Flight webhook transition is not authorized';
end;
$protect_flight_consumer_webhook_ledger$;

create trigger flight_consumer_webhook_ledger_transition_guard
before update or delete on public.flight_consumer_webhook_ledger
for each row execute function public.protect_flight_consumer_webhook_ledger_v1();

create trigger flight_order_response_evidence_append_only_guard
before update or delete on public.flight_order_response_evidence_vault
for each row execute function public.reject_flight_evidence_mutation();

-- Prepare exactly one Duffel offer-request attempt for an owner-bound search.
create function public.prepare_flight_consumer_search_attempt_v1(
  p_search_id uuid,
  p_request_plan_sha256 text,
  p_request_sha256 text,
  p_request_body_sha256 text,
  p_adapter_source_sha256 text,
  p_provider_binding_receipt_sha256 text,
  p_operation_authority_receipt_sha256 text,
  p_dispatch_not_after timestamptz
)
returns table (
  decision text, attempt_id uuid, attempt_revision integer, attempt_state text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $prepare_flight_consumer_search_attempt$
declare
  v_search public.flight_searches;
  v_attempt public.flight_provider_request_attempts;
  v_control public.flight_runtime_controls;
  v_now timestamptz;
  v_point_of_sale_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight consumer shopping preparation is service-role only';
  end if;
  select * into v_search from public.flight_searches as search
   where search.id = p_search_id for update;
  if not found or v_search.execution_mode <> 'test' then
    raise exception 'Flight consumer search is unavailable';
  end if;
  select * into v_attempt from public.flight_provider_request_attempts as attempt
   where attempt.search_id = v_search.id
     and attempt.consumer_flow_version = 1
     and attempt.operation = 'create_offer_request'
   for update;
  if found then
    if v_attempt.request_plan_sha256 is distinct from p_request_plan_sha256
      or v_attempt.request_sha256 is distinct from p_request_sha256
      or v_attempt.request_body_sha256 is distinct from p_request_body_sha256
      or v_attempt.adapter_source_sha256 is distinct from p_adapter_source_sha256
      or v_attempt.provider_binding_receipt_sha256
        is distinct from p_provider_binding_receipt_sha256
      or v_attempt.operation_authority_receipt_sha256
        is distinct from p_operation_authority_receipt_sha256
      or v_attempt.dispatch_not_after is distinct from p_dispatch_not_after then
      raise exception 'Flight search already has a different provider attempt';
    end if;
    return query select 'replay'::text, v_attempt.id, v_attempt.revision, v_attempt.state;
    return;
  end if;
  if v_search.status <> 'created' or v_search.expires_at <= clock_timestamp() then
    raise exception 'Flight consumer search is not ready for dispatch';
  end if;
  select * into v_control from public.flight_runtime_controls
   where control_key = 'global' for update;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_search.execution_scope_sha256, 'shopping'
  );
  if p_adapter_source_sha256 is null or p_adapter_source_sha256 !~ '^[0-9a-f]{64}$'
    or p_provider_binding_receipt_sha256 is null
    or p_provider_binding_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_operation_authority_receipt_sha256 is null
    or p_operation_authority_receipt_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight shopping opaque authority digests are invalid';
  end if;
  v_now := clock_timestamp();
  if p_dispatch_not_after <= v_now
    or p_dispatch_not_after > v_now + interval '5 minutes' then
    raise exception 'Flight shopping dispatch deadline is invalid';
  end if;
  v_point_of_sale_sha256 := encode(
    extensions.digest(convert_to(v_control.bound_point_of_sale, 'UTF8'), 'sha256'), 'hex'
  );
  insert into public.flight_provider_request_attempts (
    tenant_id, commerce_id, operation, provider_code, execution_mode,
    execution_scope_sha256, activation_evidence_sha256,
    adapter_version_sha256, adapter_source_sha256, provider_account_sha256,
    point_of_sale_sha256, content_scope_sha256, provider_binding_receipt_sha256,
    request_plan_sha256, request_sha256, request_body_sha256,
    operation_authority_receipt_sha256, dispatch_not_after,
    state, revision, retry_authorized, prepared_at,
    consumer_flow_version, customer_id, search_id
  ) values (
    'customer:' || v_search.customer_id::text, 'search:' || v_search.id::text,
    'create_offer_request', 'duffel', 'test', v_search.execution_scope_sha256,
    v_control.activation_evidence_sha256, v_control.bound_adapter_version_sha256,
    p_adapter_source_sha256, v_control.bound_provider_account_sha256,
    v_point_of_sale_sha256, v_control.bound_content_scope_sha256,
    p_provider_binding_receipt_sha256, p_request_plan_sha256, p_request_sha256,
    p_request_body_sha256, p_operation_authority_receipt_sha256,
    p_dispatch_not_after, 'prepared', 0, false, v_now,
    1, v_search.customer_id, v_search.id
  ) returning * into v_attempt;
  update public.flight_searches
     set status = 'searching', provider_request_sha256 = p_request_sha256
   where id = v_search.id and status = 'created';
  if not found then
    raise exception 'Flight search preparation CAS failed';
  end if;
  return query select 'prepared'::text, v_attempt.id, v_attempt.revision, v_attempt.state;
exception when unique_violation then
  raise exception 'Flight search already has a provider request identity';
end;
$prepare_flight_consumer_search_attempt$;

create function public.prepare_flight_consumer_reprice_attempt_v1(
  p_customer_id uuid,
  p_offer_id uuid,
  p_key_sha256 text,
  p_idempotency_request_sha256 text,
  p_request_plan_sha256 text,
  p_request_sha256 text,
  p_request_body_sha256 text,
  p_adapter_source_sha256 text,
  p_provider_binding_receipt_sha256 text,
  p_operation_authority_receipt_sha256 text,
  p_dispatch_not_after timestamptz
)
returns table (
  decision text, attempt_id uuid, attempt_revision integer, attempt_state text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $prepare_flight_consumer_reprice_attempt$
declare
  v_search public.flight_searches;
  v_offer public.flight_offers;
  v_evidence public.flight_offer_evidence_vault;
  v_attempt public.flight_provider_request_attempts;
  v_idempotency public.flight_idempotency_records;
  v_control public.flight_runtime_controls;
  v_now timestamptz;
  v_point_of_sale_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight consumer reprice preparation is service-role only';
  end if;
  select search.* into v_search
    from public.flight_searches as search
    join public.flight_offers as offer on offer.search_id = search.id
   where offer.id = p_offer_id and search.customer_id = p_customer_id
   for update of search;
  select * into v_offer from public.flight_offers as offer
   where offer.id = p_offer_id for share;
  if v_search.id is null or v_offer.id is null
    or v_search.execution_mode <> 'test' or v_offer.execution_mode <> 'test'
    or v_search.status <> 'complete' or v_offer.status <> 'offered'
    or v_offer.expires_at <= clock_timestamp() then
    raise exception 'Flight offer is unavailable for repricing';
  end if;
  select * into v_evidence
    from public.flight_offer_evidence_vault as evidence
   where evidence.customer_id = p_customer_id
     and evidence.search_id = v_search.id and evidence.offer_id = v_offer.id
     and evidence.stage = 'initial'
     and evidence.retention_expires_at > clock_timestamp()
   order by evidence.observed_at desc, evidence.id desc limit 1 for share;
  if not found then
    raise exception 'Flight offer lacks active encrypted initial evidence';
  end if;
  select * into v_attempt from public.flight_provider_request_attempts as attempt
   where attempt.offer_id = v_offer.id and attempt.consumer_flow_version = 1
     and attempt.operation = 'retrieve_offer' for update;
  if found then
    if v_attempt.request_sha256 is distinct from p_request_sha256
      or v_attempt.request_body_sha256 is distinct from p_request_body_sha256
      or v_attempt.request_plan_sha256 is distinct from p_request_plan_sha256
      or v_attempt.adapter_source_sha256 is distinct from p_adapter_source_sha256
      or v_attempt.provider_binding_receipt_sha256
        is distinct from p_provider_binding_receipt_sha256
      or v_attempt.operation_authority_receipt_sha256
        is distinct from p_operation_authority_receipt_sha256 then
      raise exception 'Flight offer already has a different reprice attempt';
    end if;
    return query select 'replay'::text, v_attempt.id, v_attempt.revision, v_attempt.state;
    return;
  end if;
  select * into v_idempotency from public.flight_idempotency_records as idempotency
   where idempotency.execution_scope_sha256 = v_offer.execution_scope_sha256
     and idempotency.execution_mode = 'test' and idempotency.scope = 'reprice'
     and idempotency.key_sha256 = p_key_sha256 for update;
  if found then
    raise exception 'Flight reprice idempotency key is unresolved or conflicts';
  end if;
  select * into v_control from public.flight_runtime_controls
   where control_key = 'global' for update;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_offer.execution_scope_sha256, 'shopping'
  );
  v_now := clock_timestamp();
  if p_dispatch_not_after <= v_now
    or p_dispatch_not_after > v_now + interval '5 minutes' then
    raise exception 'Flight reprice dispatch deadline is invalid';
  end if;
  insert into public.flight_idempotency_records (
    scope, execution_mode, execution_scope_sha256, key_sha256, request_sha256,
    status, locked_until, created_at, updated_at
  ) values (
    'reprice', 'test', v_offer.execution_scope_sha256, p_key_sha256,
    p_idempotency_request_sha256, 'in_progress', v_now + interval '5 minutes',
    v_now, v_now
  ) returning * into v_idempotency;
  v_point_of_sale_sha256 := encode(
    extensions.digest(convert_to(v_control.bound_point_of_sale, 'UTF8'), 'sha256'), 'hex'
  );
  insert into public.flight_provider_request_attempts (
    tenant_id, commerce_id, operation, provider_code, execution_mode,
    execution_scope_sha256, activation_evidence_sha256,
    adapter_version_sha256, adapter_source_sha256, provider_account_sha256,
    point_of_sale_sha256, content_scope_sha256, provider_binding_receipt_sha256,
    request_plan_sha256, request_sha256, request_body_sha256,
    operation_authority_receipt_sha256, dispatch_not_after,
    state, revision, retry_authorized, prepared_at,
    consumer_flow_version, customer_id, search_id, offer_id,
    offer_evidence_receipt_sha256, consumer_idempotency_key_sha256,
    consumer_idempotency_request_sha256
  ) values (
    'customer:' || p_customer_id::text, 'offer:' || v_offer.id::text,
    'retrieve_offer', 'duffel', 'test', v_offer.execution_scope_sha256,
    v_control.activation_evidence_sha256, v_control.bound_adapter_version_sha256,
    p_adapter_source_sha256, v_control.bound_provider_account_sha256,
    v_point_of_sale_sha256, v_control.bound_content_scope_sha256,
    p_provider_binding_receipt_sha256, p_request_plan_sha256, p_request_sha256,
    p_request_body_sha256, p_operation_authority_receipt_sha256,
    p_dispatch_not_after, 'prepared', 0, false, v_now,
    1, p_customer_id, v_search.id, v_offer.id, v_evidence.receipt_sha256,
    p_key_sha256, p_idempotency_request_sha256
  ) returning * into v_attempt;
  return query select 'prepared'::text, v_attempt.id, v_attempt.revision, v_attempt.state;
exception when unique_violation then
  raise exception 'Flight offer already has a reprice request identity';
end;
$prepare_flight_consumer_reprice_attempt$;

create function public.claim_flight_consumer_shopping_attempt_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_adapter_source_sha256 text,
  p_provider_binding_receipt_sha256 text,
  p_operation_authority_receipt_sha256 text
)
returns table (attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $claim_flight_consumer_shopping_attempt$
declare
  v_attempt public.flight_provider_request_attempts;
  v_order_id uuid;
  v_control public.flight_runtime_controls;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight consumer shopping claim is service-role only';
  end if;
  select attempt.order_id into v_order_id
    from public.flight_provider_request_attempts as attempt
   where attempt.id = p_attempt_id;
  if v_order_id is not null then
    perform 1 from public.flight_orders as flight_order
     where flight_order.id = v_order_id for update;
  else
    perform 1
      from public.flight_searches as search
      join public.flight_provider_request_attempts as attempt
        on attempt.search_id = search.id
     where attempt.id = p_attempt_id for update of search;
  end if;
  select * into v_attempt from public.flight_provider_request_attempts as attempt
   where attempt.id = p_attempt_id for update;
  if not found or v_attempt.consumer_flow_version <> 1
    or v_attempt.operation not in (
      'create_offer_request', 'retrieve_offer', 'list_orders_by_offer'
    )
    or v_attempt.provider_code <> 'duffel' or v_attempt.execution_mode <> 'test'
    or v_attempt.state <> 'prepared' or v_attempt.revision <> p_expected_revision then
    raise exception 'Flight consumer shopping dispatch CAS failed';
  end if;
  select * into v_control from public.flight_runtime_controls
   where control_key = 'global' for update;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_attempt.execution_scope_sha256, 'shopping'
  );
  if p_adapter_source_sha256 is distinct from v_attempt.adapter_source_sha256
    or p_provider_binding_receipt_sha256
      is distinct from v_attempt.provider_binding_receipt_sha256
    or p_operation_authority_receipt_sha256
      is distinct from v_attempt.operation_authority_receipt_sha256
    or v_control.activation_evidence_sha256
      is distinct from v_attempt.activation_evidence_sha256
    or v_control.bound_provider_account_sha256
      is distinct from v_attempt.provider_account_sha256
    or v_control.bound_adapter_version_sha256
      is distinct from v_attempt.adapter_version_sha256
    or v_control.bound_content_scope_sha256
      is distinct from v_attempt.content_scope_sha256 then
    raise exception 'Flight consumer shopping authority changed before dispatch';
  end if;
  v_now := clock_timestamp();
  if v_attempt.dispatch_not_after <= v_now then
    raise exception 'Flight consumer shopping dispatch authority expired';
  end if;
  update public.flight_provider_request_attempts
     set state = 'dispatching', revision = revision + 1,
         dispatch_started_at = v_now
   where id = v_attempt.id and state = 'prepared'
     and revision = p_expected_revision
  returning * into v_attempt;
  if not found then raise exception 'Flight consumer shopping dispatch CAS failed'; end if;
  return query select v_attempt.id, v_attempt.revision, v_attempt.state;
end;
$claim_flight_consumer_shopping_attempt$;

create function public.complete_flight_consumer_search_v1(
  p_attempt_id uuid,
  p_expected_terminal_revision integer,
  p_normalized_offers jsonb
)
returns table (
  decision text,
  search_id uuid,
  search_status text,
  offer_count integer,
  offer_ids uuid[]
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $complete_flight_consumer_search$
declare
  v_attempt public.flight_provider_request_attempts;
  v_search public.flight_searches;
  v_offer_json jsonb;
  v_segment_json jsonb;
  v_terms_json jsonb;
  v_evidence_json jsonb;
  v_offer_id uuid;
  v_offer_ids uuid[] := '{}'::uuid[];
  v_count integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight consumer search completion is service-role only';
  end if;
  select search.* into v_search
    from public.flight_searches as search
    join public.flight_provider_request_attempts as attempt
      on attempt.search_id = search.id
   where attempt.id = p_attempt_id
   for update of search;
  select * into v_attempt from public.flight_provider_request_attempts as attempt
   where attempt.id = p_attempt_id for update;
  if v_search.id is null or v_attempt.id is null
    or v_attempt.consumer_flow_version <> 1
    or v_attempt.operation <> 'create_offer_request'
    or v_attempt.state <> 'succeeded'
    or v_attempt.revision <> p_expected_terminal_revision
    or v_attempt.terminal_response_sha256 is null
    or v_search.status <> 'searching'
    or v_search.provider_request_sha256 is distinct from v_attempt.request_sha256 then
    raise exception 'Successful flight search terminal evidence does not match';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_search.execution_scope_sha256, 'shopping'
  );
  if jsonb_typeof(p_normalized_offers) <> 'array'
    or jsonb_array_length(p_normalized_offers) > 5 then
    raise exception 'Flight normalized offers must be an array of at most five';
  end if;
  for v_offer_json in select value from jsonb_array_elements(p_normalized_offers)
  loop
    if not public.flight_jsonb_has_exact_keys_v1(v_offer_json, array[
      'offer_id', 'local_offer_id', 'provider_offer_ref_ciphertext',
      'provider_offer_ref_sha256', 'provider_payload_sha256', 'currency',
      'base_fare_cents', 'tax_cents', 'fee_cents', 'total_cents',
      'validating_carrier', 'itinerary_sha256', 'fare_rules_sha256',
      'expires_at', 'segments', 'fare_terms', 'evidence'
    ]) then
      raise exception 'Flight normalized offer contains missing or unknown keys';
    end if;
    v_offer_id := (v_offer_json ->> 'offer_id')::uuid;
    if v_offer_json ->> 'local_offer_id' is distinct from v_offer_id::text then
      raise exception 'Flight local offer identity must equal its durable UUID';
    end if;
    if jsonb_typeof(v_offer_json -> 'segments') <> 'array'
      or jsonb_array_length(v_offer_json -> 'segments') not between 1 and 16 then
      raise exception 'Flight normalized segments are invalid';
    end if;
    v_terms_json := v_offer_json -> 'fare_terms';
    if not public.flight_jsonb_has_exact_keys_v1(v_terms_json, array[
      'refundable', 'changeable', 'change_fee_cents',
      'cancellation_fee_cents', 'checked_bag_pieces', 'carry_on_pieces',
      'checked_bag_weight_kg', 'terms_summary_sha256'
    ]) then
      raise exception 'Flight normalized fare terms contain missing or unknown keys';
    end if;
    v_evidence_json := v_offer_json -> 'evidence';
    if not public.flight_jsonb_has_exact_keys_v1(v_evidence_json, array[
      'stage', 'predecessor_receipt_sha256', 'observed_at',
      'retention_expires_at', 'raw_body_sha256', 'evidence_sha256',
      'snapshot_sha256', 'record_sha256', 'receipt_sha256', 'key_version',
      'iv_base64url', 'auth_tag_base64url', 'ciphertext_base64url',
      'aad_sha256', 'record_hmac_sha256'
    ])
      or v_evidence_json ->> 'stage' <> 'initial'
      or v_evidence_json ->> 'predecessor_receipt_sha256' is not null
      or v_evidence_json ->> 'raw_body_sha256'
        is distinct from v_attempt.terminal_response_sha256 then
      raise exception 'Initial encrypted offer evidence is malformed';
    end if;
    insert into public.flight_offers (
      id, search_id, provider_code, execution_mode, execution_scope_sha256,
      provider_offer_ref_ciphertext, provider_offer_ref_sha256,
      provider_payload_sha256, currency, base_fare_cents, tax_cents, fee_cents,
      total_cents, validating_carrier, segment_count, itinerary_sha256,
      fare_rules_sha256, status, expires_at
    ) values (
      v_offer_id, v_search.id, 'duffel', 'test', v_search.execution_scope_sha256,
      v_offer_json ->> 'provider_offer_ref_ciphertext',
      v_offer_json ->> 'provider_offer_ref_sha256',
      v_offer_json ->> 'provider_payload_sha256', upper(v_offer_json ->> 'currency'),
      (v_offer_json ->> 'base_fare_cents')::bigint,
      (v_offer_json ->> 'tax_cents')::bigint,
      (v_offer_json ->> 'fee_cents')::bigint,
      (v_offer_json ->> 'total_cents')::bigint,
      upper(v_offer_json ->> 'validating_carrier'),
      jsonb_array_length(v_offer_json -> 'segments')::smallint,
      v_offer_json ->> 'itinerary_sha256', v_offer_json ->> 'fare_rules_sha256',
      'offered', (v_offer_json ->> 'expires_at')::timestamptz
    );
    for v_segment_json in
      select value from jsonb_array_elements(v_offer_json -> 'segments')
    loop
      if not public.flight_jsonb_has_exact_keys_v1(v_segment_json, array[
        'segment_sequence', 'journey_direction', 'origin_iata', 'destination_iata',
        'marketing_carrier', 'operating_carrier', 'marketing_flight_number',
        'departure_at', 'arrival_at', 'departure_local_date', 'arrival_local_date',
        'cabin', 'booking_class', 'duration_minutes', 'aircraft_code'
      ]) then
        raise exception 'Flight normalized segment contains missing or unknown keys';
      end if;
      insert into public.flight_offer_segments (
        offer_id, execution_mode, execution_scope_sha256, segment_sequence,
        journey_direction, origin_iata, destination_iata, marketing_carrier,
        operating_carrier, marketing_flight_number, departure_at, arrival_at,
        departure_local_date, arrival_local_date, cabin, booking_class,
        duration_minutes, aircraft_code
      ) values (
        v_offer_id, 'test', v_search.execution_scope_sha256,
        (v_segment_json ->> 'segment_sequence')::smallint,
        v_segment_json ->> 'journey_direction', upper(v_segment_json ->> 'origin_iata'),
        upper(v_segment_json ->> 'destination_iata'),
        upper(v_segment_json ->> 'marketing_carrier'),
        upper(v_segment_json ->> 'operating_carrier'),
        upper(v_segment_json ->> 'marketing_flight_number'),
        (v_segment_json ->> 'departure_at')::timestamptz,
        (v_segment_json ->> 'arrival_at')::timestamptz,
        (v_segment_json ->> 'departure_local_date')::date,
        (v_segment_json ->> 'arrival_local_date')::date,
        v_segment_json ->> 'cabin', v_segment_json ->> 'booking_class',
        (v_segment_json ->> 'duration_minutes')::integer,
        v_segment_json ->> 'aircraft_code'
      );
    end loop;
    insert into public.flight_offer_fare_terms (
      offer_id, execution_mode, execution_scope_sha256, refundable, changeable,
      change_fee_cents, cancellation_fee_cents, checked_bag_pieces,
      carry_on_pieces, checked_bag_weight_kg, terms_summary_sha256
    ) values (
      v_offer_id, 'test', v_search.execution_scope_sha256,
      (v_terms_json ->> 'refundable')::boolean,
      (v_terms_json ->> 'changeable')::boolean,
      case when jsonb_typeof(v_terms_json -> 'change_fee_cents') = 'null'
        then null else (v_terms_json ->> 'change_fee_cents')::bigint end,
      case when jsonb_typeof(v_terms_json -> 'cancellation_fee_cents') = 'null'
        then null else (v_terms_json ->> 'cancellation_fee_cents')::bigint end,
      (v_terms_json ->> 'checked_bag_pieces')::smallint,
      (v_terms_json ->> 'carry_on_pieces')::smallint,
      case when jsonb_typeof(v_terms_json -> 'checked_bag_weight_kg') = 'null'
        then null else (v_terms_json ->> 'checked_bag_weight_kg')::numeric end,
      v_terms_json ->> 'terms_summary_sha256'
    );
    insert into public.flight_offer_evidence_vault (
      customer_id, search_id, offer_id, provider_code, execution_mode,
      execution_scope_sha256, stage, predecessor_receipt_sha256, local_offer_id,
      reprice_receipt_id, observed_at, retention_expires_at, raw_body_sha256,
      evidence_sha256, snapshot_sha256, record_sha256, receipt_sha256,
      key_version, iv_base64url, auth_tag_base64url, ciphertext_base64url,
      aad_sha256, record_hmac_sha256
    ) values (
      v_search.customer_id, v_search.id, v_offer_id, 'duffel', 'test',
      v_search.execution_scope_sha256, 'initial', null,
      v_offer_json ->> 'local_offer_id', null,
      (v_evidence_json ->> 'observed_at')::timestamptz,
      (v_evidence_json ->> 'retention_expires_at')::timestamptz,
      v_evidence_json ->> 'raw_body_sha256', v_evidence_json ->> 'evidence_sha256',
      v_evidence_json ->> 'snapshot_sha256', v_evidence_json ->> 'record_sha256',
      v_evidence_json ->> 'receipt_sha256', v_evidence_json ->> 'key_version',
      v_evidence_json ->> 'iv_base64url', v_evidence_json ->> 'auth_tag_base64url',
      v_evidence_json ->> 'ciphertext_base64url', v_evidence_json ->> 'aad_sha256',
      v_evidence_json ->> 'record_hmac_sha256'
    );
    v_offer_ids := array_append(v_offer_ids, v_offer_id);
    v_count := v_count + 1;
  end loop;
  update public.flight_searches set status = 'complete'
   where id = v_search.id and status = 'searching'
  returning * into v_search;
  if not found then raise exception 'Flight search completion CAS failed'; end if;
  return query select 'completed'::text, v_search.id, v_search.status,
    v_count, v_offer_ids;
end;
$complete_flight_consumer_search$;

create function public.fail_flight_consumer_search_v1(
  p_attempt_id uuid,
  p_expected_terminal_revision integer
)
returns table (search_id uuid, search_status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $fail_flight_consumer_search$
declare
  v_attempt public.flight_provider_request_attempts;
  v_search public.flight_searches;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight consumer search failure is service-role only';
  end if;
  select search.* into v_search
    from public.flight_searches as search
    join public.flight_provider_request_attempts as attempt on attempt.search_id = search.id
   where attempt.id = p_attempt_id for update of search;
  select * into v_attempt from public.flight_provider_request_attempts
   where id = p_attempt_id for update;
  if v_search.id is null or v_attempt.id is null
    or v_attempt.operation <> 'create_offer_request'
    or v_attempt.consumer_flow_version <> 1
    or v_attempt.state not in ('succeeded', 'failed', 'ambiguous', 'blocked')
    or v_attempt.revision <> p_expected_terminal_revision
    or v_search.status not in ('created', 'searching') then
    raise exception 'Flight search terminal failure evidence does not match';
  end if;
  if v_attempt.state = 'succeeded' and (
    v_attempt.revision <> 2 or v_search.status <> 'searching'
    or exists (select 1 from public.flight_offers where search_id = v_search.id)
  ) then
    raise exception 'Successful provider response may fail locally only before any offer materializes';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_search.execution_scope_sha256, 'shopping'
  );
  update public.flight_searches set status = 'failed'
   where id = v_search.id and status in ('created', 'searching')
  returning * into v_search;
  return query select v_search.id, v_search.status;
end;
$fail_flight_consumer_search$;

create function public.complete_flight_consumer_reprice_v1(
  p_attempt_id uuid,
  p_expected_terminal_revision integer,
  p_reprice_request_sha256 text,
  p_reprice_response_sha256 text,
  p_status text,
  p_currency text,
  p_original_total_cents bigint,
  p_repriced_total_cents bigint,
  p_expires_at timestamptz,
  p_refreshed_evidence jsonb
)
returns table (
  decision text,
  reprice_receipt_id uuid,
  reprice_status text,
  acceptance_required boolean,
  evidence_receipt_sha256 text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $complete_flight_consumer_reprice$
declare
  v_attempt public.flight_provider_request_attempts;
  v_offer public.flight_offers;
  v_search public.flight_searches;
  v_predecessor public.flight_offer_evidence_vault;
  v_reprice public.flight_reprice_receipts;
  v_existing_evidence public.flight_offer_evidence_vault;
  v_idempotency public.flight_idempotency_records;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight consumer reprice completion is service-role only';
  end if;
  select search.* into v_search
    from public.flight_searches as search
    join public.flight_offers as offer on offer.search_id = search.id
    join public.flight_provider_request_attempts as attempt on attempt.offer_id = offer.id
   where attempt.id = p_attempt_id for update of search;
  select * into v_offer from public.flight_offers as offer
   where offer.id = (select attempt.offer_id from public.flight_provider_request_attempts attempt
                      where attempt.id = p_attempt_id) for share;
  select * into v_attempt from public.flight_provider_request_attempts
   where id = p_attempt_id for update;
  if v_search.id is null or v_offer.id is null or v_attempt.id is null
    or v_attempt.consumer_flow_version <> 1
    or v_attempt.operation <> 'retrieve_offer'
    or v_attempt.state <> 'succeeded'
    or v_attempt.revision <> p_expected_terminal_revision
    or v_attempt.request_sha256 is distinct from p_reprice_request_sha256
    or v_attempt.terminal_response_sha256 is distinct from p_reprice_response_sha256
    or v_offer.total_cents is distinct from p_original_total_cents
    or upper(p_currency) is distinct from v_offer.currency
    or p_status not in ('confirmed', 'price_changed', 'unavailable', 'failed') then
    raise exception 'Flight reprice terminal evidence does not match';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_offer.execution_scope_sha256, 'shopping'
  );
  if not public.flight_jsonb_has_exact_keys_v1(p_refreshed_evidence, array[
    'stage', 'predecessor_receipt_sha256', 'observed_at', 'retention_expires_at',
    'raw_body_sha256', 'evidence_sha256', 'snapshot_sha256', 'record_sha256',
    'receipt_sha256', 'key_version', 'iv_base64url', 'auth_tag_base64url',
    'ciphertext_base64url', 'aad_sha256', 'record_hmac_sha256'
  ])
    or p_refreshed_evidence ->> 'stage' <> 'refreshed'
    or p_refreshed_evidence ->> 'predecessor_receipt_sha256'
      is distinct from v_attempt.offer_evidence_receipt_sha256
    or p_refreshed_evidence ->> 'raw_body_sha256'
      is distinct from p_reprice_response_sha256 then
    raise exception 'Refreshed encrypted offer evidence is malformed';
  end if;
  select * into v_predecessor from public.flight_offer_evidence_vault as evidence
   where evidence.receipt_sha256 = v_attempt.offer_evidence_receipt_sha256
     and evidence.customer_id = v_attempt.customer_id
     and evidence.search_id = v_attempt.search_id
     and evidence.offer_id = v_attempt.offer_id
     and evidence.stage = 'initial' for share;
  if not found
    or v_predecessor.retention_expires_at
      is distinct from (p_refreshed_evidence ->> 'retention_expires_at')::timestamptz
    or (p_refreshed_evidence ->> 'observed_at')::timestamptz < v_predecessor.observed_at then
    raise exception 'Refreshed flight evidence predecessor does not match';
  end if;
  select * into v_reprice from public.flight_reprice_receipts as reprice
   where reprice.offer_id = v_offer.id
     and reprice.request_sha256 = p_reprice_request_sha256
   for update;
  if found then
    select * into v_existing_evidence
      from public.flight_offer_evidence_vault as evidence
     where evidence.reprice_receipt_id = v_reprice.id for share;
    if v_reprice.response_sha256 is distinct from p_reprice_response_sha256
      or v_reprice.status is distinct from p_status
      or v_reprice.currency is distinct from upper(p_currency)
      or v_reprice.original_total_cents is distinct from p_original_total_cents
      or v_reprice.repriced_total_cents is distinct from p_repriced_total_cents
      or v_reprice.expires_at is distinct from p_expires_at
      or v_existing_evidence.receipt_sha256
        is distinct from (p_refreshed_evidence ->> 'receipt_sha256')
      or v_existing_evidence.record_sha256
        is distinct from (p_refreshed_evidence ->> 'record_sha256')
      or v_existing_evidence.record_hmac_sha256
        is distinct from (p_refreshed_evidence ->> 'record_hmac_sha256')
      or v_existing_evidence.ciphertext_base64url
        is distinct from (p_refreshed_evidence ->> 'ciphertext_base64url') then
      raise exception 'Flight reprice completion replay collides';
    end if;
    return query select 'replay'::text, v_reprice.id, v_reprice.status,
      v_reprice.status = 'price_changed', v_existing_evidence.receipt_sha256;
    return;
  end if;
  insert into public.flight_reprice_receipts (
    offer_id, execution_mode, execution_scope_sha256, request_sha256,
    response_sha256, currency, original_total_cents, repriced_total_cents,
    status, expires_at
  ) values (
    v_offer.id, 'test', v_offer.execution_scope_sha256, p_reprice_request_sha256,
    p_reprice_response_sha256, upper(p_currency), p_original_total_cents,
    p_repriced_total_cents, p_status, p_expires_at
  ) returning * into v_reprice;
  insert into public.flight_offer_evidence_vault (
    customer_id, search_id, offer_id, provider_code, execution_mode,
    execution_scope_sha256, stage, predecessor_receipt_sha256, local_offer_id,
    reprice_receipt_id, observed_at, retention_expires_at, raw_body_sha256,
    evidence_sha256, snapshot_sha256, record_sha256, receipt_sha256,
    key_version, iv_base64url, auth_tag_base64url, ciphertext_base64url,
    aad_sha256, record_hmac_sha256
  ) values (
    v_attempt.customer_id, v_attempt.search_id, v_attempt.offer_id,
    'duffel', 'test', v_attempt.execution_scope_sha256, 'refreshed',
    p_refreshed_evidence ->> 'predecessor_receipt_sha256',
    v_predecessor.local_offer_id, v_reprice.id,
    (p_refreshed_evidence ->> 'observed_at')::timestamptz,
    (p_refreshed_evidence ->> 'retention_expires_at')::timestamptz,
    p_refreshed_evidence ->> 'raw_body_sha256',
    p_refreshed_evidence ->> 'evidence_sha256',
    p_refreshed_evidence ->> 'snapshot_sha256',
    p_refreshed_evidence ->> 'record_sha256',
    p_refreshed_evidence ->> 'receipt_sha256',
    p_refreshed_evidence ->> 'key_version',
    p_refreshed_evidence ->> 'iv_base64url',
    p_refreshed_evidence ->> 'auth_tag_base64url',
    p_refreshed_evidence ->> 'ciphertext_base64url',
    p_refreshed_evidence ->> 'aad_sha256',
    p_refreshed_evidence ->> 'record_hmac_sha256'
  );
  if p_status = 'unavailable' then
    update public.flight_offers set status = 'expired'
     where id = v_offer.id and status = 'offered';
  end if;
  select * into v_idempotency from public.flight_idempotency_records as idempotency
   where idempotency.execution_scope_sha256 = v_offer.execution_scope_sha256
     and idempotency.execution_mode = 'test' and idempotency.scope = 'reprice'
     and idempotency.key_sha256 = v_attempt.consumer_idempotency_key_sha256
   for update;
  if not found or v_idempotency.status <> 'in_progress'
    or v_idempotency.request_sha256
      is distinct from v_attempt.consumer_idempotency_request_sha256 then
    raise exception 'Flight reprice idempotency evidence is unavailable';
  end if;
  update public.flight_idempotency_records
     set status = 'succeeded', response_sha256 = p_reprice_response_sha256,
         resource_type = 'flight_reprice_receipt', resource_id = v_reprice.id,
         locked_until = greatest(locked_until, clock_timestamp() + interval '5 minutes')
   where id = v_idempotency.id and status = 'in_progress';
  return query select 'completed'::text, v_reprice.id, v_reprice.status,
    v_reprice.status = 'price_changed',
    p_refreshed_evidence ->> 'receipt_sha256';
end;
$complete_flight_consumer_reprice$;

create function public.fail_flight_consumer_reprice_v1(
  p_attempt_id uuid,
  p_expected_terminal_revision integer
)
returns table (offer_id uuid, terminal_state text, idempotency_status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $fail_flight_consumer_reprice$
declare
  v_search public.flight_searches;
  v_attempt public.flight_provider_request_attempts;
  v_idempotency public.flight_idempotency_records;
  v_outcome text;
  v_outcome_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight consumer reprice failure is service-role only';
  end if;
  select search.* into v_search
    from public.flight_searches as search
    join public.flight_provider_request_attempts as attempt
      on attempt.search_id = search.id
   where attempt.id = p_attempt_id for update of search;
  select * into v_attempt from public.flight_provider_request_attempts
   where id = p_attempt_id for update;
  if v_search.id is null or v_attempt.id is null
    or v_attempt.consumer_flow_version <> 1
    or v_attempt.operation <> 'retrieve_offer'
    or v_attempt.state not in ('succeeded', 'failed', 'ambiguous', 'blocked')
    or v_attempt.revision <> p_expected_terminal_revision
    or exists (
      select 1 from public.flight_reprice_receipts
       where offer_id = v_attempt.offer_id
    ) then
    raise exception 'Flight reprice terminal failure evidence does not match';
  end if;
  if v_attempt.state = 'succeeded' and v_attempt.revision <> 2 then
    raise exception 'Local reprice projection failure requires a succeeded terminal attempt';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_attempt.execution_scope_sha256, 'shopping'
  );
  select * into v_idempotency from public.flight_idempotency_records as idempotency
   where idempotency.execution_scope_sha256 = v_attempt.execution_scope_sha256
     and idempotency.execution_mode = 'test' and idempotency.scope = 'reprice'
     and idempotency.key_sha256 = v_attempt.consumer_idempotency_key_sha256
   for update;
  if not found or v_idempotency.status <> 'in_progress'
    or v_idempotency.request_sha256
      is distinct from v_attempt.consumer_idempotency_request_sha256 then
    raise exception 'Flight reprice idempotency evidence is unavailable';
  end if;
  v_outcome := case when v_attempt.state = 'ambiguous' then 'ambiguous' else 'failed' end;
  v_outcome_sha256 := coalesce(
    v_attempt.terminal_response_sha256,
    v_attempt.terminal_receipt_sha256
  );
  update public.flight_idempotency_records
     set status = v_outcome, response_sha256 = v_outcome_sha256,
         locked_until = greatest(locked_until, clock_timestamp() + interval '5 minutes')
   where id = v_idempotency.id and status = 'in_progress'
  returning * into v_idempotency;
  if not found then raise exception 'Flight reprice failure CAS failed'; end if;
  return query select v_attempt.offer_id, v_attempt.state, v_idempotency.status;
end;
$fail_flight_consumer_reprice$;

-- Digest-only processor state observations back authorization and webhook
-- convergence decisions without retaining a Stripe object or client secret.
create table public.flight_payment_state_observations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.flight_orders(id) on delete restrict,
  payment_id uuid not null references public.flight_payments(id) on delete restrict,
  execution_mode text not null default 'test' check (execution_mode = 'test'),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  observed_status text not null check (observed_status in (
    'requires_payment_method', 'requires_action', 'requires_capture',
    'failed', 'cancelled', 'uncertain', 'unsupported'
  )),
  authorized_cents bigint not null check (authorized_cents >= 0),
  observation_sha256 text not null unique check (observation_sha256 ~ '^[0-9a-f]{64}$'),
  observed_at timestamptz not null default clock_timestamp(),
  unique (payment_id, observed_status, observation_sha256)
);

create trigger flight_payment_state_observations_append_only_guard
before update or delete on public.flight_payment_state_observations
for each row execute function public.reject_flight_evidence_mutation();

create function public.accept_flight_consumer_reprice_and_create_order_v1(
  p_offer_id uuid,
  p_reprice_receipt_id uuid,
  p_key_sha256 text,
  p_request_sha256 text
)
returns table (
  decision text,
  order_id uuid,
  order_status text,
  confirmation_code text,
  currency text,
  total_cents bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $accept_flight_consumer_reprice_and_create_order$
declare
  v_actor uuid := auth.uid();
  v_search public.flight_searches;
  v_offer public.flight_offers;
  v_reprice public.flight_reprice_receipts;
  v_evidence public.flight_offer_evidence_vault;
  v_idempotency public.flight_idempotency_records;
  v_order public.flight_orders;
  v_order_id uuid;
  v_confirmation_code text;
  v_now timestamptz;
  v_response_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or v_actor is null then
    raise exception 'Flight order creation requires an authenticated customer';
  end if;
  select search.* into v_search
    from public.flight_searches as search
    join public.flight_offers as offer on offer.search_id = search.id
   where offer.id = p_offer_id and search.customer_id = v_actor
   for update of search;
  select * into v_offer from public.flight_offers as offer
   where offer.id = p_offer_id for share;
  select * into v_reprice from public.flight_reprice_receipts as reprice
   where reprice.id = p_reprice_receipt_id and reprice.offer_id = p_offer_id
   for update;
  if v_search.id is null or v_offer.id is null or v_reprice.id is null
    or v_search.status <> 'complete' or v_offer.status <> 'offered'
    or v_offer.execution_mode <> 'test' or v_reprice.execution_mode <> 'test'
    or v_reprice.status not in ('confirmed', 'price_changed')
    or v_reprice.expires_at <= clock_timestamp()
    or v_reprice.repriced_total_cents is null then
    raise exception 'Flight reprice receipt is unavailable for checkout';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_offer.execution_scope_sha256, 'order'
  );
  select * into v_idempotency from public.flight_idempotency_records as idempotency
   where idempotency.execution_scope_sha256 = v_offer.execution_scope_sha256
     and idempotency.execution_mode = 'test' and idempotency.scope = 'order'
     and idempotency.key_sha256 = p_key_sha256 for update;
  if found then
    if v_idempotency.request_sha256 is distinct from p_request_sha256
      or v_idempotency.status <> 'succeeded'
      or v_idempotency.resource_type <> 'flight_order' then
      raise exception 'Flight order idempotency key conflicts or is unresolved';
    end if;
    select * into v_order from public.flight_orders as flight_order
     where flight_order.id = v_idempotency.resource_id
       and flight_order.customer_id = v_actor;
    if not found then raise exception 'Flight order replay does not belong to the actor'; end if;
    return query select 'replay'::text, v_order.id, v_order.status,
      v_order.confirmation_code, v_order.currency, v_order.total_cents;
    return;
  end if;
  select * into v_evidence from public.flight_offer_evidence_vault as evidence
   where evidence.reprice_receipt_id = v_reprice.id
     and evidence.customer_id = v_actor and evidence.search_id = v_search.id
     and evidence.offer_id = v_offer.id and evidence.stage = 'refreshed'
     and evidence.execution_scope_sha256 = v_offer.execution_scope_sha256
     and evidence.retention_expires_at > clock_timestamp() for share;
  if not found then
    raise exception 'Flight reprice receipt lacks active encrypted provider evidence';
  end if;
  if v_reprice.status = 'price_changed' then
    if v_reprice.customer_accepted_at is null then
      update public.flight_reprice_receipts
         set customer_accepted_at = clock_timestamp(),
             customer_accepted_by = v_actor,
             customer_accepted_currency = v_reprice.currency,
             customer_accepted_total_cents = v_reprice.repriced_total_cents
       where id = v_reprice.id and customer_accepted_at is null
      returning * into v_reprice;
      if not found then raise exception 'Flight price acceptance CAS failed'; end if;
    elsif v_reprice.customer_accepted_by is distinct from v_actor
      or v_reprice.customer_acceptance_version is distinct from 1
      or v_reprice.customer_accepted_currency is distinct from v_reprice.currency
      or v_reprice.customer_accepted_total_cents
        is distinct from v_reprice.repriced_total_cents then
      raise exception 'Flight changed price was not accepted by its owner';
    end if;
  end if;
  v_now := clock_timestamp();
  insert into public.flight_idempotency_records (
    scope, execution_mode, execution_scope_sha256, key_sha256, request_sha256,
    status, locked_until, created_at, updated_at
  ) values (
    'order', 'test', v_offer.execution_scope_sha256, p_key_sha256,
    p_request_sha256, 'in_progress', v_now + interval '5 minutes', v_now, v_now
  ) returning * into v_idempotency;
  v_order_id := gen_random_uuid();
  v_confirmation_code := 'FLT-' || upper(substr(encode(extensions.digest(
    convert_to(v_order_id::text || ':' || p_key_sha256, 'UTF8'), 'sha256'
  ), 'hex'), 1, 12));
  insert into public.flight_orders (
    id, customer_id, search_id, offer_id, reprice_receipt_id,
    confirmation_code, execution_mode, execution_scope_sha256, provider_code,
    currency, total_cents, status, consumer_flow_version,
    created_at, updated_at
  ) values (
    v_order_id, v_actor, v_search.id, v_offer.id, v_reprice.id,
    v_confirmation_code, 'test', v_offer.execution_scope_sha256, 'duffel',
    v_reprice.currency, v_reprice.repriced_total_cents, 'pending_payment', 1,
    v_now, v_now
  ) returning * into v_order;
  v_response_sha256 := encode(extensions.digest(convert_to(jsonb_build_object(
    'domain', 'iratepilot.flight.consumer-order.v1',
    'order_id', v_order.id::text, 'actor_id', v_actor::text,
    'reprice_receipt_id', v_reprice.id::text, 'request_sha256', p_request_sha256
  )::text, 'UTF8'), 'sha256'), 'hex');
  update public.flight_idempotency_records
     set status = 'succeeded', response_sha256 = v_response_sha256,
         resource_type = 'flight_order', resource_id = v_order.id
   where id = v_idempotency.id and status = 'in_progress';
  return query select 'created'::text, v_order.id, v_order.status,
    v_order.confirmation_code, v_order.currency, v_order.total_cents;
exception when unique_violation then
  raise exception 'Flight reprice already belongs to a consumer order';
end;
$accept_flight_consumer_reprice_and_create_order$;

create function public.prepare_flight_consumer_checkout_v1(
  p_customer_id uuid,
  p_order_id uuid,
  p_key_sha256 text,
  p_request_sha256 text,
  p_encrypted_passengers jsonb,
  p_adapter_source_sha256 text,
  p_payment_binding_receipt_sha256 text,
  p_operation_authority_receipt_sha256 text,
  p_dispatch_not_after timestamptz
)
returns table (
  decision text,
  payment_attempt_id uuid,
  attempt_revision integer,
  attempt_state text,
  amount_cents bigint,
  currency text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $prepare_flight_consumer_checkout$
declare
  v_order public.flight_orders;
  v_search public.flight_searches;
  v_control public.flight_runtime_controls;
  v_attempt public.flight_payment_operation_attempts;
  v_passenger jsonb;
  v_expected integer;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight checkout preparation is service-role only';
  end if;
  select * into v_order from public.flight_orders as flight_order
   where flight_order.id = p_order_id and flight_order.customer_id = p_customer_id
   for update;
  if not found or v_order.consumer_flow_version <> 1
    or v_order.execution_mode <> 'test' or v_order.status <> 'pending_payment'
    or v_order.provider_order_ref_sha256 is not null then
    raise exception 'Flight order is unavailable for checkout';
  end if;
  select * into v_attempt from public.flight_payment_operation_attempts as attempt
   where attempt.order_id = v_order.id and attempt.operation = 'create_intent'
   for update;
  if found then
    if v_attempt.idempotency_key_sha256 is distinct from p_key_sha256
      or v_attempt.idempotency_request_sha256 is distinct from p_request_sha256
      or v_attempt.adapter_source_sha256 is distinct from p_adapter_source_sha256
      or v_attempt.payment_binding_receipt_sha256
        is distinct from p_payment_binding_receipt_sha256
      or v_attempt.operation_authority_receipt_sha256
        is distinct from p_operation_authority_receipt_sha256
      or v_attempt.dispatch_not_after is distinct from p_dispatch_not_after then
      raise exception 'Flight checkout already has a different Stripe attempt';
    end if;
    return query select 'replay'::text, v_attempt.id, v_attempt.revision,
      v_attempt.state, v_attempt.amount_cents, v_attempt.currency;
    return;
  end if;
  select * into v_control from public.flight_runtime_controls
   where control_key = 'global' for update;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'payment'
  );
  if p_adapter_source_sha256 is distinct from v_control.bound_payment_source_sha256
    or p_payment_binding_receipt_sha256 is null
    or p_payment_binding_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_operation_authority_receipt_sha256 is null
    or p_operation_authority_receipt_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight Stripe binding receipt is invalid';
  end if;
  select * into v_search from public.flight_searches as search
   where search.id = v_order.search_id and search.customer_id = v_order.customer_id
   for share;
  v_expected := v_search.adult_count + v_search.child_count
    + v_search.infant_in_seat_count + v_search.infant_on_lap_count;
  if jsonb_typeof(p_encrypted_passengers) <> 'array'
    or jsonb_array_length(p_encrypted_passengers) <> v_expected
    or jsonb_array_length(p_encrypted_passengers) not between 1 and 9 then
    raise exception 'Flight checkout requires the exact encrypted traveler count';
  end if;
  if (select count(*) from public.flight_passenger_refs where order_id = v_order.id) <> 0
    or (select count(*) from public.flight_secure_pii_records where order_id = v_order.id) <> 0 then
    raise exception 'Flight checkout passenger evidence already exists without its attempt';
  end if;
  for v_passenger in select value from jsonb_array_elements(p_encrypted_passengers)
  loop
    if not public.flight_jsonb_has_exact_keys_v1(v_passenger, array[
      'traveler_sequence', 'traveler_type', 'secure_pii_record_ref',
      'pii_record_sha256', 'pii_authority_receipt_sha256',
      'retention_expires_at', 'key_version', 'iv_base64url',
      'auth_tag_base64url', 'ciphertext_base64url', 'aad_sha256',
      'pii_hmac_sha256'
    ]) then
      raise exception 'Encrypted flight passenger contains missing or unknown keys';
    end if;
    insert into public.flight_secure_pii_records (
      secure_pii_record_ref, customer_id, order_id, execution_mode,
      execution_scope_sha256, traveler_type, pii_record_sha256,
      pii_authority_receipt_sha256, key_version, iv_base64url,
      auth_tag_base64url, ciphertext_base64url, aad_sha256, pii_hmac_sha256,
      retention_expires_at
    ) values (
      v_passenger ->> 'secure_pii_record_ref', v_order.customer_id, v_order.id,
      'test', v_order.execution_scope_sha256, v_passenger ->> 'traveler_type',
      v_passenger ->> 'pii_record_sha256',
      v_passenger ->> 'pii_authority_receipt_sha256',
      v_passenger ->> 'key_version', v_passenger ->> 'iv_base64url',
      v_passenger ->> 'auth_tag_base64url',
      v_passenger ->> 'ciphertext_base64url', v_passenger ->> 'aad_sha256',
      v_passenger ->> 'pii_hmac_sha256',
      (v_passenger ->> 'retention_expires_at')::timestamptz
    );
    insert into public.flight_passenger_refs (
      order_id, execution_mode, execution_scope_sha256, traveler_sequence,
      traveler_type, secure_pii_record_ref, pii_record_sha256,
      retention_expires_at
    ) values (
      v_order.id, 'test', v_order.execution_scope_sha256,
      (v_passenger ->> 'traveler_sequence')::smallint,
      v_passenger ->> 'traveler_type', v_passenger ->> 'secure_pii_record_ref',
      v_passenger ->> 'pii_record_sha256',
      (v_passenger ->> 'retention_expires_at')::timestamptz
    );
  end loop;
  if (select count(*) from public.flight_passenger_refs
       where order_id = v_order.id and traveler_type = 'adult') <> v_search.adult_count
    or (select count(*) from public.flight_passenger_refs
         where order_id = v_order.id and traveler_type = 'child') <> v_search.child_count
    or (select count(*) from public.flight_passenger_refs
         where order_id = v_order.id and traveler_type = 'infant_in_seat')
       <> v_search.infant_in_seat_count
    or (select count(*) from public.flight_passenger_refs
         where order_id = v_order.id and traveler_type = 'infant_on_lap')
       <> v_search.infant_on_lap_count
    or exists (
      select 1 from generate_series(1, v_expected) as expected(sequence)
       where not exists (
         select 1 from public.flight_passenger_refs as passenger
          where passenger.order_id = v_order.id
            and passenger.traveler_sequence = expected.sequence
       )
    ) then
    raise exception 'Encrypted flight traveler types do not match the search';
  end if;
  v_now := clock_timestamp();
  if p_dispatch_not_after <= v_now
    or p_dispatch_not_after > v_now + interval '5 minutes' then
    raise exception 'Flight Stripe intent dispatch deadline is invalid';
  end if;
  insert into public.flight_payment_operation_attempts (
    customer_id, order_id, operation, execution_scope_sha256,
    processor_account_sha256, processor_source_sha256,
    processor_adapter_version_sha256, payment_binding_receipt_sha256,
    adapter_source_sha256, operation_authority_receipt_sha256,
    idempotency_key_sha256, idempotency_request_sha256,
    request_plan_sha256, request_sha256, request_body_sha256,
    amount_cents, currency, dispatch_not_after, state, revision, prepared_at
  ) values (
    v_order.customer_id, v_order.id, 'create_intent', v_order.execution_scope_sha256,
    v_control.bound_payment_account_sha256, v_control.bound_payment_source_sha256,
    v_control.bound_payment_adapter_version_sha256, p_payment_binding_receipt_sha256,
    p_adapter_source_sha256, p_operation_authority_receipt_sha256,
    p_key_sha256, p_request_sha256, p_request_sha256, p_request_sha256,
    p_request_sha256, v_order.total_cents, v_order.currency,
    p_dispatch_not_after, 'prepared', 0, v_now
  ) returning * into v_attempt;
  update public.flight_orders
     set updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
   where id = v_order.id;
  return query select 'prepared'::text, v_attempt.id, v_attempt.revision,
    v_attempt.state, v_attempt.amount_cents, v_attempt.currency;
exception when unique_violation then
  raise exception 'Flight checkout already has a Stripe or passenger identity';
end;
$prepare_flight_consumer_checkout$;

-- Narrow recovery projection for Stripe retries. This deliberately excludes
-- encrypted processor references and all credentials while returning every
-- digest needed to reject an idempotency or binding mismatch.
create function public.get_flight_consumer_payment_operation_v1(
  p_customer_id uuid,
  p_order_id uuid,
  p_operation text
)
returns table (
  attempt_id uuid,
  customer_id uuid,
  order_id uuid,
  payment_id uuid,
  operation text,
  execution_scope_sha256 text,
  processor_account_sha256 text,
  processor_source_sha256 text,
  processor_adapter_version_sha256 text,
  payment_binding_receipt_sha256 text,
  adapter_source_sha256 text,
  operation_authority_receipt_sha256 text,
  idempotency_key_sha256 text,
  idempotency_request_sha256 text,
  request_plan_sha256 text,
  request_sha256 text,
  request_body_sha256 text,
  amount_cents bigint,
  currency text,
  dispatch_not_after timestamptz,
  attempt_revision integer,
  attempt_state text,
  processor_object_ref_sha256 text,
  terminal_http_status smallint,
  terminal_response_sha256 text,
  terminal_response_bytes bigint,
  terminal_receipt_sha256 text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $get_flight_consumer_payment_operation$
declare
  v_order public.flight_orders;
  v_attempt public.flight_payment_operation_attempts;
  v_control public.flight_runtime_controls;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight payment operation recovery is service-role only';
  end if;
  if p_operation is null
    or p_operation not in ('create_intent', 'capture', 'refund') then
    raise exception 'Flight payment recovery operation is invalid';
  end if;
  select * into v_order from public.flight_orders as flight_order
   where flight_order.id = p_order_id
     and flight_order.customer_id = p_customer_id
   for share;
  if v_order.id is null or v_order.consumer_flow_version <> 1
    or v_order.execution_mode <> 'test' then
    raise exception 'Flight payment recovery order is unavailable';
  end if;
  select * into v_control from public.flight_runtime_controls
   where control_key = 'global';
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'payment'
  );
  select * into v_attempt from public.flight_payment_operation_attempts as attempt
   where attempt.customer_id = p_customer_id
     and attempt.order_id = p_order_id
     and attempt.operation = p_operation;
  if not found then
    return;
  end if;
  if v_attempt.processor_code <> 'stripe'
    or v_attempt.processor_environment <> 'test'
    or v_attempt.execution_mode <> 'test'
    or v_attempt.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_attempt.processor_account_sha256
      is distinct from v_control.bound_payment_account_sha256
    or v_attempt.processor_source_sha256
      is distinct from v_control.bound_payment_source_sha256
    or v_attempt.processor_adapter_version_sha256
      is distinct from v_control.bound_payment_adapter_version_sha256
    or v_attempt.adapter_source_sha256
      is distinct from v_control.bound_payment_source_sha256 then
    raise exception 'Flight payment recovery binding is stale';
  end if;
  return query select
    v_attempt.id, v_attempt.customer_id, v_attempt.order_id,
    v_attempt.payment_id, v_attempt.operation,
    v_attempt.execution_scope_sha256, v_attempt.processor_account_sha256,
    v_attempt.processor_source_sha256,
    v_attempt.processor_adapter_version_sha256,
    v_attempt.payment_binding_receipt_sha256,
    v_attempt.adapter_source_sha256,
    v_attempt.operation_authority_receipt_sha256,
    v_attempt.idempotency_key_sha256,
    v_attempt.idempotency_request_sha256,
    v_attempt.request_plan_sha256, v_attempt.request_sha256,
    v_attempt.request_body_sha256, v_attempt.amount_cents,
    v_attempt.currency, v_attempt.dispatch_not_after,
    v_attempt.revision, v_attempt.state,
    v_attempt.processor_object_ref_sha256,
    v_attempt.terminal_http_status, v_attempt.terminal_response_sha256,
    v_attempt.terminal_response_bytes, v_attempt.terminal_receipt_sha256;
end;
$get_flight_consumer_payment_operation$;

create function public.claim_flight_consumer_payment_operation_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_payment_binding_receipt_sha256 text,
  p_operation_authority_receipt_sha256 text
)
returns table (attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $claim_flight_consumer_payment_operation$
declare
  v_order_id uuid;
  v_order public.flight_orders;
  v_attempt public.flight_payment_operation_attempts;
  v_control public.flight_runtime_controls;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Stripe operation claim is service-role only';
  end if;
  select attempt.order_id into v_order_id
    from public.flight_payment_operation_attempts as attempt
   where attempt.id = p_attempt_id;
  select * into v_order from public.flight_orders as flight_order
   where flight_order.id = v_order_id for update;
  select * into v_attempt from public.flight_payment_operation_attempts as attempt
   where attempt.id = p_attempt_id for update;
  if v_order.id is null or v_attempt.id is null
    or v_attempt.state <> 'prepared' or v_attempt.revision <> p_expected_revision
    or (v_attempt.operation = 'create_intent' and v_order.status <> 'pending_payment')
    or (v_attempt.operation = 'capture' and v_order.status <> 'payment_authorized')
    or (v_attempt.operation = 'refund' and v_order.status <> 'requires_review') then
    raise exception 'Flight Stripe operation dispatch CAS failed';
  end if;
  select * into v_control from public.flight_runtime_controls
   where control_key = 'global' for update;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'payment'
  );
  if p_payment_binding_receipt_sha256
      is distinct from v_attempt.payment_binding_receipt_sha256
    or p_operation_authority_receipt_sha256
      is distinct from v_attempt.operation_authority_receipt_sha256
    or v_control.bound_payment_account_sha256
      is distinct from v_attempt.processor_account_sha256
    or v_control.bound_payment_source_sha256
      is distinct from v_attempt.processor_source_sha256
    or v_control.bound_payment_adapter_version_sha256
      is distinct from v_attempt.processor_adapter_version_sha256 then
    raise exception 'Flight Stripe operation authority changed before dispatch';
  end if;
  v_now := clock_timestamp();
  if v_attempt.dispatch_not_after <= v_now then
    raise exception 'Flight Stripe operation dispatch authority expired';
  end if;
  update public.flight_payment_operation_attempts
     set state = 'dispatching', revision = revision + 1,
         dispatch_started_at = v_now
   where id = v_attempt.id and state = 'prepared'
     and revision = p_expected_revision
  returning * into v_attempt;
  if not found then raise exception 'Flight Stripe operation dispatch CAS failed'; end if;
  update public.flight_orders
     set updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
   where id = v_order.id;
  return query select v_attempt.id, v_attempt.revision, v_attempt.state;
end;
$claim_flight_consumer_payment_operation$;

create function public.complete_flight_consumer_payment_operation_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_terminal_state text,
  p_terminal_http_status smallint,
  p_terminal_response_sha256 text,
  p_terminal_response_bytes bigint,
  p_terminal_receipt_sha256 text
)
returns table (attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $complete_flight_consumer_payment_operation$
declare
  v_order_id uuid;
  v_order public.flight_orders;
  v_attempt public.flight_payment_operation_attempts;
  v_payment public.flight_payments;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Stripe operation completion is service-role only';
  end if;
  select attempt.order_id into v_order_id
    from public.flight_payment_operation_attempts as attempt
   where attempt.id = p_attempt_id;
  select * into v_order from public.flight_orders as flight_order
   where flight_order.id = v_order_id for update;
  select * into v_attempt from public.flight_payment_operation_attempts as attempt
   where attempt.id = p_attempt_id for update;
  if v_order.id is null or v_attempt.id is null then
    raise exception 'Flight Stripe operation is unavailable';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'payment'
  );
  if v_attempt.revision = 2 and v_attempt.state in ('succeeded', 'failed', 'ambiguous') then
    if p_expected_revision <> 2
      or v_attempt.state is distinct from p_terminal_state
      or v_attempt.terminal_http_status is distinct from p_terminal_http_status
      or v_attempt.terminal_response_sha256 is distinct from p_terminal_response_sha256
      or v_attempt.terminal_response_bytes is distinct from p_terminal_response_bytes
      or v_attempt.terminal_receipt_sha256 is distinct from p_terminal_receipt_sha256 then
      raise exception 'Flight Stripe terminal replay does not match';
    end if;
    return query select v_attempt.id, v_attempt.revision, v_attempt.state;
    return;
  end if;
  if p_terminal_receipt_sha256 is null
    or p_terminal_receipt_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight Stripe terminal receipt is required';
  end if;
  if v_attempt.operation = 'create_intent' and p_terminal_state = 'succeeded' then
    raise exception 'Successful Stripe intent creation requires the dedicated atomic completion RPC';
  end if;
  if v_attempt.state = 'prepared' then
    if p_expected_revision <> 0 or p_terminal_state <> 'blocked'
      or p_terminal_http_status is not null
      or p_terminal_response_sha256 is not null
      or p_terminal_response_bytes is not null then
      raise exception 'Only a never-dispatched Stripe operation may become blocked';
    end if;
  elsif v_attempt.state = 'dispatching' then
    if p_expected_revision <> 1
      or p_terminal_state not in ('succeeded', 'failed', 'ambiguous') then
      raise exception 'Dispatched Stripe operation requires an exact terminal outcome';
    end if;
    if p_terminal_state = 'succeeded' and (
      p_terminal_http_status not between 200 and 299
      or p_terminal_response_sha256 is null or p_terminal_response_bytes is null
    ) then raise exception 'Successful Stripe response evidence is incomplete'; end if;
    if p_terminal_state = 'failed' and (
      p_terminal_http_status not between 300 and 599
      or p_terminal_response_sha256 is null or p_terminal_response_bytes is null
    ) then raise exception 'Known Stripe failure evidence is incomplete'; end if;
    if p_terminal_state = 'ambiguous' and (
      p_terminal_http_status is not null or p_terminal_response_sha256 is not null
      or p_terminal_response_bytes is not null
    ) then raise exception 'Ambiguous Stripe dispatch cannot claim a response'; end if;
  else
    raise exception 'Flight Stripe operation completion CAS failed';
  end if;
  v_now := clock_timestamp();
  update public.flight_payment_operation_attempts
     set state = p_terminal_state, revision = revision + 1,
         completed_at = v_now, terminal_http_status = p_terminal_http_status,
         terminal_response_sha256 = p_terminal_response_sha256,
         terminal_response_bytes = p_terminal_response_bytes,
         terminal_receipt_sha256 = p_terminal_receipt_sha256
   where id = v_attempt.id and state = v_attempt.state
     and revision = p_expected_revision
  returning * into v_attempt;
  if not found then raise exception 'Flight Stripe operation completion CAS failed'; end if;

  if p_terminal_state in ('failed', 'ambiguous', 'blocked') then
    if v_attempt.operation = 'create_intent' then
      update public.flight_orders
         set status = case when p_terminal_state = 'ambiguous'
           then 'requires_review' else 'failed' end
       where id = v_order.id and status = 'pending_payment';
    elsif v_attempt.operation = 'capture' then
      update public.flight_orders set status = 'requires_review'
       where id = v_order.id and status = 'payment_authorized';
      if p_terminal_state = 'ambiguous' then
        select * into v_payment from public.flight_payments
         where id = v_attempt.payment_id and order_id = v_order.id for update;
        update public.flight_payments set status = 'ambiguous'
         where id = v_payment.id and status = 'authorized';
      end if;
    elsif v_attempt.operation = 'refund' and p_terminal_state = 'ambiguous' then
      select * into v_payment from public.flight_payments
       where id = v_attempt.payment_id and order_id = v_order.id for update;
      update public.flight_payments set status = 'ambiguous'
       where id = v_payment.id and status = 'refund_pending';
    end if;
  end if;
  update public.flight_orders
     set updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
   where id = v_order.id;
  return query select v_attempt.id, v_attempt.revision, v_attempt.state;
end;
$complete_flight_consumer_payment_operation$;

create function public.complete_flight_consumer_payment_intent_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_terminal_state text,
  p_terminal_http_status smallint,
  p_terminal_response_sha256 text,
  p_terminal_response_bytes bigint,
  p_terminal_receipt_sha256 text,
  p_processor_reference_ciphertext text,
  p_processor_reference_sha256 text
)
returns table (
  decision text,
  attempt_id uuid,
  attempt_revision integer,
  attempt_state text,
  payment_id uuid,
  payment_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $complete_flight_consumer_payment_intent$
declare
  v_order_id uuid;
  v_order public.flight_orders;
  v_attempt public.flight_payment_operation_attempts;
  v_payment public.flight_payments;
  v_payment_id uuid;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Stripe intent completion is service-role only';
  end if;
  select attempt.order_id into v_order_id
    from public.flight_payment_operation_attempts as attempt
   where attempt.id = p_attempt_id;
  select * into v_order from public.flight_orders as flight_order
   where flight_order.id = v_order_id for update;
  select * into v_attempt from public.flight_payment_operation_attempts as attempt
   where attempt.id = p_attempt_id for update;
  if v_order.id is null or v_attempt.id is null
    or v_attempt.operation <> 'create_intent' then
    raise exception 'Flight Stripe intent attempt is unavailable';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'payment'
  );
  if v_attempt.revision = 2 and v_attempt.state = 'succeeded' then
    if p_expected_revision <> 2 or p_terminal_state <> 'succeeded'
      or v_attempt.terminal_http_status is distinct from p_terminal_http_status
      or v_attempt.terminal_response_sha256 is distinct from p_terminal_response_sha256
      or v_attempt.terminal_response_bytes is distinct from p_terminal_response_bytes
      or v_attempt.terminal_receipt_sha256 is distinct from p_terminal_receipt_sha256
      or v_attempt.processor_object_ref_ciphertext
        is distinct from p_processor_reference_ciphertext
      or v_attempt.processor_object_ref_sha256
        is distinct from p_processor_reference_sha256 then
      raise exception 'Flight Stripe intent terminal replay does not match';
    end if;
    select * into v_payment from public.flight_payments
     where id = v_attempt.payment_id and order_id = v_order.id;
    return query select 'replay'::text, v_attempt.id, v_attempt.revision,
      v_attempt.state, v_payment.id, v_payment.status;
    return;
  end if;
  if p_terminal_state <> 'succeeded' then
    perform * from public.complete_flight_consumer_payment_operation_v1(
      p_attempt_id, p_expected_revision, p_terminal_state,
      p_terminal_http_status, p_terminal_response_sha256,
      p_terminal_response_bytes, p_terminal_receipt_sha256
    );
    select * into v_attempt from public.flight_payment_operation_attempts
     where id = p_attempt_id;
    return query select 'terminal'::text, v_attempt.id, v_attempt.revision,
      v_attempt.state, null::uuid, null::text;
    return;
  end if;
  if v_attempt.state <> 'dispatching' or p_expected_revision <> 1
    or p_terminal_http_status not between 200 and 299
    or p_terminal_response_sha256 is null
    or p_terminal_response_sha256 !~ '^[0-9a-f]{64}$'
    or p_terminal_response_bytes not between 0 and 1048576
    or p_terminal_receipt_sha256 is null
    or p_terminal_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_processor_reference_ciphertext is null
    or p_processor_reference_sha256 is null
    or p_processor_reference_sha256 !~ '^[0-9a-f]{64}$'
    or v_order.status <> 'pending_payment' then
    raise exception 'Successful Stripe intent evidence is incomplete';
  end if;
  v_now := clock_timestamp();
  v_payment_id := gen_random_uuid();
  insert into public.flight_payments (
    id, order_id, execution_mode, execution_scope_sha256, processor_code,
    processor_reference_ciphertext, processor_reference_sha256,
    idempotency_key_sha256, currency, authorized_cents, captured_cents,
    refunded_cents, status, created_at, updated_at
  ) values (
    v_payment_id, v_order.id, 'test', v_order.execution_scope_sha256, 'stripe',
    p_processor_reference_ciphertext, p_processor_reference_sha256,
    v_attempt.idempotency_key_sha256, v_order.currency, 0, 0, 0,
    'requires_payment_method', v_now, v_now
  ) returning * into v_payment;
  update public.flight_payment_operation_attempts
     set state = 'succeeded', revision = revision + 1,
         payment_id = v_payment.id,
         processor_object_ref_ciphertext = p_processor_reference_ciphertext,
         processor_object_ref_sha256 = p_processor_reference_sha256,
         completed_at = v_now, terminal_http_status = p_terminal_http_status,
         terminal_response_sha256 = p_terminal_response_sha256,
         terminal_response_bytes = p_terminal_response_bytes,
         terminal_receipt_sha256 = p_terminal_receipt_sha256
   where id = v_attempt.id and state = 'dispatching' and revision = 1
  returning * into v_attempt;
  if not found then raise exception 'Flight Stripe intent completion CAS failed'; end if;
  update public.flight_orders
     set updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
   where id = v_order.id;
  return query select 'completed'::text, v_attempt.id, v_attempt.revision,
    v_attempt.state, v_payment.id, v_payment.status;
end;
$complete_flight_consumer_payment_intent$;

create function public.record_flight_consumer_payment_authorization_v1(
  p_order_id uuid,
  p_payment_id uuid,
  p_expected_updated_at timestamptz,
  p_processor_reference_sha256 text,
  p_observation_sha256 text,
  p_observed_status text,
  p_authorized_cents bigint
)
returns table (order_id uuid, order_status text, payment_id uuid, payment_status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $record_flight_consumer_payment_authorization$
declare
  v_order public.flight_orders;
  v_payment public.flight_payments;
  v_observation public.flight_payment_state_observations;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight payment authorization recording is service-role only';
  end if;
  select * into v_order from public.flight_orders as flight_order
   where flight_order.id = p_order_id for update;
  select * into v_payment from public.flight_payments as payment
   where payment.id = p_payment_id and payment.order_id = p_order_id for update;
  if v_order.id is null or v_payment.id is null
    or v_order.consumer_flow_version <> 1
    or v_payment.processor_code <> 'stripe'
    or v_payment.processor_reference_sha256
      is distinct from p_processor_reference_sha256
    or p_observation_sha256 is null or p_observation_sha256 !~ '^[0-9a-f]{64}$'
    or p_observed_status not in (
      'requires_payment_method', 'requires_action', 'requires_capture',
      'failed', 'cancelled', 'uncertain', 'unsupported'
    ) then
    raise exception 'Flight payment authorization observation does not match';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'payment'
  );
  select * into v_observation from public.flight_payment_state_observations
   where observation_sha256 = p_observation_sha256 for share;
  if found then
    if v_observation.order_id is distinct from v_order.id
      or v_observation.payment_id is distinct from v_payment.id
      or v_observation.observed_status is distinct from p_observed_status
      or v_observation.authorized_cents is distinct from p_authorized_cents then
      raise exception 'Flight payment observation digest collision';
    end if;
    return query select v_order.id, v_order.status, v_payment.id, v_payment.status;
    return;
  end if;
  if v_payment.updated_at is distinct from p_expected_updated_at then
    raise exception 'Flight payment authorization CAS failed';
  end if;
  if v_order.status <> 'pending_payment' then
    raise exception 'Flight order is no longer awaiting its first authorization result';
  end if;
  insert into public.flight_payment_state_observations (
    order_id, payment_id, execution_mode, execution_scope_sha256,
    observed_status, authorized_cents, observation_sha256
  ) values (
    v_order.id, v_payment.id, 'test', v_order.execution_scope_sha256,
    p_observed_status, p_authorized_cents, p_observation_sha256
  );
  if p_observed_status = 'requires_payment_method' then
    if p_authorized_cents <> 0 then raise exception 'Unfunded Stripe intent cannot claim authorization'; end if;
  elsif p_observed_status = 'requires_action' then
    if p_authorized_cents <> 0 then raise exception 'Stripe action state cannot claim authorization'; end if;
    update public.flight_payments set status = 'requires_action'
     where id = v_payment.id and status in ('requires_payment_method', 'requires_action')
    returning * into v_payment;
  elsif p_observed_status = 'requires_capture' then
    if p_authorized_cents is distinct from v_order.total_cents then
      raise exception 'Stripe authorization amount must exactly match the order';
    end if;
    update public.flight_payments
       set status = 'authorized', authorized_cents = p_authorized_cents
     where id = v_payment.id
       and status in ('requires_payment_method', 'requires_action')
       and authorized_cents = 0
    returning * into v_payment;
    if not found then raise exception 'Flight payment authorization CAS failed'; end if;
    update public.flight_orders set status = 'payment_authorized'
     where id = v_order.id and status = 'pending_payment'
    returning * into v_order;
    if not found then raise exception 'Flight order authorization CAS failed'; end if;
  elsif p_observed_status in ('failed', 'cancelled') then
    if p_authorized_cents <> 0 then raise exception 'Failed Stripe intent cannot retain liability'; end if;
    update public.flight_payments
       set status = case when p_observed_status = 'failed' then 'failed' else 'cancelled' end
     where id = v_payment.id
       and status in ('requires_payment_method', 'requires_action')
       and authorized_cents = 0 and captured_cents = 0
    returning * into v_payment;
    if not found then raise exception 'Flight payment terminal CAS failed'; end if;
    update public.flight_orders
       set status = case when p_observed_status = 'failed' then 'failed' else 'cancelled' end
     where id = v_order.id and status = 'pending_payment'
    returning * into v_order;
  else
    update public.flight_orders set status = 'requires_review'
     where id = v_order.id and status = 'pending_payment'
    returning * into v_order;
    if not found then raise exception 'Flight order review CAS failed'; end if;
    update public.flight_payments set status = 'ambiguous'
     where id = v_payment.id
       and status in ('requires_payment_method', 'requires_action')
    returning * into v_payment;
  end if;
  update public.flight_orders
     set updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
   where id = p_order_id returning * into v_order;
  select * into v_payment from public.flight_payments where id = p_payment_id;
  return query select v_order.id, v_order.status, v_payment.id, v_payment.status;
end;
$record_flight_consumer_payment_authorization$;

create function public.prepare_flight_consumer_capture_v1(
  p_order_id uuid,
  p_payment_id uuid,
  p_key_sha256 text,
  p_request_sha256 text,
  p_adapter_source_sha256 text,
  p_payment_binding_receipt_sha256 text,
  p_operation_authority_receipt_sha256 text,
  p_dispatch_not_after timestamptz
)
returns table (decision text, attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $prepare_flight_consumer_capture$
declare
  v_order public.flight_orders;
  v_attempt public.flight_payment_operation_attempts;
  v_control public.flight_runtime_controls;
  v_payment public.flight_payments;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight capture preparation is service-role only';
  end if;
  select * into v_order from public.flight_orders where id = p_order_id for update;
  select * into v_attempt from public.flight_payment_operation_attempts
   where order_id = p_order_id and operation = 'capture' for update;
  select * into v_control from public.flight_runtime_controls
   where control_key = 'global' for update;
  if v_order.id is null or v_order.status <> 'payment_authorized' then
    raise exception 'Flight order is not ready for capture';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'payment'
  );
  if v_attempt.id is not null then
    if v_attempt.payment_id is distinct from p_payment_id
      or v_attempt.idempotency_key_sha256 is distinct from p_key_sha256
      or v_attempt.idempotency_request_sha256 is distinct from p_request_sha256
      or v_attempt.adapter_source_sha256 is distinct from p_adapter_source_sha256
      or v_attempt.payment_binding_receipt_sha256
        is distinct from p_payment_binding_receipt_sha256
      or v_attempt.operation_authority_receipt_sha256
        is distinct from p_operation_authority_receipt_sha256 then
      raise exception 'Flight order already has a different capture attempt';
    end if;
    return query select 'replay'::text, v_attempt.id, v_attempt.revision, v_attempt.state;
    return;
  end if;
  select * into v_payment from public.flight_payments
   where id = p_payment_id and order_id = p_order_id for update;
  if not found or v_payment.status <> 'authorized'
    or v_payment.authorized_cents <> v_order.total_cents
    or v_payment.captured_cents <> 0 or v_payment.refunded_cents <> 0
    or p_adapter_source_sha256 is distinct from v_control.bound_payment_source_sha256 then
    raise exception 'Exact authorized Stripe payment is required for capture';
  end if;
  v_now := clock_timestamp();
  if p_dispatch_not_after <= v_now
    or p_dispatch_not_after > v_now + interval '5 minutes' then
    raise exception 'Flight capture dispatch deadline is invalid';
  end if;
  insert into public.flight_payment_operation_attempts (
    customer_id, order_id, payment_id, operation, execution_scope_sha256,
    processor_account_sha256, processor_source_sha256,
    processor_adapter_version_sha256, payment_binding_receipt_sha256,
    adapter_source_sha256, operation_authority_receipt_sha256,
    idempotency_key_sha256, idempotency_request_sha256,
    request_plan_sha256, request_sha256, request_body_sha256,
    amount_cents, currency, dispatch_not_after, prepared_at
  ) values (
    v_order.customer_id, v_order.id, v_payment.id, 'capture',
    v_order.execution_scope_sha256, v_control.bound_payment_account_sha256,
    v_control.bound_payment_source_sha256,
    v_control.bound_payment_adapter_version_sha256,
    p_payment_binding_receipt_sha256, p_adapter_source_sha256,
    p_operation_authority_receipt_sha256, p_key_sha256, p_request_sha256,
    p_request_sha256, p_request_sha256, p_request_sha256,
    v_order.total_cents, v_order.currency, p_dispatch_not_after, v_now
  ) returning * into v_attempt;
  update public.flight_orders
     set updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
   where id = v_order.id;
  return query select 'prepared'::text, v_attempt.id, v_attempt.revision, v_attempt.state;
end;
$prepare_flight_consumer_capture$;

create function public.apply_flight_consumer_capture_v1(
  p_attempt_id uuid,
  p_expected_terminal_revision integer,
  p_payment_id uuid,
  p_processor_reference_sha256 text
)
returns table (order_id uuid, order_status text, payment_id uuid, payment_status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $apply_flight_consumer_capture$
declare
  v_order_id uuid;
  v_order public.flight_orders;
  v_attempt public.flight_payment_operation_attempts;
  v_control public.flight_runtime_controls;
  v_payment public.flight_payments;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight capture application is service-role only';
  end if;
  select attempt.order_id into v_order_id from public.flight_payment_operation_attempts attempt
   where attempt.id = p_attempt_id;
  select * into v_order from public.flight_orders where id = v_order_id for update;
  select * into v_attempt from public.flight_payment_operation_attempts
   where id = p_attempt_id for update;
  select * into v_control from public.flight_runtime_controls
   where control_key = 'global' for update;
  select * into v_payment from public.flight_payments
   where id = p_payment_id and order_id = v_order.id for update;
  if v_order.id is null or v_attempt.id is null or v_payment.id is null
    or v_order.consumer_flow_version <> 1
    or v_attempt.operation <> 'capture' or v_attempt.state <> 'succeeded'
    or v_attempt.revision <> p_expected_terminal_revision
    or v_attempt.payment_id is distinct from v_payment.id
    or v_payment.processor_reference_sha256 is distinct from p_processor_reference_sha256
    or v_payment.execution_mode <> 'test'
    or v_payment.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_payment.processor_code <> 'stripe'
    or v_payment.currency <> v_order.currency
    or v_payment.authorized_cents <> v_order.total_cents
    or v_payment.refunded_cents <> 0 then
    raise exception 'Successful Stripe capture evidence does not match';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'payment'
  );
  if v_order.status = 'payment_authorized'
    and v_payment.status = 'captured'
    and v_payment.captured_cents = v_order.total_cents then
    return query select v_order.id, v_order.status, v_payment.id, v_payment.status;
    return;
  end if;
  if v_order.status <> 'payment_authorized'
    or v_payment.status <> 'authorized'
    or v_payment.captured_cents <> 0 then
    raise exception 'Successful Stripe capture application CAS does not match';
  end if;
  update public.flight_payments
     set status = 'captured', captured_cents = authorized_cents
   where id = v_payment.id and status = 'authorized' and captured_cents = 0
  returning * into v_payment;
  if not found then raise exception 'Flight capture application CAS failed'; end if;
  update public.flight_orders
     set updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
   where id = v_order.id returning * into v_order;
  return query select v_order.id, v_order.status, v_payment.id, v_payment.status;
end;
$apply_flight_consumer_capture$;

create function public.get_flight_consumer_offer_evidence_context_v1(
  p_customer_id uuid,
  p_search_id uuid,
  p_offer_id uuid,
  p_stage text
)
returns table (
  receipt_sha256 text,
  local_offer_id text,
  reprice_receipt_id uuid,
  retention_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $get_flight_consumer_offer_evidence_context$
declare
  v_scope text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight offer evidence context is service-role only';
  end if;
  if p_stage not in ('initial', 'refreshed') then
    raise exception 'Flight offer evidence context stage is invalid';
  end if;
  select control.bound_execution_scope_sha256 into v_scope
    from public.flight_runtime_controls as control
   where control.control_key = 'global';
  perform public.assert_flight_consumer_preview_runtime_v1(v_scope, 'shopping');
  return query
  select evidence.receipt_sha256, evidence.local_offer_id,
    evidence.reprice_receipt_id, evidence.retention_expires_at
    from public.flight_offer_evidence_vault as evidence
    join public.flight_searches as search
      on search.id = evidence.search_id and search.customer_id = evidence.customer_id
    join public.flight_offers as offer
      on offer.id = evidence.offer_id and offer.search_id = evidence.search_id
   where evidence.customer_id = p_customer_id
     and evidence.search_id = p_search_id
     and evidence.offer_id = p_offer_id
     and evidence.stage = p_stage
     and evidence.execution_mode = 'test'
     and evidence.execution_scope_sha256 = v_scope
     and search.execution_mode = 'test' and search.execution_scope_sha256 = v_scope
     and offer.execution_mode = 'test' and offer.execution_scope_sha256 = v_scope
     and evidence.retention_expires_at > clock_timestamp()
   order by evidence.observed_at desc, evidence.id desc
   limit 1;
end;
$get_flight_consumer_offer_evidence_context$;

create function public.validate_flight_consumer_provider_attempt_link_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $validate_flight_consumer_provider_attempt_link$
begin
  if new.consumer_flow_version = 1 and new.operation = 'create_order' and not exists (
    select 1
      from public.flight_orders as flight_order
      join public.flight_offer_evidence_vault as evidence
        on evidence.receipt_sha256 = new.offer_evidence_receipt_sha256
     where flight_order.id = new.order_id
       and flight_order.consumer_flow_version = 1
       and flight_order.customer_id = new.customer_id
       and flight_order.search_id = new.search_id
       and flight_order.offer_id = new.offer_id
       and flight_order.reprice_receipt_id = evidence.reprice_receipt_id
       and evidence.customer_id = new.customer_id
       and evidence.search_id = new.search_id
       and evidence.offer_id = new.offer_id
       and evidence.stage = 'refreshed'
       and evidence.execution_mode = new.execution_mode
       and evidence.execution_scope_sha256 = new.execution_scope_sha256
       and evidence.retention_expires_at > clock_timestamp()
  ) then
    raise exception 'Consumer provider order attempt requires exact refreshed reprice evidence';
  end if;
  return new;
end;
$validate_flight_consumer_provider_attempt_link$;

create function public.protect_flight_consumer_provider_idempotency_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $protect_flight_consumer_provider_idempotency$
begin
  if new.consumer_idempotency_key_sha256
      is distinct from old.consumer_idempotency_key_sha256
    or new.consumer_idempotency_request_sha256
      is distinct from old.consumer_idempotency_request_sha256 then
    raise exception 'Flight consumer provider idempotency identity is immutable';
  end if;
  return new;
end;
$protect_flight_consumer_provider_idempotency$;

create trigger flight_provider_request_attempts_00_consumer_idempotency_guard
before update of consumer_idempotency_key_sha256, consumer_idempotency_request_sha256
on public.flight_provider_request_attempts
for each row execute function public.protect_flight_consumer_provider_idempotency_v1();

create trigger flight_provider_request_attempts_consumer_link_guard
before insert on public.flight_provider_request_attempts
for each row execute function public.validate_flight_consumer_provider_attempt_link_v1();

-- Replacement for 074: discover the immutable order link without a lock, then
-- always acquire order -> attempt -> runtime control -> payment/evidence/PII.
create or replace function public.claim_flight_consumer_duffel_order_attempt_v1(
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
as $claim_flight_consumer_order_075$
declare
  v_order_id uuid;
  v_order public.flight_orders;
  v_attempt public.flight_provider_request_attempts;
  v_control public.flight_runtime_controls;
  v_payment public.flight_payments;
  v_evidence public.flight_offer_evidence_vault;
  v_now timestamptz;
  v_point_of_sale_sha256 text;
  v_expected_travelers integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight consumer Duffel order claim is service-role only';
  end if;
  select attempt.order_id into v_order_id
    from public.flight_provider_request_attempts as attempt
   where attempt.id = p_attempt_id;
  select * into v_order from public.flight_orders as flight_order
   where flight_order.id = v_order_id for update;
  select * into v_attempt from public.flight_provider_request_attempts as attempt
   where attempt.id = p_attempt_id for update;
  if v_order.id is null or v_attempt.id is null
    or v_order.consumer_flow_version <> 1
    or v_attempt.consumer_flow_version <> 1
    or v_attempt.operation <> 'create_order'
    or v_attempt.order_id is distinct from v_order.id
    or v_attempt.customer_id is distinct from v_order.customer_id
    or v_attempt.search_id is distinct from v_order.search_id
    or v_attempt.offer_id is distinct from v_order.offer_id
    or v_attempt.state <> 'prepared' or v_attempt.revision <> p_expected_revision
    or v_order.status not in ('order_creating', 'requires_review')
    or v_order.provider_order_ref_sha256 is not null then
    raise exception 'Flight consumer Duffel order dispatch CAS failed';
  end if;
  select * into v_control from public.flight_runtime_controls
   where control_key = 'global' for update;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'order'
  );
  if not public.flight_runtime_capability_enabled(
      'test', 'payment', 'duffel', 'stripe', v_order.execution_scope_sha256
    ) or not public.flight_runtime_capability_enabled(
      'test', 'ticketing', 'duffel', null, v_order.execution_scope_sha256
    ) then
    raise exception 'Flight payment or ticketing authority changed before Duffel dispatch';
  end if;
  perform set_config('app.flight_adapter_source_sha256', p_adapter_source_sha256, true);
  perform set_config(
    'app.flight_provider_binding_receipt_sha256', p_provider_binding_receipt_sha256, true
  );
  perform set_config(
    'app.flight_customer_payment_binding_receipt_sha256',
    p_payment_binding_receipt_sha256, true
  );
  perform set_config(
    'app.flight_provider_settlement_binding_receipt_sha256',
    p_provider_settlement_binding_receipt_sha256, true
  );
  perform set_config(
    'app.flight_request_authority_receipt_sha256',
    p_operation_authority_receipt_sha256, true
  );
  if p_adapter_source_sha256 is distinct from v_attempt.adapter_source_sha256
    or p_provider_binding_receipt_sha256
      is distinct from v_attempt.provider_binding_receipt_sha256
    or p_payment_binding_receipt_sha256
      is distinct from v_attempt.payment_binding_receipt_sha256
    or p_provider_settlement_binding_receipt_sha256
      is distinct from v_attempt.provider_settlement_binding_receipt_sha256
    or p_operation_authority_receipt_sha256
      is distinct from v_attempt.operation_authority_receipt_sha256
    or v_control.activation_evidence_sha256
      is distinct from v_attempt.activation_evidence_sha256
    or v_control.bound_provider_account_sha256
      is distinct from v_attempt.provider_account_sha256
    or v_control.bound_adapter_version_sha256
      is distinct from v_attempt.adapter_version_sha256
    or v_control.bound_content_scope_sha256
      is distinct from v_attempt.content_scope_sha256 then
    raise exception 'Flight consumer Duffel authority changed before dispatch';
  end if;
  v_point_of_sale_sha256 := encode(
    extensions.digest(convert_to(v_control.bound_point_of_sale, 'UTF8'), 'sha256'), 'hex'
  );
  if v_point_of_sale_sha256 is distinct from v_attempt.point_of_sale_sha256 then
    raise exception 'Flight consumer point-of-sale binding changed before dispatch';
  end if;
  select * into v_payment from public.flight_payments as payment
   where payment.order_id = v_order.id and payment.processor_code = 'stripe'
     and payment.execution_mode = 'test'
     and payment.execution_scope_sha256 = v_order.execution_scope_sha256
     and payment.currency = v_order.currency
     and payment.authorized_cents = v_order.total_cents
     and payment.captured_cents = v_order.total_cents
     and payment.refunded_cents = 0 and payment.status = 'captured'
   for share;
  select * into v_evidence from public.flight_offer_evidence_vault as evidence
   where evidence.receipt_sha256 = v_attempt.offer_evidence_receipt_sha256
     and evidence.customer_id = v_order.customer_id
     and evidence.search_id = v_order.search_id
     and evidence.offer_id = v_order.offer_id
     and evidence.reprice_receipt_id = v_order.reprice_receipt_id
     and evidence.stage = 'refreshed'
     and evidence.execution_mode = 'test'
     and evidence.execution_scope_sha256 = v_order.execution_scope_sha256
     and evidence.retention_expires_at > clock_timestamp() for share;
  select search.adult_count + search.child_count
      + search.infant_in_seat_count + search.infant_on_lap_count
    into v_expected_travelers from public.flight_searches as search
   where search.id = v_order.search_id and search.customer_id = v_order.customer_id
   for share;
  if v_payment.id is null or v_evidence.id is null
    or (select count(*) from public.flight_passenger_refs as passenger
         where passenger.order_id = v_order.id) <> v_expected_travelers
    or exists (
      select 1 from public.flight_passenger_refs as passenger
       where passenger.order_id = v_order.id and not exists (
         select 1 from public.flight_secure_pii_records as pii
          where pii.secure_pii_record_ref = passenger.secure_pii_record_ref
            and pii.order_id = v_order.id and pii.customer_id = v_order.customer_id
            and pii.execution_mode = passenger.execution_mode
            and pii.execution_scope_sha256 = passenger.execution_scope_sha256
            and pii.traveler_type = passenger.traveler_type
            and pii.pii_record_sha256 = passenger.pii_record_sha256
            and pii.deleted_at is null
            and pii.retention_expires_at > clock_timestamp()
       )
    ) then
    raise exception 'Captured payment or encrypted order evidence changed';
  end if;
  v_now := clock_timestamp();
  if v_attempt.dispatch_not_after <= v_now then
    raise exception 'Flight consumer Duffel order authority expired';
  end if;
  update public.flight_provider_request_attempts
     set state = 'dispatching', revision = revision + 1,
         dispatch_started_at = v_now
   where id = v_attempt.id and state = 'prepared'
     and revision = p_expected_revision
  returning * into v_attempt;
  if not found then raise exception 'Flight consumer Duffel order dispatch CAS failed'; end if;
  update public.flight_orders
     set updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
   where id = v_order.id;
  return query select v_attempt.id, v_attempt.revision, v_attempt.state;
end;
$claim_flight_consumer_order_075$;

create function public.record_flight_consumer_duffel_order_terminal_v1(
  p_attempt_id uuid,
  p_expected_revision integer,
  p_terminal_state text,
  p_terminal_http_status smallint,
  p_terminal_response_sha256 text,
  p_terminal_response_bytes bigint,
  p_terminal_receipt_sha256 text,
  p_key_version text,
  p_iv_base64url text,
  p_auth_tag_base64url text,
  p_ciphertext_base64url text,
  p_aad_sha256 text,
  p_ciphertext_sha256 text,
  p_evidence_receipt_sha256 text,
  p_retention_expires_at timestamptz
)
returns table (attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $record_flight_consumer_duffel_order_terminal$
declare
  v_order_id uuid;
  v_order public.flight_orders;
  v_attempt public.flight_provider_request_attempts;
  v_evidence public.flight_order_response_evidence_vault;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Duffel order terminal recording is service-role only';
  end if;
  select attempt.order_id into v_order_id from public.flight_provider_request_attempts attempt
   where attempt.id = p_attempt_id;
  select * into v_order from public.flight_orders where id = v_order_id for update;
  select * into v_attempt from public.flight_provider_request_attempts
   where id = p_attempt_id for update;
  if v_order.id is null or v_attempt.id is null
    or v_attempt.consumer_flow_version <> 1
    or v_attempt.operation <> 'create_order'
    or v_attempt.order_id is distinct from v_order.id then
    raise exception 'Flight Duffel order attempt is unavailable';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'order'
  );
  if v_attempt.revision = 2
    and v_attempt.state in ('succeeded', 'failed', 'ambiguous') then
    if p_expected_revision <> 2
      or v_attempt.state is distinct from p_terminal_state
      or v_attempt.terminal_http_status is distinct from p_terminal_http_status
      or v_attempt.terminal_response_sha256 is distinct from p_terminal_response_sha256
      or v_attempt.terminal_response_bytes is distinct from p_terminal_response_bytes
      or v_attempt.terminal_receipt_sha256 is distinct from p_terminal_receipt_sha256 then
      raise exception 'Flight Duffel terminal replay does not match the journal';
    end if;
  elsif v_attempt.state = 'dispatching' and v_attempt.revision = 1
    and p_expected_revision = 1 then
    if p_terminal_state not in ('succeeded', 'failed', 'ambiguous')
      or p_terminal_receipt_sha256 is null
      or p_terminal_receipt_sha256 !~ '^[0-9a-f]{64}$' then
      raise exception 'Flight Duffel terminal outcome is invalid';
    end if;
    if p_terminal_state = 'succeeded' and (
      p_terminal_http_status not between 200 and 299
      or p_terminal_response_sha256 is null or p_terminal_response_bytes is null
    ) then raise exception 'Successful Duffel order response evidence is incomplete'; end if;
    if p_terminal_state = 'failed' and (
      p_terminal_http_status not between 300 and 599
      or p_terminal_response_sha256 is null or p_terminal_response_bytes is null
    ) then raise exception 'Known Duffel order failure evidence is incomplete'; end if;
    if p_terminal_state = 'ambiguous' and (
      p_terminal_http_status is not null or p_terminal_response_sha256 is not null
      or p_terminal_response_bytes is not null
    ) then raise exception 'Ambiguous Duffel order dispatch cannot claim a response'; end if;
    v_now := clock_timestamp();
    update public.flight_provider_request_attempts
       set state = p_terminal_state, revision = revision + 1,
           completed_at = v_now, terminal_http_status = p_terminal_http_status,
           terminal_response_sha256 = p_terminal_response_sha256,
           terminal_response_bytes = p_terminal_response_bytes,
           terminal_receipt_sha256 = p_terminal_receipt_sha256
     where id = v_attempt.id and state = 'dispatching' and revision = 1
    returning * into v_attempt;
  else
    raise exception 'Flight Duffel order terminal CAS failed';
  end if;
  if p_terminal_state = 'succeeded' then
    if p_key_version is null or p_iv_base64url is null or p_auth_tag_base64url is null
      or p_ciphertext_base64url is null or p_aad_sha256 is null
      or p_ciphertext_sha256 is null or p_evidence_receipt_sha256 is null
      or p_terminal_response_sha256 is distinct from v_attempt.terminal_response_sha256 then
      raise exception 'Successful Duffel order requires encrypted response evidence';
    end if;
    select * into v_evidence from public.flight_order_response_evidence_vault
     where attempt_id = v_attempt.id;
    if found then
      if v_evidence.order_id is distinct from v_order.id
        or v_evidence.customer_id is distinct from v_order.customer_id
        or v_evidence.provider_response_sha256
          is distinct from p_terminal_response_sha256
        or v_evidence.evidence_receipt_sha256
          is distinct from p_evidence_receipt_sha256
        or v_evidence.key_version is distinct from p_key_version
        or v_evidence.iv_base64url is distinct from p_iv_base64url
        or v_evidence.auth_tag_base64url is distinct from p_auth_tag_base64url
        or v_evidence.ciphertext_base64url is distinct from p_ciphertext_base64url
        or v_evidence.aad_sha256 is distinct from p_aad_sha256
        or v_evidence.ciphertext_sha256 is distinct from p_ciphertext_sha256
        or v_evidence.retention_expires_at is distinct from p_retention_expires_at then
        raise exception 'Flight Duffel response evidence replay collides';
      end if;
    else
      insert into public.flight_order_response_evidence_vault (
        attempt_id, order_id, customer_id, execution_mode,
        execution_scope_sha256, provider_response_sha256,
        evidence_receipt_sha256, key_version, iv_base64url,
        auth_tag_base64url, ciphertext_base64url, aad_sha256,
        ciphertext_sha256, retention_expires_at
      ) values (
        v_attempt.id, v_order.id, v_order.customer_id, 'test',
        v_order.execution_scope_sha256, p_terminal_response_sha256,
        p_evidence_receipt_sha256, p_key_version, p_iv_base64url,
        p_auth_tag_base64url, p_ciphertext_base64url, p_aad_sha256,
        p_ciphertext_sha256, p_retention_expires_at
      );
    end if;
  elsif p_key_version is not null or p_iv_base64url is not null
    or p_auth_tag_base64url is not null or p_ciphertext_base64url is not null
    or p_aad_sha256 is not null or p_ciphertext_sha256 is not null
    or p_evidence_receipt_sha256 is not null or p_retention_expires_at is not null then
    raise exception 'Failed or ambiguous Duffel attempt cannot claim response ciphertext';
  end if;
  update public.flight_orders
     set updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
   where id = v_order.id;
  return query select v_attempt.id, v_attempt.revision, v_attempt.state;
end;
$record_flight_consumer_duffel_order_terminal$;

-- Owner/order-scoped metadata discovery after a process crash. This exposes
-- only immutable journal/evidence digests needed to choose load/finalize or
-- review; it cannot disclose the encrypted response or authorize redispatch.
create function public.get_flight_consumer_duffel_order_recovery_v1(
  p_customer_id uuid,
  p_order_id uuid
)
returns table (
  attempt_id uuid,
  customer_id uuid,
  order_id uuid,
  attempt_revision integer,
  attempt_state text,
  request_sha256 text,
  operation_authority_receipt_sha256 text,
  terminal_http_status smallint,
  terminal_response_sha256 text,
  terminal_response_bytes bigint,
  terminal_receipt_sha256 text,
  response_evidence_receipt_sha256 text,
  response_evidence_retention_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $get_flight_consumer_duffel_order_recovery$
declare
  v_order public.flight_orders;
  v_attempt public.flight_provider_request_attempts;
  v_control public.flight_runtime_controls;
  v_evidence public.flight_order_response_evidence_vault;
  v_point_of_sale_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Duffel order recovery is service-role only';
  end if;
  select * into v_order from public.flight_orders as flight_order
   where flight_order.id = p_order_id
     and flight_order.customer_id = p_customer_id
   for share;
  if v_order.id is null or v_order.consumer_flow_version <> 1
    or v_order.execution_mode <> 'test' or v_order.provider_code <> 'duffel' then
    raise exception 'Flight Duffel recovery order is unavailable';
  end if;
  select * into v_control from public.flight_runtime_controls
   where control_key = 'global';
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'order'
  );
  select * into v_attempt from public.flight_provider_request_attempts as attempt
   where attempt.order_id = v_order.id
     and attempt.customer_id = v_order.customer_id
     and attempt.operation = 'create_order'
     and attempt.consumer_flow_version = 1;
  if not found then
    return;
  end if;
  v_point_of_sale_sha256 := encode(
    extensions.digest(convert_to(v_control.bound_point_of_sale, 'UTF8'), 'sha256'),
    'hex'
  );
  if v_attempt.execution_mode <> 'test'
    or v_attempt.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_attempt.provider_code <> 'duffel'
    or v_attempt.provider_account_sha256
      is distinct from v_control.bound_provider_account_sha256
    or v_attempt.point_of_sale_sha256 is distinct from v_point_of_sale_sha256
    or v_attempt.content_scope_sha256
      is distinct from v_control.bound_content_scope_sha256
    or v_attempt.adapter_version_sha256
      is distinct from v_control.bound_adapter_version_sha256
    or v_attempt.retry_authorized then
    raise exception 'Flight Duffel recovery binding is stale';
  end if;
  select * into v_evidence from public.flight_order_response_evidence_vault as evidence
   where evidence.attempt_id = v_attempt.id
     and evidence.order_id = v_order.id
     and evidence.customer_id = v_order.customer_id
     and evidence.execution_mode = 'test'
     and evidence.execution_scope_sha256 = v_order.execution_scope_sha256
     and evidence.deleted_at is null;
  if v_attempt.state = 'succeeded' and (
    v_attempt.revision <> 2
    or v_evidence.id is null
    or v_evidence.provider_response_sha256
      is distinct from v_attempt.terminal_response_sha256
    or v_evidence.retention_expires_at <= clock_timestamp()
  ) then
    raise exception 'Flight Duffel recovery response evidence is unavailable';
  end if;
  if v_attempt.state <> 'succeeded' and v_evidence.id is not null then
    raise exception 'Non-successful Flight Duffel attempt cannot own response evidence';
  end if;
  return query select
    v_attempt.id, v_attempt.customer_id, v_attempt.order_id,
    v_attempt.revision, v_attempt.state, v_attempt.request_sha256,
    v_attempt.operation_authority_receipt_sha256,
    v_attempt.terminal_http_status,
    v_attempt.terminal_response_sha256, v_attempt.terminal_response_bytes,
    v_attempt.terminal_receipt_sha256, v_evidence.evidence_receipt_sha256,
    v_evidence.retention_expires_at;
end;
$get_flight_consumer_duffel_order_recovery$;

-- Crash-safe rehydration for an already-terminal successful Duffel response.
-- The caller receives only the authenticated encrypted envelope; plaintext
-- provider JSON never crosses the database boundary.
create function public.load_flight_consumer_order_response_evidence_v1(
  p_customer_id uuid,
  p_order_id uuid,
  p_attempt_id uuid,
  p_evidence_receipt_sha256 text
)
returns table (
  evidence_id uuid,
  attempt_id uuid,
  order_id uuid,
  customer_id uuid,
  execution_scope_sha256 text,
  provider_response_sha256 text,
  evidence_receipt_sha256 text,
  key_version text,
  iv_base64url text,
  auth_tag_base64url text,
  ciphertext_base64url text,
  aad_sha256 text,
  ciphertext_sha256 text,
  retention_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $load_flight_consumer_order_response_evidence$
declare
  v_order public.flight_orders;
  v_attempt public.flight_provider_request_attempts;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight order response evidence is service-role only';
  end if;
  select * into v_order from public.flight_orders as flight_order
   where flight_order.id = p_order_id
     and flight_order.customer_id = p_customer_id
   for share;
  if v_order.id is null or v_order.consumer_flow_version <> 1
    or v_order.execution_mode <> 'test' or v_order.provider_code <> 'duffel' then
    raise exception 'Flight order response owner is unavailable';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'order'
  );
  select * into v_attempt from public.flight_provider_request_attempts as attempt
   where attempt.id = p_attempt_id
     and attempt.order_id = v_order.id
     and attempt.customer_id = v_order.customer_id
     and attempt.operation = 'create_order'
     and attempt.consumer_flow_version = 1
     and attempt.execution_mode = 'test'
     and attempt.execution_scope_sha256 = v_order.execution_scope_sha256
     and attempt.state = 'succeeded' and attempt.revision = 2;
  if v_attempt.id is null then
    raise exception 'Successful Flight Duffel response attempt is unavailable';
  end if;
  return query
  select evidence.id, evidence.attempt_id, evidence.order_id,
    evidence.customer_id, evidence.execution_scope_sha256,
    evidence.provider_response_sha256, evidence.evidence_receipt_sha256,
    evidence.key_version, evidence.iv_base64url, evidence.auth_tag_base64url,
    evidence.ciphertext_base64url, evidence.aad_sha256,
    evidence.ciphertext_sha256, evidence.retention_expires_at
    from public.flight_order_response_evidence_vault as evidence
   where evidence.attempt_id = v_attempt.id
     and evidence.order_id = v_order.id
     and evidence.customer_id = v_order.customer_id
     and evidence.execution_mode = 'test'
     and evidence.execution_scope_sha256 = v_order.execution_scope_sha256
     and evidence.provider_response_sha256 = v_attempt.terminal_response_sha256
     and evidence.evidence_receipt_sha256 = p_evidence_receipt_sha256
     and evidence.deleted_at is null
     and evidence.retention_expires_at > clock_timestamp();
end;
$load_flight_consumer_order_response_evidence$;

create function public.finalize_flight_consumer_duffel_order_v1(
  p_attempt_id uuid,
  p_expected_terminal_revision integer,
  p_response_evidence_receipt_sha256 text,
  p_provider_order_ref_ciphertext text,
  p_provider_order_ref_sha256 text,
  p_provider_created_at timestamptz,
  p_ticketing_deadline_at timestamptz,
  p_passenger_bindings jsonb,
  p_ticket_documents jsonb
)
returns table (
  order_id uuid,
  order_status text,
  issued_ticket_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $finalize_flight_consumer_duffel_order$
declare
  v_order_id uuid;
  v_order public.flight_orders;
  v_attempt public.flight_provider_request_attempts;
  v_control public.flight_runtime_controls;
  v_payment public.flight_payments;
  v_offer_evidence public.flight_offer_evidence_vault;
  v_response_evidence public.flight_order_response_evidence_vault;
  v_binding jsonb;
  v_document jsonb;
  v_passenger public.flight_passenger_refs;
  v_ticket public.flight_ticket_documents;
  v_expected integer;
  v_issued integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Duffel order finalization is service-role only';
  end if;
  select attempt.order_id into v_order_id from public.flight_provider_request_attempts attempt
   where attempt.id = p_attempt_id;
  select * into v_order from public.flight_orders where id = v_order_id for update;
  select * into v_attempt from public.flight_provider_request_attempts
   where id = p_attempt_id for update;
  if v_order.id is null or v_attempt.id is null
    or v_attempt.operation <> 'create_order'
    or v_attempt.consumer_flow_version <> 1
    or v_attempt.state <> 'succeeded'
    or v_attempt.revision <> p_expected_terminal_revision
    or v_attempt.order_id is distinct from v_order.id
    or v_attempt.customer_id is distinct from v_order.customer_id then
    raise exception 'Successful Duffel order attempt is not finalizable';
  end if;
  select * into v_control from public.flight_runtime_controls
   where control_key = 'global' for update;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'ticketing'
  );
  select * into v_payment from public.flight_payments
   where order_id = v_order.id and processor_code = 'stripe'
     and status = 'captured' and authorized_cents = v_order.total_cents
     and captured_cents = v_order.total_cents and refunded_cents = 0
   for share;
  select * into v_offer_evidence from public.flight_offer_evidence_vault
   where receipt_sha256 = v_attempt.offer_evidence_receipt_sha256
     and customer_id = v_order.customer_id and search_id = v_order.search_id
      and offer_id = v_order.offer_id
      and reprice_receipt_id = v_order.reprice_receipt_id
      and stage = 'refreshed'
   for share;
  select * into v_response_evidence from public.flight_order_response_evidence_vault
   where attempt_id = v_attempt.id and order_id = v_order.id
     and customer_id = v_order.customer_id
     and evidence_receipt_sha256 = p_response_evidence_receipt_sha256
     and provider_response_sha256 = v_attempt.terminal_response_sha256
     and deleted_at is null
   for share;
  select search.adult_count + search.child_count
      + search.infant_in_seat_count + search.infant_on_lap_count
    into v_expected from public.flight_searches as search
   where search.id = v_order.search_id and search.customer_id = v_order.customer_id
   for share;
  if jsonb_typeof(p_passenger_bindings) <> 'array'
    or jsonb_array_length(p_passenger_bindings) <> v_expected
    or jsonb_typeof(p_ticket_documents) <> 'array'
    or jsonb_array_length(p_ticket_documents) <> v_expected
    or (select count(distinct (binding.value ->> 'passenger_ref_id')::uuid)
          from jsonb_array_elements(p_passenger_bindings) as binding(value))
       <> v_expected
    or (select count(distinct (document.value ->> 'passenger_ref_id')::uuid)
          from jsonb_array_elements(p_ticket_documents) as document(value))
       <> v_expected then
    raise exception 'Flight Duffel finalization evidence is incomplete';
  end if;
  if v_order.status = 'ticketed' then
    if v_order.provider_order_ref_sha256
        is distinct from p_provider_order_ref_sha256
      or v_order.provider_created_at is distinct from p_provider_created_at
      or v_order.ticketing_deadline_at is distinct from p_ticketing_deadline_at
      or v_payment.id is null or v_offer_evidence.id is null
      or v_response_evidence.id is null then
      raise exception 'Flight Duffel finalization replay collides';
    end if;
    for v_binding in select value from jsonb_array_elements(p_passenger_bindings)
    loop
      if not public.flight_jsonb_has_exact_keys_v1(v_binding, array[
        'passenger_ref_id', 'provider_passenger_ref_ciphertext',
        'provider_passenger_ref_sha256'
      ]) then
        raise exception 'Flight finalization replay passenger keys collide';
      end if;
      select * into v_passenger from public.flight_passenger_refs as passenger
       where passenger.id = (v_binding ->> 'passenger_ref_id')::uuid
         and passenger.order_id = v_order.id;
      if v_passenger.id is null
        or v_passenger.provider_passenger_ref_sha256
          is distinct from (v_binding ->> 'provider_passenger_ref_sha256') then
        raise exception 'Flight finalization replay passenger binding collides';
      end if;
    end loop;
    for v_document in select value from jsonb_array_elements(p_ticket_documents)
    loop
      if not public.flight_jsonb_has_exact_keys_v1(v_document, array[
        'passenger_ref_id', 'document_ref_ciphertext',
        'document_ref_sha256', 'issuing_carrier'
      ]) then
        raise exception 'Flight finalization replay ticket keys collide';
      end if;
      select * into v_ticket from public.flight_ticket_documents as document
       where document.order_id = v_order.id
         and document.passenger_ref_id =
           (v_document ->> 'passenger_ref_id')::uuid
         and document.document_type = 'electronic_ticket'
         and document.status = 'issued';
      if v_ticket.id is null
        or v_ticket.document_ref_sha256
          is distinct from (v_document ->> 'document_ref_sha256')
        or v_ticket.issuing_carrier
          is distinct from upper(v_document ->> 'issuing_carrier') then
        raise exception 'Flight finalization replay ticket binding collides';
      end if;
    end loop;
    select count(*)::integer into v_issued
      from public.flight_ticket_documents as document
     where document.order_id = v_order.id
       and document.document_type = 'electronic_ticket'
       and document.status = 'issued';
    if v_issued <> v_expected then
      raise exception 'Flight finalization replay ticket count collides';
    end if;
    return query select v_order.id, v_order.status, v_issued;
    return;
  end if;
  if v_order.status <> 'order_creating'
    or v_order.provider_order_ref_ciphertext is not null
    or v_order.provider_order_ref_sha256 is not null
    or v_order.provider_created_at is not null
    or v_order.ticketing_deadline_at is not null
    or v_payment.id is null or v_offer_evidence.id is null
    or v_offer_evidence.retention_expires_at <= clock_timestamp()
    or v_response_evidence.id is null
    or v_response_evidence.retention_expires_at <= clock_timestamp()
    or p_provider_created_at > clock_timestamp() + interval '5 minutes'
    or p_ticketing_deadline_at <= clock_timestamp()
    or p_ticketing_deadline_at <= p_provider_created_at then
    raise exception 'Flight Duffel finalization evidence is incomplete';
  end if;
  update public.flight_orders
     set provider_order_ref_ciphertext = p_provider_order_ref_ciphertext,
         provider_order_ref_sha256 = p_provider_order_ref_sha256,
         provider_created_at = p_provider_created_at,
         ticketing_deadline_at = p_ticketing_deadline_at,
         status = 'booked'
   where id = v_order.id and status = 'order_creating'
  returning * into v_order;
  if not found then raise exception 'Flight Duffel booking finalization CAS failed'; end if;
  for v_binding in select value from jsonb_array_elements(p_passenger_bindings)
  loop
    if not public.flight_jsonb_has_exact_keys_v1(v_binding, array[
      'passenger_ref_id', 'provider_passenger_ref_ciphertext',
      'provider_passenger_ref_sha256'
    ]) then
      raise exception 'Flight passenger binding contains missing or unknown keys';
    end if;
    update public.flight_passenger_refs
       set provider_passenger_ref_ciphertext =
             v_binding ->> 'provider_passenger_ref_ciphertext',
           provider_passenger_ref_sha256 =
             v_binding ->> 'provider_passenger_ref_sha256'
     where id = (v_binding ->> 'passenger_ref_id')::uuid
       and order_id = v_order.id and provider_passenger_ref_sha256 is null
    returning * into v_passenger;
    if not found then raise exception 'Flight provider passenger binding CAS failed'; end if;
  end loop;
  if exists (
    select 1 from public.flight_passenger_refs
     where order_id = v_order.id and provider_passenger_ref_sha256 is null
  ) then raise exception 'Every flight passenger requires one provider binding'; end if;
  update public.flight_orders set status = 'ticketing_pending'
   where id = v_order.id and status = 'booked' returning * into v_order;
  if not found then raise exception 'Flight ticketing transition CAS failed'; end if;
  for v_document in select value from jsonb_array_elements(p_ticket_documents)
  loop
    if not public.flight_jsonb_has_exact_keys_v1(v_document, array[
      'passenger_ref_id', 'document_ref_ciphertext',
      'document_ref_sha256', 'issuing_carrier'
    ]) then
      raise exception 'Flight ticket document contains missing or unknown keys';
    end if;
    insert into public.flight_ticket_documents (
      order_id, passenger_ref_id, execution_mode, execution_scope_sha256,
      document_type, issuing_carrier, status
    ) values (
      v_order.id, (v_document ->> 'passenger_ref_id')::uuid, 'test',
      v_order.execution_scope_sha256, 'electronic_ticket',
      upper(v_document ->> 'issuing_carrier'), 'pending'
    ) returning * into v_ticket;
    update public.flight_ticket_documents
       set document_ref_ciphertext = v_document ->> 'document_ref_ciphertext',
           document_ref_sha256 = v_document ->> 'document_ref_sha256',
           status = 'issued'
     where id = v_ticket.id and status = 'pending'
    returning * into v_ticket;
    if not found then raise exception 'Flight ticket issuance CAS failed'; end if;
  end loop;
  select count(*)::integer into v_issued
    from public.flight_ticket_documents as document
   where document.order_id = v_order.id
     and document.document_type = 'electronic_ticket'
     and document.status = 'issued';
  if v_issued <> v_expected or exists (
    select 1 from public.flight_passenger_refs as passenger
     where passenger.order_id = v_order.id
       and (select count(*) from public.flight_ticket_documents as document
             where document.order_id = v_order.id
               and document.passenger_ref_id = passenger.id
               and document.document_type = 'electronic_ticket'
               and document.status = 'issued') <> 1
  ) then
    raise exception 'Exactly one distinct Duffel e-ticket is required per passenger';
  end if;
  update public.flight_orders set status = 'ticketed'
   where id = v_order.id and status = 'ticketing_pending'
  returning * into v_order;
  if not found then raise exception 'Flight ticketed transition CAS failed'; end if;
  update public.flight_orders
     set updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
   where id = v_order.id returning * into v_order;
  return query select v_order.id, v_order.status, v_issued;
end;
$finalize_flight_consumer_duffel_order$;

create table public.flight_payment_refund_evidence (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique
    references public.flight_payment_operation_attempts(id) on delete restrict,
  order_id uuid not null references public.flight_orders(id) on delete restrict,
  payment_id uuid not null references public.flight_payments(id) on delete restrict,
  execution_mode text not null default 'test' check (execution_mode = 'test'),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  refund_reference_ciphertext text not null check (
    refund_reference_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$'
  ),
  refund_reference_sha256 text not null unique
    check (refund_reference_sha256 ~ '^[0-9a-f]{64}$'),
  refunded_cents bigint not null check (refunded_cents > 0),
  terminal_receipt_sha256 text not null unique
    check (terminal_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp()
);

create trigger flight_payment_refund_evidence_append_only_guard
before update or delete on public.flight_payment_refund_evidence
for each row execute function public.reject_flight_evidence_mutation();

create function public.mark_flight_consumer_order_ambiguous_v1(
  p_attempt_id uuid,
  p_expected_terminal_revision integer,
  p_expected_state_sha256 text,
  p_observed_state_sha256 text
)
returns table (order_id uuid, order_status text, reconciliation_case_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $mark_flight_consumer_order_ambiguous$
declare
  v_order_id uuid;
  v_order public.flight_orders;
  v_attempt public.flight_provider_request_attempts;
  v_control public.flight_runtime_controls;
  v_payment public.flight_payments;
  v_case public.flight_reconciliation_cases;
  v_target_status text;
  v_target_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight order ambiguity recording is service-role only';
  end if;
  select attempt.order_id into v_order_id from public.flight_provider_request_attempts attempt
   where attempt.id = p_attempt_id;
  select * into v_order from public.flight_orders where id = v_order_id for update;
  select * into v_attempt from public.flight_provider_request_attempts
   where id = p_attempt_id for update;
  if v_order.id is null or v_attempt.id is null
    or v_attempt.consumer_flow_version <> 1
    or v_attempt.operation <> 'create_order'
    or v_attempt.order_id is distinct from v_order.id
    or v_attempt.customer_id is distinct from v_order.customer_id
    or v_attempt.execution_mode <> 'test'
    or v_attempt.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_attempt.provider_code <> 'duffel'
    or v_attempt.retry_authorized
    or v_attempt.state not in (
      'prepared', 'dispatching', 'succeeded', 'failed', 'ambiguous', 'blocked'
    )
    or v_attempt.revision <> p_expected_terminal_revision
    or (v_attempt.state = 'prepared' and v_attempt.revision <> 0)
    or (v_attempt.state in ('dispatching', 'blocked') and v_attempt.revision <> 1)
    or (v_attempt.state in ('succeeded', 'failed', 'ambiguous')
      and v_attempt.revision <> 2)
    or v_order.status <> 'order_creating'
    or v_order.provider_order_ref_sha256 is not null
    or p_expected_state_sha256 is null
    or p_expected_state_sha256 !~ '^[0-9a-f]{64}$'
    or p_observed_state_sha256 is null
    or p_observed_state_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight order ambiguity evidence does not match';
  end if;
  select * into v_control from public.flight_runtime_controls
   where control_key = 'global' for update;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'order'
  );
  select * into v_payment from public.flight_payments as payment
   where payment.order_id = v_order.id
     and payment.execution_mode = 'test'
     and payment.execution_scope_sha256 = v_order.execution_scope_sha256
     and payment.processor_code = 'stripe'
     and payment.currency = v_order.currency
     and payment.status = 'captured'
     and payment.authorized_cents = v_order.total_cents
     and payment.captured_cents = v_order.total_cents
     and payment.refunded_cents = 0
   for share;
  if v_payment.id is null then
    raise exception 'Flight order ambiguity requires exact captured Stripe liability';
  end if;
  v_target_status := case when v_attempt.state in ('prepared', 'blocked')
    then 'failed' else 'order_creating' end;
  if v_order.status = 'requires_review' then
    select * into v_case from public.flight_reconciliation_cases as reconciliation
     where reconciliation.order_id = v_order.id
       and reconciliation.execution_mode = v_order.execution_mode
       and reconciliation.execution_scope_sha256 = v_order.execution_scope_sha256
       and reconciliation.case_type = 'ambiguous_order'
       and reconciliation.subject_type = 'flight_order'
       and reconciliation.subject_id = v_order.id
       and reconciliation.source_status = 'requires_review'
       and reconciliation.expected_state_sha256 = p_expected_state_sha256
       and reconciliation.observed_state_sha256 = p_observed_state_sha256
       and reconciliation.target_status = v_target_status
     order by reconciliation.created_at asc, reconciliation.id asc
     limit 1;
    if v_case.id is null then
      raise exception 'Flight order ambiguity replay collides';
    end if;
    return query select v_order.id, v_order.status, v_case.id;
    return;
  end if;
  update public.flight_orders set status = 'requires_review'
   where id = v_order.id and status = 'order_creating'
  returning * into v_order;
  if not found then raise exception 'Flight order review transition CAS failed'; end if;
  v_target_sha256 := encode(extensions.digest(convert_to(jsonb_build_object(
    'domain', 'iratepilot.flight.reconciliation.target.v1',
    'subject_type', 'flight_order', 'subject_id', v_order.id::text,
    'target_status', v_target_status, 'execution_mode', v_order.execution_mode,
    'execution_scope_sha256', v_order.execution_scope_sha256
  )::text, 'UTF8'), 'sha256'), 'hex');
  insert into public.flight_reconciliation_cases (
    order_id, provider_code, execution_mode, execution_scope_sha256,
    case_type, subject_type, subject_id, source_status, source_revision_at,
    expected_state_sha256, observed_state_sha256, target_status,
    target_state_sha256, status
  ) values (
    v_order.id, 'duffel', 'test', v_order.execution_scope_sha256,
    'ambiguous_order', 'flight_order', v_order.id, 'requires_review',
    v_order.updated_at, p_expected_state_sha256, p_observed_state_sha256,
    v_target_status, v_target_sha256, 'open'
  ) returning * into v_case;
  return query select v_order.id, v_order.status, v_case.id;
end;
$mark_flight_consumer_order_ambiguous$;

-- Capture has already created customer liability, but the one allowed Duffel
-- create-order journal could not be prepared. Locking the order first
-- serializes this absence check against prepare_flight_consumer_duffel_order_attempt_v1,
-- which takes the same order lock before inserting its attempt.
create function public.mark_flight_consumer_captured_order_unstarted_v1(
  p_order_id uuid,
  p_expected_state_sha256 text,
  p_observed_state_sha256 text
)
returns table (order_id uuid, order_status text, reconciliation_case_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $mark_flight_consumer_captured_order_unstarted$
declare
  v_order public.flight_orders;
  v_control public.flight_runtime_controls;
  v_payment public.flight_payments;
  v_capture_attempt public.flight_payment_operation_attempts;
  v_case public.flight_reconciliation_cases;
  v_target_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight captured-order abandonment is service-role only';
  end if;
  if p_expected_state_sha256 is null
    or p_expected_state_sha256 !~ '^[0-9a-f]{64}$'
    or p_observed_state_sha256 is null
    or p_observed_state_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight captured-order abandonment evidence is invalid';
  end if;
  select * into v_order from public.flight_orders
   where id = p_order_id for update;
  if v_order.id is null
    or v_order.consumer_flow_version <> 1
    or v_order.execution_mode <> 'test'
    or v_order.provider_code <> 'duffel'
    or v_order.status not in ('payment_authorized', 'requires_review')
    or v_order.provider_order_ref_ciphertext is not null
    or v_order.provider_order_ref_sha256 is not null
    or v_order.provider_created_at is not null
    or v_order.ticketing_deadline_at is not null
    or not exists (
      select 1
        from public.flight_searches as search
        join public.flight_offers as offer
          on offer.search_id = search.id and offer.id = v_order.offer_id
        join public.flight_reprice_receipts as reprice
          on reprice.offer_id = offer.id and reprice.id = v_order.reprice_receipt_id
       where search.id = v_order.search_id
         and search.customer_id = v_order.customer_id
         and search.execution_mode = v_order.execution_mode
         and search.execution_scope_sha256 = v_order.execution_scope_sha256
         and offer.execution_mode = v_order.execution_mode
         and offer.execution_scope_sha256 = v_order.execution_scope_sha256
         and reprice.execution_mode = v_order.execution_mode
         and reprice.execution_scope_sha256 = v_order.execution_scope_sha256
    ) then
    raise exception 'Flight captured consumer order is unavailable';
  end if;
  if exists (
    select 1 from public.flight_provider_request_attempts as attempt
     where attempt.order_id = v_order.id
       and attempt.consumer_flow_version = 1
       and attempt.operation = 'create_order'
  ) then
    raise exception 'Flight captured order already has its provider attempt';
  end if;
  select * into v_control from public.flight_runtime_controls
   where control_key = 'global' for update;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'payment'
  );
  select * into v_payment from public.flight_payments as payment
   where payment.order_id = v_order.id
     and payment.execution_mode = 'test'
     and payment.execution_scope_sha256 = v_order.execution_scope_sha256
     and payment.processor_code = 'stripe'
     and payment.currency = v_order.currency
     and payment.status = 'captured'
     and payment.authorized_cents = v_order.total_cents
     and payment.captured_cents = v_order.total_cents
     and payment.refunded_cents = 0
   for update;
  select * into v_capture_attempt
    from public.flight_payment_operation_attempts as attempt
   where attempt.order_id = v_order.id and attempt.operation = 'capture'
   for share;
  if v_payment.id is null or v_capture_attempt.id is null
    or v_capture_attempt.customer_id is distinct from v_order.customer_id
    or v_capture_attempt.payment_id is distinct from v_payment.id
    or v_capture_attempt.execution_mode <> 'test'
    or v_capture_attempt.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_capture_attempt.processor_code <> 'stripe'
    or v_capture_attempt.processor_environment <> 'test'
    or v_capture_attempt.processor_account_sha256
      is distinct from v_control.bound_payment_account_sha256
    or v_capture_attempt.processor_source_sha256
      is distinct from v_control.bound_payment_source_sha256
    or v_capture_attempt.processor_adapter_version_sha256
      is distinct from v_control.bound_payment_adapter_version_sha256
    or v_capture_attempt.state <> 'succeeded'
    or v_capture_attempt.revision <> 2
    or v_capture_attempt.amount_cents <> v_order.total_cents
    or v_capture_attempt.currency <> v_order.currency
    or exists (
      select 1 from public.flight_ticket_documents as document
       where document.order_id = v_order.id
    )
    or exists (
      select 1 from public.flight_passenger_refs as passenger
       where passenger.order_id = v_order.id
         and passenger.provider_passenger_ref_sha256 is not null
    ) then
    raise exception 'Exact successful Stripe capture without provider liability is required';
  end if;
  if v_order.status = 'requires_review' then
    select * into v_case from public.flight_reconciliation_cases as reconciliation
     where reconciliation.order_id = v_order.id
       and reconciliation.execution_mode = v_order.execution_mode
       and reconciliation.execution_scope_sha256 = v_order.execution_scope_sha256
       and reconciliation.case_type = 'ambiguous_order'
       and reconciliation.subject_type = 'flight_order'
       and reconciliation.subject_id = v_order.id
       and reconciliation.source_status = 'requires_review'
       and reconciliation.expected_state_sha256 = p_expected_state_sha256
       and reconciliation.observed_state_sha256 = p_observed_state_sha256
       and reconciliation.target_status = 'failed'
     order by reconciliation.created_at asc, reconciliation.id asc
     limit 1;
    if v_case.id is null then
      raise exception 'Flight captured-order abandonment replay collides';
    end if;
    return query select v_order.id, v_order.status, v_case.id;
    return;
  end if;
  update public.flight_orders set status = 'requires_review'
   where id = v_order.id and status = 'payment_authorized'
  returning * into v_order;
  if not found then
    raise exception 'Flight captured-order review transition CAS failed';
  end if;
  v_target_sha256 := encode(extensions.digest(convert_to(jsonb_build_object(
    'domain', 'iratepilot.flight.reconciliation.target.v1',
    'subject_type', 'flight_order', 'subject_id', v_order.id::text,
    'target_status', 'failed', 'execution_mode', v_order.execution_mode,
    'execution_scope_sha256', v_order.execution_scope_sha256
  )::text, 'UTF8'), 'sha256'), 'hex');
  insert into public.flight_reconciliation_cases (
    order_id, provider_code, execution_mode, execution_scope_sha256,
    case_type, subject_type, subject_id, source_status, source_revision_at,
    expected_state_sha256, observed_state_sha256, target_status,
    target_state_sha256, status
  ) values (
    v_order.id, 'duffel', 'test', v_order.execution_scope_sha256,
    'ambiguous_order', 'flight_order', v_order.id, 'requires_review',
    v_order.updated_at, p_expected_state_sha256, p_observed_state_sha256,
    'failed', v_target_sha256, 'open'
  ) returning * into v_case;
  return query select v_order.id, v_order.status, v_case.id;
end;
$mark_flight_consumer_captured_order_unstarted$;

create function public.resolve_flight_consumer_review_v1(
  p_case_id uuid,
  p_resolution_code text,
  p_resolution_evidence_sha256 text
)
returns table (
  reconciliation_case_id uuid,
  reconciliation_status text,
  order_id uuid,
  order_status text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $resolve_flight_consumer_review$
declare
  v_actor uuid := auth.uid();
  v_order_id uuid;
  v_order public.flight_orders;
  v_case public.flight_reconciliation_cases;
  v_failure_case public.flight_reconciliation_cases;
  v_failure_target_sha256 text;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or v_actor is null
    or not exists (
      select 1 from public.profiles where id = v_actor and role = 'admin'
    ) then
    raise exception 'Flight review resolution requires an authenticated administrator';
  end if;
  select reconciliation.order_id into v_order_id
    from public.flight_reconciliation_cases as reconciliation
   where reconciliation.id = p_case_id;
  select * into v_order from public.flight_orders where id = v_order_id for update;
  select * into v_case from public.flight_reconciliation_cases
   where id = p_case_id for update;
  if v_order.id is null or v_case.id is null
    or v_order.consumer_flow_version <> 1
    or v_order.status <> 'requires_review'
    or v_case.case_type <> 'ambiguous_order'
    or v_case.subject_type <> 'flight_order'
    or v_case.subject_id is distinct from v_order.id
    or v_case.status = 'resolved'
    or v_case.source_status <> 'requires_review'
    or p_resolution_evidence_sha256 is null
    or p_resolution_evidence_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight ambiguous-order review case is unavailable';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'order'
  );
  update public.flight_reconciliation_cases
     set status = 'resolved', resolution_code = p_resolution_code,
         resolution_evidence_sha256 = p_resolution_evidence_sha256,
         resolved_by = v_actor
   where id = v_case.id and status <> 'resolved'
  returning * into v_case;
  if not found then raise exception 'Flight review resolution CAS failed'; end if;
  if p_resolution_code = 'provider_state_confirmed' then
    if v_case.target_status <> 'order_creating'
      or v_order.provider_order_ref_sha256 is not null then
      raise exception 'Provider-confirmed ambiguity cannot rewind a bound order';
    end if;
    update public.flight_orders set status = 'order_creating'
     where id = v_order.id and status = 'requires_review'
    returning * into v_order;
    if not found then raise exception 'Flight ambiguity recovery transition failed'; end if;
  elsif p_resolution_code in ('payment_reversed', 'duplicate_suppressed') then
    if v_case.target_status = 'order_creating' then
      v_failure_target_sha256 := encode(extensions.digest(convert_to(jsonb_build_object(
        'domain', 'iratepilot.flight.reconciliation.target.v1',
        'subject_type', 'flight_order', 'subject_id', v_order.id::text,
        'target_status', 'failed', 'execution_mode', v_order.execution_mode,
        'execution_scope_sha256', v_order.execution_scope_sha256
      )::text, 'UTF8'), 'sha256'), 'hex');
      insert into public.flight_reconciliation_cases (
        order_id, provider_code, execution_mode, execution_scope_sha256,
        case_type, subject_type, subject_id, source_status, source_revision_at,
        expected_state_sha256, observed_state_sha256, target_status,
        target_state_sha256, status
      ) values (
        v_order.id, 'duffel', 'test', v_order.execution_scope_sha256,
        'ambiguous_order', 'flight_order', v_order.id, 'requires_review',
        v_order.updated_at, v_case.expected_state_sha256, v_case.observed_state_sha256,
        'failed', v_failure_target_sha256, 'open'
      ) returning * into v_failure_case;
      update public.flight_reconciliation_cases
         set status = 'resolved', resolution_code = p_resolution_code,
             resolution_evidence_sha256 = p_resolution_evidence_sha256,
             resolved_by = v_actor
       where id = v_failure_case.id and status = 'open';
    elsif v_case.target_status <> 'failed' then
      raise exception 'Flight ambiguity compensation target is not allowlisted';
    end if;
  elsif p_resolution_code <> 'manual_followup_required' then
    raise exception 'Flight ambiguous-order resolution code is not allowlisted';
  end if;
  select * into v_order from public.flight_orders where id = v_order.id;
  return query select v_case.id, v_case.status, v_order.id, v_order.status;
end;
$resolve_flight_consumer_review$;

create function public.prepare_flight_consumer_refund_compensation_v1(
  p_order_id uuid,
  p_payment_id uuid,
  p_key_sha256 text,
  p_request_sha256 text,
  p_adapter_source_sha256 text,
  p_payment_binding_receipt_sha256 text,
  p_operation_authority_receipt_sha256 text,
  p_dispatch_not_after timestamptz
)
returns table (decision text, attempt_id uuid, attempt_revision integer, attempt_state text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $prepare_flight_consumer_refund_compensation$
declare
  v_order public.flight_orders;
  v_attempt public.flight_payment_operation_attempts;
  v_control public.flight_runtime_controls;
  v_payment public.flight_payments;
  v_provider_attempt public.flight_provider_request_attempts;
  v_now timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight refund compensation preparation is service-role only';
  end if;
  select * into v_order from public.flight_orders where id = p_order_id for update;
  select * into v_attempt from public.flight_payment_operation_attempts
   where order_id = p_order_id and operation = 'refund' for update;
  select * into v_control from public.flight_runtime_controls
   where control_key = 'global' for update;
  select * into v_payment from public.flight_payments
   where id = p_payment_id and order_id = p_order_id for update;
  select * into v_provider_attempt from public.flight_provider_request_attempts
   where order_id = p_order_id and consumer_flow_version = 1
     and operation = 'create_order' for share;
  if v_order.id is null or v_payment.id is null then
    raise exception 'Flight refund order or payment is unavailable';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'payment'
  );
  if v_attempt.id is not null then
    if v_attempt.payment_id is distinct from v_payment.id
      or v_attempt.idempotency_key_sha256 is distinct from p_key_sha256
      or v_attempt.idempotency_request_sha256 is distinct from p_request_sha256
      or v_attempt.adapter_source_sha256 is distinct from p_adapter_source_sha256
      or v_attempt.payment_binding_receipt_sha256
        is distinct from p_payment_binding_receipt_sha256
      or v_attempt.operation_authority_receipt_sha256
        is distinct from p_operation_authority_receipt_sha256 then
      raise exception 'Flight order already has a different refund attempt';
    end if;
    return query select 'replay'::text, v_attempt.id, v_attempt.revision, v_attempt.state;
    return;
  end if;
  if v_order.status <> 'requires_review'
    or v_order.provider_order_ref_sha256 is not null
    or v_order.provider_order_ref_ciphertext is not null
    or v_order.provider_created_at is not null
    or v_order.ticketing_deadline_at is not null
    or v_payment.execution_mode <> 'test'
    or v_payment.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_payment.processor_code <> 'stripe'
    or v_payment.currency <> v_order.currency
    or v_payment.status <> 'captured'
    or v_payment.authorized_cents <> v_order.total_cents
    or v_payment.captured_cents <> v_order.total_cents
    or v_payment.refunded_cents <> 0
    or exists (select 1 from public.flight_ticket_documents where order_id = v_order.id)
    or (v_provider_attempt.id is not null and (
      v_provider_attempt.retry_authorized
      or v_provider_attempt.state not in (
        'prepared', 'dispatching', 'succeeded', 'failed', 'ambiguous', 'blocked'
      )
    ))
    or not exists (
      select 1 from public.flight_reconciliation_cases as reconciliation
       where reconciliation.order_id = v_order.id
         and reconciliation.execution_mode = v_order.execution_mode
         and reconciliation.execution_scope_sha256 = v_order.execution_scope_sha256
         and reconciliation.case_type = 'ambiguous_order'
         and reconciliation.subject_type = 'flight_order'
         and reconciliation.subject_id = v_order.id
         and reconciliation.source_status = 'requires_review'
         and reconciliation.target_status = 'failed'
         and reconciliation.status = 'resolved'
         and reconciliation.resolution_code in ('payment_reversed', 'duplicate_suppressed')
    ) then
    raise exception 'Flight order is not eligible for zero-provider-liability compensation';
  end if;
  if p_adapter_source_sha256 is distinct from v_control.bound_payment_source_sha256 then
    raise exception 'Flight refund Stripe adapter binding changed';
  end if;
  v_now := clock_timestamp();
  if p_dispatch_not_after <= v_now
    or p_dispatch_not_after > v_now + interval '5 minutes' then
    raise exception 'Flight refund dispatch deadline is invalid';
  end if;
  insert into public.flight_payment_operation_attempts (
    customer_id, order_id, payment_id, operation, execution_scope_sha256,
    processor_account_sha256, processor_source_sha256,
    processor_adapter_version_sha256, payment_binding_receipt_sha256,
    adapter_source_sha256, operation_authority_receipt_sha256,
    idempotency_key_sha256, idempotency_request_sha256,
    request_plan_sha256, request_sha256, request_body_sha256,
    amount_cents, currency, dispatch_not_after, prepared_at
  ) values (
    v_order.customer_id, v_order.id, v_payment.id, 'refund',
    v_order.execution_scope_sha256, v_control.bound_payment_account_sha256,
    v_control.bound_payment_source_sha256,
    v_control.bound_payment_adapter_version_sha256,
    p_payment_binding_receipt_sha256, p_adapter_source_sha256,
    p_operation_authority_receipt_sha256, p_key_sha256, p_request_sha256,
    p_request_sha256, p_request_sha256, p_request_sha256,
    v_order.total_cents, v_order.currency, p_dispatch_not_after, v_now
  ) returning * into v_attempt;
  update public.flight_payments set status = 'refund_pending'
   where id = v_payment.id and status = 'captured' and refunded_cents = 0
  returning * into v_payment;
  if not found then raise exception 'Flight refund-pending CAS failed'; end if;
  update public.flight_orders
     set updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
   where id = v_order.id;
  return query select 'prepared'::text, v_attempt.id, v_attempt.revision, v_attempt.state;
end;
$prepare_flight_consumer_refund_compensation$;

create function public.apply_flight_consumer_refund_compensation_v1(
  p_attempt_id uuid,
  p_expected_terminal_revision integer,
  p_payment_id uuid,
  p_refund_reference_ciphertext text,
  p_refund_reference_sha256 text,
  p_refunded_cents bigint
)
returns table (order_id uuid, order_status text, payment_id uuid, payment_status text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $apply_flight_consumer_refund_compensation$
declare
  v_order_id uuid;
  v_order public.flight_orders;
  v_attempt public.flight_payment_operation_attempts;
  v_control public.flight_runtime_controls;
  v_payment public.flight_payments;
  v_refund_evidence public.flight_payment_refund_evidence;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight refund compensation application is service-role only';
  end if;
  select attempt.order_id into v_order_id from public.flight_payment_operation_attempts attempt
   where attempt.id = p_attempt_id;
  select * into v_order from public.flight_orders where id = v_order_id for update;
  select * into v_attempt from public.flight_payment_operation_attempts
   where id = p_attempt_id for update;
  select * into v_control from public.flight_runtime_controls
   where control_key = 'global' for update;
  select * into v_payment from public.flight_payments
   where id = p_payment_id and order_id = v_order.id for update;
  if v_order.id is null or v_order.consumer_flow_version <> 1
    or v_order.provider_order_ref_sha256 is not null
    or v_attempt.id is null or v_attempt.operation <> 'refund'
    or v_attempt.state <> 'succeeded'
    or v_attempt.revision <> p_expected_terminal_revision
    or v_attempt.payment_id is distinct from v_payment.id
    or v_payment.id is null
    or v_payment.execution_mode <> 'test'
    or v_payment.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_payment.processor_code <> 'stripe'
    or v_payment.currency <> v_order.currency
    or v_payment.authorized_cents <> v_order.total_cents
    or v_payment.captured_cents <> v_order.total_cents
    or p_refunded_cents is distinct from v_order.total_cents
    or exists (select 1 from public.flight_ticket_documents where order_id = v_order.id) then
    raise exception 'Successful full-refund compensation evidence does not match';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'payment'
  );
  if v_order.status = 'failed' and v_payment.status = 'refunded'
    and v_payment.refunded_cents = v_order.total_cents then
    select * into v_refund_evidence
      from public.flight_payment_refund_evidence as evidence
     where evidence.attempt_id = v_attempt.id
       and evidence.order_id = v_order.id
       and evidence.payment_id = v_payment.id;
    if v_refund_evidence.id is null
      or v_refund_evidence.execution_mode <> 'test'
      or v_refund_evidence.execution_scope_sha256
        is distinct from v_order.execution_scope_sha256
      or v_refund_evidence.refund_reference_ciphertext
        is distinct from p_refund_reference_ciphertext
      or v_refund_evidence.refund_reference_sha256
        is distinct from p_refund_reference_sha256
      or v_refund_evidence.refunded_cents is distinct from p_refunded_cents
      or v_refund_evidence.terminal_receipt_sha256
        is distinct from v_attempt.terminal_receipt_sha256 then
      raise exception 'Flight refund application replay collides';
    end if;
    return query select v_order.id, v_order.status, v_payment.id, v_payment.status;
    return;
  end if;
  if v_order.status <> 'requires_review'
    or v_payment.status <> 'refund_pending'
    or v_payment.refunded_cents <> 0
    or not exists (
      select 1 from public.flight_reconciliation_cases as reconciliation
       where reconciliation.order_id = v_order.id
         and reconciliation.case_type = 'ambiguous_order'
         and reconciliation.status = 'resolved'
         and reconciliation.target_status = 'failed'
         and reconciliation.resolution_code in ('payment_reversed', 'duplicate_suppressed')
    ) then
    raise exception 'Successful full-refund compensation evidence does not match';
  end if;
  insert into public.flight_payment_refund_evidence (
    attempt_id, order_id, payment_id, execution_mode, execution_scope_sha256,
    refund_reference_ciphertext, refund_reference_sha256, refunded_cents,
    terminal_receipt_sha256
  ) values (
    v_attempt.id, v_order.id, v_payment.id, 'test', v_order.execution_scope_sha256,
    p_refund_reference_ciphertext, p_refund_reference_sha256,
    p_refunded_cents, v_attempt.terminal_receipt_sha256
  );
  update public.flight_payments
     set status = 'refunded', refunded_cents = p_refunded_cents
   where id = v_payment.id and status = 'refund_pending'
     and captured_cents = p_refunded_cents and refunded_cents = 0
  returning * into v_payment;
  if not found then raise exception 'Flight refund application CAS failed'; end if;
  perform set_config('app.flight_consumer_compensated_failure_authorized', 'true', true);
  update public.flight_orders set status = 'failed'
   where id = v_order.id and status = 'requires_review'
  returning * into v_order;
  if not found then raise exception 'Flight compensated order failure transition failed'; end if;
  update public.flight_orders
     set updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
   where id = v_order.id returning * into v_order;
  return query select v_order.id, v_order.status, v_payment.id, v_payment.status;
end;
$apply_flight_consumer_refund_compensation$;

-- Preserve every 068 order invariant while admitting one narrowly evidenced
-- Consumer Preview exit from requires_review after an exact full Stripe
-- compensation. The transaction-local flag is set only by the apply RPC after
-- the succeeded refund journal and append-only refund receipt both exist.
create or replace function public.validate_flight_order_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_expected_adults bigint;
  v_expected_children bigint;
  v_expected_infants_in_seat bigint;
  v_expected_infants_on_lap bigint;
  v_actual_adults bigint;
  v_actual_children bigint;
  v_actual_infants_in_seat bigint;
  v_actual_infants_on_lap bigint;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending_payment' then
      raise exception 'New flight orders must start pending payment';
    end if;
    if new.provider_order_ref_ciphertext is not null
      or new.provider_order_ref_sha256 is not null
      or new.provider_created_at is not null
      or new.ticketing_deadline_at is not null then
      raise exception 'New flight orders cannot contain pre-bound provider evidence';
    end if;
    return new;
  end if;
  if new.status = old.status then
    return new;
  end if;
  if not (
    (old.status = 'pending_payment' and new.status in ('payment_authorized', 'cancelled', 'failed', 'requires_review'))
    or (old.status = 'payment_authorized'
      and new.status in ('order_creating', 'cancelled', 'requires_review'))
    or (old.status = 'order_creating' and new.status in ('booked', 'requires_review'))
    or (old.status = 'booked'
      and new.status in ('ticketing_pending', 'servicing', 'cancellation_pending', 'requires_review'))
    or (old.status = 'ticketing_pending' and new.status in ('ticketed', 'requires_review'))
    or (old.status = 'ticketed'
      and new.status in ('servicing', 'cancellation_pending', 'requires_review'))
    or (old.status = 'servicing'
      and new.status in ('ticketed', 'cancellation_pending', 'requires_review'))
    or (old.status = 'cancellation_pending' and new.status in ('cancelled', 'requires_review'))
    or (old.status = 'cancelled' and new.status = 'refund_pending')
    or (old.status = 'refund_pending' and new.status in ('refunded', 'requires_review'))
    or (old.status = 'requires_review' and new.status in (
      'pending_payment', 'payment_authorized', 'order_creating',
      'ticketing_pending', 'ticketed', 'servicing', 'cancellation_pending',
      'cancelled', 'refund_pending', 'refunded', 'failed'
    ))
  ) then
    raise exception 'Invalid flight order status transition from % to %', old.status, new.status;
  end if;

  -- A review exit may never rewind a provider-bound or serviced order into a
  -- state from which a second provider order could be created. These target
  -- invariants apply independently of the reconciliation case classification.
  if new.status in ('pending_payment', 'payment_authorized', 'order_creating')
    and (
      new.provider_order_ref_ciphertext is not null
      or new.provider_order_ref_sha256 is not null
      or new.provider_created_at is not null
      or new.ticketing_deadline_at is not null
      or exists (
        select 1 from public.flight_ticket_documents
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
      )
      or exists (
        select 1 from public.flight_service_requests
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
      )
    ) then
    raise exception 'Early flight order states require zero provider-order, ticket, and service liability';
  end if;

  if new.status = 'pending_payment'
    and exists (
      select 1 from public.flight_payments
       where order_id = new.id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
         and (
           authorized_cents <> 0
           or captured_cents <> 0
           or refunded_cents <> 0
           or status not in (
             'requires_payment_method', 'requires_action', 'cancelled', 'failed'
           )
         )
    ) then
    raise exception 'Pending flight orders require exact zero monetary liability';
  end if;

  if old.status = 'requires_review'
    and new.status <> old.status
    and not (
      (
        new.status = 'failed'
        and new.consumer_flow_version = 1
        and current_setting(
          'app.flight_consumer_compensated_failure_authorized', true
        ) = 'true'
        and new.provider_order_ref_sha256 is null
        and not exists (
          select 1 from public.flight_ticket_documents as active_document
           where active_document.order_id = new.id
             and active_document.status not in ('voided', 'refunded', 'failed')
        )
        and exists (
          select 1
            from public.flight_payments as compensated_payment
            join public.flight_payment_operation_attempts as refund_attempt
              on refund_attempt.payment_id = compensated_payment.id
             and refund_attempt.order_id = new.id
             and refund_attempt.operation = 'refund'
             and refund_attempt.state = 'succeeded'
             and refund_attempt.revision = 2
            join public.flight_payment_refund_evidence as refund_evidence
              on refund_evidence.attempt_id = refund_attempt.id
             and refund_evidence.payment_id = compensated_payment.id
             and refund_evidence.order_id = new.id
           where compensated_payment.order_id = new.id
             and compensated_payment.execution_mode = new.execution_mode
             and compensated_payment.execution_scope_sha256 =
               new.execution_scope_sha256
             and compensated_payment.currency = new.currency
             and compensated_payment.authorized_cents = new.total_cents
             and compensated_payment.captured_cents = new.total_cents
             and compensated_payment.refunded_cents = new.total_cents
             and compensated_payment.status = 'refunded'
             and refund_attempt.amount_cents = new.total_cents
             and refund_attempt.currency = new.currency
             and refund_evidence.refunded_cents = new.total_cents
        )
        and exists (
          select 1 from public.flight_reconciliation_cases as resolution
           where resolution.order_id = new.id
             and resolution.execution_mode = new.execution_mode
             and resolution.execution_scope_sha256 = new.execution_scope_sha256
             and resolution.case_type = 'ambiguous_order'
             and resolution.subject_type = 'flight_order'
             and resolution.subject_id = new.id
             and resolution.status = 'resolved'
             and resolution.resolution_code in (
               'payment_reversed', 'duplicate_suppressed'
             )
             and resolution.resolution_evidence_sha256 is not null
        )
      )
      or exists (
      select 1
        from public.flight_reconciliation_cases as reconciliation
        join public.profiles as resolver on resolver.id = reconciliation.resolved_by
       where reconciliation.order_id = new.id
         and reconciliation.execution_mode = new.execution_mode
         and reconciliation.execution_scope_sha256 = new.execution_scope_sha256
         and reconciliation.provider_code = new.provider_code
         and reconciliation.status = 'resolved'
         and reconciliation.resolution_evidence_sha256 is not null
         and reconciliation.resolved_at >= old.updated_at
         and resolver.role = 'admin'
         and reconciliation.subject_type = 'flight_order'
         and reconciliation.subject_id = new.id
         and reconciliation.source_status = old.status
         and reconciliation.source_revision_at = old.updated_at
         and reconciliation.target_status = new.status
         and reconciliation.target_state_sha256 = encode(
           extensions.digest(
             convert_to(jsonb_build_object(
               'domain', 'iratepilot.flight.reconciliation.target.v1',
               'subject_type', 'flight_order',
               'subject_id', new.id::text,
               'target_status', new.status,
               'execution_mode', new.execution_mode,
               'execution_scope_sha256', new.execution_scope_sha256
             )::text, 'UTF8'),
             'sha256'
           ),
           'hex'
         )
         and (
           (new.status in ('pending_payment', 'order_creating', 'failed')
             and reconciliation.case_type = 'ambiguous_order')
           or (new.status = 'payment_authorized'
             and reconciliation.case_type = 'payment_order_mismatch')
           or (new.status in ('ticketing_pending', 'ticketed')
             and reconciliation.case_type = 'ticket_mismatch')
           or (new.status in ('refund_pending', 'refunded')
             and reconciliation.case_type = 'refund_mismatch')
           or (new.status in ('servicing', 'cancellation_pending')
             and reconciliation.case_type = 'servicing_mismatch')
           or (new.status = 'cancelled' and (
             (new.provider_order_ref_sha256 is null
               and reconciliation.case_type in ('payment_order_mismatch', 'ambiguous_order'))
             or (new.provider_order_ref_sha256 is not null
               and reconciliation.case_type = 'servicing_mismatch')
           ))
         )
    )
  ) then
    raise exception 'Resolved administrator-attributed reconciliation evidence is required';
  end if;

  if new.status = 'failed' and (
    exists (
      select 1 from public.flight_payments
       where order_id = new.id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
         and (
           captured_cents <> refunded_cents
           or status not in ('failed', 'cancelled', 'refunded')
           or (status = 'failed' and authorized_cents > 0)
         )
    )
    or (
      new.provider_order_ref_sha256 is not null
      and not exists (
        select 1 from public.flight_service_requests
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and request_type = 'cancel'
           and status = 'completed'
      )
    )
    or exists (
      select 1 from public.flight_ticket_documents
       where order_id = new.id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
         and status not in ('voided', 'refunded', 'failed')
    )
  ) then
    raise exception 'Flight orders can fail only with exact zero-liability evidence';
  end if;

  if new.status in ('payment_authorized', 'order_creating', 'booked')
    and not exists (
      select 1 from public.flight_payments
       where order_id = new.id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
         and currency = new.currency
         and authorized_cents = new.total_cents
         and status in ('authorized', 'captured')
    ) then
    raise exception 'Exact authorized flight payment evidence is required';
  end if;

  if new.status in ('ticketing_pending', 'ticketed')
    and (
      new.ticketing_deadline_at is null
      or new.ticketing_deadline_at <= clock_timestamp()
    ) then
    raise exception 'Flight order ticketing deadline has expired';
  end if;

  if new.status in ('ticketing_pending', 'ticketed')
    and not exists (
      select 1 from public.flight_payments
       where order_id = new.id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
         and currency = new.currency
         and authorized_cents = new.total_cents
         and captured_cents = new.total_cents
         and refunded_cents = 0
         and status = 'captured'
    ) then
    raise exception 'Exact captured flight payment evidence is required before ticketing';
  end if;

  if new.status in ('ticketing_pending', 'ticketed') then
    select adult_count, child_count, infant_in_seat_count, infant_on_lap_count
      into v_expected_adults, v_expected_children,
        v_expected_infants_in_seat, v_expected_infants_on_lap
      from public.flight_searches
     where id = new.search_id;
    select
      count(*) filter (where traveler_type = 'adult'),
      count(*) filter (where traveler_type = 'child'),
      count(*) filter (where traveler_type = 'infant_in_seat'),
      count(*) filter (where traveler_type = 'infant_on_lap')
      into v_actual_adults, v_actual_children,
        v_actual_infants_in_seat, v_actual_infants_on_lap
      from public.flight_passenger_refs
     where order_id = new.id
       and execution_mode = new.execution_mode
       and execution_scope_sha256 = new.execution_scope_sha256;
    if v_actual_adults is distinct from v_expected_adults
      or v_actual_children is distinct from v_expected_children
      or v_actual_infants_in_seat is distinct from v_expected_infants_in_seat
      or v_actual_infants_on_lap is distinct from v_expected_infants_on_lap then
      raise exception 'Exact passenger-reference evidence is required before ticketing';
    end if;
  end if;

  if new.status = 'ticketed'
    and exists (
      select 1 from public.flight_passenger_refs as passenger
       where passenger.order_id = new.id
         and passenger.execution_mode = new.execution_mode
         and passenger.execution_scope_sha256 = new.execution_scope_sha256
         and (
           select count(*) from public.flight_ticket_documents as document
            where document.order_id = new.id
               and document.passenger_ref_id = passenger.id
               and document.execution_mode = new.execution_mode
               and document.execution_scope_sha256 = new.execution_scope_sha256
               and document.document_type = 'electronic_ticket'
              and document.status = 'issued'
         ) <> 1
    ) then
    raise exception 'Exactly one issued ticket document is required for every passenger';
  end if;

  if new.status = 'servicing'
    and not exists (
      select 1 from public.flight_service_requests
       where order_id = new.id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
         and status in ('accepted', 'processing')
    ) then
    raise exception 'Accepted flight service evidence is required';
  end if;

  if new.status = 'cancellation_pending'
    and not exists (
      select 1 from public.flight_service_requests
       where order_id = new.id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
         and request_type = 'cancel'
         and status in ('accepted', 'processing', 'completed')
    ) then
    raise exception 'Accepted flight cancellation evidence is required';
  end if;

  if new.status = 'cancelled'
    and old.status = 'pending_payment'
    and (
      new.provider_order_ref_sha256 is not null
      or exists (
        select 1 from public.flight_payments
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and (
             authorized_cents <> 0
             or captured_cents <> 0
             or refunded_cents <> 0
             or status not in ('failed', 'cancelled')
           )
      )
      or exists (
        select 1 from public.flight_ticket_documents
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and status not in ('voided', 'refunded', 'failed')
      )
    ) then
    raise exception 'Pending flight orders can cancel only with exact zero-liability evidence';
  end if;

  if new.status = 'cancelled'
    and old.status <> 'pending_payment'
    and (
      not exists (
        select 1 from public.flight_payments
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and currency = new.currency
           and authorized_cents = new.total_cents
           and (
             (status = 'cancelled' and captured_cents = 0 and refunded_cents = 0)
             or (
               status in ('captured', 'refund_pending', 'partially_refunded', 'refunded')
               and captured_cents = new.total_cents
             )
           )
      )
      or exists (
        select 1 from public.flight_ticket_documents
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and status not in ('voided', 'refunded', 'failed')
      )
    ) then
    raise exception 'Exact cancelled or captured payment and inactive-ticket evidence is required';
  end if;

  if new.status = 'refund_pending'
    and (
      not exists (
        select 1 from public.flight_payments
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and currency = new.currency
           and authorized_cents = new.total_cents
           and captured_cents = new.total_cents
           and status in ('refund_pending', 'partially_refunded', 'refunded')
      )
      or not exists (
        select 1 from public.flight_service_requests
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and request_type in ('cancel', 'refund')
           and status in ('accepted', 'processing', 'completed')
      )
      or exists (
        select 1 from public.flight_ticket_documents
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and status not in ('voided', 'refunded', 'failed')
      )
    ) then
    raise exception 'Exact in-progress refund, service, and inactive-ticket evidence is required';
  end if;

  if new.status = 'cancelled' and new.provider_order_ref_sha256 is not null
    and not exists (
      select 1 from public.flight_service_requests
       where order_id = new.id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
         and request_type = 'cancel'
         and status = 'completed'
    ) then
    raise exception 'Completed provider cancellation evidence is required';
  end if;

  if new.status = 'refunded'
    and (
      not exists (
        select 1 from public.flight_payments
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and currency = new.currency
           and captured_cents = new.total_cents
           and refunded_cents = new.total_cents
           and status = 'refunded'
      )
      or not exists (
        select 1 from public.flight_service_requests
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and request_type in ('cancel', 'refund')
           and status = 'completed'
      )
      or exists (
        select 1 from public.flight_ticket_documents
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and status not in ('voided', 'refunded', 'failed')
      )
    ) then
    raise exception 'Exact completed refund, service, and ticket evidence is required';
  end if;
  return new;
end;
$$;

create function public.record_flight_consumer_verified_webhook_v1(
  p_source text,
  p_event_id_sha256 text,
  p_idempotency_sha256 text,
  p_event_type text,
  p_payload_sha256 text,
  p_semantic_sha256 text,
  p_verification_receipt_sha256 text,
  p_occurred_at timestamptz,
  p_order_id uuid,
  p_payment_id uuid,
  p_provider_attempt_id uuid
)
returns table (decision text, ledger_id uuid, ledger_revision integer, ledger_state text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $record_flight_consumer_verified_webhook$
declare
  v_scope text;
  v_order public.flight_orders;
  v_control public.flight_runtime_controls;
  v_existing public.flight_consumer_webhook_ledger;
  v_ledger public.flight_consumer_webhook_ledger;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight verified webhook ingress is service-role only';
  end if;
  if p_order_id is not null then
    select * into v_order from public.flight_orders where id = p_order_id for update;
  end if;
  select * into v_control from public.flight_runtime_controls
   where control_key = 'global' for update;
  v_scope := v_control.bound_execution_scope_sha256;
  perform public.assert_flight_consumer_preview_runtime_v1(v_scope, 'provider_event');
  if p_source not in ('stripe', 'duffel')
    or p_event_id_sha256 is null or p_event_id_sha256 !~ '^[0-9a-f]{64}$'
    or p_idempotency_sha256 is null or p_idempotency_sha256 !~ '^[0-9a-f]{64}$'
    or p_payload_sha256 is null or p_payload_sha256 !~ '^[0-9a-f]{64}$'
    or p_semantic_sha256 is null or p_semantic_sha256 !~ '^[0-9a-f]{64}$'
    or p_verification_receipt_sha256 is null
    or p_verification_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or (p_source = 'stripe' and p_event_type not in (
      'payment_intent.requires_action', 'payment_intent.amount_capturable_updated',
      'payment_intent.payment_failed', 'payment_intent.canceled',
      'payment_intent.succeeded', 'charge.refunded'
    ))
    or (p_source = 'duffel' and p_event_type not in (
      'order.created', 'order.updated', 'order.cancelled', 'order.ticketed'
    )) then
    raise exception 'Flight webhook verified digest envelope is invalid';
  end if;
  if p_order_id is not null and (
    v_order.id is null or v_order.execution_mode <> 'test'
    or v_order.execution_scope_sha256 <> v_scope
  ) then raise exception 'Flight webhook order link is outside Preview scope'; end if;
  if p_payment_id is not null and not exists (
    select 1 from public.flight_payments as payment
     where payment.id = p_payment_id
       and (p_order_id is null or payment.order_id = p_order_id)
       and payment.execution_mode = 'test'
       and payment.execution_scope_sha256 = v_scope
  ) then raise exception 'Flight webhook payment link does not match'; end if;
  if p_provider_attempt_id is not null and not exists (
    select 1 from public.flight_provider_request_attempts as attempt
     where attempt.id = p_provider_attempt_id
       and attempt.consumer_flow_version = 1
       and (p_order_id is null or attempt.order_id = p_order_id)
       and attempt.execution_mode = 'test'
       and attempt.execution_scope_sha256 = v_scope
  ) then raise exception 'Flight webhook provider-attempt link does not match'; end if;
  select * into v_existing from public.flight_consumer_webhook_ledger as ledger
   where ledger.execution_scope_sha256 = v_scope and ledger.source = p_source
     and (
       ledger.event_id_sha256 = p_event_id_sha256
       or ledger.idempotency_sha256 = p_idempotency_sha256
     )
   order by (ledger.event_id_sha256 = p_event_id_sha256) desc
   limit 1 for update;
  if found then
    if v_existing.event_type is distinct from p_event_type
      or v_existing.payload_sha256 is distinct from p_payload_sha256
      or v_existing.semantic_sha256 is distinct from p_semantic_sha256
      or v_existing.verification_receipt_sha256
        is distinct from p_verification_receipt_sha256
      or v_existing.order_id is distinct from p_order_id
      or v_existing.payment_id is distinct from p_payment_id
      or v_existing.provider_attempt_id is distinct from p_provider_attempt_id then
      raise exception 'Flight webhook event or idempotency digest collision';
    end if;
    return query select
      case when v_existing.event_id_sha256 = p_event_id_sha256
        then 'replay'::text else 'duplicate'::text end,
      v_existing.id, v_existing.revision, v_existing.state;
    return;
  end if;
  insert into public.flight_consumer_webhook_ledger (
    source, execution_mode, execution_scope_sha256, event_id_sha256,
    idempotency_sha256, event_type, payload_sha256, semantic_sha256,
    verification_receipt_sha256, order_id, payment_id, provider_attempt_id,
    state, revision, occurred_at
  ) values (
    p_source, 'test', v_scope, p_event_id_sha256, p_idempotency_sha256,
    p_event_type, p_payload_sha256, p_semantic_sha256,
    p_verification_receipt_sha256, p_order_id, p_payment_id,
    p_provider_attempt_id, 'verified', 0, p_occurred_at
  ) returning * into v_ledger;
  if p_order_id is not null then
    update public.flight_orders
       set updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
     where id = p_order_id;
  end if;
  return query select 'created'::text, v_ledger.id, v_ledger.revision, v_ledger.state;
end;
$record_flight_consumer_verified_webhook$;

create function public.claim_flight_consumer_webhook_v1(
  p_ledger_id uuid,
  p_expected_revision integer
)
returns table (ledger_id uuid, ledger_revision integer, ledger_state text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $claim_flight_consumer_webhook$
declare
  v_order_id uuid;
  v_ledger public.flight_consumer_webhook_ledger;
  v_control public.flight_runtime_controls;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight webhook claim is service-role only';
  end if;
  select ledger.order_id into v_order_id from public.flight_consumer_webhook_ledger ledger
   where ledger.id = p_ledger_id;
  if v_order_id is not null then
    perform 1 from public.flight_orders where id = v_order_id for update;
  end if;
  select * into v_ledger from public.flight_consumer_webhook_ledger
   where id = p_ledger_id for update;
  select * into v_control from public.flight_runtime_controls
   where control_key = 'global' for update;
  if v_ledger.id is null or v_ledger.state <> 'verified'
    or v_ledger.revision <> p_expected_revision then
    raise exception 'Flight webhook claim CAS failed';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_ledger.execution_scope_sha256, 'provider_event'
  );
  update public.flight_consumer_webhook_ledger
     set state = 'processing', revision = revision + 1,
         processing_started_at = clock_timestamp()
   where id = v_ledger.id and state = 'verified'
     and revision = p_expected_revision
  returning * into v_ledger;
  if not found then raise exception 'Flight webhook claim CAS failed'; end if;
  if v_order_id is not null then
    update public.flight_orders
       set updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
     where id = v_order_id;
  end if;
  return query select v_ledger.id, v_ledger.revision, v_ledger.state;
end;
$claim_flight_consumer_webhook$;

create function public.complete_flight_consumer_webhook_v1(
  p_ledger_id uuid,
  p_expected_revision integer,
  p_outcome text,
  p_outcome_sha256 text
)
returns table (ledger_id uuid, ledger_revision integer, ledger_state text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $complete_flight_consumer_webhook$
declare
  v_order_id uuid;
  v_ledger public.flight_consumer_webhook_ledger;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight webhook completion is service-role only';
  end if;
  select ledger.order_id into v_order_id from public.flight_consumer_webhook_ledger ledger
   where ledger.id = p_ledger_id;
  if v_order_id is not null then
    perform 1 from public.flight_orders where id = v_order_id for update;
  end if;
  select * into v_ledger from public.flight_consumer_webhook_ledger
   where id = p_ledger_id for update;
  if v_ledger.id is null or v_ledger.state <> 'processing'
    or v_ledger.revision <> p_expected_revision
    or p_outcome not in ('processed', 'duplicate', 'blocked', 'failed')
    or p_outcome_sha256 is null or p_outcome_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight webhook completion CAS failed';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_ledger.execution_scope_sha256, 'provider_event'
  );
  update public.flight_consumer_webhook_ledger
     set state = p_outcome, revision = revision + 1,
         completed_at = clock_timestamp(), outcome_sha256 = p_outcome_sha256
   where id = v_ledger.id and state = 'processing'
     and revision = p_expected_revision
  returning * into v_ledger;
  if not found then raise exception 'Flight webhook completion CAS failed'; end if;
  if v_order_id is not null then
    update public.flight_orders
       set updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
     where id = v_order_id;
  end if;
  return query select v_ledger.id, v_ledger.revision, v_ledger.state;
end;
$complete_flight_consumer_webhook$;

alter table public.flight_payment_operation_attempts enable row level security;
alter table public.flight_payment_operation_attempts force row level security;
alter table public.flight_order_response_evidence_vault enable row level security;
alter table public.flight_order_response_evidence_vault force row level security;
alter table public.flight_consumer_webhook_ledger enable row level security;
alter table public.flight_consumer_webhook_ledger force row level security;
alter table public.flight_payment_state_observations enable row level security;
alter table public.flight_payment_state_observations force row level security;
alter table public.flight_payment_refund_evidence enable row level security;
alter table public.flight_payment_refund_evidence force row level security;

revoke all on table public.flight_payment_operation_attempts
  from public, anon, authenticated, service_role;
revoke all on table public.flight_order_response_evidence_vault
  from public, anon, authenticated, service_role;
revoke all on table public.flight_consumer_webhook_ledger
  from public, anon, authenticated, service_role;
revoke all on table public.flight_payment_state_observations
  from public, anon, authenticated, service_role;
revoke all on table public.flight_payment_refund_evidence
  from public, anon, authenticated, service_role;

revoke all on function public.assert_flight_consumer_preview_runtime_v1(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.flight_jsonb_has_exact_keys_v1(jsonb, text[])
  from public, anon, authenticated, service_role;
revoke all on function public.bind_flight_offer_evidence_local_id_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.protect_flight_payment_operation_attempt_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.protect_flight_consumer_webhook_ledger_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.validate_flight_consumer_provider_attempt_link_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.protect_flight_consumer_provider_idempotency_v1()
  from public, anon, authenticated, service_role;

revoke all on function public.prepare_flight_consumer_search_attempt_v1(
  uuid, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.prepare_flight_consumer_reprice_attempt_v1(
  uuid, uuid, text, text, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.claim_flight_consumer_shopping_attempt_v1(
  uuid, integer, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.complete_flight_consumer_search_v1(uuid, integer, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.fail_flight_consumer_search_v1(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_flight_consumer_reprice_v1(
  uuid, integer, text, text, text, text, bigint, bigint, timestamptz, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.fail_flight_consumer_reprice_v1(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.accept_flight_consumer_reprice_and_create_order_v1(
  uuid, uuid, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.prepare_flight_consumer_checkout_v1(
  uuid, uuid, text, text, jsonb, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.get_flight_consumer_payment_operation_v1(
  uuid, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.claim_flight_consumer_payment_operation_v1(
  uuid, integer, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.complete_flight_consumer_payment_operation_v1(
  uuid, integer, text, smallint, text, bigint, text
) from public, anon, authenticated, service_role;
revoke all on function public.complete_flight_consumer_payment_intent_v1(
  uuid, integer, text, smallint, text, bigint, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.record_flight_consumer_payment_authorization_v1(
  uuid, uuid, timestamptz, text, text, text, bigint
) from public, anon, authenticated, service_role;
revoke all on function public.prepare_flight_consumer_capture_v1(
  uuid, uuid, text, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.apply_flight_consumer_capture_v1(uuid, integer, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.get_flight_consumer_offer_evidence_context_v1(
  uuid, uuid, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.claim_flight_consumer_duffel_order_attempt_v1(
  uuid, integer, text, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.record_flight_consumer_duffel_order_terminal_v1(
  uuid, integer, text, smallint, text, bigint, text, text,
  text, text, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.get_flight_consumer_duffel_order_recovery_v1(
  uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.load_flight_consumer_order_response_evidence_v1(
  uuid, uuid, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.finalize_flight_consumer_duffel_order_v1(
  uuid, integer, text, text, text, timestamptz, timestamptz, jsonb, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.mark_flight_consumer_order_ambiguous_v1(
  uuid, integer, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.mark_flight_consumer_captured_order_unstarted_v1(
  uuid, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.resolve_flight_consumer_review_v1(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.prepare_flight_consumer_refund_compensation_v1(
  uuid, uuid, text, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.apply_flight_consumer_refund_compensation_v1(
  uuid, integer, uuid, text, text, bigint
) from public, anon, authenticated, service_role;
revoke all on function public.record_flight_consumer_verified_webhook_v1(
  text, text, text, text, text, text, text, timestamptz, uuid, uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.claim_flight_consumer_webhook_v1(uuid, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_flight_consumer_webhook_v1(
  uuid, integer, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.prepare_flight_consumer_search_attempt_v1(
  uuid, text, text, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.prepare_flight_consumer_reprice_attempt_v1(
  uuid, uuid, text, text, text, text, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.claim_flight_consumer_shopping_attempt_v1(
  uuid, integer, text, text, text
) to service_role;
grant execute on function public.complete_flight_consumer_search_v1(uuid, integer, jsonb)
  to service_role;
grant execute on function public.fail_flight_consumer_search_v1(uuid, integer)
  to service_role;
grant execute on function public.complete_flight_consumer_reprice_v1(
  uuid, integer, text, text, text, text, bigint, bigint, timestamptz, jsonb
) to service_role;
grant execute on function public.fail_flight_consumer_reprice_v1(uuid, integer)
  to service_role;
grant execute on function public.accept_flight_consumer_reprice_and_create_order_v1(
  uuid, uuid, text, text
) to authenticated;
grant execute on function public.prepare_flight_consumer_checkout_v1(
  uuid, uuid, text, text, jsonb, text, text, text, timestamptz
) to service_role;
grant execute on function public.get_flight_consumer_payment_operation_v1(
  uuid, uuid, text
) to service_role;
grant execute on function public.claim_flight_consumer_payment_operation_v1(
  uuid, integer, text, text
) to service_role;
grant execute on function public.complete_flight_consumer_payment_operation_v1(
  uuid, integer, text, smallint, text, bigint, text
) to service_role;
grant execute on function public.complete_flight_consumer_payment_intent_v1(
  uuid, integer, text, smallint, text, bigint, text, text, text
) to service_role;
grant execute on function public.record_flight_consumer_payment_authorization_v1(
  uuid, uuid, timestamptz, text, text, text, bigint
) to service_role;
grant execute on function public.prepare_flight_consumer_capture_v1(
  uuid, uuid, text, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.apply_flight_consumer_capture_v1(uuid, integer, uuid, text)
  to service_role;
grant execute on function public.get_flight_consumer_offer_evidence_context_v1(
  uuid, uuid, uuid, text
) to service_role;
grant execute on function public.claim_flight_consumer_duffel_order_attempt_v1(
  uuid, integer, text, text, text, text, text
) to service_role;
grant execute on function public.record_flight_consumer_duffel_order_terminal_v1(
  uuid, integer, text, smallint, text, bigint, text, text,
  text, text, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.get_flight_consumer_duffel_order_recovery_v1(
  uuid, uuid
) to service_role;
grant execute on function public.load_flight_consumer_order_response_evidence_v1(
  uuid, uuid, uuid, text
) to service_role;
grant execute on function public.finalize_flight_consumer_duffel_order_v1(
  uuid, integer, text, text, text, timestamptz, timestamptz, jsonb, jsonb
) to service_role;
grant execute on function public.mark_flight_consumer_order_ambiguous_v1(
  uuid, integer, text, text
) to service_role;
grant execute on function public.mark_flight_consumer_captured_order_unstarted_v1(
  uuid, text, text
) to service_role;
grant execute on function public.resolve_flight_consumer_review_v1(uuid, text, text)
  to authenticated;
grant execute on function public.prepare_flight_consumer_refund_compensation_v1(
  uuid, uuid, text, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.apply_flight_consumer_refund_compensation_v1(
  uuid, integer, uuid, text, text, bigint
) to service_role;
grant execute on function public.record_flight_consumer_verified_webhook_v1(
  text, text, text, text, text, text, text, timestamptz, uuid, uuid, uuid
) to service_role;
grant execute on function public.claim_flight_consumer_webhook_v1(uuid, integer)
  to service_role;
grant execute on function public.complete_flight_consumer_webhook_v1(
  uuid, integer, text, text
) to service_role;

comment on table public.flight_payment_operation_attempts is
  'Digest-only Stripe test operation journal with exact idempotency and CAS; never stores card data, client secrets, raw HTTP, or credentials.';
comment on function public.get_flight_consumer_payment_operation_v1(
  uuid, uuid, text
) is
  'Owner/order/operation-scoped, runtime-bound recovery projection for safe Stripe retry decisions; returns digests only and no encrypted reference or secret.';
comment on table public.flight_order_response_evidence_vault is
  'Service-only AES-GCM Duffel test order-response envelope; plaintext provider JSON never enters PostgreSQL.';
comment on table public.flight_consumer_webhook_ledger is
  'Verified digest-only Stripe/Duffel test webhook ledger; processing must call the same business RPCs and cannot bypass lifecycle invariants.';
comment on function public.record_flight_consumer_duffel_order_terminal_v1(
  uuid, integer, text, smallint, text, bigint, text, text,
  text, text, text, text, text, text, timestamptz
) is
  'Accepts an exact revision-1 terminal transition or exact revision-2 transport replay, and atomically stores successful encrypted response evidence once.';
comment on function public.get_flight_consumer_duffel_order_recovery_v1(
  uuid, uuid
) is
  'Returns the one owner/order-scoped Duffel create-order journal identity and response-evidence receipt needed for crash recovery, without ciphertext or redispatch authority.';
comment on function public.load_flight_consumer_order_response_evidence_v1(
  uuid, uuid, uuid, text
) is
  'Owner/order/attempt/receipt-scoped loader for an unexpired encrypted Duffel success envelope after a process restart; returns no plaintext.';
comment on function public.complete_flight_consumer_payment_operation_v1(
  uuid, integer, text, smallint, text, bigint, text
) is
  'Exact Stripe operation CAS: revision 0 may only block without dispatch; revision 1 may terminalize once; no retry is authorized.';
comment on function public.mark_flight_consumer_captured_order_unstarted_v1(
  uuid, text, text
) is
  'Moves an exactly captured Consumer Preview order into durable review only when no Duffel create-order attempt exists, preserving a full-refund path.';

commit;

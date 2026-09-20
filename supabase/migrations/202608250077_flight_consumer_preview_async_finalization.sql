begin;

-- Forward-only async Duffel convergence for the exact Consumer Preview/test
-- authority established by 074-076. This migration never dispatches a
-- provider request. It consumes one already-succeeded create-order journal,
-- one processed verified order.created webhook, and one separately encrypted
-- GET-order recovery receipt to finish an administrator-reviewed order.
do $flight_consumer_preview_077_dependencies$
begin
  if to_regclass('public.flight_order_recovery_evidence_vault') is null
    or to_regclass('public.flight_consumer_webhook_ledger') is null
    or to_regclass('public.flight_offer_evidence_vault') is null
    or to_regprocedure(
      'public.assert_flight_consumer_preview_runtime_v1(text,text)'
    ) is null
    or to_regprocedure(
      'public.flight_jsonb_has_exact_keys_v1(jsonb,text[])'
    ) is null
    or to_regprocedure(
      'public.resolve_flight_consumer_admin_reconciliation_v1(uuid,timestamptz,text,text)'
    ) is null then
    raise exception 'Flight Consumer Preview async finalization requires migrations 068 through 076';
  end if;
  if to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'Flight Consumer Preview async finalization requires reviewed SHA-256 support';
  end if;
end;
$flight_consumer_preview_077_dependencies$;

-- System convergence is a distinct, auditable actor. It never fabricates an
-- administrator identity. Existing and future human resolutions retain the
-- administrator default and the original resolved_by foreign key semantics.
alter table public.flight_reconciliation_cases
  add column resolution_actor_type text not null default 'administrator'
    check (resolution_actor_type in ('administrator', 'system')),
  add column system_resolution_receipt_sha256 text check (
    system_resolution_receipt_sha256 is null
    or system_resolution_receipt_sha256 ~ '^[0-9a-f]{64}$'
  );

do $flight_consumer_preview_077_resolution_constraint$
declare
  v_constraint_name text;
  v_constraint_count integer;
begin
  select count(*), min(con.conname)
    into v_constraint_count, v_constraint_name
    from pg_catalog.pg_constraint as con
   where con.conrelid = 'public.flight_reconciliation_cases'::regclass
     and con.contype = 'c'
     and pg_catalog.pg_get_constraintdef(con.oid) like '%status = %resolved%'
     and pg_catalog.pg_get_constraintdef(con.oid) like '%resolution_code IS NOT NULL%'
     and pg_catalog.pg_get_constraintdef(con.oid) like '%resolved_by IS NOT NULL%'
     and pg_catalog.pg_get_constraintdef(con.oid) like '%status <> %resolved%';
  if v_constraint_count <> 1 then
    raise exception 'Expected exactly one inherited flight reconciliation resolution constraint';
  end if;
  execute format(
    'alter table public.flight_reconciliation_cases drop constraint %I',
    v_constraint_name
  );
end;
$flight_consumer_preview_077_resolution_constraint$;

alter table public.flight_reconciliation_cases
  add constraint flight_reconciliation_resolution_actor_check check (
    (
      status = 'resolved'
      and resolution_code is not null
      and resolution_evidence_sha256 is not null
      and resolved_at is not null
      and (
        (resolution_actor_type = 'administrator'
          and resolved_by is not null
          and system_resolution_receipt_sha256 is null)
        or (resolution_actor_type = 'system'
          and resolved_by is null
          and system_resolution_receipt_sha256 is not null)
      )
    )
    or (
      status <> 'resolved'
      and resolution_code is null
      and resolution_evidence_sha256 is null
      and resolved_by is null
      and resolved_at is null
      and resolution_actor_type = 'administrator'
      and system_resolution_receipt_sha256 is null
    )
  );

create function public.validate_flight_consumer_async_system_resolution_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $validate_flight_consumer_async_system_resolution$
declare
  v_order public.flight_orders;
begin
  if tg_op <> 'UPDATE'
    or current_setting(
      'app.flight_consumer_async_system_resolution_authorized', true
    ) is distinct from 'true'
    or old.status not in ('open', 'investigating', 'blocked')
    or new.status <> 'resolved'
    or old.case_type <> 'ambiguous_order'
    or old.subject_type <> 'flight_order'
    or old.source_status <> 'requires_review'
    or old.target_status <> 'order_creating'
    or new.resolution_code <> 'provider_state_confirmed'
    or new.resolution_evidence_sha256 is null
    or new.resolution_evidence_sha256 !~ '^[0-9a-f]{64}$'
    or new.resolution_actor_type <> 'system'
    or new.system_resolution_receipt_sha256 is null
    or new.system_resolution_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or new.resolved_by is not null
    or to_jsonb(new) - array[
      'status', 'resolution_code', 'resolution_evidence_sha256',
      'resolved_by', 'resolved_at', 'updated_at',
      'resolution_actor_type', 'system_resolution_receipt_sha256'
    ] is distinct from to_jsonb(old) - array[
      'status', 'resolution_code', 'resolution_evidence_sha256',
      'resolved_by', 'resolved_at', 'updated_at',
      'resolution_actor_type', 'system_resolution_receipt_sha256'
    ] then
    raise exception 'Flight async system resolution is unavailable';
  end if;
  select * into v_order from public.flight_orders as flight_order
   where flight_order.id = new.order_id
     and flight_order.id = new.subject_id
     and flight_order.consumer_flow_version = 1
     and flight_order.execution_mode = 'test'
     and flight_order.execution_scope_sha256 = new.execution_scope_sha256
     and flight_order.provider_code = 'duffel'
     and flight_order.status = 'requires_review'
     and flight_order.provider_order_ref_sha256 is null;
  if v_order.id is null then
    raise exception 'Flight async system resolution order is unavailable';
  end if;
  if not exists (
    select 1
      from public.flight_provider_request_attempts as attempt
      join public.flight_offers as offer
        on offer.id = v_order.offer_id
       and offer.search_id = v_order.search_id
       and offer.execution_mode = 'test'
       and offer.execution_scope_sha256 = v_order.execution_scope_sha256
       and offer.provider_code = 'duffel'
      join public.flight_consumer_webhook_ledger as ledger
        on ledger.provider_attempt_id = attempt.id
       and ledger.order_id = v_order.id
       and ledger.source = 'duffel'
       and ledger.event_type = 'order.created'
       and ledger.execution_mode = 'test'
       and ledger.execution_scope_sha256 = v_order.execution_scope_sha256
       and ledger.provider_offer_ref_sha256 = offer.provider_offer_ref_sha256
       and ledger.provider_live_mode is false
       and ledger.state = 'processed' and ledger.revision = 2
      join public.flight_order_recovery_evidence_vault as evidence
        on evidence.ledger_id = ledger.id
       and evidence.attempt_id = attempt.id
       and evidence.order_id = v_order.id
       and evidence.customer_id = v_order.customer_id
       and evidence.execution_scope_sha256 = v_order.execution_scope_sha256
       and evidence.provider_offer_ref_sha256
         = ledger.provider_offer_ref_sha256
       and evidence.provider_order_ref_sha256
         = ledger.provider_order_ref_sha256
       and evidence.deleted_at is null
       and evidence.retention_expires_at > clock_timestamp()
      join public.flight_payments as payment
        on payment.id = ledger.payment_id
       and payment.order_id = v_order.id
       and payment.execution_mode = 'test'
       and payment.execution_scope_sha256 = v_order.execution_scope_sha256
       and payment.processor_code = 'stripe'
       and payment.currency = v_order.currency
       and payment.status = 'captured'
       and payment.authorized_cents = v_order.total_cents
       and payment.captured_cents = v_order.total_cents
       and payment.refunded_cents = 0
     where attempt.order_id = v_order.id
       and attempt.customer_id = v_order.customer_id
       and attempt.search_id = v_order.search_id
       and attempt.offer_id = v_order.offer_id
       and attempt.consumer_flow_version = 1
       and attempt.operation = 'create_order'
       and attempt.provider_code = 'duffel'
       and attempt.execution_mode = 'test'
       and attempt.execution_scope_sha256 = v_order.execution_scope_sha256
       and attempt.state = 'succeeded' and attempt.revision = 2
       and not attempt.retry_authorized
  ) then
    raise exception 'Flight async system resolution lacks exact recovery liability evidence';
  end if;
  new.resolved_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  new.updated_at := new.resolved_at;
  return new;
end;
$validate_flight_consumer_async_system_resolution$;

-- Preserve both inherited reconciliation guards for all human and unrelated
-- updates. Only the exact transaction-local system convergence update is
-- routed through the validator above.
drop trigger flight_reconciliation_cases_order_mode_guard
  on public.flight_reconciliation_cases;
drop trigger flight_reconciliation_cases_immutable_guard
  on public.flight_reconciliation_cases;

create trigger flight_reconciliation_cases_order_mode_insert_guard
before insert on public.flight_reconciliation_cases
for each row execute function public.validate_flight_order_child_mode();

create trigger flight_reconciliation_cases_order_mode_guard
before update on public.flight_reconciliation_cases
for each row when (not (
  old.status in ('open', 'investigating', 'blocked')
  and new.status = 'resolved'
  and old.case_type = 'ambiguous_order'
  and old.subject_type = 'flight_order'
  and old.source_status = 'requires_review'
  and old.target_status = 'order_creating'
  and current_setting(
    'app.flight_consumer_async_system_resolution_authorized', true
  ) = 'true'
)) execute function public.validate_flight_order_child_mode();

create trigger flight_reconciliation_cases_immutable_insert_guard
before insert on public.flight_reconciliation_cases
for each row execute function public.protect_flight_operational_evidence();

create trigger flight_reconciliation_cases_immutable_guard
before update on public.flight_reconciliation_cases
for each row when (not (
  old.status in ('open', 'investigating', 'blocked')
  and new.status = 'resolved'
  and old.case_type = 'ambiguous_order'
  and old.subject_type = 'flight_order'
  and old.source_status = 'requires_review'
  and old.target_status = 'order_creating'
  and current_setting(
    'app.flight_consumer_async_system_resolution_authorized', true
  ) = 'true'
)) execute function public.protect_flight_operational_evidence();

create trigger flight_reconciliation_cases_async_system_resolution_guard
before update of status, resolution_code, resolution_evidence_sha256,
  resolved_by, resolved_at, resolution_actor_type,
  system_resolution_receipt_sha256
on public.flight_reconciliation_cases
for each row when (
  old.status in ('open', 'investigating', 'blocked')
  and new.status = 'resolved'
  and old.case_type = 'ambiguous_order'
  and old.subject_type = 'flight_order'
  and old.source_status = 'requires_review'
  and old.target_status = 'order_creating'
  and current_setting(
    'app.flight_consumer_async_system_resolution_authorized', true
  ) = 'true'
) execute function public.validate_flight_consumer_async_system_resolution_v1();

-- This validator is invoked only for the one alternate order transition
-- admitted below. It repeats the durable authority checks independently of the
-- RPC so a transaction-local flag can never become a broad trigger bypass.
create function public.validate_flight_consumer_async_order_finalization_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $validate_flight_consumer_async_order_finalization$
declare
  v_attempt public.flight_provider_request_attempts;
  v_payment public.flight_payments;
  v_offer public.flight_offers;
  v_offer_evidence public.flight_offer_evidence_vault;
  v_ledger public.flight_consumer_webhook_ledger;
  v_recovery public.flight_order_recovery_evidence_vault;
  v_case public.flight_reconciliation_cases;
  v_expected integer;
  v_actual integer;
  v_target_sha256 text;
begin
  if tg_op <> 'UPDATE'
    or old.status <> 'requires_review'
    or new.status <> 'booked'
    or new.consumer_flow_version <> 1
    or current_setting(
      'app.flight_consumer_async_finalization_authorized', true
    ) is distinct from 'true' then
    raise exception 'Flight async finalization trigger is unavailable';
  end if;
  if to_jsonb(new) - array[
      'provider_order_ref_ciphertext', 'provider_order_ref_sha256',
      'provider_created_at', 'ticketing_deadline_at', 'status', 'updated_at'
    ] is distinct from to_jsonb(old) - array[
      'provider_order_ref_ciphertext', 'provider_order_ref_sha256',
      'provider_created_at', 'ticketing_deadline_at', 'status', 'updated_at'
    ]
    or old.provider_order_ref_ciphertext is not null
    or old.provider_order_ref_sha256 is not null
    or old.provider_created_at is not null
    or old.ticketing_deadline_at is not null
    or new.execution_mode <> 'test'
    or new.provider_code <> 'duffel'
    or new.provider_order_ref_ciphertext is null
    or new.provider_order_ref_ciphertext
      !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,8176}$'
    or new.provider_order_ref_sha256 is null
    or new.provider_order_ref_sha256 !~ '^[0-9a-f]{64}$'
    or new.provider_created_at is null
    or new.provider_created_at > clock_timestamp() + interval '5 minutes'
    or new.ticketing_deadline_at is null
    or new.ticketing_deadline_at <= clock_timestamp()
    or new.ticketing_deadline_at <= new.provider_created_at then
    raise exception 'Flight async provider-order binding is invalid';
  end if;

  select * into v_attempt
    from public.flight_provider_request_attempts as attempt
   where attempt.order_id = new.id
     and attempt.customer_id = new.customer_id
     and attempt.search_id = new.search_id
     and attempt.offer_id = new.offer_id
     and attempt.consumer_flow_version = 1
     and attempt.operation = 'create_order'
     and attempt.provider_code = 'duffel'
     and attempt.execution_mode = 'test'
     and attempt.execution_scope_sha256 = new.execution_scope_sha256
     and attempt.state = 'succeeded' and attempt.revision = 2
     and not attempt.retry_authorized;
  select * into v_payment
    from public.flight_payments as payment
   where payment.order_id = new.id
     and payment.execution_mode = 'test'
     and payment.execution_scope_sha256 = new.execution_scope_sha256
     and payment.processor_code = 'stripe'
     and payment.currency = new.currency
     and payment.status = 'captured'
     and payment.authorized_cents = new.total_cents
     and payment.captured_cents = new.total_cents
     and payment.refunded_cents = 0;
  select * into v_offer
    from public.flight_offers as offer
   where offer.id = new.offer_id
     and offer.search_id = new.search_id
     and offer.execution_mode = 'test'
     and offer.execution_scope_sha256 = new.execution_scope_sha256
     and offer.provider_code = 'duffel';
  if v_attempt.id is null or v_payment.id is null or v_offer.id is null then
    raise exception 'Flight async commercial evidence is incomplete';
  end if;
  select * into v_offer_evidence
    from public.flight_offer_evidence_vault as evidence
   where evidence.receipt_sha256 = v_attempt.offer_evidence_receipt_sha256
     and evidence.customer_id = new.customer_id
     and evidence.search_id = new.search_id
     and evidence.offer_id = new.offer_id
     and evidence.reprice_receipt_id = new.reprice_receipt_id
     and evidence.execution_mode = 'test'
     and evidence.execution_scope_sha256 = new.execution_scope_sha256
     and evidence.stage = 'refreshed'
     and evidence.provider_offer_ref_sha256 = v_offer.provider_offer_ref_sha256
     and evidence.deleted_at is null
     and evidence.retention_expires_at > clock_timestamp();
  select * into v_ledger
    from public.flight_consumer_webhook_ledger as ledger
   where ledger.source = 'duffel'
     and ledger.event_type = 'order.created'
     and ledger.execution_mode = 'test'
     and ledger.execution_scope_sha256 = new.execution_scope_sha256
     and ledger.order_id = new.id
     and ledger.payment_id = v_payment.id
     and ledger.provider_attempt_id = v_attempt.id
     and ledger.provider_offer_ref_sha256 = v_offer.provider_offer_ref_sha256
     and ledger.provider_order_ref_sha256 = new.provider_order_ref_sha256
     and ledger.provider_live_mode is false
     and ledger.state = 'processed' and ledger.revision = 2;
  if v_offer_evidence.id is null or v_ledger.id is null then
    raise exception 'Flight async verified provider evidence is incomplete';
  end if;
  select * into v_recovery
    from public.flight_order_recovery_evidence_vault as evidence
   where evidence.ledger_id = v_ledger.id
     and evidence.attempt_id = v_attempt.id
     and evidence.order_id = new.id
     and evidence.customer_id = new.customer_id
     and evidence.execution_mode = 'test'
     and evidence.execution_scope_sha256 = new.execution_scope_sha256
     and evidence.provider_offer_ref_sha256 = v_offer.provider_offer_ref_sha256
     and evidence.provider_order_ref_sha256 = new.provider_order_ref_sha256
     and evidence.webhook_verification_receipt_sha256
       = v_ledger.verification_receipt_sha256
     and evidence.deleted_at is null
     and evidence.retention_expires_at > clock_timestamp();
  v_target_sha256 := encode(extensions.digest(convert_to(jsonb_build_object(
    'domain', 'iratepilot.flight.reconciliation.target.v1',
    'subject_type', 'flight_order', 'subject_id', new.id::text,
    'target_status', 'order_creating', 'execution_mode', new.execution_mode,
    'execution_scope_sha256', new.execution_scope_sha256
  )::text, 'UTF8'), 'sha256'), 'hex');
  select reconciliation.* into v_case
    from public.flight_reconciliation_cases as reconciliation
    left join public.profiles as resolver on resolver.id = reconciliation.resolved_by
   where reconciliation.order_id = new.id
     and reconciliation.provider_code = 'duffel'
     and reconciliation.execution_mode = 'test'
     and reconciliation.execution_scope_sha256 = new.execution_scope_sha256
     and reconciliation.case_type = 'ambiguous_order'
     and reconciliation.subject_type = 'flight_order'
     and reconciliation.subject_id = new.id
     and reconciliation.source_status = 'requires_review'
     and reconciliation.target_status = 'order_creating'
     and reconciliation.target_state_sha256 = v_target_sha256
     and reconciliation.status = 'resolved'
     and reconciliation.resolution_code = 'provider_state_confirmed'
     and reconciliation.resolution_evidence_sha256 is not null
     and reconciliation.resolved_at is not null
     and (
       (reconciliation.resolution_actor_type = 'administrator'
         and reconciliation.resolved_by is not null
         and reconciliation.system_resolution_receipt_sha256 is null
         and resolver.role = 'admin')
       or (reconciliation.resolution_actor_type = 'system'
         and reconciliation.resolved_by is null
         and reconciliation.system_resolution_receipt_sha256 is not null)
     )
   order by reconciliation.resolved_at desc, reconciliation.id desc
   limit 1;
  select search.adult_count + search.child_count
      + search.infant_in_seat_count + search.infant_on_lap_count
    into v_expected
    from public.flight_searches as search
   where search.id = new.search_id
     and search.customer_id = new.customer_id
     and search.execution_mode = 'test'
     and search.execution_scope_sha256 = new.execution_scope_sha256;
  select count(*)::integer into v_actual
    from public.flight_passenger_refs as passenger
   where passenger.order_id = new.id
     and passenger.execution_mode = 'test'
     and passenger.execution_scope_sha256 = new.execution_scope_sha256
     and passenger.provider_passenger_ref_sha256 is null
     and passenger.provider_passenger_ref_ciphertext is null;
  if v_recovery.id is null or v_case.id is null
    or v_expected is null or v_actual <> v_expected
    or exists (
      select 1 from public.flight_ticket_documents as document
       where document.order_id = new.id
    ) then
    raise exception 'Flight async recovery or review evidence is incomplete';
  end if;
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$validate_flight_consumer_async_order_finalization$;

-- Preserve the original 068/075 trigger functions for every ordinary insert
-- and update. Only the exact flag-gated requires_review -> booked update is
-- routed to the validator above; neither inherited guard becomes broader.
drop trigger flight_orders_immutable_guard on public.flight_orders;
drop trigger flight_orders_transition_guard on public.flight_orders;

create trigger flight_orders_immutable_insert_guard
before insert on public.flight_orders
for each row execute function public.protect_flight_operational_evidence();

create trigger flight_orders_immutable_guard
before update on public.flight_orders
for each row when (not (
  old.status = 'requires_review'
  and new.status = 'booked'
  and new.consumer_flow_version = 1
  and current_setting(
    'app.flight_consumer_async_finalization_authorized', true
  ) = 'true'
)) execute function public.protect_flight_operational_evidence();

create trigger flight_orders_transition_insert_guard
before insert on public.flight_orders
for each row execute function public.validate_flight_order_transition();

create trigger flight_orders_transition_guard
before update of status on public.flight_orders
for each row when (not (
  old.status = 'requires_review'
  and new.status = 'booked'
  and new.consumer_flow_version = 1
  and current_setting(
    'app.flight_consumer_async_finalization_authorized', true
  ) = 'true'
)) execute function public.validate_flight_order_transition();

create trigger flight_orders_async_finalization_guard
before update of status, provider_order_ref_ciphertext,
  provider_order_ref_sha256, provider_created_at, ticketing_deadline_at
on public.flight_orders
for each row when (
  old.status = 'requires_review'
  and new.status = 'booked'
  and new.consumer_flow_version = 1
  and current_setting(
    'app.flight_consumer_async_finalization_authorized', true
  ) = 'true'
) execute function public.validate_flight_consumer_async_order_finalization_v1();

-- Close the lease-completion/evidence-insert crash window. Both existing 076
-- RPCs execute in this function's transaction: any evidence collision rolls
-- the ledger transition back to processing revision 1. A successful return
-- guarantees processed revision 2 and the immutable encrypted GET receipt.
create function public.complete_flight_consumer_duffel_recovery_evidence_v1(
  p_customer_id uuid,
  p_order_id uuid,
  p_ledger_id uuid,
  p_attempt_id uuid,
  p_expected_revision integer,
  p_lease_token_sha256 text,
  p_outcome_sha256 text,
  p_recovery_request_sha256 text,
  p_recovery_authority_receipt_sha256 text,
  p_provider_order_ref_sha256 text,
  p_provider_response_sha256 text,
  p_key_version text,
  p_iv_base64url text,
  p_auth_tag_base64url text,
  p_ciphertext_base64url text,
  p_aad_sha256 text,
  p_ciphertext_sha256 text,
  p_recovery_evidence_receipt_sha256 text,
  p_retention_expires_at timestamptz
)
returns table (
  ledger_id uuid,
  ledger_revision integer,
  ledger_state text,
  evidence_id uuid,
  recovery_evidence_receipt_sha256 text,
  retention_expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $complete_flight_consumer_duffel_recovery_evidence$
declare
  v_ledger public.flight_consumer_webhook_ledger;
  v_completed record;
  v_recorded record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Duffel recovery completion is service-role only';
  end if;
  if p_expected_revision is distinct from 1 then
    raise exception 'Flight Duffel recovery completion requires processing revision 1';
  end if;
  perform 1 from public.flight_orders as flight_order
   where flight_order.id = p_order_id
     and flight_order.customer_id = p_customer_id
   for update;
  if not found then
    raise exception 'Flight Duffel recovery completion order is unavailable';
  end if;
  select * into v_ledger
    from public.flight_consumer_webhook_ledger as ledger
   where ledger.id = p_ledger_id for update;
  if v_ledger.id is null
    or v_ledger.order_id is distinct from p_order_id
    or v_ledger.provider_attempt_id is distinct from p_attempt_id
    or v_ledger.source <> 'duffel'
    or v_ledger.event_type <> 'order.created'
    or v_ledger.processing_lease_token_sha256
      is distinct from p_lease_token_sha256 then
    raise exception 'Flight Duffel recovery completion linkage is invalid';
  end if;
  if v_ledger.state = 'processing' and v_ledger.revision = 1 then
    select completed.* into v_completed
      from public.complete_flight_consumer_webhook_lease_v1(
        p_ledger_id, p_expected_revision, p_lease_token_sha256,
        'processed', p_outcome_sha256
      ) as completed;
  elsif v_ledger.state = 'processed' and v_ledger.revision = 2
    and v_ledger.outcome_sha256 is not distinct from p_outcome_sha256 then
    select v_ledger.id as ledger_id, v_ledger.revision as ledger_revision,
      v_ledger.state as ledger_state into v_completed;
  else
    raise exception 'Flight Duffel recovery completion replay collides';
  end if;
  select recorded.* into v_recorded
    from public.record_flight_consumer_duffel_order_recovery_evidence_v1(
      p_customer_id, p_order_id, p_ledger_id, p_attempt_id,
      p_recovery_request_sha256, p_recovery_authority_receipt_sha256,
      p_provider_order_ref_sha256, p_provider_response_sha256,
      p_key_version, p_iv_base64url, p_auth_tag_base64url,
      p_ciphertext_base64url, p_aad_sha256, p_ciphertext_sha256,
      p_recovery_evidence_receipt_sha256, p_retention_expires_at
    ) as recorded;
  if v_completed.ledger_id is null or v_recorded.evidence_id is null then
    raise exception 'Flight Duffel recovery completion did not converge';
  end if;
  return query select v_completed.ledger_id, v_completed.ledger_revision,
    v_completed.ledger_state, v_recorded.evidence_id,
    v_recorded.recovery_evidence_receipt_sha256,
    v_recorded.retention_expires_at;
end;
$complete_flight_consumer_duffel_recovery_evidence$;

-- A terminal replay does not refetch GET /air/orders/:id. This projection
-- exposes the already-committed evidence receipt (never ciphertext) so the
-- caller can load the immutable envelope through the 076 owner-scoped loader,
-- resume administrator review, or idempotently replay finalization.
create function public.get_flight_consumer_async_duffel_convergence_v1(
  p_customer_id uuid,
  p_order_id uuid,
  p_ledger_id uuid
)
returns table (
  order_id uuid,
  customer_id uuid,
  order_status text,
  execution_scope_sha256 text,
  provider_attempt_id uuid,
  provider_attempt_state text,
  provider_attempt_revision integer,
  ledger_id uuid,
  ledger_state text,
  ledger_revision integer,
  provider_offer_ref_sha256 text,
  provider_order_ref_sha256 text,
  recovery_evidence_receipt_sha256 text,
  recovery_retention_expires_at timestamptz,
  reconciliation_case_id uuid,
  reconciliation_case_status text,
  reconciliation_resolution_code text,
  reconciliation_resolution_actor_type text,
  reconciliation_system_receipt_sha256 text,
  reconciliation_updated_at timestamptz,
  issued_ticket_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $get_flight_consumer_async_duffel_convergence$
declare
  v_order public.flight_orders;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight async Duffel convergence recovery is service-role only';
  end if;
  select * into v_order from public.flight_orders as flight_order
   where flight_order.id = p_order_id
     and flight_order.customer_id = p_customer_id
     and flight_order.consumer_flow_version = 1
     and flight_order.execution_mode = 'test'
     and flight_order.provider_code = 'duffel'
     and flight_order.status in ('order_creating', 'requires_review', 'ticketed')
   for share;
  if not found then return; end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'ticketing'
  );
  return query
  select v_order.id, v_order.customer_id, v_order.status,
    v_order.execution_scope_sha256, attempt.id, attempt.state,
    attempt.revision, ledger.id, ledger.state, ledger.revision,
    ledger.provider_offer_ref_sha256, ledger.provider_order_ref_sha256,
    evidence.recovery_evidence_receipt_sha256,
    evidence.retention_expires_at, reconciliation.id,
    reconciliation.status, reconciliation.resolution_code,
    reconciliation.resolution_actor_type,
    reconciliation.system_resolution_receipt_sha256,
    reconciliation.updated_at,
    (select count(*)::integer
       from public.flight_ticket_documents as document
      where document.order_id = v_order.id
        and document.document_type = 'electronic_ticket'
        and document.status = 'issued')
    from public.flight_consumer_webhook_ledger as ledger
    join public.flight_provider_request_attempts as attempt
      on attempt.id = ledger.provider_attempt_id
     and attempt.order_id = v_order.id
     and attempt.customer_id = v_order.customer_id
     and attempt.consumer_flow_version = 1
     and attempt.operation = 'create_order'
     and attempt.provider_code = 'duffel'
     and attempt.execution_mode = 'test'
     and attempt.execution_scope_sha256 = v_order.execution_scope_sha256
     and attempt.state = 'succeeded' and attempt.revision = 2
     and not attempt.retry_authorized
    left join public.flight_order_recovery_evidence_vault as evidence
      on evidence.ledger_id = ledger.id
     and evidence.attempt_id = attempt.id
     and evidence.order_id = v_order.id
     and evidence.customer_id = v_order.customer_id
     and evidence.execution_scope_sha256 = v_order.execution_scope_sha256
     and evidence.deleted_at is null
    left join lateral (
      select candidate.*
        from public.flight_reconciliation_cases as candidate
       where candidate.order_id = v_order.id
         and candidate.execution_mode = 'test'
         and candidate.execution_scope_sha256 = v_order.execution_scope_sha256
         and candidate.case_type = 'ambiguous_order'
         and candidate.subject_type = 'flight_order'
         and candidate.subject_id = v_order.id
         and candidate.source_status = 'requires_review'
         and candidate.target_status = 'order_creating'
       order by candidate.created_at desc, candidate.id desc
       limit 1
    ) as reconciliation on true
   where ledger.id = p_ledger_id
     and ledger.source = 'duffel'
     and ledger.event_type = 'order.created'
     and ledger.execution_mode = 'test'
     and ledger.execution_scope_sha256 = v_order.execution_scope_sha256
     and ledger.order_id = v_order.id
     and ledger.provider_live_mode is false
     and (
       (ledger.state = 'processing' and ledger.revision = 1)
       or (ledger.state = 'processed' and ledger.revision = 2)
     );
end;
$get_flight_consumer_async_duffel_convergence$;

create function public.finalize_flight_consumer_async_duffel_order_v1(
  p_customer_id uuid,
  p_order_id uuid,
  p_ledger_id uuid,
  p_recovery_evidence_receipt_sha256 text,
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
  issued_ticket_count integer,
  reconciliation_case_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $finalize_flight_consumer_async_duffel_order$
declare
  v_order public.flight_orders;
  v_attempt public.flight_provider_request_attempts;
  v_control public.flight_runtime_controls;
  v_ledger public.flight_consumer_webhook_ledger;
  v_payment public.flight_payments;
  v_offer public.flight_offers;
  v_offer_evidence public.flight_offer_evidence_vault;
  v_recovery public.flight_order_recovery_evidence_vault;
  v_case public.flight_reconciliation_cases;
  v_binding jsonb;
  v_document jsonb;
  v_passenger public.flight_passenger_refs;
  v_ticket public.flight_ticket_documents;
  v_expected integer;
  v_issued integer;
  v_target_sha256 text;
  v_system_resolution_receipt_sha256 text;
  v_system_resolution_evidence_sha256 text;
  v_canonical_passenger_bindings jsonb;
  v_canonical_ticket_documents jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight async Duffel finalization is service-role only';
  end if;
  if p_recovery_evidence_receipt_sha256 is null
    or p_recovery_evidence_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_provider_order_ref_ciphertext is null
    or p_provider_order_ref_ciphertext
      !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,8176}$'
    or p_provider_order_ref_sha256 is null
    or p_provider_order_ref_sha256 !~ '^[0-9a-f]{64}$'
    or p_provider_created_at is null
    or p_ticketing_deadline_at is null
    or jsonb_typeof(p_passenger_bindings) <> 'array'
    or jsonb_typeof(p_ticket_documents) <> 'array' then
    raise exception 'Flight async Duffel finalization envelope is invalid';
  end if;

  -- Fixed lock order: order -> provider attempt -> runtime control -> webhook
  -- ledger -> payment -> offer/evidence/review -> passengers/tickets.
  select * into v_order from public.flight_orders as flight_order
   where flight_order.id = p_order_id
     and flight_order.customer_id = p_customer_id
   for update;
  if v_order.id is null or v_order.consumer_flow_version <> 1
    or v_order.execution_mode <> 'test' or v_order.provider_code <> 'duffel'
    or v_order.status not in ('requires_review', 'ticketed') then
    raise exception 'Flight async Duffel order is unavailable';
  end if;
  select * into v_attempt
    from public.flight_provider_request_attempts as attempt
   where attempt.order_id = v_order.id
     and attempt.consumer_flow_version = 1
     and attempt.operation = 'create_order'
   for update;
  select * into v_control from public.flight_runtime_controls
   where control_key = 'global' for update;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'ticketing'
  );
  select * into v_ledger
    from public.flight_consumer_webhook_ledger as ledger
   where ledger.id = p_ledger_id for share;
  select * into v_payment
    from public.flight_payments as payment
   where payment.id = v_ledger.payment_id
     and payment.order_id = v_order.id for share;
  select * into v_offer
    from public.flight_offers as offer
   where offer.id = v_order.offer_id
     and offer.search_id = v_order.search_id for share;
  select * into v_offer_evidence
    from public.flight_offer_evidence_vault as evidence
   where evidence.receipt_sha256 = v_attempt.offer_evidence_receipt_sha256
   for share;
  select * into v_recovery
    from public.flight_order_recovery_evidence_vault as evidence
   where evidence.ledger_id = p_ledger_id
     and evidence.recovery_evidence_receipt_sha256
       = p_recovery_evidence_receipt_sha256
   for share;
  v_target_sha256 := encode(extensions.digest(convert_to(jsonb_build_object(
    'domain', 'iratepilot.flight.reconciliation.target.v1',
    'subject_type', 'flight_order', 'subject_id', v_order.id::text,
    'target_status', 'order_creating', 'execution_mode', v_order.execution_mode,
    'execution_scope_sha256', v_order.execution_scope_sha256
  )::text, 'UTF8'), 'sha256'), 'hex');
  select reconciliation.* into v_case
    from public.flight_reconciliation_cases as reconciliation
    left join public.profiles as resolver on resolver.id = reconciliation.resolved_by
   where reconciliation.order_id = v_order.id
     and reconciliation.provider_code = 'duffel'
     and reconciliation.execution_mode = 'test'
     and reconciliation.execution_scope_sha256 = v_order.execution_scope_sha256
     and reconciliation.case_type = 'ambiguous_order'
     and reconciliation.subject_type = 'flight_order'
     and reconciliation.subject_id = v_order.id
     and reconciliation.source_status = 'requires_review'
     and reconciliation.target_status = 'order_creating'
     and reconciliation.target_state_sha256 = v_target_sha256
     and (
       (reconciliation.status in ('open', 'investigating', 'blocked')
         and reconciliation.resolution_code is null
         and reconciliation.resolution_evidence_sha256 is null
         and reconciliation.resolved_by is null
         and reconciliation.resolved_at is null
         and reconciliation.resolution_actor_type = 'administrator'
         and reconciliation.system_resolution_receipt_sha256 is null)
       or (reconciliation.status = 'resolved'
         and reconciliation.resolution_code = 'provider_state_confirmed'
         and reconciliation.resolution_evidence_sha256 is not null
         and reconciliation.resolved_at is not null
         and (
           (reconciliation.resolution_actor_type = 'administrator'
             and reconciliation.resolved_by is not null
             and reconciliation.system_resolution_receipt_sha256 is null
             and resolver.role = 'admin')
           or (reconciliation.resolution_actor_type = 'system'
             and reconciliation.resolved_by is null
             and reconciliation.system_resolution_receipt_sha256 is not null)
         ))
     )
   order by reconciliation.resolved_at desc, reconciliation.id desc
   limit 1
   for update of reconciliation;
  perform 1 from public.flight_passenger_refs as passenger
   where passenger.order_id = v_order.id
   order by passenger.traveler_sequence, passenger.id
   for update;
  perform 1 from public.flight_ticket_documents as document
   where document.order_id = v_order.id
   order by document.passenger_ref_id, document.id
   for share;

  if v_attempt.id is null
    or v_attempt.customer_id is distinct from v_order.customer_id
    or v_attempt.search_id is distinct from v_order.search_id
    or v_attempt.offer_id is distinct from v_order.offer_id
    or v_attempt.order_id is distinct from v_order.id
    or v_attempt.provider_code <> 'duffel'
    or v_attempt.execution_mode <> 'test'
    or v_attempt.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_attempt.state <> 'succeeded' or v_attempt.revision <> 2
    or v_attempt.retry_authorized
    or v_ledger.id is null or v_ledger.source <> 'duffel'
    or v_ledger.event_type <> 'order.created'
    or v_ledger.execution_mode <> 'test'
    or v_ledger.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_ledger.order_id is distinct from v_order.id
    or v_ledger.payment_id is distinct from v_payment.id
    or v_ledger.provider_attempt_id is distinct from v_attempt.id
    or v_ledger.provider_offer_ref_sha256
      is distinct from v_offer.provider_offer_ref_sha256
    or v_ledger.provider_order_ref_sha256
      is distinct from p_provider_order_ref_sha256
    or v_ledger.provider_live_mode is distinct from false
    or v_ledger.state <> 'processed' or v_ledger.revision <> 2
    or v_payment.id is null or v_payment.processor_code <> 'stripe'
    or v_payment.execution_mode <> 'test'
    or v_payment.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_payment.currency <> v_order.currency
    or v_payment.status <> 'captured'
    or v_payment.authorized_cents <> v_order.total_cents
    or v_payment.captured_cents <> v_order.total_cents
    or v_payment.refunded_cents <> 0
    or v_offer.id is null or v_offer.provider_code <> 'duffel'
    or v_offer.execution_mode <> 'test'
    or v_offer.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_offer_evidence.id is null
    or v_offer_evidence.customer_id is distinct from v_order.customer_id
    or v_offer_evidence.search_id is distinct from v_order.search_id
    or v_offer_evidence.offer_id is distinct from v_order.offer_id
    or v_offer_evidence.reprice_receipt_id
      is distinct from v_order.reprice_receipt_id
    or v_offer_evidence.execution_mode <> 'test'
    or v_offer_evidence.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_offer_evidence.stage <> 'refreshed'
    or v_offer_evidence.provider_offer_ref_sha256
      is distinct from v_offer.provider_offer_ref_sha256
    or v_offer_evidence.deleted_at is not null
    or v_recovery.id is null
    or v_recovery.attempt_id is distinct from v_attempt.id
    or v_recovery.order_id is distinct from v_order.id
    or v_recovery.customer_id is distinct from v_order.customer_id
    or v_recovery.execution_mode <> 'test'
    or v_recovery.execution_scope_sha256
      is distinct from v_order.execution_scope_sha256
    or v_recovery.provider_offer_ref_sha256
      is distinct from v_offer.provider_offer_ref_sha256
    or v_recovery.provider_order_ref_sha256
      is distinct from p_provider_order_ref_sha256
    or v_recovery.webhook_verification_receipt_sha256
      is distinct from v_ledger.verification_receipt_sha256
    or v_recovery.deleted_at is not null
    or v_case.id is null then
    raise exception 'Flight async Duffel convergence evidence is incomplete';
  end if;

  select search.adult_count + search.child_count
      + search.infant_in_seat_count + search.infant_on_lap_count
    into v_expected
    from public.flight_searches as search
   where search.id = v_order.search_id
     and search.customer_id = v_order.customer_id
     and search.execution_mode = 'test'
     and search.execution_scope_sha256 = v_order.execution_scope_sha256
   for share;
  if v_expected is null
    or jsonb_array_length(p_passenger_bindings) <> v_expected
    or jsonb_array_length(p_ticket_documents) <> v_expected
    or (select count(distinct (binding.value ->> 'passenger_ref_id')::uuid)
          from jsonb_array_elements(p_passenger_bindings) as binding(value))
       <> v_expected
    or (select count(distinct (document.value ->> 'passenger_ref_id')::uuid)
          from jsonb_array_elements(p_ticket_documents) as document(value))
       <> v_expected then
    raise exception 'Flight async passenger or ticket evidence is incomplete';
  end if;

  for v_binding in select value from jsonb_array_elements(p_passenger_bindings)
  loop
    if not public.flight_jsonb_has_exact_keys_v1(v_binding, array[
      'passenger_ref_id', 'provider_passenger_ref_ciphertext',
      'provider_passenger_ref_sha256'
    ])
      or coalesce(v_binding ->> 'provider_passenger_ref_ciphertext', '')
        !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$'
      or coalesce(v_binding ->> 'provider_passenger_ref_sha256', '')
        !~ '^[0-9a-f]{64}$' then
      raise exception 'Flight async passenger binding is invalid';
    end if;
    select * into v_passenger
      from public.flight_passenger_refs as passenger
     where passenger.id = (v_binding ->> 'passenger_ref_id')::uuid
       and passenger.order_id = v_order.id
       and passenger.execution_mode = 'test'
       and passenger.execution_scope_sha256 = v_order.execution_scope_sha256;
    if v_passenger.id is null then
      raise exception 'Flight async passenger binding is not owner scoped';
    end if;
    if v_order.status = 'ticketed' and (
      v_passenger.provider_passenger_ref_sha256
        is distinct from v_binding ->> 'provider_passenger_ref_sha256'
    ) then
      raise exception 'Flight async passenger replay collides';
    elsif v_order.status = 'requires_review' and (
      v_passenger.provider_passenger_ref_ciphertext is not null
      or v_passenger.provider_passenger_ref_sha256 is not null
    ) then
      raise exception 'Flight async passenger identity was already bound';
    end if;
  end loop;

  for v_document in select value from jsonb_array_elements(p_ticket_documents)
  loop
    if not public.flight_jsonb_has_exact_keys_v1(v_document, array[
      'passenger_ref_id', 'document_ref_ciphertext',
      'document_ref_sha256', 'issuing_carrier'
    ])
      or coalesce(v_document ->> 'document_ref_ciphertext', '')
        !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$'
      or coalesce(v_document ->> 'document_ref_sha256', '')
        !~ '^[0-9a-f]{64}$'
      or upper(coalesce(v_document ->> 'issuing_carrier', ''))
        is distinct from v_offer.validating_carrier then
      raise exception 'Flight async ticket document is invalid';
    end if;
    if not exists (
      select 1 from public.flight_passenger_refs as passenger
       where passenger.id = (v_document ->> 'passenger_ref_id')::uuid
         and passenger.order_id = v_order.id
    ) then
      raise exception 'Flight async ticket passenger is not owner scoped';
    end if;
    if v_order.status = 'ticketed' then
      select * into v_ticket
        from public.flight_ticket_documents as document
       where document.order_id = v_order.id
         and document.passenger_ref_id
           = (v_document ->> 'passenger_ref_id')::uuid
         and document.document_type = 'electronic_ticket'
         and document.status = 'issued';
      if v_ticket.id is null
        or v_ticket.document_ref_sha256
          is distinct from v_document ->> 'document_ref_sha256'
        or v_ticket.issuing_carrier
          is distinct from upper(v_document ->> 'issuing_carrier') then
        raise exception 'Flight async ticket replay collides';
      end if;
    end if;
  end loop;

  select jsonb_agg(jsonb_build_object(
      'passenger_ref_id', binding.value ->> 'passenger_ref_id',
      'provider_passenger_ref_sha256',
        binding.value ->> 'provider_passenger_ref_sha256'
    ) order by binding.value ->> 'passenger_ref_id')
    into v_canonical_passenger_bindings
    from jsonb_array_elements(p_passenger_bindings) as binding(value);
  select jsonb_agg(jsonb_build_object(
      'passenger_ref_id', document.value ->> 'passenger_ref_id',
      'document_ref_sha256', document.value ->> 'document_ref_sha256',
      'issuing_carrier', upper(document.value ->> 'issuing_carrier')
    ) order by document.value ->> 'passenger_ref_id')
    into v_canonical_ticket_documents
    from jsonb_array_elements(p_ticket_documents) as document(value);
  v_system_resolution_receipt_sha256 := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'domain', 'iratepilot.flight.consumer-preview.async-system-resolution-receipt.v1',
      'case_id', v_case.id::text,
      'order_id', v_order.id::text,
      'attempt_id', v_attempt.id::text,
      'ledger_id', v_ledger.id::text,
      'recovery_evidence_receipt_sha256',
        v_recovery.recovery_evidence_receipt_sha256,
      'provider_response_sha256', v_recovery.provider_response_sha256,
      'provider_order_ref_sha256', p_provider_order_ref_sha256,
      'provider_created_at', p_provider_created_at,
      'ticketing_deadline_at', p_ticketing_deadline_at,
      'passenger_bindings', v_canonical_passenger_bindings,
      'ticket_documents', v_canonical_ticket_documents
    )::text, 'UTF8'
  ), 'sha256'), 'hex');
  v_system_resolution_evidence_sha256 := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'domain', 'iratepilot.flight.consumer-preview.async-system-resolution-evidence.v1',
      'case_id', v_case.id::text,
      'system_resolution_receipt_sha256',
        v_system_resolution_receipt_sha256,
      'webhook_verification_receipt_sha256',
        v_ledger.verification_receipt_sha256,
      'recovery_authority_receipt_sha256',
        v_recovery.recovery_authority_receipt_sha256
    )::text, 'UTF8'
  ), 'sha256'), 'hex');

  if v_case.status in ('open', 'investigating', 'blocked') then
    if v_order.status <> 'requires_review' then
      raise exception 'Flight async system review cannot resolve a terminal order';
    end if;
    perform set_config(
      'app.flight_consumer_async_system_resolution_authorized', 'true', true
    );
    update public.flight_reconciliation_cases
       set status = 'resolved',
           resolution_code = 'provider_state_confirmed',
           resolution_evidence_sha256 = v_system_resolution_evidence_sha256,
           resolved_by = null,
           resolution_actor_type = 'system',
           system_resolution_receipt_sha256 =
             v_system_resolution_receipt_sha256
     where id = v_case.id
       and status = v_case.status
       and resolution_code is null
       and resolution_evidence_sha256 is null
       and resolved_by is null
       and resolved_at is null
       and resolution_actor_type = 'administrator'
       and system_resolution_receipt_sha256 is null
    returning * into v_case;
    if not found then
      raise exception 'Flight async system review resolution CAS failed';
    end if;
  elsif v_case.resolution_actor_type = 'system'
    and (
      v_case.system_resolution_receipt_sha256
        is distinct from v_system_resolution_receipt_sha256
      or v_case.resolution_evidence_sha256
        is distinct from v_system_resolution_evidence_sha256
    ) then
    raise exception 'Flight async system review replay collides';
  end if;

  if v_order.status = 'ticketed' then
    if v_order.provider_order_ref_sha256
        is distinct from p_provider_order_ref_sha256
      or v_order.provider_created_at is distinct from p_provider_created_at
      or v_order.ticketing_deadline_at is distinct from p_ticketing_deadline_at then
      raise exception 'Flight async finalization replay collides';
    end if;
    select count(*)::integer into v_issued
      from public.flight_ticket_documents as document
     where document.order_id = v_order.id
       and document.document_type = 'electronic_ticket'
       and document.status = 'issued';
    if v_issued <> v_expected then
      raise exception 'Flight async finalization replay ticket count collides';
    end if;
    return query select v_order.id, v_order.status, v_issued, v_case.id;
    return;
  end if;

  if v_order.provider_order_ref_ciphertext is not null
    or v_order.provider_order_ref_sha256 is not null
    or v_order.provider_created_at is not null
    or v_order.ticketing_deadline_at is not null
    or v_offer_evidence.retention_expires_at <= clock_timestamp()
    or v_recovery.retention_expires_at <= clock_timestamp()
    or p_provider_created_at > clock_timestamp() + interval '5 minutes'
    or p_ticketing_deadline_at <= clock_timestamp()
    or p_ticketing_deadline_at <= p_provider_created_at
    or exists (
      select 1 from public.flight_ticket_documents as document
       where document.order_id = v_order.id
    ) then
    raise exception 'Flight async first finalization evidence is stale or colliding';
  end if;

  perform set_config(
    'app.flight_consumer_async_finalization_authorized', 'true', true
  );
  update public.flight_orders
     set provider_order_ref_ciphertext = p_provider_order_ref_ciphertext,
         provider_order_ref_sha256 = p_provider_order_ref_sha256,
         provider_created_at = p_provider_created_at,
         ticketing_deadline_at = p_ticketing_deadline_at,
         status = 'booked'
   where id = v_order.id and status = 'requires_review'
  returning * into v_order;
  if not found then
    raise exception 'Flight async reviewed-booking transition CAS failed';
  end if;

  for v_binding in select value from jsonb_array_elements(p_passenger_bindings)
  loop
    update public.flight_passenger_refs
       set provider_passenger_ref_ciphertext =
             v_binding ->> 'provider_passenger_ref_ciphertext',
           provider_passenger_ref_sha256 =
             v_binding ->> 'provider_passenger_ref_sha256'
     where id = (v_binding ->> 'passenger_ref_id')::uuid
       and order_id = v_order.id
       and provider_passenger_ref_ciphertext is null
       and provider_passenger_ref_sha256 is null
    returning * into v_passenger;
    if not found then
      raise exception 'Flight async provider passenger binding CAS failed';
    end if;
  end loop;
  if exists (
    select 1 from public.flight_passenger_refs as passenger
     where passenger.order_id = v_order.id
       and (
         passenger.provider_passenger_ref_ciphertext is null
         or passenger.provider_passenger_ref_sha256 is null
       )
  ) then
    raise exception 'Every async flight passenger requires one provider binding';
  end if;

  update public.flight_orders set status = 'ticketing_pending'
   where id = v_order.id and status = 'booked'
  returning * into v_order;
  if not found then raise exception 'Flight async ticketing transition CAS failed'; end if;

  for v_document in select value from jsonb_array_elements(p_ticket_documents)
  loop
    insert into public.flight_ticket_documents (
      order_id, passenger_ref_id, execution_mode, execution_scope_sha256,
      document_type, issuing_carrier, status
    ) values (
      v_order.id, (v_document ->> 'passenger_ref_id')::uuid,
      'test', v_order.execution_scope_sha256, 'electronic_ticket',
      upper(v_document ->> 'issuing_carrier'), 'pending'
    ) returning * into v_ticket;
    update public.flight_ticket_documents
       set document_ref_ciphertext = v_document ->> 'document_ref_ciphertext',
           document_ref_sha256 = v_document ->> 'document_ref_sha256',
           status = 'issued'
     where id = v_ticket.id and status = 'pending'
    returning * into v_ticket;
    if not found then raise exception 'Flight async ticket issuance CAS failed'; end if;
  end loop;
  select count(*)::integer into v_issued
    from public.flight_ticket_documents as document
   where document.order_id = v_order.id
     and document.document_type = 'electronic_ticket'
     and document.status = 'issued';
  if v_issued <> v_expected or exists (
    select 1 from public.flight_passenger_refs as passenger
     where passenger.order_id = v_order.id
       and (
         select count(*) from public.flight_ticket_documents as document
          where document.order_id = v_order.id
            and document.passenger_ref_id = passenger.id
            and document.document_type = 'electronic_ticket'
            and document.status = 'issued'
       ) <> 1
  ) then
    raise exception 'Exactly one async Duffel e-ticket is required per passenger';
  end if;
  update public.flight_orders set status = 'ticketed'
   where id = v_order.id and status = 'ticketing_pending'
  returning * into v_order;
  if not found then raise exception 'Flight async ticketed transition CAS failed'; end if;
  update public.flight_orders
     set updated_at = greatest(clock_timestamp(), updated_at + interval '1 microsecond')
   where id = v_order.id returning * into v_order;
  return query select v_order.id, v_order.status, v_issued, v_case.id;
end;
$finalize_flight_consumer_async_duffel_order$;

revoke all on function public.validate_flight_consumer_async_order_finalization_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.validate_flight_consumer_async_system_resolution_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.complete_flight_consumer_duffel_recovery_evidence_v1(
  uuid, uuid, uuid, uuid, integer, text, text, text, text, text, text,
  text, text, text, text, text, text, text, timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.get_flight_consumer_async_duffel_convergence_v1(
  uuid, uuid, uuid
) from public, anon, authenticated, service_role;
revoke all on function public.finalize_flight_consumer_async_duffel_order_v1(
  uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, jsonb, jsonb
) from public, anon, authenticated, service_role;

grant execute on function public.finalize_flight_consumer_async_duffel_order_v1(
  uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, jsonb, jsonb
) to service_role;
grant execute on function public.complete_flight_consumer_duffel_recovery_evidence_v1(
  uuid, uuid, uuid, uuid, integer, text, text, text, text, text, text,
  text, text, text, text, text, text, text, timestamptz
) to service_role;
grant execute on function public.get_flight_consumer_async_duffel_convergence_v1(
  uuid, uuid, uuid
) to service_role;

comment on function public.finalize_flight_consumer_async_duffel_order_v1(
  uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, jsonb, jsonb
) is
  'No-redispatch Consumer Preview convergence: atomically finalizes one administrator-reviewed Duffel test order from processed order.created and encrypted GET-order recovery evidence.';
comment on function public.complete_flight_consumer_duffel_recovery_evidence_v1(
  uuid, uuid, uuid, uuid, integer, text, text, text, text, text, text,
  text, text, text, text, text, text, text, timestamptz
) is
  'Atomically completes a token-fenced Duffel order.created lease and stores/replays its encrypted GET-order recovery evidence; neither commit can exist alone.';
comment on function public.get_flight_consumer_async_duffel_convergence_v1(
  uuid, uuid, uuid
) is
  'Owner-scoped terminal replay metadata exposing the immutable recovery receipt and review state without ciphertext, plaintext provider identifiers, or redispatch authority.';

commit;

begin;

-- PostgreSQL POSIX regular-expression repetition bounds are limited to 255.
-- The inherited ciphertext checks used bounds as large as 8176, so evaluating
-- them raised SQLSTATE 2201B before valid encrypted provider evidence could be
-- persisted. Keep the intended total-length ceilings with an unbounded
-- base64url shape check plus an explicit suffix-length check.
--
-- This forward repair is installed only while every flight capability is
-- relocked. It does not change runtime controls, enable provider traffic, move
-- money, or authorize Production.
do $flight_consumer_preview_085_dependencies$
declare
  v_complete_source text;
  v_fail_source text;
  v_validator_source text;
  v_finalizer_source text;
  v_settlement_constraint_definition text;
  v_settlement_constraint_validated boolean;
  v_legacy_count integer;
  v_legacy_oid oid;
  v_target_count integer;
  v_repair record;
begin
  if to_regclass('public.flight_runtime_controls') is null
    or to_regclass('public.flight_offers') is null
    or to_regclass('public.flight_orders') is null
    or to_regclass('public.flight_passenger_refs') is null
    or to_regclass('public.flight_ticket_documents') is null
    or to_regclass('public.flight_payments') is null
    or to_regclass('public.flight_service_requests') is null
    or to_regclass('public.flight_payment_operation_attempts') is null
    or to_regclass('public.flight_payment_refund_evidence') is null
    or to_regprocedure(
      'public.complete_flight_consumer_search_v1(uuid,integer,jsonb)'
    ) is null
    or to_regprocedure(
      'public.fail_flight_consumer_search_v1(uuid,integer)'
    ) is null
    or to_regprocedure(
      'public.validate_flight_consumer_async_order_finalization_v1()'
    ) is null
    or to_regprocedure(
      'public.finalize_flight_consumer_async_duffel_order_v1(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,jsonb,jsonb)'
    ) is null then
    raise exception 'Flight Consumer Preview ciphertext repair requires migrations 068 through 084';
  end if;

  select lower(pg_catalog.pg_get_constraintdef(constraint_record.oid)),
         constraint_record.convalidated
    into v_settlement_constraint_definition, v_settlement_constraint_validated
    from pg_catalog.pg_constraint as constraint_record
   where constraint_record.conrelid = 'public.flight_runtime_controls'::regclass
     and constraint_record.conname =
       'flight_runtime_controls_provider_settlement_dependency_check'
     and constraint_record.contype = 'c';
  if v_settlement_constraint_definition is null
    or not coalesce(v_settlement_constraint_validated, false)
    or position(
      'bound_provider_settlement_processor_code is not null'
      in v_settlement_constraint_definition
    ) = 0
    or position(
      'execution_kill_switch_engaged' in v_settlement_constraint_definition
    ) = 0
    or position(
      'not synthetic_execution_enabled' in v_settlement_constraint_definition
    ) = 0
    or position(
      'not provider_sandbox_traffic_enabled'
      in v_settlement_constraint_definition
    ) = 0
    or position(
      'not provider_live_traffic_enabled'
      in v_settlement_constraint_definition
    ) = 0
    or position('not shopping_enabled' in v_settlement_constraint_definition) = 0
    or position('not order_enabled' in v_settlement_constraint_definition) = 0
    or position('not payment_enabled' in v_settlement_constraint_definition) = 0
    or position('not ticketing_enabled' in v_settlement_constraint_definition) = 0
    or position('not servicing_enabled' in v_settlement_constraint_definition) = 0
    or position(
      'not provider_events_enabled' in v_settlement_constraint_definition
    ) = 0
    or position(
      'not production_release_enabled' in v_settlement_constraint_definition
    ) = 0 then
    raise exception 'Flight Consumer Preview ciphertext repair requires validated migration 083';
  end if;

  select routine.prosrc into v_complete_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.complete_flight_consumer_search_v1(uuid,integer,jsonb)'
   );
  select routine.prosrc into v_fail_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.fail_flight_consumer_search_v1(uuid,integer)'
   );
  if v_complete_source is null
    or position('#variable_conflict error' in v_complete_source) = 0
    or position(
      'Flight local offer identity is malformed' in v_complete_source
    ) = 0
    or position(
      'Flight local offer identity must equal its durable UUID'
      in v_complete_source
    ) > 0
    or v_fail_source is null
    or position('#variable_conflict error' in v_fail_source) = 0
    or position('public.flight_offers as offer' in v_fail_source) = 0
    or position('where offer.search_id = v_search.id' in v_fail_source) = 0 then
    raise exception 'Flight Consumer Preview ciphertext repair requires migration 084';
  end if;

  select routine.prosrc into v_validator_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.validate_flight_consumer_async_order_finalization_v1()'
   );
  select routine.prosrc into v_finalizer_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.finalize_flight_consumer_async_duffel_order_v1(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,jsonb,jsonb)'
   );
  if v_validator_source is null
    or position(
      '!~ ''^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,8176}$'''
      in v_validator_source
    ) = 0
    or v_finalizer_source is null
    or (
      char_length(v_finalizer_source)
      - char_length(replace(
          v_finalizer_source,
          '!~ ''^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,8176}$''',
          ''
        ))
    ) / char_length(
      '!~ ''^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,8176}$'''
    ) <> 1
    or (
      char_length(v_finalizer_source)
      - char_length(replace(
          v_finalizer_source,
          '!~ ''^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$''',
          ''
        ))
    ) / char_length(
      '!~ ''^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$'''
    ) <> 2 then
    raise exception 'Flight Consumer Preview ciphertext function predecessor has drifted';
  end if;

  for v_repair in
    select * from (values
      ('flight_offers', 'provider_offer_ref_ciphertext', '{16,8176}',
       'flight_offers_provider_offer_ref_ciphertext_check'),
      ('flight_orders', 'provider_order_ref_ciphertext', '{16,8176}',
       'flight_orders_provider_order_ref_ciphertext_check'),
      ('flight_passenger_refs', 'provider_passenger_ref_ciphertext', '{16,4080}',
       'flight_passenger_refs_provider_ref_ciphertext_check'),
      ('flight_ticket_documents', 'document_ref_ciphertext', '{16,4080}',
       'flight_ticket_documents_document_ref_ciphertext_check'),
      ('flight_payments', 'processor_reference_ciphertext', '{16,4080}',
       'flight_payments_processor_reference_ciphertext_check'),
      ('flight_service_requests', 'provider_case_ref_ciphertext', '{16,4080}',
       'flight_service_requests_provider_case_ref_ciphertext_check'),
      ('flight_payment_operation_attempts', 'processor_object_ref_ciphertext',
       '{16,4080}', 'flight_payment_operation_attempts_processor_ref_check'),
      ('flight_payment_refund_evidence', 'refund_reference_ciphertext',
       '{16,4080}', 'flight_payment_refund_evidence_reference_check')
    ) as repair(
      relation_name, column_name, legacy_bound, target_constraint_name
    )
  loop
    select count(*)::integer,
           (array_agg(
             constraint_record.oid order by constraint_record.oid
           ))[1]
      into v_legacy_count, v_legacy_oid
      from pg_catalog.pg_constraint as constraint_record
     where constraint_record.conrelid = pg_catalog.to_regclass(
       pg_catalog.format('public.%I', v_repair.relation_name)
     )
       and constraint_record.contype = 'c'
       and position(
         v_repair.column_name
         in lower(pg_catalog.pg_get_constraintdef(constraint_record.oid))
       ) > 0
       and position(
         v_repair.legacy_bound
         in lower(pg_catalog.pg_get_constraintdef(constraint_record.oid))
       ) > 0;
    select count(*)::integer into v_target_count
      from pg_catalog.pg_constraint as constraint_record
     where constraint_record.conrelid = pg_catalog.to_regclass(
       pg_catalog.format('public.%I', v_repair.relation_name)
     )
       and constraint_record.conname = v_repair.target_constraint_name
       and constraint_record.oid is distinct from v_legacy_oid;
    if v_legacy_count <> 1 or v_target_count <> 0 then
      raise exception
        'Flight Consumer Preview ciphertext constraint predecessor drifted for %.% (legacy %, target %)',
        v_repair.relation_name, v_repair.column_name,
        v_legacy_count, v_target_count;
    end if;
  end loop;
end;
$flight_consumer_preview_085_dependencies$;

do $flight_consumer_preview_085_relocked_precondition$
declare
  v_safe_count integer;
begin
  select count(*)::integer into v_safe_count
    from public.flight_runtime_controls as control
   where control.control_key = 'global'
     and control.execution_kill_switch_engaged
     and not control.synthetic_execution_enabled
     and not control.provider_sandbox_traffic_enabled
     and not control.provider_live_traffic_enabled
     and not control.shopping_enabled
     and not control.order_enabled
     and not control.payment_enabled
     and not control.ticketing_enabled
     and not control.servicing_enabled
     and not control.provider_events_enabled
     and not control.production_release_enabled;
  if v_safe_count <> 1 then
    raise exception 'Flight Consumer Preview migration 085 requires relock before repair';
  end if;
end;
$flight_consumer_preview_085_relocked_precondition$;

-- Constraint names generated by the historical CREATE TABLE statements are
-- not stable enough to address directly. The dependency block proved there is
-- exactly one legacy check for each column; acquire and hold each table lock
-- while dropping precisely that check.
do $flight_consumer_preview_085_drop_legacy_constraints$
declare
  v_legacy_count integer;
  v_legacy_name name;
  v_repair record;
begin
  for v_repair in
    select * from (values
      ('flight_offers', 'provider_offer_ref_ciphertext', '{16,8176}'),
      ('flight_orders', 'provider_order_ref_ciphertext', '{16,8176}'),
      ('flight_passenger_refs', 'provider_passenger_ref_ciphertext', '{16,4080}'),
      ('flight_ticket_documents', 'document_ref_ciphertext', '{16,4080}'),
      ('flight_payments', 'processor_reference_ciphertext', '{16,4080}'),
      ('flight_service_requests', 'provider_case_ref_ciphertext', '{16,4080}'),
      ('flight_payment_operation_attempts', 'processor_object_ref_ciphertext',
       '{16,4080}'),
      ('flight_payment_refund_evidence', 'refund_reference_ciphertext',
       '{16,4080}')
    ) as repair(relation_name, column_name, legacy_bound)
  loop
    select count(*)::integer,
           min(constraint_record.conname::text)::name
      into v_legacy_count, v_legacy_name
      from pg_catalog.pg_constraint as constraint_record
     where constraint_record.conrelid = pg_catalog.to_regclass(
       pg_catalog.format('public.%I', v_repair.relation_name)
     )
       and constraint_record.contype = 'c'
       and position(
         v_repair.column_name
         in lower(pg_catalog.pg_get_constraintdef(constraint_record.oid))
       ) > 0
       and position(
         v_repair.legacy_bound
         in lower(pg_catalog.pg_get_constraintdef(constraint_record.oid))
       ) > 0;
    if v_legacy_count <> 1 or v_legacy_name is null then
      raise exception
        'Flight Consumer Preview ciphertext constraint changed before repair for %.%',
        v_repair.relation_name, v_repair.column_name;
    end if;
    execute pg_catalog.format(
      'alter table public.%I drop constraint %I',
      v_repair.relation_name, v_legacy_name
    );
  end loop;
end;
$flight_consumer_preview_085_drop_legacy_constraints$;

alter table public.flight_offers
  add constraint flight_offers_provider_offer_ref_ciphertext_check
  check (
    (execution_mode = 'synthetic' and provider_offer_ref_ciphertext is null)
    or (
      execution_mode in ('test', 'live')
      and provider_offer_ref_ciphertext is not null
      and provider_offer_ref_ciphertext
        ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
      and char_length(split_part(provider_offer_ref_ciphertext, ':', 3))
        between 16 and 8176
    )
  ) not valid;
alter table public.flight_offers validate constraint
  flight_offers_provider_offer_ref_ciphertext_check;

alter table public.flight_orders
  add constraint flight_orders_provider_order_ref_ciphertext_check
  check (
    (provider_order_ref_ciphertext is null and provider_order_ref_sha256 is null)
    or (
      execution_mode <> 'synthetic'
      and provider_order_ref_ciphertext is not null
      and provider_order_ref_ciphertext
        ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
      and char_length(split_part(provider_order_ref_ciphertext, ':', 3))
        between 16 and 8176
      and provider_order_ref_sha256 is not null
    )
  ) not valid;
alter table public.flight_orders validate constraint
  flight_orders_provider_order_ref_ciphertext_check;

alter table public.flight_passenger_refs
  add constraint flight_passenger_refs_provider_ref_ciphertext_check
  check (
    (provider_passenger_ref_ciphertext is null
      and provider_passenger_ref_sha256 is null)
    or (
      provider_passenger_ref_ciphertext is not null
      and provider_passenger_ref_ciphertext
        ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
      and char_length(split_part(provider_passenger_ref_ciphertext, ':', 3))
        between 16 and 4080
      and provider_passenger_ref_sha256 is not null
    )
  ) not valid;
alter table public.flight_passenger_refs validate constraint
  flight_passenger_refs_provider_ref_ciphertext_check;

alter table public.flight_ticket_documents
  add constraint flight_ticket_documents_document_ref_ciphertext_check
  check (
    (status in ('pending', 'failed')
      and document_ref_ciphertext is null and document_ref_sha256 is null)
    or (
      status in ('issued', 'voided', 'refunded')
      and document_ref_ciphertext is not null
      and document_ref_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
      and char_length(split_part(document_ref_ciphertext, ':', 3))
        between 16 and 4080
      and document_ref_sha256 is not null
    )
  ) not valid;
alter table public.flight_ticket_documents validate constraint
  flight_ticket_documents_document_ref_ciphertext_check;

alter table public.flight_payments
  add constraint flight_payments_processor_reference_ciphertext_check
  check (
    processor_reference_ciphertext is not null
    and processor_reference_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
    and char_length(split_part(processor_reference_ciphertext, ':', 3))
      between 16 and 4080
  ) not valid;
alter table public.flight_payments validate constraint
  flight_payments_processor_reference_ciphertext_check;

alter table public.flight_service_requests
  add constraint flight_service_requests_provider_case_ref_ciphertext_check
  check (
    (provider_case_ref_ciphertext is null and provider_case_ref_sha256 is null)
    or (
      provider_case_ref_ciphertext is not null
      and provider_case_ref_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
      and char_length(split_part(provider_case_ref_ciphertext, ':', 3))
        between 16 and 4080
      and provider_case_ref_sha256 is not null
    )
  ) not valid;
alter table public.flight_service_requests validate constraint
  flight_service_requests_provider_case_ref_ciphertext_check;

alter table public.flight_payment_operation_attempts
  add constraint flight_payment_operation_attempts_processor_ref_check
  check (
    (processor_object_ref_ciphertext is null
      and processor_object_ref_sha256 is null)
    or (
      processor_object_ref_ciphertext is not null
      and processor_object_ref_ciphertext
        ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
      and char_length(split_part(processor_object_ref_ciphertext, ':', 3))
        between 16 and 4080
      and processor_object_ref_sha256 is not null
    )
  ) not valid;
alter table public.flight_payment_operation_attempts validate constraint
  flight_payment_operation_attempts_processor_ref_check;

alter table public.flight_payment_refund_evidence
  add constraint flight_payment_refund_evidence_reference_check
  check (
    refund_reference_ciphertext is not null
    and refund_reference_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
    and char_length(split_part(refund_reference_ciphertext, ':', 3))
      between 16 and 4080
  ) not valid;
alter table public.flight_payment_refund_evidence validate constraint
  flight_payment_refund_evidence_reference_check;

-- Explicitly replace only the two migration-077 routines whose procedural
-- envelope checks repeated the same PostgreSQL-incompatible bounds.
create or replace function public.validate_flight_consumer_async_order_finalization_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $validate_flight_consumer_async_order_finalization_085$
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
    or (
      new.provider_order_ref_ciphertext
        !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
      or char_length(split_part(new.provider_order_ref_ciphertext, ':', 3))
        not between 16 and 8176
    )
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
$validate_flight_consumer_async_order_finalization_085$;

create or replace function public.finalize_flight_consumer_async_duffel_order_v1(
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
as $finalize_flight_consumer_async_duffel_order_085$
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
    or (
      p_provider_order_ref_ciphertext
        !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
      or char_length(split_part(p_provider_order_ref_ciphertext, ':', 3))
        not between 16 and 8176
    )
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
      or (
        coalesce(v_binding ->> 'provider_passenger_ref_ciphertext', '')
          !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
        or char_length(split_part(coalesce(
          v_binding ->> 'provider_passenger_ref_ciphertext', ''
        ), ':', 3)) not between 16 and 4080
      )
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
      or (
        coalesce(v_document ->> 'document_ref_ciphertext', '')
          !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
        or char_length(split_part(coalesce(
          v_document ->> 'document_ref_ciphertext', ''
        ), ':', 3)) not between 16 and 4080
      )
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
$finalize_flight_consumer_async_duffel_order_085$;

revoke all on function public.validate_flight_consumer_async_order_finalization_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_flight_consumer_async_duffel_order_v1(
  uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, jsonb, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.finalize_flight_consumer_async_duffel_order_v1(
  uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, jsonb, jsonb
) to service_role;

do $flight_consumer_preview_085_postcondition$
declare
  v_complete_source text;
  v_fail_source text;
  v_validator_source text;
  v_finalizer_source text;
  v_definition text;
  v_validated boolean;
  v_safe_count integer;
  v_repair record;
  v_valid_256 text := 'enc:v1:' || repeat('A', 256);
  v_valid_4080 text := 'enc:v1:' || repeat('A', 4080);
  v_valid_8176 text := 'enc:v1:' || repeat('A', 8176);
  v_invalid_15 text := 'enc:v1:' || repeat('A', 15);
  v_invalid_4081 text := 'enc:v1:' || repeat('A', 4081);
  v_invalid_8177 text := 'enc:v1:' || repeat('A', 8177);
  v_malformed_16 text := 'enc:v1:' || repeat('A', 15) || '!';
begin
  for v_repair in
    select * from (values
      ('flight_offers', 'provider_offer_ref_ciphertext', '8176',
       'flight_offers_provider_offer_ref_ciphertext_check'),
      ('flight_orders', 'provider_order_ref_ciphertext', '8176',
       'flight_orders_provider_order_ref_ciphertext_check'),
      ('flight_passenger_refs', 'provider_passenger_ref_ciphertext', '4080',
       'flight_passenger_refs_provider_ref_ciphertext_check'),
      ('flight_ticket_documents', 'document_ref_ciphertext', '4080',
       'flight_ticket_documents_document_ref_ciphertext_check'),
      ('flight_payments', 'processor_reference_ciphertext', '4080',
       'flight_payments_processor_reference_ciphertext_check'),
      ('flight_service_requests', 'provider_case_ref_ciphertext', '4080',
       'flight_service_requests_provider_case_ref_ciphertext_check'),
      ('flight_payment_operation_attempts', 'processor_object_ref_ciphertext',
       '4080', 'flight_payment_operation_attempts_processor_ref_check'),
      ('flight_payment_refund_evidence', 'refund_reference_ciphertext',
       '4080', 'flight_payment_refund_evidence_reference_check')
    ) as repair(
      relation_name, column_name, maximum_suffix_length,
      target_constraint_name
    )
  loop
    v_definition := null;
    v_validated := null;
    select lower(pg_catalog.pg_get_constraintdef(constraint_record.oid)),
           constraint_record.convalidated
      into v_definition, v_validated
      from pg_catalog.pg_constraint as constraint_record
     where constraint_record.conrelid = pg_catalog.to_regclass(
       pg_catalog.format('public.%I', v_repair.relation_name)
     )
       and constraint_record.conname = v_repair.target_constraint_name
       and constraint_record.contype = 'c';
    if v_definition is null
      or not coalesce(v_validated, false)
      or position(v_repair.column_name in v_definition) = 0
      or position(
        '^enc:v[1-9][0-9]*:[a-za-z0-9_-]+$' in v_definition
      ) = 0
      or position('char_length' in v_definition) = 0
      or position('split_part' in v_definition) = 0
      or position(v_repair.maximum_suffix_length in v_definition) = 0
      or position(
        v_repair.column_name || ' is not null' in v_definition
      ) = 0
      or position('{16,8176}' in v_definition) > 0
      or position('{16,4080}' in v_definition) > 0 then
      raise exception
        'Flight Consumer Preview migration 085 did not repair %.%',
        v_repair.relation_name, v_repair.column_name;
    end if;
  end loop;

  -- Prove the exact PostgreSQL predicate at both ceilings, including a length
  -- above the POSIX-regex repetition limit that triggered this repair.
  if not (
      v_valid_256 ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
      and char_length(split_part(v_valid_256, ':', 3)) between 16 and 4080
    )
    or not (
      v_valid_4080 ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
      and char_length(split_part(v_valid_4080, ':', 3)) between 16 and 4080
    )
    or not (
      v_valid_8176 ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
      and char_length(split_part(v_valid_8176, ':', 3)) between 16 and 8176
    )
    or (
      v_invalid_15 ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
      and char_length(split_part(v_invalid_15, ':', 3)) between 16 and 4080
    )
    or (
      v_invalid_4081 ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
      and char_length(split_part(v_invalid_4081, ':', 3)) between 16 and 4080
    )
    or (
      v_invalid_8177 ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
      and char_length(split_part(v_invalid_8177, ':', 3)) between 16 and 8176
    )
    or (
      v_malformed_16 ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
      and char_length(split_part(v_malformed_16, ':', 3)) between 16 and 4080
    ) then
    raise exception 'Flight Consumer Preview migration 085 ciphertext boundary proof failed';
  end if;

  select routine.prosrc into v_validator_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.validate_flight_consumer_async_order_finalization_v1()'
   )
     and routine.prosecdef
     and routine.provolatile = 'v'
     and routine.proconfig =
       array['search_path=pg_catalog, public, extensions']::text[];
  select routine.prosrc into v_finalizer_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.finalize_flight_consumer_async_duffel_order_v1(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,jsonb,jsonb)'
   )
     and routine.prosecdef
     and routine.provolatile = 'v'
     and routine.proconfig =
       array['search_path=pg_catalog, public, extensions']::text[];
  if v_validator_source is null
    or position(
      '!~ ''^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'''
      in v_validator_source
    ) = 0
    or position(
      'split_part(new.provider_order_ref_ciphertext, '':'', 3)'
      in v_validator_source
    ) = 0
    or position('not between 16 and 8176' in v_validator_source) = 0
    or position('{16,8176}' in v_validator_source) > 0
    or position('{16,4080}' in v_validator_source) > 0
    or v_finalizer_source is null
    or (
      char_length(v_finalizer_source)
      - char_length(replace(
          v_finalizer_source,
          '!~ ''^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$''',
          ''
        ))
    ) / char_length(
      '!~ ''^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'''
    ) <> 3
    or position(
      'split_part(p_provider_order_ref_ciphertext, '':'', 3)'
      in v_finalizer_source
    ) = 0
    or (
      char_length(v_finalizer_source)
      - char_length(replace(v_finalizer_source, 'split_part(coalesce(', ''))
    ) / char_length('split_part(coalesce(') <> 2
    or position('not between 16 and 8176' in v_finalizer_source) = 0
    or (
      char_length(v_finalizer_source)
      - char_length(replace(
          v_finalizer_source, 'not between 16 and 4080', ''
        ))
    ) / char_length('not between 16 and 4080') <> 2
    or position('{16,8176}' in v_finalizer_source) > 0
    or position('{16,4080}' in v_finalizer_source) > 0 then
    raise exception 'Flight Consumer Preview migration 085 did not repair the affected functions';
  end if;
  if has_function_privilege(
    'service_role',
    'public.validate_flight_consumer_async_order_finalization_v1()',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.validate_flight_consumer_async_order_finalization_v1()',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.validate_flight_consumer_async_order_finalization_v1()',
    'EXECUTE'
  ) or not has_function_privilege(
    'service_role',
    'public.finalize_flight_consumer_async_duffel_order_v1(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,jsonb,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.finalize_flight_consumer_async_duffel_order_v1(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,jsonb,jsonb)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.finalize_flight_consumer_async_duffel_order_v1(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,jsonb,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'Flight Consumer Preview migration 085 function grants are unsafe';
  end if;

  -- Migration 084 search semantics and least-privilege grants must remain
  -- exactly in force after replacing unrelated constraints and functions.
  select routine.prosrc into v_complete_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.complete_flight_consumer_search_v1(uuid,integer,jsonb)'
   )
     and routine.prosecdef
     and routine.provolatile = 'v'
     and routine.proconfig = array['search_path=pg_catalog, public']::text[];
  select routine.prosrc into v_fail_source
    from pg_catalog.pg_proc as routine
   where routine.oid = to_regprocedure(
     'public.fail_flight_consumer_search_v1(uuid,integer)'
   )
     and routine.prosecdef
     and routine.provolatile = 'v'
     and routine.proconfig = array['search_path=pg_catalog, public']::text[];
  if v_complete_source is null
    or position('#variable_conflict error' in v_complete_source) = 0
    or position(
      'Flight local offer identity is malformed' in v_complete_source
    ) = 0
    or position(
      'Flight local offer identity must equal its durable UUID'
      in v_complete_source
    ) > 0
    or v_fail_source is null
    or position('#variable_conflict error' in v_fail_source) = 0
    or position('public.flight_offers as offer' in v_fail_source) = 0
    or position('where offer.search_id = v_search.id' in v_fail_source) = 0
    or not has_function_privilege(
      'service_role',
      'public.complete_flight_consumer_search_v1(uuid,integer,jsonb)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.fail_flight_consumer_search_v1(uuid,integer)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.complete_flight_consumer_search_v1(uuid,integer,jsonb)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.fail_flight_consumer_search_v1(uuid,integer)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.complete_flight_consumer_search_v1(uuid,integer,jsonb)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.fail_flight_consumer_search_v1(uuid,integer)',
      'EXECUTE'
    ) then
    raise exception 'Flight Consumer Preview migration 085 changed migration 084 search authority';
  end if;
  if not has_column_privilege(
    'authenticated', 'public.flight_offers', 'execution_scope_sha256', 'SELECT'
  ) or not has_column_privilege(
    'authenticated', 'public.flight_orders', 'execution_scope_sha256', 'SELECT'
  ) or not has_column_privilege(
    'authenticated', 'public.flight_payments', 'execution_scope_sha256', 'SELECT'
  ) or not has_column_privilege(
    'authenticated', 'public.flight_ticket_documents',
    'execution_scope_sha256', 'SELECT'
  ) or has_column_privilege(
    'authenticated', 'public.flight_offers',
    'provider_offer_ref_ciphertext', 'SELECT'
  ) or has_column_privilege(
    'authenticated', 'public.flight_offers', 'provider_offer_ref_sha256', 'SELECT'
  ) or has_column_privilege(
    'authenticated', 'public.flight_offers', 'provider_payload_sha256', 'SELECT'
  ) or has_column_privilege(
    'authenticated', 'public.flight_orders',
    'provider_order_ref_ciphertext', 'SELECT'
  ) or has_column_privilege(
    'authenticated', 'public.flight_orders', 'provider_order_ref_sha256', 'SELECT'
  ) or has_column_privilege(
    'authenticated', 'public.flight_payments',
    'processor_reference_ciphertext', 'SELECT'
  ) or has_column_privilege(
    'authenticated', 'public.flight_payments',
    'processor_reference_sha256', 'SELECT'
  ) or has_column_privilege(
    'authenticated', 'public.flight_ticket_documents',
    'document_ref_ciphertext', 'SELECT'
  ) or has_column_privilege(
    'authenticated', 'public.flight_ticket_documents',
    'document_ref_sha256', 'SELECT'
  ) or has_column_privilege(
    'anon', 'public.flight_offers', 'execution_scope_sha256', 'SELECT'
  ) or has_column_privilege(
    'anon', 'public.flight_orders', 'execution_scope_sha256', 'SELECT'
  ) or has_column_privilege(
    'anon', 'public.flight_payments', 'execution_scope_sha256', 'SELECT'
  ) or has_column_privilege(
    'anon', 'public.flight_ticket_documents', 'execution_scope_sha256', 'SELECT'
  ) then
    raise exception 'Flight Consumer Preview migration 085 changed migration 084 repository grants';
  end if;

  select count(*)::integer into v_safe_count
    from public.flight_runtime_controls as control
   where control.control_key = 'global'
     and control.execution_kill_switch_engaged
     and not control.synthetic_execution_enabled
     and not control.provider_sandbox_traffic_enabled
     and not control.provider_live_traffic_enabled
     and not control.shopping_enabled
     and not control.order_enabled
     and not control.payment_enabled
     and not control.ticketing_enabled
     and not control.servicing_enabled
     and not control.provider_events_enabled
     and not control.production_release_enabled;
  if v_safe_count <> 1 then
    raise exception 'Flight Consumer Preview migration 085 changed the locked runtime posture';
  end if;
end;
$flight_consumer_preview_085_postcondition$;

comment on function public.validate_flight_consumer_async_order_finalization_v1()
  is 'Migration-085 trigger validator with PostgreSQL-compatible encrypted provider-reference validation.';
comment on function public.finalize_flight_consumer_async_duffel_order_v1(
  uuid, uuid, uuid, text, text, text, timestamptz, timestamptz, jsonb, jsonb
) is
  'No-redispatch Consumer Preview convergence with migration-085 PostgreSQL-compatible encrypted provider-reference validation.';

commit;

begin;

-- This ledger is the durable one-to-one bridge between a verified Consumer
-- Preview lifecycle receipt and the existing transactional email outbox. It
-- stores no recipient address, provider reference, ticket reference, payment
-- reference, raw response, or traveler PII.
create table public.flight_consumer_notification_outbox_receipts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  order_id uuid not null,
  event_type text not null check (event_type in (
    'order_pending', 'ticketed', 'order_failed', 'refund_completed'
  )),
  event_receipt_id uuid not null,
  lifecycle_evidence_sha256 text not null
    check (lifecycle_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  trusted_evidence_receipt_sha256 text not null
    check (trusted_evidence_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  email_outbox_id uuid not null unique
    references public.email_outbox(id) on delete restrict,
  execution_mode text not null default 'test' check (execution_mode = 'test'),
  execution_scope_sha256 text not null
    check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (order_id, customer_id)
    references public.flight_orders(id, customer_id) on delete restrict,
  unique (order_id, event_type, event_receipt_id)
);

create index flight_consumer_notification_owner_created_idx
  on public.flight_consumer_notification_outbox_receipts
    (customer_id, created_at desc);

alter table public.flight_consumer_notification_outbox_receipts enable row level security;
alter table public.flight_consumer_notification_outbox_receipts force row level security;
revoke all on public.flight_consumer_notification_outbox_receipts
  from public, anon, authenticated, service_role;

create trigger flight_consumer_notification_receipts_append_only_guard
before update or delete on public.flight_consumer_notification_outbox_receipts
for each row execute function public.reject_flight_evidence_mutation();

-- Return a digest-only/sanitized projection for exactly one authoritative
-- Consumer Preview notification. This function never decrypts or returns a
-- provider, ticket, payment-processor, or traveler reference. The local FLT-
-- confirmation is used only as an internal builder proof and is deliberately
-- excluded from queued template_data by the queue RPC below.
create function public.get_flight_consumer_notification_projection_v1(
  p_customer_id uuid,
  p_order_id uuid,
  p_event_type text
)
returns table (
  customer_id uuid,
  order_id uuid,
  event_type text,
  event_receipt_id text,
  execution_scope_sha256 text,
  lifecycle_evidence_sha256 text,
  origin_iata text,
  destination_iata text,
  booking_reference text,
  provider_order_receipt_sha256 text,
  booking_reference_receipt_sha256 text,
  electronic_ticket_document_receipt_sha256s text[],
  payment_id text,
  currency text,
  refunded_amount_minor bigint,
  payment_receipt_sha256 text,
  reconciliation_receipt_sha256 text,
  trusted_evidence_receipt_sha256 text
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $flight_consumer_notification_projection$
declare
  v_order public.flight_orders;
  v_search public.flight_searches;
  v_attempt public.flight_provider_request_attempts;
  v_payment public.flight_payments;
  v_refund_attempt public.flight_payment_operation_attempts;
  v_refund_evidence public.flight_payment_refund_evidence;
  v_case public.flight_reconciliation_cases;
  v_event_receipt_id text;
  v_lifecycle_evidence_sha256 text;
  v_booking_reference text;
  v_provider_order_receipt_sha256 text;
  v_booking_reference_receipt_sha256 text;
  v_document_receipts text[];
  v_payment_id text;
  v_currency text;
  v_refunded_amount_minor bigint;
  v_payment_receipt_sha256 text;
  v_reconciliation_receipt_sha256 text;
  v_trusted_receipt_sha256 text;
  v_passenger_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight notification projection is service-role only';
  end if;
  if p_event_type not in (
    'order_pending', 'ticketed', 'order_failed', 'refund_completed'
  ) then
    raise exception 'Flight notification event is unsupported';
  end if;

  select * into v_order
    from public.flight_orders as flight_order
   where flight_order.id = p_order_id
     and flight_order.customer_id = p_customer_id
     and flight_order.consumer_flow_version = 1
     and flight_order.execution_mode = 'test'
     and flight_order.provider_code = 'duffel'
   for share;
  if v_order.id is null then
    raise exception 'Flight notification order is unavailable';
  end if;

  select * into v_search
    from public.flight_searches as search
   where search.id = v_order.search_id
     and search.customer_id = v_order.customer_id
     and search.execution_mode = v_order.execution_mode
     and search.execution_scope_sha256 = v_order.execution_scope_sha256
   for share;
  if v_search.id is null then
    raise exception 'Flight notification itinerary is unavailable';
  end if;

  if p_event_type = 'ticketed' then
    select * into v_attempt
      from public.flight_provider_request_attempts as attempt
     where attempt.order_id = v_order.id
       and attempt.customer_id = v_order.customer_id
       and attempt.consumer_flow_version = 1
       and attempt.operation = 'create_order'
       and attempt.provider_code = 'duffel'
       and attempt.execution_mode = 'test'
       and attempt.execution_scope_sha256 = v_order.execution_scope_sha256
       and attempt.state = 'succeeded'
       and attempt.revision = 2
       and attempt.terminal_receipt_sha256 is not null
     for share;
    select count(*)::integer into v_passenger_count
      from public.flight_passenger_refs as passenger
     where passenger.order_id = v_order.id
       and passenger.execution_mode = 'test'
       and passenger.execution_scope_sha256 = v_order.execution_scope_sha256;
    select array_agg(document.document_ref_sha256 order by passenger.traveler_sequence)
      into v_document_receipts
      from public.flight_passenger_refs as passenger
      join public.flight_ticket_documents as document
        on document.passenger_ref_id = passenger.id
       and document.order_id = passenger.order_id
     where passenger.order_id = v_order.id
       and passenger.execution_mode = 'test'
       and passenger.execution_scope_sha256 = v_order.execution_scope_sha256
       and document.execution_mode = 'test'
       and document.execution_scope_sha256 = v_order.execution_scope_sha256
       and document.document_type = 'electronic_ticket'
       and document.status = 'issued';
    if v_order.status <> 'ticketed'
      or v_order.provider_order_ref_sha256 is null
      or v_attempt.id is null
      or v_passenger_count < 1
      or cardinality(coalesce(v_document_receipts, array[]::text[]))
        <> v_passenger_count
      or exists (
        select 1
          from unnest(coalesce(v_document_receipts, array[]::text[])) as receipt(value)
         where receipt.value is null or receipt.value !~ '^[0-9a-f]{64}$'
      ) then
      raise exception 'Flight ticket notification evidence is incomplete';
    end if;
    v_event_receipt_id := v_attempt.id::text;
    v_lifecycle_evidence_sha256 := v_attempt.terminal_receipt_sha256;
    v_booking_reference := v_order.confirmation_code;
    v_provider_order_receipt_sha256 := v_attempt.terminal_receipt_sha256;
    v_booking_reference_receipt_sha256 := encode(extensions.digest(convert_to(
      jsonb_build_object(
        'domain', 'iratepilot.flight.notification.booking-reference.v1',
        'order_id', v_order.id::text,
        'event_receipt_id', v_attempt.id::text,
        'confirmation_code', v_order.confirmation_code
      )::text, 'UTF8'
    ), 'sha256'), 'hex');

  elsif p_event_type = 'order_pending' then
    select * into v_case
      from public.flight_reconciliation_cases as reconciliation
     where reconciliation.order_id = v_order.id
       and reconciliation.execution_mode = 'test'
       and reconciliation.execution_scope_sha256 = v_order.execution_scope_sha256
       and reconciliation.subject_type = 'flight_order'
       and reconciliation.subject_id = v_order.id
       and reconciliation.status in ('open', 'investigating', 'blocked')
     order by reconciliation.created_at desc, reconciliation.id desc
     limit 1
     for share;
    if v_order.status <> 'requires_review' or v_case.id is null then
      raise exception 'Flight pending notification requires active review evidence';
    end if;
    v_event_receipt_id := v_case.id::text;
    v_lifecycle_evidence_sha256 := encode(extensions.digest(convert_to(
      jsonb_build_object(
        'domain', 'iratepilot.flight.notification.order-pending.v1',
        'order_id', v_order.id::text,
        'order_status', v_order.status,
        'case_id', v_case.id::text,
        'case_type', v_case.case_type,
        'case_status', v_case.status,
        'expected_state_sha256', v_case.expected_state_sha256,
        'observed_state_sha256', v_case.observed_state_sha256
      )::text, 'UTF8'
    ), 'sha256'), 'hex');

  elsif p_event_type = 'order_failed' then
    select * into v_payment
      from public.flight_payments as payment
     where payment.order_id = v_order.id
       and payment.execution_mode = 'test'
       and payment.execution_scope_sha256 = v_order.execution_scope_sha256
     order by payment.created_at desc, payment.id desc
     limit 1
     for share;
    select * into v_case
      from public.flight_reconciliation_cases as reconciliation
     where reconciliation.order_id = v_order.id
       and reconciliation.execution_mode = 'test'
       and reconciliation.execution_scope_sha256 = v_order.execution_scope_sha256
       and reconciliation.subject_type = 'flight_order'
       and reconciliation.subject_id = v_order.id
       and reconciliation.status = 'resolved'
       and reconciliation.resolution_evidence_sha256 is not null
     order by reconciliation.resolved_at desc, reconciliation.id desc
     limit 1
     for share;
    select * into v_refund_attempt
      from public.flight_payment_operation_attempts as attempt
     where v_payment.id is not null
       and attempt.order_id = v_order.id
       and attempt.payment_id = v_payment.id
       and attempt.operation = 'refund'
       and attempt.state = 'succeeded'
       and attempt.revision = 2
       and attempt.terminal_receipt_sha256 is not null
     order by attempt.prepared_at desc, attempt.id desc
     limit 1
     for share;
    if v_order.status <> 'failed'
      or exists (
        select 1 from public.flight_ticket_documents as document
         where document.order_id = v_order.id
           and document.status not in ('voided', 'refunded', 'failed')
      )
      or (
        v_payment.id is not null
        and (
          v_payment.captured_cents <> v_payment.refunded_cents
          or v_payment.status not in ('failed', 'cancelled', 'refunded')
        )
      ) then
      raise exception 'Flight failed notification requires zero liability';
    end if;
    v_event_receipt_id := coalesce(
      v_refund_attempt.id::text,
      v_case.id::text,
      v_order.id::text
    );
    v_lifecycle_evidence_sha256 := encode(extensions.digest(convert_to(
      jsonb_build_object(
        'domain', 'iratepilot.flight.notification.order-failed.v1',
        'order_id', v_order.id::text,
        'order_status', v_order.status,
        'order_updated_at', v_order.updated_at,
        'payment_id', v_payment.id::text,
        'payment_status', v_payment.status,
        'captured_cents', v_payment.captured_cents,
        'refunded_cents', v_payment.refunded_cents,
        'resolution_evidence_sha256', v_case.resolution_evidence_sha256,
        'refund_terminal_receipt_sha256', v_refund_attempt.terminal_receipt_sha256
      )::text, 'UTF8'
    ), 'sha256'), 'hex');

  else
    select * into v_payment
      from public.flight_payments as payment
     where payment.order_id = v_order.id
       and payment.execution_mode = 'test'
       and payment.execution_scope_sha256 = v_order.execution_scope_sha256
       and payment.processor_code = 'stripe'
       and payment.status = 'refunded'
     order by payment.created_at desc, payment.id desc
     limit 1
     for share;
    select * into v_refund_attempt
      from public.flight_payment_operation_attempts as attempt
     where v_payment.id is not null
       and attempt.order_id = v_order.id
       and attempt.payment_id = v_payment.id
       and attempt.operation = 'refund'
       and attempt.processor_code = 'stripe'
       and attempt.execution_mode = 'test'
       and attempt.execution_scope_sha256 = v_order.execution_scope_sha256
       and attempt.state = 'succeeded'
       and attempt.revision = 2
       and attempt.terminal_receipt_sha256 is not null
     order by attempt.prepared_at desc, attempt.id desc
     limit 1
     for share;
    select * into v_refund_evidence
      from public.flight_payment_refund_evidence as evidence
     where v_refund_attempt.id is not null
       and evidence.attempt_id = v_refund_attempt.id
       and evidence.order_id = v_order.id
       and evidence.payment_id = v_payment.id
       and evidence.execution_mode = 'test'
       and evidence.execution_scope_sha256 = v_order.execution_scope_sha256
       and evidence.terminal_receipt_sha256 = v_refund_attempt.terminal_receipt_sha256
     for share;
    select * into v_case
      from public.flight_reconciliation_cases as reconciliation
     where reconciliation.order_id = v_order.id
       and reconciliation.execution_mode = 'test'
       and reconciliation.execution_scope_sha256 = v_order.execution_scope_sha256
       and reconciliation.status = 'resolved'
       and reconciliation.resolution_evidence_sha256 is not null
       and reconciliation.resolution_code in (
         'payment_reversed', 'duplicate_suppressed'
       )
       and (
         (
           reconciliation.case_type = 'ambiguous_order'
           and reconciliation.subject_type = 'flight_order'
           and reconciliation.subject_id = v_order.id
         )
         or (
           reconciliation.case_type in ('payment_order_mismatch', 'refund_mismatch')
           and reconciliation.subject_type = 'flight_payment'
           and reconciliation.subject_id = v_payment.id
         )
       )
     order by reconciliation.resolved_at desc, reconciliation.id desc
     limit 1
     for share;
    if v_order.status not in ('failed', 'refunded')
      or v_order.provider_order_ref_sha256 is not null
      or v_payment.id is null
      or v_payment.currency <> v_order.currency
      or v_payment.authorized_cents <> v_order.total_cents
      or v_payment.captured_cents <> v_order.total_cents
      or v_payment.refunded_cents <> v_order.total_cents
      or v_refund_attempt.id is null
      or v_refund_evidence.id is null
      or v_refund_evidence.refunded_cents <> v_order.total_cents
      or v_case.id is null
      or exists (
        select 1 from public.flight_ticket_documents as document
         where document.order_id = v_order.id
           and document.status not in ('voided', 'refunded', 'failed')
      ) then
      raise exception 'Flight refund notification requires reconciled refund evidence';
    end if;
    v_event_receipt_id := v_refund_attempt.id::text;
    v_lifecycle_evidence_sha256 := v_refund_evidence.terminal_receipt_sha256;
    v_payment_id := v_payment.id::text;
    v_currency := v_payment.currency;
    v_refunded_amount_minor := v_payment.refunded_cents;
    v_payment_receipt_sha256 := v_refund_attempt.payment_binding_receipt_sha256;
    v_reconciliation_receipt_sha256 := v_case.resolution_evidence_sha256;
  end if;

  if v_event_receipt_id is null
    or v_event_receipt_id !~ '^[0-9a-f-]{36}$'
    or v_lifecycle_evidence_sha256 is null
    or v_lifecycle_evidence_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight notification lifecycle evidence is invalid';
  end if;

  v_trusted_receipt_sha256 := encode(extensions.digest(convert_to(
    jsonb_build_object(
      'domain', 'iratepilot.flight.notification.projection.v1',
      'customer_id', v_order.customer_id::text,
      'order_id', v_order.id::text,
      'event_type', p_event_type,
      'event_receipt_id', v_event_receipt_id,
      'lifecycle_evidence_sha256', v_lifecycle_evidence_sha256,
      'origin_iata', v_search.origin_iata,
      'destination_iata', v_search.destination_iata,
      'booking_reference', v_booking_reference,
      'provider_order_receipt_sha256', v_provider_order_receipt_sha256,
      'booking_reference_receipt_sha256', v_booking_reference_receipt_sha256,
      'electronic_ticket_document_receipt_sha256s',
        to_jsonb(v_document_receipts),
      'payment_id', v_payment_id,
      'currency', v_currency,
      'refunded_amount_minor', v_refunded_amount_minor,
      'payment_receipt_sha256', v_payment_receipt_sha256,
      'reconciliation_receipt_sha256', v_reconciliation_receipt_sha256
    )::text, 'UTF8'
  ), 'sha256'), 'hex');

  return query select
    v_order.customer_id,
    v_order.id,
    p_event_type,
    v_event_receipt_id,
    v_order.execution_scope_sha256,
    v_lifecycle_evidence_sha256,
    v_search.origin_iata,
    v_search.destination_iata,
    v_booking_reference,
    v_provider_order_receipt_sha256,
    v_booking_reference_receipt_sha256,
    v_document_receipts,
    v_payment_id,
    v_currency,
    v_refunded_amount_minor,
    v_payment_receipt_sha256,
    v_reconciliation_receipt_sha256,
    v_trusted_receipt_sha256;
end;
$flight_consumer_notification_projection$;

-- Verify the exact sanitized projection again and atomically bridge it to the
-- existing outbox. The recipient is selected from auth.users using the order's
-- durable customer_id; no caller can supply or redirect an email address.
create function public.queue_flight_consumer_notification_v1(
  p_customer_id uuid,
  p_order_id uuid,
  p_event_type text,
  p_event_receipt_id uuid,
  p_lifecycle_evidence_sha256 text,
  p_trusted_evidence_receipt_sha256 text,
  p_template_name text,
  p_dedupe_key text,
  p_subject text,
  p_message text,
  p_action_url text
)
returns table (decision text, email_outbox_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $queue_flight_consumer_notification$
declare
  v_projection record;
  v_existing public.flight_consumer_notification_outbox_receipts;
  v_outbox public.email_outbox;
  v_recipient_email text;
  v_expected_subject text;
  v_expected_message text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight notification queue is service-role only';
  end if;

  select * into v_projection
    from public.get_flight_consumer_notification_projection_v1(
      p_customer_id, p_order_id, p_event_type
    );
  if v_projection.order_id is null
    or v_projection.event_receipt_id is distinct from p_event_receipt_id::text
    or v_projection.lifecycle_evidence_sha256
      is distinct from p_lifecycle_evidence_sha256
    or v_projection.trusted_evidence_receipt_sha256
      is distinct from p_trusted_evidence_receipt_sha256 then
    raise exception 'Flight notification evidence changed before queueing';
  end if;

  v_expected_subject := case p_event_type
    when 'order_pending' then 'Your flight order is still processing'
    when 'ticketed' then 'Your flight is booked and ticketed'
    when 'order_failed' then 'Your flight order could not be completed'
    when 'refund_completed' then 'Your flight refund is complete'
  end;
  v_expected_message := case p_event_type
    when 'order_pending' then format(
      'Your %s to %s request is processing. It is not confirmed or ticketed yet. Do not submit another order.',
      v_projection.origin_iata, v_projection.destination_iata
    )
    when 'ticketed' then format(
      'Your %s to %s order has a provider booking reference and electronic-ticket documentation. Review the operating carrier, itinerary, fare conditions, and support details.',
      v_projection.origin_iata, v_projection.destination_iata
    )
    when 'order_failed' then format(
      'Your %s to %s order was not completed. Any payment state must be reconciled before trying again.',
      v_projection.origin_iata, v_projection.destination_iata
    )
    when 'refund_completed' then format(
      'The approved traveler refund for your cancelled %s to %s order was completed and reconciled.',
      v_projection.origin_iata, v_projection.destination_iata
    )
  end;
  if p_template_name is distinct from 'flight_' || p_event_type
    or p_dedupe_key is distinct from format(
      'flight:%s:%s:%s', p_order_id::text, p_event_type, p_event_receipt_id::text
    )
    or p_subject is distinct from v_expected_subject
    or p_message is distinct from v_expected_message
    or p_action_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/account/flights$' then
    raise exception 'Flight notification content is not the approved projection';
  end if;

  select lower(trim(users.email::text)) into v_recipient_email
    from auth.users as users
   where users.id = v_projection.customer_id
     and users.deleted_at is null
     and users.email_confirmed_at is not null;
  if v_recipient_email is null
    or length(v_recipient_email) > 320
    or v_recipient_email !~ '^[^[:space:]@]+@[^[:space:]@]+$' then
    raise exception 'Flight notification owner email is unavailable';
  end if;

  -- Serialize only this exact business notification; unrelated bookings and
  -- outbox jobs remain concurrent.
  perform pg_advisory_xact_lock(pg_catalog.hashtextextended(p_dedupe_key, 0));
  select * into v_existing
    from public.flight_consumer_notification_outbox_receipts as receipt
   where receipt.order_id = p_order_id
     and receipt.event_type = p_event_type
     and receipt.event_receipt_id = p_event_receipt_id;
  if v_existing.id is not null then
    if v_existing.customer_id is distinct from p_customer_id
      or v_existing.lifecycle_evidence_sha256
        is distinct from p_lifecycle_evidence_sha256
      or v_existing.trusted_evidence_receipt_sha256
        is distinct from p_trusted_evidence_receipt_sha256 then
      raise exception 'Flight notification replay collides';
    end if;
    return query select 'replay'::text, v_existing.email_outbox_id;
    return;
  end if;

  insert into public.email_outbox (
    recipient_email, subject, template_name, template_data,
    status, scheduled_at
  ) values (
    v_recipient_email,
    p_subject,
    p_template_name,
    jsonb_build_object(
      'dedupe_key', p_dedupe_key,
      'message', p_message,
      'action_url', p_action_url
    ),
    'pending',
    clock_timestamp()
  ) returning * into v_outbox;

  insert into public.flight_consumer_notification_outbox_receipts (
    customer_id, order_id, event_type, event_receipt_id,
    lifecycle_evidence_sha256, trusted_evidence_receipt_sha256,
    email_outbox_id, execution_mode, execution_scope_sha256
  ) values (
    p_customer_id, p_order_id, p_event_type, p_event_receipt_id,
    p_lifecycle_evidence_sha256, p_trusted_evidence_receipt_sha256,
    v_outbox.id, 'test', v_projection.execution_scope_sha256
  );
  return query select 'queued'::text, v_outbox.id;
end;
$queue_flight_consumer_notification$;

revoke all on function public.get_flight_consumer_notification_projection_v1(
  uuid, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public.queue_flight_consumer_notification_v1(
  uuid, uuid, text, uuid, text, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.get_flight_consumer_notification_projection_v1(
  uuid, uuid, text
) to service_role;
grant execute on function public.queue_flight_consumer_notification_v1(
  uuid, uuid, text, uuid, text, text, text, text, text, text, text
) to service_role;

commit;

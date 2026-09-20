begin;

-- Consumer Preview support intake records owner intent for local staff review.
-- It never enables provider servicing, changes an order, or dispatches network
-- traffic. Migrations 076-078 must already be applied in sequence.
do $flight_consumer_preview_support_079_dependencies$
begin
  if to_regclass('public.flight_service_requests') is null
    or to_regclass('public.flight_consumer_notification_outbox_receipts') is null
    or to_regprocedure(
      'public.assert_flight_consumer_preview_runtime_v1(text,text)'
    ) is null
    or to_regprocedure(
      'public.flight_consumer_preview_control_is_bound_v1(text)'
    ) is null
    or to_regprocedure(
      'public.finalize_flight_consumer_async_duffel_order_v1(uuid,uuid,uuid,text,text,text,timestamptz,timestamptz,jsonb,jsonb)'
    ) is null then
    raise exception 'Flight Consumer Preview support intake requires migrations 068 through 078';
  end if;
  if to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'Flight Consumer Preview support intake requires reviewed SHA-256 support';
  end if;
end;
$flight_consumer_preview_support_079_dependencies$;

-- Preserve the original servicing guard for every insert/update except the
-- transaction-local, authenticated-owner Preview intake created by the RPC
-- below. The special branch requires the exact active test scope while the
-- provider servicing capability remains false.
create function public.enforce_flight_consumer_preview_service_intake_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $enforce_flight_consumer_preview_service_intake$
begin
  if tg_op = 'INSERT'
    and new.execution_mode = 'test'
    and new.status = 'requested'
    and coalesce(auth.role(), '') = 'authenticated'
    and auth.uid() is not null
    and new.requested_by = auth.uid()
    and current_setting(
      'app.flight_consumer_preview_support_intake_v1', true
    ) = 'authorized' then
    perform public.assert_flight_consumer_preview_runtime_v1(
      new.execution_scope_sha256, 'ticketing'
    );
    return new;
  end if;

  if not public.flight_runtime_capability_enabled(
    new.execution_mode,
    'servicing',
    null,
    null,
    new.execution_scope_sha256
  ) then
    raise exception 'Flight servicing capability is disabled for % execution',
      new.execution_mode;
  end if;
  return new;
end;
$enforce_flight_consumer_preview_service_intake$;

drop trigger flight_service_requests_runtime_guard
  on public.flight_service_requests;
create trigger flight_service_requests_runtime_guard
before insert or update on public.flight_service_requests
for each row execute function
  public.enforce_flight_consumer_preview_service_intake_v1();

create function public.create_flight_consumer_preview_service_request_v1(
  p_order_id uuid,
  p_request_type text,
  p_reason_code text,
  p_idempotency_key_sha256 text
)
returns table (
  decision text,
  service_request_id uuid,
  order_id uuid,
  request_type text,
  reason_code text,
  request_status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $create_flight_consumer_preview_service_request$
declare
  v_actor uuid;
  v_order public.flight_orders;
  v_request public.flight_service_requests;
  v_request_sha256 text;
  v_inserted boolean := false;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or auth.uid() is null then
    raise exception 'Flight Consumer Preview support intake requires authentication'
      using errcode = '42501';
  end if;
  v_actor := auth.uid();
  if p_order_id is null
    or p_request_type not in (
      'cancel', 'change', 'refund', 'schedule_change',
      'name_correction', 'document_reissue'
    )
    or p_reason_code is null
    or p_reason_code !~ '^[a-z][a-z0-9_]{1,63}$'
    or not (
      (p_request_type = 'cancel'
        and p_reason_code in ('plans_changed', 'duplicate_test_booking'))
      or (p_request_type = 'change'
        and p_reason_code in ('travel_date_change', 'route_change'))
      or (p_request_type = 'refund'
        and p_reason_code in ('test_refund_review', 'duplicate_test_booking'))
      or (p_request_type = 'schedule_change'
        and p_reason_code in ('schedule_change_review', 'connection_risk'))
      or (p_request_type = 'name_correction'
        and p_reason_code = 'fictional_name_correction')
      or (p_request_type = 'document_reissue'
        and p_reason_code = 'test_document_review')
    )
    or p_idempotency_key_sha256 is null
    or p_idempotency_key_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight Consumer Preview support intake is invalid'
      using errcode = '23514';
  end if;

  select * into v_order
    from public.flight_orders as candidate
   where candidate.id = p_order_id
   for update;
  if not found
    or v_order.customer_id <> v_actor
    or v_order.consumer_flow_version <> 1
    or v_order.execution_mode <> 'test'
    or v_order.provider_code <> 'duffel'
    or v_order.status <> 'ticketed'
    or v_order.provider_order_ref_ciphertext is null
    or v_order.provider_order_ref_sha256 is null then
    raise exception 'Flight Consumer Preview support intake order is ineligible'
      using errcode = '23514';
  end if;
  perform public.assert_flight_consumer_preview_runtime_v1(
    v_order.execution_scope_sha256, 'ticketing'
  );
  if not public.flight_consumer_preview_control_is_bound_v1(
    v_order.execution_scope_sha256
  )
    or not exists (
      select 1 from public.flight_payments as payment
       where payment.order_id = v_order.id
         and payment.execution_mode = 'test'
         and payment.execution_scope_sha256 = v_order.execution_scope_sha256
         and payment.processor_code = 'stripe'
         and payment.currency = v_order.currency
         and payment.authorized_cents = v_order.total_cents
         and payment.captured_cents = v_order.total_cents
         and payment.refunded_cents = 0
         and payment.status = 'captured'
    )
    or not exists (
      select 1 from public.flight_passenger_refs as passenger
       where passenger.order_id = v_order.id
         and passenger.execution_mode = 'test'
         and passenger.execution_scope_sha256 = v_order.execution_scope_sha256
    )
    or exists (
      select 1 from public.flight_passenger_refs as passenger
       where passenger.order_id = v_order.id
         and passenger.execution_mode = 'test'
         and passenger.execution_scope_sha256 = v_order.execution_scope_sha256
         and (
           select count(*)
             from public.flight_ticket_documents as document
            where document.order_id = v_order.id
              and document.passenger_ref_id = passenger.id
              and document.execution_mode = 'test'
              and document.execution_scope_sha256 = v_order.execution_scope_sha256
              and document.document_type = 'electronic_ticket'
              and document.status = 'issued'
         ) <> 1
    ) then
    raise exception 'Flight Consumer Preview support intake lacks finalized ticket evidence'
      using errcode = '23514';
  end if;
  -- The request digest binds only the idempotency identity and owner/order
  -- scope. Reusing a key with a different enum payload is detected below.
  v_request_sha256 := encode(extensions.digest(convert_to(
    'iratepilot.flight.consumer-preview.service-request.v1' || chr(10)
      || jsonb_build_object(
        'customer_id', v_actor::text,
        'order_id', v_order.id::text,
        'execution_scope_sha256', v_order.execution_scope_sha256,
        'idempotency_key_sha256', p_idempotency_key_sha256
      )::text,
    'UTF8'
  ), 'sha256'), 'hex');

  -- Check the idempotency identity before creation so one key can never be
  -- reused to smuggle a different enum-only payload.
  select * into v_request
    from public.flight_service_requests as idempotent_replay
   where idempotent_replay.order_id = v_order.id
     and idempotent_replay.request_sha256 = v_request_sha256
   for update;
  if found then
    if v_request.requested_by <> v_actor
      or v_request.execution_mode <> 'test'
      or v_request.execution_scope_sha256 <> v_order.execution_scope_sha256
      or v_request.request_type <> p_request_type
      or v_request.reason_code <> p_reason_code then
      raise exception 'Flight Consumer Preview support idempotency key collides'
        using errcode = '23505';
    end if;
    return query select
      'replay'::text,
      v_request.id,
      v_request.order_id,
      v_request.request_type,
      v_request.reason_code,
      v_request.status,
      v_request.created_at,
      v_request.updated_at;
    return;
  end if;

  if (
    select count(*)
      from public.flight_service_requests as existing_request
     where existing_request.order_id = v_order.id
       and existing_request.execution_mode = 'test'
       and existing_request.execution_scope_sha256 = v_order.execution_scope_sha256
       and existing_request.status in (
         'requested', 'quoted', 'accepted', 'processing', 'requires_review'
       )
  ) >= 12 then
    raise exception 'Flight Consumer Preview support intake limit reached'
      using errcode = '23514';
  end if;

  perform set_config(
    'app.flight_consumer_preview_support_intake_v1', 'authorized', true
  );
  insert into public.flight_service_requests (
    order_id, requested_by, execution_mode, execution_scope_sha256,
    request_type, reason_code, secure_request_ref, request_sha256, status
  ) values (
    v_order.id, v_actor, 'test', v_order.execution_scope_sha256,
    p_request_type, p_reason_code, null, v_request_sha256, 'requested'
  )
  on conflict on constraint
    flight_service_requests_order_id_request_sha256_key do nothing
  returning * into v_request;
  v_inserted := found;
  if not v_inserted then
    select * into v_request
      from public.flight_service_requests as replay
     where replay.order_id = v_order.id
       and replay.request_sha256 = v_request_sha256
     for update;
  end if;
  if v_request.id is null
    or v_request.order_id <> v_order.id
    or v_request.requested_by <> v_actor
    or v_request.execution_mode <> 'test'
    or v_request.execution_scope_sha256 <> v_order.execution_scope_sha256
    or v_request.request_type <> p_request_type
    or v_request.reason_code <> p_reason_code then
    raise exception 'Flight Consumer Preview support idempotency key collides'
      using errcode = '23505';
  end if;

  return query select
    case when v_inserted then 'created'::text else 'replay'::text end,
    v_request.id,
    v_request.order_id,
    v_request.request_type,
    v_request.reason_code,
    v_request.status,
    v_request.created_at,
    v_request.updated_at;
end;
$create_flight_consumer_preview_service_request$;

create function public.list_flight_consumer_preview_service_requests_v1(
  p_order_id uuid default null
)
returns table (
  service_request_id uuid,
  order_id uuid,
  request_type text,
  reason_code text,
  request_status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $list_flight_consumer_preview_service_requests$
declare
  v_actor uuid;
  v_scope text;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or auth.uid() is null then
    raise exception 'Flight Consumer Preview support ledger requires authentication'
      using errcode = '42501';
  end if;
  v_actor := auth.uid();
  select control.bound_execution_scope_sha256 into v_scope
    from public.flight_runtime_controls as control
   where control.control_key = 'global';
  perform public.assert_flight_consumer_preview_runtime_v1(v_scope, 'ticketing');

  return query
  select
    request.id,
    request.order_id,
    request.request_type,
    request.reason_code,
    request.status,
    request.created_at,
    request.updated_at
  from public.flight_service_requests as request
  join public.flight_orders as owned_order on owned_order.id = request.order_id
  where owned_order.customer_id = v_actor
    and owned_order.consumer_flow_version = 1
    and owned_order.execution_mode = 'test'
    and owned_order.execution_scope_sha256 = v_scope
    and owned_order.provider_code = 'duffel'
    and request.requested_by = v_actor
    and request.execution_mode = 'test'
    and request.execution_scope_sha256 = v_scope
    and (p_order_id is null or request.order_id = p_order_id)
  order by request.created_at desc, request.id desc
  limit 200;
end;
$list_flight_consumer_preview_service_requests$;

create function public.list_flight_consumer_admin_service_requests_v1(
  p_limit integer default 50,
  p_status text default null
)
returns table (
  service_request_id uuid,
  order_id uuid,
  customer_id uuid,
  confirmation_code text,
  order_status text,
  request_type text,
  reason_code text,
  request_status text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $list_flight_consumer_admin_service_requests$
declare
  v_actor uuid;
  v_scope text;
begin
  if coalesce(auth.role(), '') <> 'authenticated' or auth.uid() is null then
    raise exception 'Flight Consumer Preview support administration requires authentication'
      using errcode = '42501';
  end if;
  v_actor := auth.uid();
  if not exists (
    select 1 from public.profiles as profile
     where profile.id = v_actor and profile.role = 'admin'
  ) then
    raise exception 'Flight Consumer Preview support administration requires an administrator'
      using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100
    or (
      p_status is not null
      and p_status not in (
        'requested', 'quoted', 'accepted', 'processing', 'completed',
        'declined', 'failed', 'requires_review'
      )
    ) then
    raise exception 'Flight Consumer Preview support administration query is invalid'
      using errcode = '23514';
  end if;
  select control.bound_execution_scope_sha256 into v_scope
    from public.flight_runtime_controls as control
   where control.control_key = 'global';
  perform public.assert_flight_consumer_preview_runtime_v1(v_scope, 'ticketing');

  return query
  select
    request.id,
    request.order_id,
    support_order.customer_id,
    support_order.confirmation_code,
    support_order.status,
    request.request_type,
    request.reason_code,
    request.status,
    request.created_at,
    request.updated_at
  from public.flight_service_requests as request
  join public.flight_orders as support_order on support_order.id = request.order_id
  where support_order.consumer_flow_version = 1
    and support_order.execution_mode = 'test'
    and support_order.execution_scope_sha256 = v_scope
    and support_order.provider_code = 'duffel'
    and request.execution_mode = 'test'
    and request.execution_scope_sha256 = v_scope
    and (p_status is null or request.status = p_status)
  order by request.created_at desc, request.id desc
  limit p_limit;
end;
$list_flight_consumer_admin_service_requests$;

revoke all on function
  public.enforce_flight_consumer_preview_service_intake_v1()
from public, anon, authenticated, service_role;
revoke all on function
  public.create_flight_consumer_preview_service_request_v1(uuid,text,text,text),
  public.list_flight_consumer_preview_service_requests_v1(uuid),
  public.list_flight_consumer_admin_service_requests_v1(integer,text)
from public, anon, authenticated, service_role;

grant execute on function
  public.create_flight_consumer_preview_service_request_v1(uuid,text,text,text),
  public.list_flight_consumer_preview_service_requests_v1(uuid),
  public.list_flight_consumer_admin_service_requests_v1(integer,text)
to authenticated;

comment on function public.create_flight_consumer_preview_service_request_v1(uuid,text,text,text)
is 'Owner-authenticated, enum-only Consumer Preview support intake. It never enables or dispatches provider servicing.';
comment on function public.list_flight_consumer_preview_service_requests_v1(uuid)
is 'Owner-scoped Consumer Preview support request visibility without provider or passenger references.';
comment on function public.list_flight_consumer_admin_service_requests_v1(integer,text)
is 'Administrator-only Consumer Preview local support queue; read-only and test-scope bound.';

commit;

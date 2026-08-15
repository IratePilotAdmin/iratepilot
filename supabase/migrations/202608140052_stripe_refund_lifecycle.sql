begin;

alter table public.booking_cancellation_requests
  add column if not exists stripe_refund_status text,
  add column if not exists stripe_refund_failure_reason text,
  add column if not exists stripe_refund_status_updated_at timestamptz;

alter table public.booking_cancellation_requests
  drop constraint if exists booking_cancellation_requests_status_check;
alter table public.booking_cancellation_requests
  add constraint booking_cancellation_requests_status_check
  check (status in ('pending','processing','approved','rejected','refunded','refund_failed'));

alter table public.booking_cancellation_requests
  drop constraint if exists booking_cancellation_requests_stripe_refund_status_check;
alter table public.booking_cancellation_requests
  add constraint booking_cancellation_requests_stripe_refund_status_check
  check (
    stripe_refund_status is null
    or stripe_refund_status in ('pending','requires_action','succeeded','failed','canceled')
  );

create unique index if not exists booking_cancellation_requests_stripe_refund_id_uidx
  on public.booking_cancellation_requests(stripe_refund_id)
  where stripe_refund_id is not null;

create or replace function public.record_booking_refund_lifecycle(
  p_request_id uuid,
  p_refund_id text,
  p_refund_amount numeric,
  p_refund_status text,
  p_failure_reason text,
  p_event_created_at timestamptz
) returns public.booking_cancellation_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.booking_cancellation_requests;
  v_booking public.bookings;
  v_next_status text;
begin
  if p_refund_id is null or p_refund_id !~ '^re_' then
    raise exception 'Invalid Stripe refund reference';
  end if;
  if p_refund_status not in ('pending','requires_action','succeeded','failed','canceled') then
    raise exception 'Invalid Stripe refund status';
  end if;
  if p_event_created_at is null then
    raise exception 'Stripe refund event timestamp is required';
  end if;

  select * into v_request
  from public.booking_cancellation_requests
  where id = p_request_id
  for update;
  if not found then raise exception 'Cancellation request not found'; end if;

  select * into v_booking
  from public.bookings
  where id = v_request.booking_id
  for update;
  if not found then raise exception 'Booking not found'; end if;

  if p_refund_amount <> v_booking.total then
    raise exception 'Refund amount does not match booking total';
  end if;
  if v_request.stripe_refund_id is not null
    and v_request.stripe_refund_id <> p_refund_id
    and not (
      v_request.status = 'processing'
      and v_request.stripe_refund_status in ('failed','canceled')
    ) then
    raise exception 'Cancellation request is linked to a different Stripe refund';
  end if;
  if v_request.stripe_refund_id is null and v_request.status <> 'processing' then
    raise exception 'Cancellation refund is not claimed for processing';
  end if;

  if v_request.stripe_refund_status_updated_at is not null
    and v_request.stripe_refund_status_updated_at > p_event_created_at then
    return v_request;
  end if;
  if v_booking.status = 'refunded'
    and v_request.stripe_refund_status = 'succeeded'
    and p_refund_status in ('pending','requires_action') then
    return v_request;
  end if;

  v_next_status := case
    when p_refund_status = 'succeeded' and v_booking.status = 'refunded' then 'refunded'
    when p_refund_status = 'succeeded' then 'processing'
    when p_refund_status in ('failed','canceled') then 'refund_failed'
    else 'processing'
  end;

  update public.booking_cancellation_requests
  set status = v_next_status,
      refund_amount = p_refund_amount,
      stripe_refund_id = p_refund_id,
      stripe_refund_status = p_refund_status,
      stripe_refund_failure_reason = case
        when p_refund_status in ('failed','canceled')
          then left(coalesce(nullif(trim(p_failure_reason), ''), 'Stripe refund did not complete.'), 500)
        else null
      end,
      stripe_refund_status_updated_at = p_event_created_at,
      reviewed_at = case when v_next_status = 'refunded' then coalesce(reviewed_at, now()) else reviewed_at end,
      updated_at = now()
  where id = v_request.id
  returning * into v_request;

  return v_request;
end;
$$;

revoke all on function public.record_booking_refund_lifecycle(uuid, text, numeric, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_booking_refund_lifecycle(uuid, text, numeric, text, text, timestamptz)
  to service_role;

commit;

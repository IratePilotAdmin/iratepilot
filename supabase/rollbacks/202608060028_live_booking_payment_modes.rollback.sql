-- OPERATOR-ONLY ROLLBACK. Supabase does not apply files in this directory.
-- Before running:
--   1. Set ENABLE_LIVE_BOOKING_PAYMENTS=false and ENABLE_LIVE_STRIPE_WEBHOOKS=false.
--   2. Set NEXT_PUBLIC_PUBLIC_BOOKING=false and redeploy.
--   3. Roll Vercel production back to the commit before PR #145.
--   4. Confirm there are no live-mode payment records; this script also fails closed.

begin;

do $$
begin
  if exists (
    select 1 from public.bookings where stripe_payment_mode = 'live'
  ) then
    raise exception 'Rollback blocked: live payment records exist';
  end if;
end;
$$;

create or replace function public.complete_approved_booking_test_payment(
  p_booking_id uuid,
  p_customer_id uuid,
  p_payment_intent_id text,
  p_amount_total_cents integer
) returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
begin
  if p_payment_intent_id is null or p_payment_intent_id !~ '^pi_' then
    raise exception 'Invalid payment reference';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found or v_booking.customer_id <> p_customer_id then
    raise exception 'Booking not found';
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'Only confirmed reservations can be paid';
  end if;
  if round(v_booking.total * 100)::integer <> p_amount_total_cents then
    raise exception 'Payment amount does not match the reservation total';
  end if;
  if v_booking.stripe_payment_intent_id is not null then
    if v_booking.stripe_payment_intent_id = p_payment_intent_id then
      return v_booking;
    end if;
    raise exception 'This reservation already has a different payment';
  end if;

  update public.bookings
  set stripe_payment_intent_id = p_payment_intent_id,
      updated_at = now()
  where id = p_booking_id
  returning * into v_booking;

  update public.booking_financials
  set status = 'eligible'
  where booking_id = p_booking_id
    and status = 'awaiting_payment';

  insert into public.notifications (user_id, title, body)
  values (
    v_booking.customer_id,
    'Test payment received',
    'Your Stripe test payment for ' || v_booking.confirmation_code ||
      ' was recorded. No live card charge was created.'
  );

  return v_booking;
end;
$$;

create or replace function public.finalize_test_booking_refund(
  p_request_id uuid,
  p_refund_id text,
  p_refund_amount numeric
) returns public.bookings
language plpgsql
security definer set search_path = public
as $$
declare
  v_request public.booking_cancellation_requests;
  v_booking public.bookings;
  v_points integer;
begin
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

  if v_request.status = 'refunded' and v_booking.status = 'refunded' then
    return v_booking;
  end if;
  if v_request.status <> 'processing' then
    raise exception 'Cancellation refund is not claimed for processing';
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'Booking is not confirmed';
  end if;
  if p_refund_amount <> v_booking.total then
    raise exception 'Refund amount does not match booking total';
  end if;
  if exists (
    select 1
    from public.booking_financials
    where booking_id = v_booking.id
      and status = 'paid'
      and stripe_transfer_status <> 'reversed'
  ) then
    raise exception 'Partner transfer must be reversed before refund finalization';
  end if;

  update public.inventory
  set available_units = available_units + 1
  where room_id = v_booking.room_id
    and stay_date >= v_booking.check_in
    and stay_date < v_booking.check_out;

  update public.booking_financials
  set status = 'void',
      stripe_transfer_status = case
        when stripe_transfer_id is null
          and stripe_transfer_status in ('not_started','pending','failed')
        then 'cancelled'
        else stripe_transfer_status
      end,
      stripe_transfer_error = case
        when stripe_transfer_id is null
          and stripe_transfer_status in ('not_started','pending','failed')
        then null
        else stripe_transfer_error
      end
  where booking_id = v_booking.id
    and (status <> 'paid' or stripe_transfer_status = 'reversed');

  select coalesce(sum(points), 0)::integer into v_points
  from public.reward_ledger
  where booking_id = v_booking.id;
  if v_points <> 0 then
    insert into public.reward_ledger (user_id, booking_id, points, description)
    values (
      v_booking.customer_id, v_booking.id, -v_points,
      'Points reversed for refunded booking ' || v_booking.confirmation_code
    );
    update public.profiles
    set reward_points = greatest(0, reward_points - v_points)
    where id = v_booking.customer_id;
  end if;

  update public.bookings
  set status = 'refunded',
      cancellation_reason = v_request.reason,
      updated_at = now()
  where id = v_booking.id
  returning * into v_booking;

  update public.booking_cancellation_requests
  set status = 'refunded',
      refund_amount = p_refund_amount,
      stripe_refund_id = p_refund_id,
      reviewed_by = coalesce(auth.uid(), reviewed_by),
      reviewed_at = now(),
      updated_at = now()
  where id = v_request.id;

  insert into public.notifications (user_id, title, body)
  values (
    v_booking.customer_id,
    'Booking refunded',
    'Your test booking ' || v_booking.confirmation_code || ' was cancelled and refunded.'
  );
  return v_booking;
end;
$$;

revoke all on function public.complete_approved_booking_test_payment(uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.complete_approved_booking_test_payment(uuid, uuid, text, integer)
  to service_role;

revoke all on function public.finalize_test_booking_refund(uuid, text, numeric)
  from public, anon, authenticated;
grant execute on function public.finalize_test_booking_refund(uuid, text, numeric)
  to service_role;

drop function if exists public.complete_approved_booking_payment(uuid, uuid, text, integer, text);
drop function if exists public.finalize_booking_refund(uuid, text, numeric);

alter table public.bookings
  drop constraint if exists bookings_stripe_payment_mode_check;
alter table public.bookings
  drop column if exists stripe_payment_mode;

commit;

begin;

alter table public.booking_cancellation_requests
  drop constraint if exists booking_cancellation_requests_status_check;
alter table public.booking_cancellation_requests
  add constraint booking_cancellation_requests_status_check
  check (status in ('pending','processing','approved','rejected','refunded'));

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
  set status = 'void'
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

revoke all on function public.finalize_test_booking_refund(uuid, text, numeric)
  from public;
grant execute on function public.finalize_test_booking_refund(uuid, text, numeric)
  to service_role;

commit;

begin;

create or replace function public.cancel_unpaid_confirmed_booking(
  p_booking_id uuid,
  p_reason text
) returns public.booking_cancellation_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_request public.booking_cancellation_requests;
  v_points integer;
  v_is_admin boolean;
begin
  if auth.uid() is null and auth.role() <> 'service_role' then
    raise exception 'Authentication required';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;
  if not found then raise exception 'Booking not found'; end if;

  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ) into v_is_admin;
  if v_booking.customer_id <> auth.uid()
    and not v_is_admin
    and auth.role() <> 'service_role' then
    raise exception 'Not authorized';
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'Only confirmed bookings can be cancelled';
  end if;
  if v_booking.stripe_payment_intent_id is not null then
    raise exception 'Paid bookings require the refund workflow';
  end if;
  if v_booking.check_in <= current_date then
    raise exception 'Online cancellation is unavailable after check-in';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A cancellation reason is required';
  end if;

  update public.inventory
  set available_units = available_units + 1
  where room_id = v_booking.room_id
    and stay_date >= v_booking.check_in
    and stay_date < v_booking.check_out;

  update public.booking_financials
  set status = 'void'
  where booking_id = v_booking.id
    and status = 'awaiting_payment';

  select coalesce(sum(points), 0)::integer into v_points
  from public.reward_ledger
  where booking_id = v_booking.id;
  if v_points <> 0 then
    insert into public.reward_ledger (user_id, booking_id, points, description)
    values (
      v_booking.customer_id, v_booking.id, -v_points,
      'Points reversed for cancelled unpaid booking ' || v_booking.confirmation_code
    );
    update public.profiles
    set reward_points = greatest(0, reward_points - v_points)
    where id = v_booking.customer_id;
  end if;

  update public.bookings
  set status = 'cancelled',
      cancellation_reason = trim(p_reason),
      updated_at = now()
  where id = v_booking.id;

  insert into public.booking_cancellation_requests (
    booking_id, customer_id, reason, status, refund_amount,
    reviewed_by, reviewed_at, updated_at
  ) values (
    v_booking.id, v_booking.customer_id, trim(p_reason), 'approved', 0,
    case when v_is_admin then auth.uid() else null end, now(), now()
  )
  on conflict (booking_id) do update
    set reason = excluded.reason,
        status = 'approved',
        refund_amount = 0,
        reviewed_by = excluded.reviewed_by,
        reviewed_at = now(),
        updated_at = now()
    where booking_cancellation_requests.status = 'pending'
  returning * into v_request;
  if v_request.id is null then
    raise exception 'This cancellation request was already reviewed';
  end if;

  insert into public.booking_status_history (booking_id, status, note)
  values (v_booking.id, 'cancelled', 'Unpaid reservation cancelled; no refund required.');
  insert into public.notifications (user_id, title, body)
  values (
    v_booking.customer_id,
    'Unpaid reservation cancelled',
    'Your reservation ' || v_booking.confirmation_code ||
      ' was cancelled. No payment was collected, so no refund was required.'
  );
  return v_request;
end;
$$;

revoke all on function public.cancel_unpaid_confirmed_booking(uuid, text) from public;
revoke all on function public.cancel_unpaid_confirmed_booking(uuid, text) from anon;
revoke all on function public.cancel_unpaid_confirmed_booking(uuid, text) from authenticated;
revoke all on function public.cancel_unpaid_confirmed_booking(uuid, text) from service_role;
grant execute on function public.cancel_unpaid_confirmed_booking(uuid, text) to authenticated;
grant execute on function public.cancel_unpaid_confirmed_booking(uuid, text) to service_role;

commit;

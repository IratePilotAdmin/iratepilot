begin;

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

revoke all on function public.complete_approved_booking_test_payment(uuid, uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.complete_approved_booking_test_payment(uuid, uuid, text, integer) to service_role;

commit;

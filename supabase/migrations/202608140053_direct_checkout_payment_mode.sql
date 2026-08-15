begin;

create or replace function public.complete_paid_test_booking(
  p_payment_intent_id text,
  p_customer_id uuid,
  p_property_id uuid,
  p_room_id uuid,
  p_check_in date,
  p_check_out date,
  p_guests integer,
  p_confirmation_code text,
  p_amount_total_cents integer
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_nights integer;
  v_inventory_days integer;
  v_subtotal numeric(12,2);
  v_service_fee numeric(12,2);
  v_total numeric(12,2);
  v_tier text;
  v_partner_id uuid;
  v_commission numeric(12,2);
  v_points integer;
begin
  select * into v_booking
  from public.bookings
  where stripe_payment_intent_id = p_payment_intent_id;
  if found then return v_booking; end if;

  if p_check_out <= p_check_in then raise exception 'Invalid stay dates'; end if;
  v_nights := p_check_out - p_check_in;
  if v_nights < 1 or v_nights > 30 then raise exception 'Invalid stay length'; end if;

  perform 1
  from public.rooms r
  join public.properties p on p.id = r.property_id
  where r.id = p_room_id
    and r.property_id = p_property_id
    and r.active = true
    and p.active = true
    and p_guests between 1 and r.max_guests;
  if not found then raise exception 'Room is not bookable'; end if;

  perform 1
  from public.inventory
  where room_id = p_room_id
    and stay_date >= p_check_in
    and stay_date < p_check_out
  for update;

  select count(*), coalesce(sum(rate), 0)
  into v_inventory_days, v_subtotal
  from public.inventory
  where room_id = p_room_id
    and stay_date >= p_check_in
    and stay_date < p_check_out
    and available_units > 0;

  if v_inventory_days <> v_nights then raise exception 'Inventory is no longer available'; end if;

  select case when membership_status = 'active' then membership_tier else 'none' end
    into v_tier from public.profiles where id = p_customer_id;
  v_service_fee := case
    when v_tier in ('basic', 'business') then 0
    else round(v_subtotal * 0.05, 2)
  end;
  v_total := v_subtotal + v_service_fee;
  if round(v_total * 100)::integer <> p_amount_total_cents then
    raise exception 'Payment total does not match inventory';
  end if;

  insert into public.bookings (
    confirmation_code, customer_id, property_id, room_id,
    check_in, check_out, guests, subtotal, taxes, fees, total,
    status, stripe_payment_intent_id, stripe_payment_mode
  ) values (
    p_confirmation_code, p_customer_id, p_property_id, p_room_id,
    p_check_in, p_check_out, p_guests, v_subtotal, 0, v_service_fee, v_total,
    'confirmed', p_payment_intent_id, 'test'
  )
  returning * into v_booking;

  update public.inventory
  set available_units = available_units - 1
  where room_id = p_room_id
    and stay_date >= p_check_in
    and stay_date < p_check_out;

  insert into public.booking_status_history (booking_id, status, note)
  values (v_booking.id, 'confirmed', 'Stripe test payment verified; inventory reserved.');

  select partner_id into v_partner_id from public.properties where id = p_property_id;
  v_commission := round(v_subtotal * 0.10, 2);
  insert into public.booking_financials (
    booking_id, partner_id, gross_room_revenue, partner_commission, partner_net, status
  ) values (
    v_booking.id, v_partner_id, v_subtotal, v_commission, v_subtotal - v_commission, 'eligible'
  );

  v_points := case
    when v_tier = 'business' then floor(v_subtotal)::integer * 2
    when v_tier = 'basic' then floor(v_subtotal)::integer
    else 0
  end;
  if v_points > 0 then
    insert into public.reward_ledger (user_id, booking_id, points, description)
    values (p_customer_id, v_booking.id, v_points, 'Points earned for ' || v_booking.confirmation_code);
    update public.profiles
    set reward_points = reward_points + v_points
    where id = p_customer_id;
  end if;

  insert into public.notifications (user_id, title, body)
  values (
    p_customer_id,
    'Booking confirmed',
    'Your Stripe test booking ' || v_booking.confirmation_code || ' is confirmed.'
  );

  return v_booking;
end;
$$;

revoke all on function public.complete_paid_test_booking(text,uuid,uuid,uuid,date,date,integer,text,integer)
  from public, anon, authenticated;
grant execute on function public.complete_paid_test_booking(text,uuid,uuid,uuid,date,date,integer,text,integer)
  to service_role;

commit;

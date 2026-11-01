begin;

alter table public.rooms
  add column if not exists direct_bed_type text,
  add column if not exists direct_refundable boolean,
  add column if not exists direct_checkin_begin_time text,
  add column if not exists direct_checkin_end_time text,
  add column if not exists direct_checkin_instructions text,
  add column if not exists direct_special_checkin_instructions text;

alter table public.rooms
  add constraint rooms_direct_bed_type_length_check check (direct_bed_type is null or char_length(trim(direct_bed_type)) between 2 and 160),
  add constraint rooms_direct_checkin_begin_length_check check (direct_checkin_begin_time is null or char_length(trim(direct_checkin_begin_time)) between 1 and 40),
  add constraint rooms_direct_checkin_end_length_check check (direct_checkin_end_time is null or char_length(trim(direct_checkin_end_time)) between 1 and 40),
  add constraint rooms_direct_checkin_instructions_length_check check (direct_checkin_instructions is null or char_length(trim(direct_checkin_instructions)) between 10 and 4000),
  add constraint rooms_direct_special_checkin_length_check check (direct_special_checkin_instructions is null or char_length(trim(direct_special_checkin_instructions)) between 2 and 4000);

alter table public.bookings
  add column if not exists supplier_name text,
  add column if not exists supplier_itinerary_id text,
  add column if not exists bed_type text,
  add column if not exists refundable boolean,
  add column if not exists cancellation_policy text,
  add column if not exists checkin_begin_time text,
  add column if not exists checkin_end_time text,
  add column if not exists checkin_instructions text,
  add column if not exists special_checkin_instructions text,
  add column if not exists due_at_property numeric(12,2) not null default 0 check (due_at_property >= 0);

create or replace function public.complete_paid_test_booking(
  p_payment_intent_id text,
  p_customer_id uuid,
  p_property_id uuid,
  p_room_id uuid,
  p_check_in date,
  p_check_out date,
  p_guests integer,
  p_confirmation_code text,
  p_amount_total_cents integer,
  p_child_ages integer[]
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
  v_inventory_subtotal numeric(12,2);
  v_tax_total numeric(12,2);
  v_mandatory_fee_total numeric(12,2);
  v_discount_rate numeric(5,4);
  v_subtotal numeric(12,2);
  v_service_fee numeric(12,2);
  v_total numeric(12,2);
  v_tier text;
  v_partner_id uuid;
  v_commission numeric(12,2);
  v_points integer;
  v_room public.rooms;
begin
  select * into v_booking from public.bookings where stripe_payment_intent_id = p_payment_intent_id;
  if found then return v_booking; end if;
  if p_check_out <= p_check_in then raise exception 'Invalid stay dates'; end if;
  v_nights := p_check_out - p_check_in;
  if v_nights < 1 or v_nights > 30 then raise exception 'Invalid stay length'; end if;
  if p_child_ages is null or cardinality(p_child_ages) >= p_guests
    or not (p_child_ages <@ array[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17])
  then raise exception 'Invalid child ages'; end if;

  select r.* into v_room
  from public.rooms r join public.properties p on p.id = r.property_id
  where r.id = p_room_id and r.property_id = p_property_id and r.active = true
    and p.active = true and p_guests between 1 and r.max_guests;
  if not found then raise exception 'Room is not bookable'; end if;

  perform 1 from public.inventory
  where room_id = p_room_id and stay_date >= p_check_in and stay_date < p_check_out for update;

  select count(*), coalesce(sum(rate),0), coalesce(sum(direct_tax_amount),0),
    coalesce(sum(direct_mandatory_fee_amount),0)
  into v_inventory_days, v_inventory_subtotal, v_tax_total, v_mandatory_fee_total
  from public.inventory
  where room_id = p_room_id and stay_date >= p_check_in and stay_date < p_check_out
    and available_units > 0 and direct_tax_amount is not null and direct_mandatory_fee_amount is not null;
  if v_inventory_days <> v_nights then raise exception 'Inventory is no longer available'; end if;

  select case when membership_status = 'active' then membership_tier else 'none' end
  into v_tier from public.profiles where id = p_customer_id;
  v_discount_rate := case when v_tier='business' then 0.10 when v_tier='basic' then 0.05 else 0 end;
  v_subtotal := round(v_inventory_subtotal * (1 - v_discount_rate), 2);
  v_service_fee := 0;
  v_total := v_subtotal + v_tax_total + v_mandatory_fee_total;
  if round((v_subtotal + v_tax_total) * 100)::integer <> p_amount_total_cents then
    raise exception 'Payment total does not match inventory and membership benefits';
  end if;

  insert into public.bookings (
    confirmation_code,customer_id,property_id,room_id,check_in,check_out,guests,child_ages,
    subtotal,taxes,fees,total,status,stripe_payment_intent_id,stripe_payment_mode,
    bed_type,refundable,cancellation_policy,checkin_begin_time,checkin_end_time,
    checkin_instructions,special_checkin_instructions,due_at_property
  ) values (
    p_confirmation_code,p_customer_id,p_property_id,p_room_id,p_check_in,p_check_out,p_guests,p_child_ages,
    v_subtotal,v_tax_total,v_service_fee + v_mandatory_fee_total,v_total,'confirmed',p_payment_intent_id,'test',
    v_room.direct_bed_type,v_room.direct_refundable,v_room.direct_cancellation_policy,
    v_room.direct_checkin_begin_time,v_room.direct_checkin_end_time,
    v_room.direct_checkin_instructions,v_room.direct_special_checkin_instructions,v_mandatory_fee_total
  ) returning * into v_booking;

  update public.inventory set available_units=available_units-1
  where room_id=p_room_id and stay_date>=p_check_in and stay_date<p_check_out;
  insert into public.booking_status_history(booking_id,status,note)
  values(v_booking.id,'confirmed','Stripe test payment verified; inventory reserved.');
  select partner_id into v_partner_id from public.properties where id=p_property_id;
  v_commission := round(v_subtotal * 0.14,2);
  insert into public.booking_financials(booking_id,partner_id,gross_room_revenue,partner_commission,partner_net,status)
  values(v_booking.id,v_partner_id,v_subtotal,v_commission,v_subtotal-v_commission,'eligible');
  v_points := case when v_tier='business' then floor(v_subtotal)::integer*3 when v_tier='basic' then floor(v_subtotal)::integer*2 else 0 end;
  if v_points>0 then
    insert into public.reward_ledger(user_id,booking_id,points,description)
    values(p_customer_id,v_booking.id,v_points,'Points earned for '||v_booking.confirmation_code);
    update public.profiles set reward_points=reward_points+v_points where id=p_customer_id;
  end if;
  insert into public.notifications(user_id,title,body)
  values(p_customer_id,'Booking confirmed','Your Stripe test booking '||v_booking.confirmation_code||' is confirmed.');
  return v_booking;
end;
$$;

revoke all on function public.complete_paid_test_booking(text,uuid,uuid,uuid,date,date,integer,text,integer,integer[]) from public,anon,authenticated;
grant execute on function public.complete_paid_test_booking(text,uuid,uuid,uuid,date,date,integer,text,integer,integer[]) to service_role;

commit;

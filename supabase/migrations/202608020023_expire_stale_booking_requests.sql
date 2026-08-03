begin;

create or replace function public.review_booking(
  p_booking_id uuid,
  p_decision text,
  p_reason text default null
) returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings;
  v_authorized boolean;
  v_expected integer;
  v_available integer;
  v_tier text;
  v_points integer;
  v_partner_id uuid;
  v_commission numeric(12,2);
begin
  select b.* into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;
  if not found then raise exception 'Booking not found'; end if;

  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
    union all
    select 1
    from public.properties p
    join public.partners pa on pa.id = p.partner_id
    where p.id = v_booking.property_id
      and pa.owner_id = auth.uid()
      and pa.status = 'approved'
  ) into v_authorized;
  if not v_authorized then raise exception 'Not authorized'; end if;
  if v_booking.status <> 'pending' then
    raise exception 'Only pending requests can be reviewed';
  end if;

  if p_decision = 'approve' then
    if v_booking.check_in <= current_date then
      update public.bookings
      set status = 'cancelled',
          cancellation_reason = 'Booking request expired before partner approval',
          updated_at = now()
      where id = p_booking_id
      returning * into v_booking;
      insert into public.notifications (user_id, title, body)
      values (
        v_booking.customer_id,
        'Booking request expired',
        'Your iRatePilot request ' || v_booking.confirmation_code ||
          ' expired because check-in began before the property approved it. No payment was collected.'
      );
      return v_booking;
    end if;

    v_expected := v_booking.check_out - v_booking.check_in;
    perform 1 from public.inventory
      where room_id = v_booking.room_id
        and stay_date >= v_booking.check_in
        and stay_date < v_booking.check_out
      for update;
    select count(*) into v_available
    from public.inventory
    where room_id = v_booking.room_id
      and stay_date >= v_booking.check_in
      and stay_date < v_booking.check_out
      and available_units > 0;
    if v_available <> v_expected then
      raise exception 'Inventory is no longer available';
    end if;
    update public.inventory
    set available_units = available_units - 1
    where room_id = v_booking.room_id
      and stay_date >= v_booking.check_in
      and stay_date < v_booking.check_out;
    update public.bookings
    set status = 'confirmed', cancellation_reason = null, updated_at = now()
    where id = p_booking_id
    returning * into v_booking;
    select case when membership_status = 'active' then membership_tier else 'none' end
      into v_tier
      from public.profiles
      where id = v_booking.customer_id;
    v_points := case
      when v_tier = 'business' then floor(v_booking.subtotal)::integer * 2
      when v_tier = 'basic' then floor(v_booking.subtotal)::integer
      else 0
    end;
    if v_points > 0 then
      insert into public.reward_ledger (user_id, booking_id, points, description)
      values (
        v_booking.customer_id,
        v_booking.id,
        v_points,
        'Points earned for ' || v_booking.confirmation_code
      );
      update public.profiles
      set reward_points = reward_points + v_points
      where id = v_booking.customer_id;
    end if;
    select partner_id into v_partner_id
    from public.properties
    where id = v_booking.property_id;
    v_commission := round(v_booking.subtotal * 0.10, 2);
    insert into public.booking_financials (
      booking_id, partner_id, gross_room_revenue,
      partner_commission, partner_net, status
    ) values (
      v_booking.id, v_partner_id, v_booking.subtotal,
      v_commission, v_booking.subtotal - v_commission, 'awaiting_payment'
    ) on conflict (booking_id) do nothing;
    insert into public.notifications (user_id, title, body)
    values (
      v_booking.customer_id,
      'Booking request approved',
      'Your iRatePilot request ' || v_booking.confirmation_code ||
        ' has been approved. No payment has been collected.'
    );
  elsif p_decision = 'reject' then
    update public.bookings
    set status = 'cancelled',
        cancellation_reason = coalesce(nullif(p_reason,''), 'Property declined the request'),
        updated_at = now()
    where id = p_booking_id
    returning * into v_booking;
    insert into public.notifications (user_id, title, body)
    values (
      v_booking.customer_id,
      'Booking request declined',
      'Your iRatePilot request ' || v_booking.confirmation_code ||
        ' was declined. No payment was collected.'
    );
  else
    raise exception 'Invalid review decision';
  end if;
  return v_booking;
end;
$$;

revoke all on function public.review_booking(uuid, text, text) from public;
grant execute on function public.review_booking(uuid, text, text) to authenticated;

commit;

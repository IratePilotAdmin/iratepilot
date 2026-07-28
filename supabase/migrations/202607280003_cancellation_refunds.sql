begin;

create table if not exists public.booking_cancellation_requests (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','refunded')),
  refund_amount numeric(12,2) check (refund_amount >= 0),
  stripe_refund_id text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.booking_cancellation_requests enable row level security;

drop policy if exists "Customers can view own cancellation requests"
  on public.booking_cancellation_requests;
create policy "Customers can view own cancellation requests"
  on public.booking_cancellation_requests for select
  using (customer_id = auth.uid());

drop policy if exists "Admins can manage cancellation requests"
  on public.booking_cancellation_requests;
create policy "Admins can manage cancellation requests"
  on public.booking_cancellation_requests for all
  using (exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ))
  with check (exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  ));

create or replace function public.request_booking_cancellation(
  p_booking_id uuid,
  p_reason text
) returns public.booking_cancellation_requests
language plpgsql
security definer set search_path = public
as $$
declare
  v_booking public.bookings;
  v_request public.booking_cancellation_requests;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id and customer_id = auth.uid()
  for update;
  if not found then raise exception 'Booking not found'; end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'Only confirmed bookings can request cancellation';
  end if;
  if v_booking.check_in <= current_date then
    raise exception 'Online cancellation is unavailable after check-in';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'A cancellation reason is required';
  end if;

  insert into public.booking_cancellation_requests (
    booking_id, customer_id, reason
  ) values (
    v_booking.id, v_booking.customer_id, trim(p_reason)
  )
  on conflict (booking_id) do update
    set reason = excluded.reason,
        updated_at = now()
    where booking_cancellation_requests.status = 'pending'
  returning * into v_request;

  if v_request.id is null then
    raise exception 'This cancellation request has already been reviewed';
  end if;

  insert into public.notifications (user_id, title, body)
  values (
    v_booking.customer_id,
    'Cancellation request received',
    'We received your cancellation request for ' || v_booking.confirmation_code || '.'
  );
  return v_request;
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
  if v_request.status <> 'pending' then
    raise exception 'Cancellation request already reviewed';
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'Booking is not confirmed';
  end if;
  if p_refund_amount <> v_booking.total then
    raise exception 'Refund amount does not match booking total';
  end if;

  update public.inventory
  set available_units = available_units + 1
  where room_id = v_booking.room_id
    and stay_date >= v_booking.check_in
    and stay_date < v_booking.check_out;

  update public.booking_financials
  set status = 'void'
  where booking_id = v_booking.id and status <> 'paid';

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
      reviewed_by = auth.uid(),
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

revoke all on function public.request_booking_cancellation(uuid, text) from public;
grant execute on function public.request_booking_cancellation(uuid, text) to authenticated;
revoke all on function public.finalize_test_booking_refund(uuid, text, numeric) from public;
grant execute on function public.finalize_test_booking_refund(uuid, text, numeric) to service_role;

commit;

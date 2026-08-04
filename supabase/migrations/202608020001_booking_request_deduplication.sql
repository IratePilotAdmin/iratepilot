do $$
begin
  if exists (
    select 1
    from public.bookings
    where status in ('pending', 'confirmed')
    group by customer_id, room_id, check_in, check_out
    having count(*) > 1
  ) then
    raise exception 'Resolve duplicate open bookings before enabling booking request deduplication';
  end if;
end;
$$;

create unique index if not exists one_open_booking_per_stay
  on public.bookings (customer_id, room_id, check_in, check_out)
  where status in ('pending', 'confirmed');

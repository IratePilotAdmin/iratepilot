begin;

drop policy if exists "Customers can create own pending bookings" on public.bookings;

commit;

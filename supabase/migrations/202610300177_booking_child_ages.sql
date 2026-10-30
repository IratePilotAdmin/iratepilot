alter table public.bookings
  add column if not exists child_ages integer[] not null default '{}';

alter table public.bookings
  drop constraint if exists bookings_child_ages_valid;

alter table public.bookings
  add constraint bookings_child_ages_valid check (
    cardinality(child_ages) < guests
    and child_ages <@ array[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]
  );

begin;

alter table public.rooms
  add constraint rooms_max_guests_bounds
  check (max_guests between 1 and 30) not valid;

alter table public.rooms
  add constraint rooms_base_rate_bounds
  check (base_rate between 25 and 25000) not valid;

alter table public.inventory
  add constraint inventory_available_units_bounds
  check (available_units between 0 and 500) not valid;

alter table public.inventory
  add constraint inventory_rate_bounds
  check (rate between 25 and 25000) not valid;

commit;

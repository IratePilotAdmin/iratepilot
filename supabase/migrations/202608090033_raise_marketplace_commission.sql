begin;

-- Apply the current marketplace commission at the database boundary so every
-- booking workflow uses the same rate, including legacy RPC insert paths.
create or replace function public.apply_marketplace_commission()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.partner_commission := round(new.gross_room_revenue * 0.14, 2);
  new.partner_net := new.gross_room_revenue - new.partner_commission;
  return new;
end;
$$;

drop trigger if exists apply_marketplace_commission_before_insert
  on public.booking_financials;
create trigger apply_marketplace_commission_before_insert
before insert on public.booking_financials
for each row execute function public.apply_marketplace_commission();

comment on function public.apply_marketplace_commission() is
  'Sets the 14% iRatePilot marketplace commission for newly created booking financial records.';

commit;

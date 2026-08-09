begin;

drop trigger if exists apply_marketplace_commission_before_insert
  on public.booking_financials;
drop function if exists public.apply_marketplace_commission();

commit;

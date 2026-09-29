begin;

do $$
begin
  if to_regclass('public.hotel_stay_requests') is not null
    and exists (select 1 from public.hotel_stay_requests limit 1) then
    raise exception 'Refusing to roll back 202608220071 while direct hotel request records exist';
  end if;
  if to_regclass('public.direct_hotel_runtime_controls') is not null
    and exists (
      select 1 from public.direct_hotel_runtime_controls
      where request_submission_enabled
        or partner_offers_enabled
        or expiry_worker_verified
        or not transaction_kill_switch_engaged
        or booking_authority_enabled
        or payment_authority_enabled
        or reward_authority_enabled
        or payout_authority_enabled
        or supplier_traffic_enabled
    ) then
    raise exception 'Refusing to roll back 202608220071 while a direct hotel runtime gate differs from its safe default';
  end if;
  if exists (
    select 1 from public.rooms
    where direct_rate_plan_code is not null
      or direct_rate_plan_name is not null
      or direct_currency_code is not null
      or direct_cancellation_policy is not null
      or direct_cancellation_policy_version is not null
  ) then
    raise exception 'Refusing to roll back 202608220071 while direct room terms exist';
  end if;
  if exists (
    select 1 from public.inventory
    where direct_tax_amount is not null
      or direct_mandatory_fee_amount is not null
  ) then
    raise exception 'Refusing to roll back 202608220071 while direct inventory pricing exists';
  end if;
end;
$$;

drop function if exists public.expire_direct_hotel_stay_requests(integer);
drop function if exists public.withdraw_direct_hotel_stay_request(uuid, text);
drop function if exists public.review_direct_hotel_stay_request(uuid, text, text, timestamptz);
drop function if exists public.release_direct_hotel_request_holds(uuid, text);
drop function if exists public.submit_direct_hotel_stay_request(
  uuid, uuid, date, date, integer, text, text, text, text, uuid
);

drop trigger if exists prevent_direct_hotel_event_mutation
  on public.hotel_stay_request_events;
drop function if exists public.prevent_direct_hotel_event_mutation();
drop trigger if exists enforce_direct_hotel_active_hold_inventory_immutability
  on public.inventory;
drop function if exists public.enforce_direct_hotel_active_hold_inventory_immutability();

drop table if exists public.hotel_inventory_holds;
drop table if exists public.hotel_stay_request_events;
drop table if exists public.hotel_stay_requests;
drop table if exists public.direct_hotel_runtime_controls;

alter table public.inventory
  drop constraint if exists inventory_direct_tax_amount_bounds,
  drop constraint if exists inventory_direct_mandatory_fee_bounds,
  drop column if exists direct_tax_amount,
  drop column if exists direct_mandatory_fee_amount;

alter table public.rooms
  drop constraint if exists rooms_direct_currency_code_check,
  drop constraint if exists rooms_direct_rate_plan_code_length_check,
  drop constraint if exists rooms_direct_rate_plan_name_length_check,
  drop constraint if exists rooms_direct_cancellation_policy_length_check,
  drop constraint if exists rooms_direct_cancellation_version_length_check,
  drop column if exists direct_rate_plan_code,
  drop column if exists direct_rate_plan_name,
  drop column if exists direct_currency_code,
  drop column if exists direct_cancellation_policy,
  drop column if exists direct_cancellation_policy_version;

commit;

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Reconcile the effective hotel fee contract without replaying the missing
-- historical 062/063 files or guessing which version a database has applied.
-- Deploy the compatible application with booking writes disabled first.
-- Existing money is never recalculated; older rows without snapshots receive
-- an explicitly unknown historical schedule, not an inferred percentage.
lock table public.booking_financials in access exclusive mode;

alter table public.booking_financials
  add column if not exists reward_program_fee numeric(12,2) not null default 0,
  add column if not exists partner_commission_rate_bps smallint,
  add column if not exists reward_program_fee_rate_bps smallint not null default 0,
  add column if not exists fee_schedule_version text not null default 'legacy_recorded_split_v0';

-- IF NOT EXISTS alone would silently accept incompatible partial deployments.
do $hotel_fee_column_contract$
declare
  v_expected record;
begin
  for v_expected in
    select * from (values
      ('gross_room_revenue', 'numeric(12,2)', true),
      ('partner_commission', 'numeric(12,2)', true),
      ('reward_program_fee', 'numeric(12,2)', true),
      ('partner_net', 'numeric(12,2)', true),
      ('partner_commission_rate_bps', 'smallint', false),
      ('reward_program_fee_rate_bps', 'smallint', true),
      ('fee_schedule_version', 'text', true)
    ) as contract(column_name, column_type, required)
  loop
    if not exists (
      select 1 from pg_catalog.pg_attribute a
      where a.attrelid = 'public.booking_financials'::regclass
        and a.attname = v_expected.column_name and not a.attisdropped
        and pg_catalog.format_type(a.atttypid, a.atttypmod) = v_expected.column_type
        and a.attnotnull = v_expected.required
    ) then
      raise exception 'Hotel fee column contract mismatch: %', v_expected.column_name;
    end if;
  end loop;
end;
$hotel_fee_column_contract$;

alter table public.booking_financials
  drop constraint if exists booking_financials_reward_program_fee_check,
  drop constraint if exists booking_financials_partner_commission_rate_bps_check,
  drop constraint if exists booking_financials_reward_program_fee_rate_bps_check,
  drop constraint if exists booking_financials_combined_fee_rate_bps_check,
  drop constraint if exists booking_financials_fee_schedule_version_check,
  drop constraint if exists booking_financials_finite_amounts_check,
  drop constraint if exists booking_financials_amount_reconciliation_check;

alter table public.booking_financials
  add constraint booking_financials_reward_program_fee_check
    check (reward_program_fee >= 0),
  add constraint booking_financials_partner_commission_rate_bps_check
    check (partner_commission_rate_bps is null or partner_commission_rate_bps between 0 and 10000),
  add constraint booking_financials_reward_program_fee_rate_bps_check
    check (reward_program_fee_rate_bps between 0 and 10000),
  add constraint booking_financials_combined_fee_rate_bps_check
    check (coalesce(partner_commission_rate_bps, 0) + reward_program_fee_rate_bps <= 10000),
  add constraint booking_financials_fee_schedule_version_check
    check (
      (fee_schedule_version = 'legacy_recorded_split_v0'
        and partner_commission_rate_bps is null and reward_program_fee_rate_bps = 0)
      or
      (fee_schedule_version = 'hotel_partner_commission_13_reward_fee_3_v1'
        and partner_commission_rate_bps is not null
        and partner_commission_rate_bps = 1300 and reward_program_fee_rate_bps = 300)
      or
      (fee_schedule_version = 'partner_commission_14_reward_fee_0_v1'
        and partner_commission_rate_bps is not null
        and partner_commission_rate_bps = 1400 and reward_program_fee_rate_bps = 0)
    ),
  add constraint booking_financials_finite_amounts_check
    check (gross_room_revenue <> 'NaN'::numeric
      and partner_commission <> 'NaN'::numeric
      and reward_program_fee <> 'NaN'::numeric
      and partner_net <> 'NaN'::numeric),
  add constraint booking_financials_amount_reconciliation_check
    check (gross_room_revenue = partner_commission + reward_program_fee + partner_net);

create or replace function public.apply_marketplace_commission()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.gross_room_revenue is distinct from old.gross_room_revenue
      or new.partner_commission is distinct from old.partner_commission
      or new.reward_program_fee is distinct from old.reward_program_fee
      or new.partner_net is distinct from old.partner_net
      or new.partner_commission_rate_bps is distinct from old.partner_commission_rate_bps
      or new.reward_program_fee_rate_bps is distinct from old.reward_program_fee_rate_bps
      or new.fee_schedule_version is distinct from old.fee_schedule_version then
      raise exception 'Booking financial fee schedule fields are immutable after insert'
        using errcode = '23514';
    end if;
    return new;
  end if;

  new.partner_commission_rate_bps := 1300;
  new.reward_program_fee_rate_bps := 300;
  new.fee_schedule_version := 'hotel_partner_commission_13_reward_fee_3_v1';
  new.partner_commission := round(new.gross_room_revenue * new.partner_commission_rate_bps / 10000, 2);
  new.reward_program_fee := round(new.gross_room_revenue * new.reward_program_fee_rate_bps / 10000, 2);
  new.partner_net := new.gross_room_revenue - new.partner_commission - new.reward_program_fee;
  return new;
end;
$$;

drop trigger if exists apply_marketplace_commission_before_insert on public.booking_financials;
create trigger apply_marketplace_commission_before_insert
before insert or update of gross_room_revenue, partner_commission, reward_program_fee,
  partner_net, partner_commission_rate_bps, reward_program_fee_rate_bps, fee_schedule_version
on public.booking_financials
for each row execute function public.apply_marketplace_commission();

alter table public.booking_financials
  alter column reward_program_fee drop default,
  alter column reward_program_fee_rate_bps drop default,
  alter column fee_schedule_version drop default;

comment on function public.apply_marketplace_commission() is
  'New hotel financial snapshots: 13% iRatePilot Group, LLC commission plus a separate 3% iRate Rewards Program contribution (16% total hotel distribution cost); existing recorded money and rates are immutable.';

commit;

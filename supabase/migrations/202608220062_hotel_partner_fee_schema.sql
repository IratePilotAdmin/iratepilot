begin;

-- Prepare additive, mixed-history-safe accounting fields before the 13% + 3%
-- schedule is activated. Existing rows keep their recorded money. Pre-033 rows
-- can contain an earlier commission rate, so no historical rate is inferred.
alter table public.booking_financials
  add column if not exists reward_program_fee numeric(12,2) not null default 0,
  add column if not exists partner_commission_rate_bps smallint,
  add column if not exists reward_program_fee_rate_bps smallint not null default 0,
  add column if not exists fee_schedule_version text not null default 'legacy_recorded_split_v0';

alter table public.booking_financials
  drop constraint if exists booking_financials_reward_program_fee_check,
  drop constraint if exists booking_financials_partner_commission_rate_bps_check,
  drop constraint if exists booking_financials_reward_program_fee_rate_bps_check,
  drop constraint if exists booking_financials_combined_fee_rate_bps_check,
  drop constraint if exists booking_financials_fee_schedule_version_check,
  drop constraint if exists booking_financials_amount_reconciliation_check;

alter table public.booking_financials
  add constraint booking_financials_reward_program_fee_check
    check (reward_program_fee >= 0),
  add constraint booking_financials_partner_commission_rate_bps_check
    check (
      partner_commission_rate_bps is null
      or partner_commission_rate_bps between 0 and 10000
    ),
  add constraint booking_financials_reward_program_fee_rate_bps_check
    check (reward_program_fee_rate_bps between 0 and 10000),
  add constraint booking_financials_combined_fee_rate_bps_check
    check (
      coalesce(partner_commission_rate_bps, 0)
        + reward_program_fee_rate_bps <= 10000
    ),
  add constraint booking_financials_fee_schedule_version_check
    check (
      (fee_schedule_version = 'legacy_recorded_split_v0'
        and partner_commission_rate_bps is null
        and reward_program_fee_rate_bps = 0)
      or
      (fee_schedule_version = 'hotel_partner_commission_13_reward_fee_3_v1'
        and partner_commission_rate_bps = 1300
        and reward_program_fee_rate_bps = 300)
      or
      (fee_schedule_version = 'partner_commission_14_reward_fee_0_v1'
        and partner_commission_rate_bps = 1400
        and reward_program_fee_rate_bps = 0)
    ),
  add constraint booking_financials_amount_reconciliation_check
    check (
      gross_room_revenue
        = partner_commission + reward_program_fee + partner_net
    );

-- Preparation deliberately keeps the preceding 14%/0% schedule active. This
-- makes the schema safe for the old application while the compatible build is
-- deployed. Migration 063 is the separate monetary activation boundary.
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

  new.partner_commission_rate_bps := 1400;
  new.reward_program_fee_rate_bps := 0;
  new.fee_schedule_version := 'partner_commission_14_reward_fee_0_v1';
  new.partner_commission := round(
    new.gross_room_revenue * new.partner_commission_rate_bps / 10000,
    2
  );
  new.reward_program_fee := 0;
  new.partner_net := new.gross_room_revenue - new.partner_commission;
  return new;
end;
$$;

drop trigger if exists apply_marketplace_commission_before_insert
  on public.booking_financials;
create trigger apply_marketplace_commission_before_insert
before insert or update of
  gross_room_revenue,
  partner_commission,
  reward_program_fee,
  partner_net,
  partner_commission_rate_bps,
  reward_program_fee_rate_bps,
  fee_schedule_version
on public.booking_financials
for each row execute function public.apply_marketplace_commission();

alter table public.booking_financials
  alter column reward_program_fee drop default,
  alter column reward_program_fee_rate_bps drop default,
  alter column fee_schedule_version drop default;

comment on function public.apply_marketplace_commission() is
  'Preparation stage: records the preceding 14%/0% schedule for new rows while additive hotel fee fields are deployed; preserves every recorded split.';

commit;

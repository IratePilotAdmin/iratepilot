begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Operational rollback preserves all recorded terms and additive columns. The
-- previous deployed schedule is not knowable from missing migration history:
-- stop NEW financial inserts instead of silently reinstating an obsolete fee.
-- Reapplying migration 139 restores new 13% + 3% snapshots after investigation.
lock table public.booking_financials in access exclusive mode;

create or replace function public.apply_marketplace_commission()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    raise exception 'New hotel booking financial records are paused by fee alignment rollback'
      using errcode = '55000';
  end if;
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
end;
$$;

comment on function public.apply_marketplace_commission() is
  'Fee alignment rollback pauses new hotel financial inserts; recorded 13% + 3% and historical schedules remain immutable, while status updates remain available.';

commit;

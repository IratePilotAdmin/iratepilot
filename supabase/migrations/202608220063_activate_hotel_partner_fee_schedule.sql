begin;

-- Activate the new schedule only after migration 062 and the compatible
-- application build are verified with booking writes disabled.
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
  new.partner_commission := round(
    new.gross_room_revenue * new.partner_commission_rate_bps / 10000,
    2
  );
  new.reward_program_fee := round(
    new.gross_room_revenue * new.reward_program_fee_rate_bps / 10000,
    2
  );
  new.partner_net := new.gross_room_revenue
    - new.partner_commission
    - new.reward_program_fee;
  return new;
end;
$$;

comment on function public.apply_marketplace_commission() is
  'Activation stage: for new booking financial rows, records a 13% partner commission and separate 3% hotel-side iRate Reward Program fee on post-discount gross room revenue; preserves every recorded split.';

commit;

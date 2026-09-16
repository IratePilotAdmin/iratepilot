\set ON_ERROR_STOP on

-- Use only a NEW disposable local database named hotel_fee_test_<suffix>.
-- These fixtures intentionally omit unrelated booking/property foreign keys.
do $$
begin
  if current_database() !~ '^hotel_fee_test_[a-z0-9_]+$'
    or coalesce(inet_server_addr()::text, '') not in ('127.0.0.1', '::1')
    or to_regclass('public.booking_financials') is not null then
    raise exception 'Requires an empty disposable hotel_fee_test_* database on loopback';
  end if;
end;
$$;

create function public.assert_fee(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_condition is distinct from true then raise exception 'ASSERT: %', p_message; end if;
end;
$$;

create table public.booking_financials (
  id integer primary key,
  gross_room_revenue numeric(12,2) not null check (gross_room_revenue >= 0),
  partner_commission numeric(12,2) not null check (partner_commission >= 0),
  partner_net numeric(12,2) not null check (partner_net >= 0),
  status text not null default 'awaiting_payment'
);
insert into public.booking_financials values
  (1, 1000, 120, 880, 'paid'),
  (2, 1000, 140, 860, 'eligible');

\ir ../../supabase/hotel-migrations/202609160139_reconcile_hotel_partner_fee_schedule.sql

select public.assert_fee(count(*) = 2, 'historical money preserved with unknown historical rates')
from public.booking_financials
where (id, partner_commission, partner_net) in ((1, 120, 880), (2, 140, 860))
  and reward_program_fee = 0 and partner_commission_rate_bps is null
  and reward_program_fee_rate_bps = 0 and fee_schedule_version = 'legacy_recorded_split_v0';

-- Even callers still sending the former intermediate split cannot override
-- the authoritative new schedule. Every monetary field is supplied by trigger.
insert into public.booking_financials (id, gross_room_revenue, partner_commission, partner_net)
values (3, 1000, 140, 860), (4, 0.04, 0, 0), (5, 0, 0, 0);
select public.assert_fee(partner_commission = 130 and reward_program_fee = 30
  and partner_net = 840 and partner_commission_rate_bps = 1300
  and reward_program_fee_rate_bps = 300
  and fee_schedule_version = 'hotel_partner_commission_13_reward_fee_3_v1',
  '$1000 records $130 commission, $30 rewards contribution and $840 net')
from public.booking_financials where id = 3;
select public.assert_fee(partner_commission = 0.01 and reward_program_fee = 0 and partner_net = 0.03,
  'fees round independently to currency cents') from public.booking_financials where id = 4;
select public.assert_fee(partner_commission = 0 and reward_program_fee = 0 and partner_net = 0,
  'zero revenue is supported') from public.booking_financials where id = 5;
do $$
begin
  begin
    insert into public.booking_financials (id, gross_room_revenue) values (9, 'NaN'::numeric);
    raise exception 'Expected NaN monetary refusal';
  exception when check_violation then
    if sqlerrm not like '%booking_financials_finite_amounts_check%' then raise; end if;
  end;
end;
$$;

update public.booking_financials set status = 'paid' where id in (1, 3);
update public.booking_financials set partner_commission = partner_commission where id in (1, 3);
do $$
declare v_field text; v_value text;
begin
  for v_field, v_value in select * from (values
    ('gross_room_revenue', '1001'), ('partner_commission', '140'),
    ('reward_program_fee', '40'), ('partner_net', '830'),
    ('partner_commission_rate_bps', '1400'), ('reward_program_fee_rate_bps', '0'),
    ('fee_schedule_version', '''legacy_recorded_split_v0''')
  ) as mutations(field_name, field_value)
  loop
    begin
      execute format('update public.booking_financials set %I = %s where id = 3', v_field, v_value);
      raise exception 'Expected snapshot mutation refusal: %', v_field;
    exception when check_violation then
      if sqlerrm <> 'Booking financial fee schedule fields are immutable after insert' then raise; end if;
    end;
  end loop;
end;
$$;

-- Seed a known historical snapshot as it could exist before this migration.
-- This privileged fixture does not represent an application permission.
alter table public.booking_financials disable trigger apply_marketplace_commission_before_insert;
insert into public.booking_financials values
  (6, 1000, 140, 860, 'paid', 0, 1400, 0, 'partner_commission_14_reward_fee_0_v1');
do $$
begin
  begin
    insert into public.booking_financials values
      (7, 1000, 130, 840, 'paid', 30, null, 300, 'hotel_partner_commission_13_reward_fee_3_v1');
    raise exception 'Expected null rate snapshot refusal';
  exception when check_violation then null;
  end;
end;
$$;
alter table public.booking_financials enable trigger apply_marketplace_commission_before_insert;
create table public.expected_financials as select * from public.booking_financials;

-- The same migration supports both the old schema and already-applied 13%+3%
-- schema. Replaying it preserves every historical and current snapshot byte.
\ir ../../supabase/hotel-migrations/202609160139_reconcile_hotel_partner_fee_schedule.sql
select public.assert_fee(not exists (
  (select * from public.booking_financials except select * from public.expected_financials)
  union all
  (select * from public.expected_financials except select * from public.booking_financials)
), 'migration replay preserves all rows');

\ir ../../supabase/hotel-rollbacks/202609160139_reconcile_hotel_partner_fee_schedule.rollback.sql
do $$
begin
  begin
    insert into public.booking_financials (id, gross_room_revenue) values (8, 1000);
    raise exception 'Expected rollback insert refusal';
  exception when object_not_in_prerequisite_state then
    if sqlerrm <> 'New hotel booking financial records are paused by fee alignment rollback' then raise; end if;
  end;
  begin
    update public.booking_financials set partner_net = 860 where id = 3;
    raise exception 'Expected rollback mutation refusal';
  exception when check_violation then
    if sqlerrm <> 'Booking financial fee schedule fields are immutable after insert' then raise; end if;
  end;
end;
$$;
update public.booking_financials set status = 'eligible' where id = 3;
select public.assert_fee(partner_commission = 130 and reward_program_fee = 30 and partner_net = 840,
  'rollback preserves money and allows status updates') from public.booking_financials where id = 3;

\ir ../../supabase/hotel-migrations/202609160139_reconcile_hotel_partner_fee_schedule.sql
insert into public.booking_financials (id, gross_room_revenue) values (8, 1000);
select public.assert_fee(partner_commission = 130 and reward_program_fee = 30 and partner_net = 840,
  'reapply restores current schedule') from public.booking_financials where id = 8;
select 'PASS: legacy preservation, current split, rounding, immutability, replay, rollback and reapply' as result;

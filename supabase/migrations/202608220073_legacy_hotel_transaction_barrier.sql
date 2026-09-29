begin;

-- A database-enforced hold for the legacy booking/payment workflow. Application
-- environment flags are defense in depth; this singleton is the authoritative
-- barrier against direct RPC or service-layer mutation.
create table if not exists public.hotel_legacy_transaction_controls (
  singleton boolean primary key default true check (singleton),
  booking_approval_enabled boolean not null default false,
  payment_finalization_enabled boolean not null default false,
  reward_issuance_enabled boolean not null default false,
  partner_connect_onboarding_enabled boolean not null default false,
  partner_payout_enabled boolean not null default false,
  change_reference text,
  updated_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint hotel_legacy_transaction_control_dependency check (
    (not booking_approval_enabled or reward_issuance_enabled)
    and (not payment_finalization_enabled or booking_approval_enabled)
    and (not partner_payout_enabled or payment_finalization_enabled)
  )
);

insert into public.hotel_legacy_transaction_controls (
  singleton,
  booking_approval_enabled,
  payment_finalization_enabled,
  reward_issuance_enabled,
  partner_connect_onboarding_enabled,
  partner_payout_enabled,
  change_reference
) values (true, false, false, false, false, false, 'initial_fail_closed_hold')
on conflict (singleton) do nothing;

alter table public.hotel_legacy_transaction_controls enable row level security;
revoke all on public.hotel_legacy_transaction_controls from public, anon, authenticated;
grant select on public.hotel_legacy_transaction_controls to authenticated;
grant all on public.hotel_legacy_transaction_controls to service_role;

drop policy if exists "Admins view legacy hotel transaction controls"
  on public.hotel_legacy_transaction_controls;
create policy "Admins view legacy hotel transaction controls"
  on public.hotel_legacy_transaction_controls
  for select to authenticated
  using (exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.role = 'admin'
  ));

create or replace function public.enforce_legacy_hotel_booking_barrier()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_approval_enabled boolean := false;
  v_payment_enabled boolean := false;
begin
  select booking_approval_enabled, payment_finalization_enabled
  into v_approval_enabled, v_payment_enabled
  from public.hotel_legacy_transaction_controls
  where singleton = true;

  if tg_op = 'INSERT' then
    if new.status = 'confirmed' and not coalesce(v_approval_enabled, false) then
      raise exception 'Legacy hotel booking approval is disabled'
        using errcode = '55000';
    end if;
    if new.stripe_payment_intent_id is not null
      and not coalesce(v_payment_enabled, false)
    then
      raise exception 'Legacy hotel payment finalization is disabled'
        using errcode = '55000';
    end if;
    return new;
  end if;

  if new.status = 'confirmed'
    and new.status is distinct from old.status
    and not coalesce(v_approval_enabled, false)
  then
    raise exception 'Legacy hotel booking approval is disabled'
      using errcode = '55000';
  end if;
  if new.stripe_payment_intent_id is not null
    and new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id
    and not coalesce(v_payment_enabled, false)
  then
    raise exception 'Legacy hotel payment finalization is disabled'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_legacy_hotel_booking_barrier()
  from public, anon, authenticated;
drop trigger if exists enforce_legacy_hotel_booking_barrier on public.bookings;
create trigger enforce_legacy_hotel_booking_barrier
before insert or update of status, stripe_payment_intent_id on public.bookings
for each row execute function public.enforce_legacy_hotel_booking_barrier();

create or replace function public.enforce_legacy_hotel_financial_barrier()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_approval_enabled boolean := false;
  v_payment_enabled boolean := false;
  v_payout_enabled boolean := false;
begin
  select booking_approval_enabled, payment_finalization_enabled, partner_payout_enabled
  into v_approval_enabled, v_payment_enabled, v_payout_enabled
  from public.hotel_legacy_transaction_controls
  where singleton = true;

  if tg_op = 'INSERT' and not coalesce(v_approval_enabled, false) then
    raise exception 'Legacy hotel financial creation is disabled'
      using errcode = '55000';
  end if;
  if new.status in ('eligible', 'paid')
    and (tg_op = 'INSERT' or new.status is distinct from old.status)
    and not coalesce(v_payment_enabled, false)
  then
    raise exception 'Legacy hotel payment finalization is disabled'
      using errcode = '55000';
  end if;
  if new.status = 'paid'
    and (tg_op = 'INSERT' or new.status is distinct from old.status)
    and not coalesce(v_payout_enabled, false)
  then
    raise exception 'Legacy hotel partner payout authority is disabled'
      using errcode = '55000';
  end if;
  -- Void/reversal updates remain available so an existing customer payment can
  -- still be refunded while new transaction authority is held.
  return new;
end;
$$;

revoke all on function public.enforce_legacy_hotel_financial_barrier()
  from public, anon, authenticated;
drop trigger if exists enforce_legacy_hotel_financial_barrier
  on public.booking_financials;
create trigger enforce_legacy_hotel_financial_barrier
before insert or update of status on public.booking_financials
for each row execute function public.enforce_legacy_hotel_financial_barrier();

create or replace function public.enforce_legacy_hotel_reward_barrier()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reward_enabled boolean := false;
begin
  select reward_issuance_enabled
  into v_reward_enabled
  from public.hotel_legacy_transaction_controls
  where singleton = true;
  if new.booking_id is not null
    and new.points > (
      case
        when tg_op = 'UPDATE' and new.booking_id is not distinct from old.booking_id
          then old.points
        else 0
      end
    )
    and not coalesce(v_reward_enabled, false)
  then
    raise exception 'Legacy hotel reward issuance authority is disabled'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_legacy_hotel_reward_barrier()
  from public, anon, authenticated;
drop trigger if exists enforce_legacy_hotel_reward_barrier
  on public.reward_ledger;
create trigger enforce_legacy_hotel_reward_barrier
before insert or update of booking_id, points on public.reward_ledger
for each row execute function public.enforce_legacy_hotel_reward_barrier();

comment on table public.hotel_legacy_transaction_controls is
  'Authoritative fail-closed database hold for the legacy booking and payment path. Direct-hotel request/offer records are outside this transaction authority.';

commit;

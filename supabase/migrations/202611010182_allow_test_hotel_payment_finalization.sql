begin;

-- Keep the authoritative live-money hold closed while allowing the explicitly
-- enabled Stripe sandbox checkout to record its test-only payment evidence.
-- Live-mode payment rows still require payment_finalization_enabled = true.
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
      and new.stripe_payment_mode is distinct from 'test'
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
    and new.stripe_payment_mode is distinct from 'test'
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
  v_booking_payment_mode text;
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
  then
    select stripe_payment_mode
    into v_booking_payment_mode
    from public.bookings
    where id = new.booking_id;

    if not coalesce(v_payment_enabled, false)
      and not (new.status = 'eligible' and v_booking_payment_mode = 'test')
    then
      raise exception 'Legacy hotel payment finalization is disabled'
        using errcode = '55000';
    end if;
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

comment on function public.enforce_legacy_hotel_booking_barrier() is
  'Fail-closed legacy hotel booking barrier. Stripe test-mode settlement is allowed without granting live payment authority.';
comment on function public.enforce_legacy_hotel_financial_barrier() is
  'Fail-closed legacy hotel financial barrier. Test-mode bookings may become eligible; paid/live payout states remain gated.';

commit;

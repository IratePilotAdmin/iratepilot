do $$
begin
  if exists (
    select 1
    from public.bookings
    where stripe_payment_intent_id is not null
    group by stripe_payment_intent_id
    having count(*) > 1
  ) then
    raise exception 'Resolve duplicate Stripe payment bookings before enabling payment idempotency';
  end if;
end;
$$;

create unique index if not exists bookings_stripe_payment_intent_id_key
  on public.bookings (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

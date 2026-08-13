do $$
begin
  if exists (
    select 1
    from public.partners
    where stripe_connect_mode = 'live'
      and stripe_connect_account_id is not null
  ) then
    raise exception 'Rollback blocked: live Stripe Connect accounts are recorded.';
  end if;
end
$$;

alter table public.partners
  drop constraint if exists partners_stripe_connect_mode_check;

alter table public.partners
  drop column if exists stripe_connect_mode;

alter table public.partners
  add column if not exists stripe_connect_mode text;

update public.partners
set stripe_connect_mode = 'test'
where stripe_connect_account_id is not null
  and stripe_connect_mode is null;

alter table public.partners
  drop constraint if exists partners_stripe_connect_mode_check;

alter table public.partners
  add constraint partners_stripe_connect_mode_check
  check (stripe_connect_mode is null or stripe_connect_mode in ('test', 'live'));

comment on column public.partners.stripe_connect_mode is
  'Stripe environment for stripe_connect_account_id. Prevents test and live Connect accounts from being mixed.';

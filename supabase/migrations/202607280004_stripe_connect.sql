begin;

alter table public.partners
  add column if not exists stripe_connect_account_id text unique,
  add column if not exists stripe_connect_status text not null default 'not_started'
    check (stripe_connect_status in ('not_started','pending','restricted','ready')),
  add column if not exists stripe_connect_details_submitted boolean not null default false,
  add column if not exists stripe_connect_charges_enabled boolean not null default false,
  add column if not exists stripe_connect_payouts_enabled boolean not null default false,
  add column if not exists stripe_connect_requirements_due text[] not null default '{}',
  add column if not exists stripe_connect_updated_at timestamptz;

commit;

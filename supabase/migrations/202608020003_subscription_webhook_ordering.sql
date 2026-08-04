begin;

alter table public.profiles
  add column if not exists membership_synced_at timestamptz;

alter table public.partners
  add column if not exists subscription_synced_at timestamptz;

commit;

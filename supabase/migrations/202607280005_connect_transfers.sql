begin;

alter table public.booking_financials
  add column if not exists stripe_transfer_id text unique,
  add column if not exists stripe_transfer_status text not null default 'not_started'
    check (stripe_transfer_status in ('not_started','pending','paid','reversed','failed')),
  add column if not exists stripe_transfer_error text,
  add column if not exists stripe_transferred_at timestamptz,
  add column if not exists stripe_reversed_at timestamptz;

create index if not exists booking_financials_transfer_status_idx
  on public.booking_financials(stripe_transfer_status);

commit;

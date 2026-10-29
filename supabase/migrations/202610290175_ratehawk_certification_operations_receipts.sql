begin;

create table public.ratehawk_certification_receipts (
  id uuid primary key default gen_random_uuid(),
  scenario text not null check (scenario in (
    'children',
    'citizenship',
    'multiroom',
    'price_change',
    'unknown_success',
    'unknown_soldout',
    'unknown_book_limit'
  )),
  result text not null check (result = 'passed'),
  partner_order_id text not null check (length(partner_order_id) between 8 and 160),
  final_status text not null check (final_status in ('confirmed', 'failed', 'timed_out')),
  final_error text check (final_error is null or length(final_error) between 1 and 80),
  booking_form_attempts integer not null check (booking_form_attempts > 0),
  status_attempts integer not null check (status_attempts > 0),
  cancelled boolean not null,
  cancellation_amount text check (cancellation_amount is null or length(cancellation_amount) between 1 and 40),
  cancellation_currency text check (cancellation_currency is null or cancellation_currency ~ '^[A-Z]{3}$'),
  tested_by uuid references public.profiles(id) on delete set null,
  tested_at timestamptz not null default now(),
  deployment_revision text,
  created_at timestamptz not null default now(),
  check (deployment_revision is null or length(deployment_revision) between 7 and 64),
  check (
    (scenario = 'unknown_soldout' and final_status = 'failed' and final_error = 'soldout')
    or (scenario = 'unknown_book_limit' and final_status = 'failed' and final_error = 'book_limit')
    or (scenario not in ('unknown_soldout', 'unknown_book_limit') and final_status = 'confirmed' and final_error is null)
  )
);

comment on table public.ratehawk_certification_receipts is
  'Sanitized, server-recorded RateHawk sandbox certification receipts. Expected sold-out and booking-limit outcomes are successful certification evidence, not operational failures.';

alter table public.ratehawk_certification_receipts enable row level security;

revoke all on table public.ratehawk_certification_receipts
  from public, anon, authenticated, service_role;
grant select, insert on table public.ratehawk_certification_receipts
  to service_role;

create index ratehawk_certification_receipts_tested_idx
  on public.ratehawk_certification_receipts (tested_at desc);

create view public.latest_pms_connection_test_events
with (security_invoker = true)
as
select distinct on (connection_id)
  id,
  connection_id,
  validation_mode,
  result,
  detail_code,
  tested_by,
  created_at
from public.pms_connection_test_events
order by connection_id, created_at desc, id desc;

comment on view public.latest_pms_connection_test_events is
  'Current PMS validation state per connection. Historical failures superseded by a newer passing test are not active operational failures.';

revoke all on table public.latest_pms_connection_test_events
  from public, anon, authenticated, service_role;
grant select on table public.latest_pms_connection_test_events
  to service_role;

commit;

begin;

alter table public.pms_webhook_event_receipts
  add column if not exists provider_entity_id text,
  add column if not exists processing_status text not null default 'pending',
  add column if not exists processing_attempts integer not null default 0,
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists processing_started_at timestamptz,
  add column if not exists processed_at timestamptz,
  add column if not exists last_error text,
  add column if not exists reservation_snapshot_sha256 text,
  add column if not exists provider_status text,
  add column if not exists provider_fetched_at timestamptz;

alter table public.pms_webhook_event_receipts
  add constraint pms_webhook_event_receipts_provider_entity_id_check
    check (
      provider_entity_id is null
      or (
        length(btrim(provider_entity_id)) between 1 and 200
        and provider_entity_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
      )
    ),
  add constraint pms_webhook_event_receipts_processing_status_check
    check (processing_status in ('pending', 'processing', 'reconciled', 'ignored', 'failed')),
  add constraint pms_webhook_event_receipts_processing_attempts_check
    check (processing_attempts between 0 and 5),
  add constraint pms_webhook_event_receipts_last_error_check
    check (last_error is null or length(last_error) between 1 and 500),
  add constraint pms_webhook_event_receipts_snapshot_sha256_check
    check (
      reservation_snapshot_sha256 is null
      or reservation_snapshot_sha256 ~ '^[0-9a-f]{64}$'
    ),
  add constraint pms_webhook_event_receipts_provider_status_check
    check (provider_status is null or provider_status ~ '^[A-Za-z][A-Za-z0-9_-]{0,79}$'),
  add constraint pms_webhook_event_receipts_processing_state_check
    check (
      (processing_status = 'processing') = (processing_started_at is not null)
      and (processing_status in ('reconciled', 'ignored')) = (processed_at is not null)
      and (processing_status = 'reconciled') = (
        reservation_snapshot_sha256 is not null
        and provider_status is not null
        and provider_fetched_at is not null
      )
      and (processing_status = 'failed') = (last_error is not null)
    );

revoke all on table public.pms_webhook_event_receipts from public, anon, authenticated;
grant select, insert, update on table public.pms_webhook_event_receipts to service_role;

update public.pms_webhook_event_receipts
set processing_status = 'ignored',
    processed_at = now(),
    last_error = null
where provider_entity_id is null;

create index if not exists pms_webhook_event_receipts_processing_idx
  on public.pms_webhook_event_receipts (processing_status, next_attempt_at, received_at)
  where processing_status in ('pending', 'processing', 'failed');

create index if not exists pms_webhook_event_receipts_entity_ordering_idx
  on public.pms_webhook_event_receipts (
    connection_id,
    provider_entity_id,
    provider_occurred_at desc,
    received_at desc
  )
  where provider_entity_id is not null;

create or replace function public.claim_apaleo_reservation_reconciliation_receipt(
  p_connection_id uuid default null
)
returns setof public.pms_webhook_event_receipts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt_id uuid;
begin
  select receipt.id into v_receipt_id
  from public.pms_webhook_event_receipts as receipt
  join public.property_pms_connections as connection
    on connection.id = receipt.connection_id
  where receipt.provider_id = 'apaleo'
    and lower(receipt.topic) = 'reservation'
    and receipt.provider_entity_id is not null
    and receipt.processing_attempts < 5
    and (p_connection_id is null or receipt.connection_id = p_connection_id)
    and (
      (receipt.processing_status in ('pending', 'failed') and receipt.next_attempt_at <= now())
      or (
        receipt.processing_status = 'processing'
        and receipt.processing_started_at < now() - interval '15 minutes'
      )
    )
    and connection.provider_id = 'apaleo'
    and connection.external_property_code = receipt.property_code
  order by receipt.provider_occurred_at, receipt.received_at
  for update of receipt skip locked
  limit 1;

  if v_receipt_id is null then
    return;
  end if;

  return query
  update public.pms_webhook_event_receipts
  set processing_status = 'processing',
      processing_attempts = processing_attempts + 1,
      processing_started_at = now(),
      processed_at = null,
      last_error = null,
      reservation_snapshot_sha256 = null,
      provider_status = null,
      provider_fetched_at = null
  where id = v_receipt_id
  returning *;
end;
$$;

revoke all on function public.claim_apaleo_reservation_reconciliation_receipt(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_apaleo_reservation_reconciliation_receipt(uuid)
  to service_role;

comment on function public.claim_apaleo_reservation_reconciliation_receipt(uuid) is
  'Claims one authenticated Apaleo reservation webhook receipt for PII-free read reconciliation. Service role only.';

commit;

begin;

-- Migration 074 separates customer payment from provider settlement, adds
-- encrypted retention vaults, and makes the consumer create-order journal
-- owner-linked and single-attempt. Restoring the earlier single-payment model
-- in place would silently re-authorize the obsolete Duffel-Balance-as-payment
-- path. Evidence must be exported/expired and a separately reviewed successor
-- migration must replace these controls; this rollback therefore fails closed.
do $flight_consumer_preview_rollback_guard$
begin
  if to_regclass('public.flight_offer_evidence_vault') is not null
    and exists (select 1 from public.flight_offer_evidence_vault) then
    raise exception 'Cannot roll back flight consumer Preview while encrypted offer evidence exists';
  end if;
  if to_regclass('public.flight_secure_pii_records') is not null
    and exists (select 1 from public.flight_secure_pii_records) then
    raise exception 'Cannot roll back flight consumer Preview while encrypted PII records or tombstones exist';
  end if;
  if to_regclass('public.flight_provider_request_attempts') is not null
    and exists (
      select 1 from public.flight_provider_request_attempts
       where consumer_flow_version = 1
    ) then
    raise exception 'Cannot roll back flight consumer Preview while linked provider attempts exist';
  end if;
  if to_regclass('public.flight_runtime_controls') is not null
    and exists (
      select 1 from public.flight_runtime_controls
       where bound_provider_settlement_processor_code is not null
          or bound_provider_settlement_account_sha256 is not null
          or bound_provider_settlement_environment is not null
          or bound_provider_settlement_source_sha256 is not null
          or bound_provider_settlement_adapter_version_sha256 is not null
    ) then
    raise exception 'Cannot roll back flight consumer Preview while a provider settlement binding exists';
  end if;
  if to_regclass('public.flight_runtime_control_receipts') is not null
    and exists (
      select 1 from public.flight_runtime_control_receipts
       where bound_provider_settlement_processor_code is not null
          or bound_provider_settlement_account_sha256 is not null
          or bound_provider_settlement_environment is not null
          or bound_provider_settlement_source_sha256 is not null
          or bound_provider_settlement_adapter_version_sha256 is not null
    ) then
    raise exception 'Cannot roll back flight consumer Preview after a split-binding receipt was issued';
  end if;

  raise exception 'Rollback 074 requires a separately reviewed fail-closed replacement for split payment/settlement authority';
end;
$flight_consumer_preview_rollback_guard$;

commit;

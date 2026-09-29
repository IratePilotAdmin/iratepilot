begin;

-- Forward-only safety boundary. 076 adds append-only authority receipts,
-- webhook lease history, reconciliation decisions, and encrypted recovery
-- evidence. Destructive rollback would erase or reinterpret those records.
do $flight_consumer_preview_076_forward_only$
declare
  v_runtime_control_updated_at timestamptz;
  v_webhook_count bigint;
  v_recovery_evidence_count bigint;
begin
  select updated_at into v_runtime_control_updated_at
    from public.flight_runtime_controls where control_key = 'global';
  select count(*) into v_webhook_count
    from public.flight_consumer_webhook_ledger;
  select count(*) into v_recovery_evidence_count
    from public.flight_order_recovery_evidence_vault;
  raise exception using
    message = 'Migration 076 is forward-only and cannot be rolled back safely',
    detail = format(
      'runtime_control_updated_at=%s webhook_rows=%s recovery_evidence_rows=%s',
      coalesce(v_runtime_control_updated_at::text, 'missing'),
      v_webhook_count,
      v_recovery_evidence_count
    ),
    hint = 'Relock Consumer Preview with relock_flight_consumer_preview_v1, preserve all receipts and evidence, and deploy a reviewed forward repair migration.';
end;
$flight_consumer_preview_076_forward_only$;

rollback;

begin;

-- Forward-only authority boundary. Restoring the stale activation function or
-- reopening direct authenticated UPDATE would weaken the audited control path.
do $flight_consumer_preview_080_forward_only$
declare
  v_runtime_control_updated_at timestamptz;
  v_runtime_control_receipt_count bigint;
begin
  select updated_at into v_runtime_control_updated_at
    from public.flight_runtime_controls where control_key = 'global';
  select count(*) into v_runtime_control_receipt_count
    from public.flight_runtime_control_receipts;
  raise exception using
    message = 'Migration 080 is forward-only and cannot be rolled back safely',
    detail = format(
      'runtime_control_updated_at=%s runtime_control_receipts=%s',
      coalesce(v_runtime_control_updated_at::text, 'missing'),
      v_runtime_control_receipt_count
    ),
    hint = 'Relock Consumer Preview with relock_flight_consumer_preview_v1, preserve every runtime-control receipt, keep direct authenticated UPDATE revoked, and deploy a reviewed forward repair migration.';
end;
$flight_consumer_preview_080_forward_only$;

rollback;

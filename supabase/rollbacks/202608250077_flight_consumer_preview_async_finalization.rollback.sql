begin;

-- Forward-only safety boundary. 077 can bind provider-order identities and
-- issue ticket documents from administrator-approved, append-only async
-- recovery evidence. Reverting its trigger routing or functions cannot undo
-- that liability without erasing the evidence needed for reconciliation.
do $flight_consumer_preview_077_forward_only$
declare
  v_recovery_evidence_count bigint;
  v_ticketed_consumer_count bigint;
  v_processed_order_created_count bigint;
begin
  select count(*) into v_recovery_evidence_count
    from public.flight_order_recovery_evidence_vault;
  select count(*) into v_ticketed_consumer_count
    from public.flight_orders
   where consumer_flow_version = 1
     and execution_mode = 'test'
     and provider_code = 'duffel'
     and status = 'ticketed';
  select count(*) into v_processed_order_created_count
    from public.flight_consumer_webhook_ledger
   where source = 'duffel'
     and event_type = 'order.created'
     and state = 'processed'
     and revision = 2;
  raise exception using
    message = 'Migration 077 is forward-only and cannot be rolled back safely',
    detail = format(
      'recovery_evidence_rows=%s ticketed_consumer_orders=%s processed_order_created_rows=%s',
      v_recovery_evidence_count,
      v_ticketed_consumer_count,
      v_processed_order_created_count
    ),
    hint = 'Relock Consumer Preview with relock_flight_consumer_preview_v1, preserve all webhook, recovery, review, payment, passenger, and ticket evidence, and deploy a reviewed forward repair migration.';
end;
$flight_consumer_preview_077_forward_only$;

rollback;

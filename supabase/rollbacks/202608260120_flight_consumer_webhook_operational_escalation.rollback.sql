begin;

-- Forward-only operational and activation boundary. Removing the escalation
-- source link, reopening the 080 activation path, or deleting already-created
-- review cases would weaken durable webhook handling.
do $flight_consumer_preview_081_forward_only$
declare
  v_escalation_count bigint;
  v_adverse_webhook_count bigint;
begin
  select count(*) into v_escalation_count
    from public.flight_reconciliation_cases
   where source_webhook_ledger_id is not null;
  select count(*) into v_adverse_webhook_count
    from public.flight_consumer_webhook_ledger
   where event_type in (
     'order.creation_failed', 'air.order.changed',
     'order.airline_initiated_change_detected',
     'payment_intent.payment_failed', 'charge.refunded'
   );
  raise exception using
    message = 'Migration 081 is forward-only and cannot be rolled back safely',
    detail = format(
      'operational_escalations=%s adverse_webhooks=%s',
      v_escalation_count,
      v_adverse_webhook_count
    ),
    hint = 'Relock Consumer Preview, preserve webhook and reconciliation evidence, and deploy a reviewed forward repair migration.';
end;
$flight_consumer_preview_081_forward_only$;

rollback;

begin;

-- Migration 075 introduces durable consumer orders, encrypted PII/provider
-- evidence, captured/refunded payment liability, issued ticket documents, and
-- webhook/reconciliation journals. An automatic downgrade would either erase
-- evidence or restore 074 functions that do not understand these identities.
-- Refuse in every state; replacement requires a separately reviewed forward
-- migration that preserves all rows and disables execution first.
do $flight_consumer_preview_075_rollback_guard$
declare
  v_payment_attempts bigint := 0;
  v_order_evidence bigint := 0;
  v_webhooks bigint := 0;
  v_observations bigint := 0;
  v_refunds bigint := 0;
  v_consumer_orders bigint := 0;
  v_linked_reprices bigint := 0;
begin
  if to_regclass('public.flight_payment_operation_attempts') is not null then
    execute 'select count(*) from public.flight_payment_operation_attempts'
      into v_payment_attempts;
  end if;
  if to_regclass('public.flight_order_response_evidence_vault') is not null then
    execute 'select count(*) from public.flight_order_response_evidence_vault'
      into v_order_evidence;
  end if;
  if to_regclass('public.flight_consumer_webhook_ledger') is not null then
    execute 'select count(*) from public.flight_consumer_webhook_ledger'
      into v_webhooks;
  end if;
  if to_regclass('public.flight_payment_state_observations') is not null then
    execute 'select count(*) from public.flight_payment_state_observations'
      into v_observations;
  end if;
  if to_regclass('public.flight_payment_refund_evidence') is not null then
    execute 'select count(*) from public.flight_payment_refund_evidence'
      into v_refunds;
  end if;
  if to_regclass('public.flight_orders') is not null then
    execute 'select count(*) from public.flight_orders where consumer_flow_version = 1'
      into v_consumer_orders;
  end if;
  if to_regclass('public.flight_offer_evidence_vault') is not null then
    execute 'select count(*) from public.flight_offer_evidence_vault where reprice_receipt_id is not null or local_offer_id is not null'
      into v_linked_reprices;
  end if;
  raise exception using
    message = 'Flight Consumer Preview orchestration rollback requires a separately reviewed fail-closed replacement',
    detail = format(
      'payment_attempts=%s order_evidence=%s webhooks=%s observations=%s refunds=%s consumer_orders=%s linked_reprices=%s',
      v_payment_attempts, v_order_evidence, v_webhooks, v_observations,
      v_refunds, v_consumer_orders, v_linked_reprices
    ),
    hint = 'Engage the flight kill switch, reconcile all provider/payment liability, preserve encrypted evidence and journals, then deploy a forward replacement migration.';
end;
$flight_consumer_preview_075_rollback_guard$;

commit;

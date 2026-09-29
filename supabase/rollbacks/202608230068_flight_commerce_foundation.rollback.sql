begin;

-- Later flight migrations must be rolled back first. Removing migration 068
-- while the request-attempt journal remains installed would strand functions
-- that depend on its runtime-control authority boundary.
do $$
begin
  if to_regclass('public.flight_provider_request_attempts') is not null
    or to_regprocedure(
      'public.prepare_flight_provider_request_attempt(text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,text,timestamptz)'
    ) is not null then
    raise exception 'Refusing rollback: flight provider request-attempt migration 069 is still installed';
  end if;
end;
$$;

-- This rollback is intentionally data-preserving: it refuses to remove the
-- flight-commerce schema after any operational or synthetic evidence exists.
lock table
  public.flight_runtime_controls,
  public.flight_runtime_control_receipts,
  public.flight_searches,
  public.flight_offers,
  public.flight_offer_segments,
  public.flight_offer_fare_terms,
  public.flight_reprice_receipts,
  public.flight_orders,
  public.flight_passenger_refs,
  public.flight_ticket_documents,
  public.flight_payments,
  public.flight_service_requests,
  public.flight_provider_events,
  public.flight_idempotency_records,
  public.flight_reconciliation_cases
in access exclusive mode;

do $$
begin
  if exists (select 1 from public.flight_runtime_control_receipts)
    or exists (select 1 from public.flight_searches)
    or exists (select 1 from public.flight_offers)
    or exists (select 1 from public.flight_offer_segments)
    or exists (select 1 from public.flight_offer_fare_terms)
    or exists (select 1 from public.flight_reprice_receipts)
    or exists (select 1 from public.flight_orders)
    or exists (select 1 from public.flight_passenger_refs)
    or exists (select 1 from public.flight_ticket_documents)
    or exists (select 1 from public.flight_payments)
    or exists (select 1 from public.flight_service_requests)
    or exists (select 1 from public.flight_provider_events)
    or exists (select 1 from public.flight_idempotency_records)
    or exists (select 1 from public.flight_reconciliation_cases) then
    raise exception 'Refusing rollback: flight commerce evidence exists';
  end if;
end;
$$;

drop trigger flight_provider_events_order_mode_guard on public.flight_provider_events;
drop trigger flight_provider_events_immutable_guard on public.flight_provider_events;
drop trigger flight_provider_events_runtime_guard on public.flight_provider_events;
drop trigger flight_provider_events_00_parent_lock_guard on public.flight_provider_events;
drop trigger flight_reconciliation_cases_order_mode_guard on public.flight_reconciliation_cases;
drop trigger flight_reconciliation_cases_immutable_guard on public.flight_reconciliation_cases;
drop trigger flight_reconciliation_cases_runtime_guard on public.flight_reconciliation_cases;
drop trigger flight_reconciliation_cases_00_parent_lock_guard
  on public.flight_reconciliation_cases;
drop trigger flight_idempotency_records_resource_guard on public.flight_idempotency_records;
drop trigger flight_idempotency_records_immutable_guard on public.flight_idempotency_records;
drop trigger flight_idempotency_records_runtime_guard on public.flight_idempotency_records;
drop trigger flight_service_requests_order_mode_guard on public.flight_service_requests;
drop trigger flight_service_requests_immutable_guard on public.flight_service_requests;
drop trigger flight_service_requests_runtime_guard on public.flight_service_requests;
drop trigger flight_service_requests_00_parent_lock_guard on public.flight_service_requests;
drop trigger flight_payments_order_mode_guard on public.flight_payments;
drop trigger flight_payments_immutable_guard on public.flight_payments;
drop trigger flight_payments_runtime_guard on public.flight_payments;
drop trigger flight_payments_00_parent_lock_guard on public.flight_payments;
drop trigger flight_ticket_documents_order_mode_guard on public.flight_ticket_documents;
drop trigger flight_ticket_documents_immutable_guard on public.flight_ticket_documents;
drop trigger flight_ticket_documents_runtime_guard on public.flight_ticket_documents;
drop trigger flight_ticket_documents_00_parent_lock_guard on public.flight_ticket_documents;
drop trigger flight_passenger_refs_order_mode_guard on public.flight_passenger_refs;
drop trigger flight_passenger_refs_immutable_guard on public.flight_passenger_refs;
drop trigger flight_passenger_refs_runtime_guard on public.flight_passenger_refs;
drop trigger flight_passenger_refs_00_parent_lock_guard on public.flight_passenger_refs;
drop trigger flight_orders_evidence_guard on public.flight_orders;
drop trigger flight_orders_immutable_guard on public.flight_orders;
drop trigger flight_orders_transition_guard on public.flight_orders;
drop trigger flight_orders_runtime_guard on public.flight_orders;
drop trigger flight_reprice_receipts_evidence_guard on public.flight_reprice_receipts;
drop trigger flight_reprice_receipts_immutable_guard on public.flight_reprice_receipts;
drop trigger flight_reprice_receipts_runtime_guard on public.flight_reprice_receipts;
drop trigger flight_offers_evidence_guard on public.flight_offers;
drop trigger flight_offers_immutable_guard on public.flight_offers;
drop trigger flight_offers_runtime_guard on public.flight_offers;
drop trigger flight_offer_fare_terms_append_only_guard on public.flight_offer_fare_terms;
drop trigger flight_offer_fare_terms_evidence_guard on public.flight_offer_fare_terms;
drop trigger flight_offer_fare_terms_runtime_guard on public.flight_offer_fare_terms;
drop trigger flight_offer_segments_append_only_guard on public.flight_offer_segments;
drop trigger flight_offer_segments_evidence_guard on public.flight_offer_segments;
drop trigger flight_offer_segments_runtime_guard on public.flight_offer_segments;
drop trigger flight_searches_immutable_guard on public.flight_searches;
drop trigger flight_searches_runtime_guard on public.flight_searches;
drop trigger flight_runtime_control_receipts_append_only_guard
  on public.flight_runtime_control_receipts;
drop trigger flight_runtime_controls_receipt_guard on public.flight_runtime_controls;
drop trigger flight_runtime_controls_authority_guard on public.flight_runtime_controls;

drop function public.reject_flight_evidence_mutation();
drop function public.protect_flight_operational_evidence();
drop function public.validate_flight_order_child_mode();
drop function public.validate_flight_order_transition();
drop function public.protect_flight_reprice_evidence();
drop function public.validate_flight_idempotency_resource();
drop function public.enforce_flight_evidence_runtime_capability();
drop function public.lock_flight_order_parent();
drop function public.enforce_flight_order_runtime_capability();
drop function public.validate_flight_reprice_chain();
drop function public.validate_flight_offer_chain();
drop function public.validate_flight_offer_snapshot();
drop function public.validate_flight_order_chain();
drop function public.enforce_flight_runtime_capability();
drop function public.flight_runtime_capability_enabled(text, text, text, text, text);
drop function public.record_flight_runtime_control_receipt();
drop function public.protect_flight_runtime_controls();

drop table public.flight_reconciliation_cases;
drop table public.flight_idempotency_records;
drop table public.flight_provider_events;
drop table public.flight_service_requests;
drop table public.flight_payments;
drop table public.flight_ticket_documents;
drop table public.flight_passenger_refs;
drop table public.flight_orders;
drop table public.flight_reprice_receipts;
drop table public.flight_offer_fare_terms;
drop table public.flight_offer_segments;
drop table public.flight_offers;
drop table public.flight_searches;
drop table public.flight_runtime_control_receipts;
drop table public.flight_runtime_controls;

commit;

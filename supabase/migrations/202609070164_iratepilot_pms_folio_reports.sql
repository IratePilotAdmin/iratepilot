BEGIN;
-- Read-only operational financial reports. These are neither processor
-- settlement reports nor earned revenue, aging, statutory books or full AR.
CREATE INDEX irp_pms_folio_entry_report_date ON irp_pms.folio_entries(tenant_id,property_id,created_at,id);

CREATE FUNCTION irp_pms.report_exact_numbers(p_value jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM jsonb_each(p_value) x WHERE jsonb_typeof(x.value)='number' AND abs((x.value#>>'{}')::numeric)>9007199254740991) THEN RAISE EXCEPTION 'Report exceeds exact JSON integer range; request a smaller activity period or an operator balance export';END IF;
 RETURN p_value;
END $$;
REVOKE ALL ON FUNCTION irp_pms.report_exact_numbers(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.irp_pms_pilot_folio_activity_report(p_tenant uuid,p_property uuid,p_start date,p_end date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;start_at timestamptz;end_at timestamptz;generated_at timestamptz;rows jsonb;totals jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_start IS NULL OR p_end IS NULL OR p_end<=p_start OR p_end-p_start>366 THEN RAISE EXCEPTION 'Read1 to366 property-local activity dates using an exclusive end date';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 generated_at:=clock_timestamp();start_at:=p_start::timestamp AT TIME ZONE prop.time_zone;end_at:=p_end::timestamp AT TIME ZONE prop.time_zone;
 IF (SELECT count(*) FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND created_at>=start_at AND created_at<end_at)>10000 THEN RAISE EXCEPTION 'Activity report exceeds10000 entries; narrow the date range. No rows were truncated';END IF;
 WITH entries AS (
  SELECT e.*,r.source,r.source_booking_id,r.status,
   CASE e.kind WHEN 'charge' THEN e.amount_minor WHEN 'charge_reversal' THEN -e.amount_minor ELSE 0 END charges_effect_minor,
   CASE e.kind WHEN 'external_payment' THEN e.amount_minor WHEN 'external_refund' THEN -e.amount_minor WHEN 'payment_correction' THEN -e.amount_minor ELSE 0 END recorded_paid_effect_minor
  FROM irp_pms.folio_entries e JOIN irp_pms.reservations r ON r.tenant_id=e.tenant_id AND r.property_id=e.property_id AND r.id=e.reservation_id
  WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.created_at>=start_at AND e.created_at<end_at
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'request_id',request_id,'reservation_id',reservation_id,'source',source,'source_booking_id',source_booking_id,'status',status,'kind',kind,'amount_minor',amount_minor,'currency',currency,'reference',reference,'reason',reason,'target_entry_id',target_entry_id,'actor_id',actor_id,'created_at',created_at,'local_date',(created_at AT TIME ZONE prop.time_zone)::date,'charges_effect_minor',charges_effect_minor,'recorded_paid_effect_minor',recorded_paid_effect_minor,'balance_effect_minor',charges_effect_minor-recorded_paid_effect_minor) ORDER BY created_at,id),'[]'),
 jsonb_build_object('entry_count',count(*),'additional_minor',coalesce(sum(amount_minor) FILTER(WHERE kind='charge'),0),'reversed_minor',coalesce(sum(amount_minor) FILTER(WHERE kind='charge_reversal'),0),'external_payments_minor',coalesce(sum(amount_minor) FILTER(WHERE kind='external_payment'),0),'external_refunds_minor',coalesce(sum(amount_minor) FILTER(WHERE kind='external_refund'),0),'corrected_payments_minor',coalesce(sum(amount_minor) FILTER(WHERE kind='payment_correction'),0),'charges_effect_minor',coalesce(sum(charges_effect_minor),0),'recorded_paid_effect_minor',coalesce(sum(recorded_paid_effect_minor),0),'balance_effect_minor',coalesce(sum(charges_effect_minor-recorded_paid_effect_minor),0),'complete',true)
 INTO rows,totals FROM entries;
 RETURN jsonb_build_object('property',to_jsonb(prop),'period',jsonb_build_object('start',p_start,'end',p_end,'end_exclusive',true,'start_at',start_at,'end_at',end_at),'generated_at',generated_at,'currency','USD','payment_recording','external_only','rows',rows,'totals',irp_pms.report_exact_numbers(totals),'rows_truncated',false,
 'definitions',jsonb_build_object('period','Immutable folio-entry recording timestamps in the current property time zone; not transaction, service or settlement dates. Reservation status and source labels are current.','charges','Additional charges and reversals only. Initial reservation charges and frozen opening amounts are not activity entries.','recorded_paid','External payment records minus external refund records and payment-record reductions. These records do not establish processor capture, bank settlement or collected cash.','payment_correction','Reduces a mistaken externally recorded payment amount; it does not assert a refund.','balance_effect','Charge effect minus recorded-payment effect. This is activity within the selected period, not the current balance or earned revenue.'));
END $$;

CREATE FUNCTION public.irp_pms_pilot_current_balances(p_tenant uuid,p_property uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;as_of timestamptz;rows jsonb;totals jsonb;item jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);as_of:=clock_timestamp();
 IF (SELECT count(*) FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property)>10000 THEN RAISE EXCEPTION 'Current balance report exceeds10000 reservations; request an operator property export. No rows were truncated';END IF;
 WITH entry_totals AS (
  SELECT reservation_id,coalesce(sum(amount_minor) FILTER(WHERE kind='charge'),0) additional,coalesce(sum(amount_minor) FILTER(WHERE kind='charge_reversal'),0) reversed,coalesce(sum(amount_minor) FILTER(WHERE kind='external_payment'),0) payments,coalesce(sum(amount_minor) FILTER(WHERE kind='external_refund'),0) refunds,coalesce(sum(amount_minor) FILTER(WHERE kind='payment_correction'),0) corrections
  FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property GROUP BY reservation_id
 ), basis AS (
  SELECT r.*,f.reservation_id IS NOT NULL frozen,
   (f.reservation_id IS NOT NULL OR (r.accommodation_minor IS NOT NULL AND r.taxes_minor IS NOT NULL AND r.ota_fees_minor IS NOT NULL AND r.hotel_fees_minor IS NOT NULL AND r.guest_total_minor IS NOT NULL)) available,
   CASE WHEN f.reservation_id IS NOT NULL THEN f.accommodation_minor ELSE r.accommodation_minor END opening_accommodation,
   CASE WHEN f.reservation_id IS NOT NULL THEN f.taxes_minor ELSE r.taxes_minor END opening_taxes,
   CASE WHEN f.reservation_id IS NOT NULL THEN f.fees_minor ELSE r.ota_fees_minor END opening_ota,
   CASE WHEN f.reservation_id IS NOT NULL THEN f.hotel_fees_minor ELSE r.hotel_fees_minor END opening_hotel,
   CASE WHEN f.reservation_id IS NOT NULL THEN f.total_minor ELSE r.guest_total_minor END opening_total,f.opened_at,
   f.reservation_id IS NOT NULL AND (f.accommodation_minor IS DISTINCT FROM r.accommodation_minor OR f.taxes_minor IS DISTINCT FROM r.taxes_minor OR f.fees_minor IS DISTINCT FROM r.ota_fees_minor OR f.hotel_fees_minor IS DISTINCT FROM r.hotel_fees_minor OR f.total_minor IS DISTINCT FROM r.guest_total_minor OR f.charge_breakdown IS DISTINCT FROM r.charge_breakdown) reservation_amounts_changed,
   coalesce(r.charge_breakdown->>'requires_reconciliation'='true',false) pricing_reconciliation_required,
   coalesce(e.additional,0) additional,coalesce(e.reversed,0) reversed,coalesce(e.payments,0) payments,coalesce(e.refunds,0) refunds,coalesce(e.corrections,0) corrections
  FROM irp_pms.reservations r LEFT JOIN irp_pms.folio_openings f ON f.tenant_id=r.tenant_id AND f.property_id=r.property_id AND f.reservation_id=r.id LEFT JOIN entry_totals e ON e.reservation_id=r.id
  WHERE r.tenant_id=p_tenant AND r.property_id=p_property
 ), balances AS (
  SELECT *,opening_total+additional-reversed charges,payments-refunds-corrections recorded_paid,opening_total+additional-reversed-payments+refunds+corrections balance FROM basis
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('reservation_id',id,'source',source,'source_booking_id',source_booking_id,'status',status,'arrival',arrival,'departure',departure,'available',available,'reason',CASE WHEN NOT available THEN 'reservation_charges_unavailable' ELSE NULL END,'opening_mode',CASE WHEN frozen THEN 'frozen' WHEN available THEN 'reservation_preview' ELSE 'unavailable' END,'reservation_amounts_changed',reservation_amounts_changed,'pricing_reconciliation_required',pricing_reconciliation_required,'current_reservation_total_minor',guest_total_minor,
 'opening',CASE WHEN available THEN jsonb_build_object('accommodation_minor',opening_accommodation,'taxes_minor',opening_taxes,'hotel_fees_minor',opening_hotel,'ota_fees_minor',opening_ota,'total_minor',opening_total,'opened_at',opened_at) ELSE NULL END,
 'totals',CASE WHEN available THEN jsonb_build_object('additional_minor',additional,'reversed_minor',reversed,'charges_minor',charges,'external_payments_minor',payments,'external_refunds_minor',refunds,'corrected_payments_minor',corrections,'recorded_paid_minor',recorded_paid,'balance_minor',balance) ELSE NULL END) ORDER BY arrival NULLS LAST,id),'[]'),
 jsonb_build_object('reservation_count',count(*),'available_count',count(*) FILTER(WHERE available),'unavailable_count',count(*) FILTER(WHERE NOT available),'positive_balance_count',count(*) FILTER(WHERE available AND balance>0),'credit_balance_count',count(*) FILTER(WHERE available AND balance<0),'zero_balance_count',count(*) FILTER(WHERE available AND balance=0),'changed_reservation_count',count(*) FILTER(WHERE reservation_amounts_changed),'pricing_review_count',count(*) FILTER(WHERE pricing_reconciliation_required),'charges_minor',coalesce(sum(charges) FILTER(WHERE available),0),'recorded_paid_minor',coalesce(sum(recorded_paid) FILTER(WHERE available),0),'balance_minor',coalesce(sum(balance) FILTER(WHERE available),0),'positive_balances_minor',coalesce(sum(balance) FILTER(WHERE available AND balance>0),0),'credit_balances_minor',coalesce(sum(balance) FILTER(WHERE available AND balance<0),0),'complete',count(*) FILTER(WHERE NOT available)=0)
 INTO rows,totals FROM balances;
 -- Per-reservation external totals are bounded by the posting API; validate
 -- explicit row totals too, so legacy/admin inconsistencies cannot lose cents.
 FOR item IN SELECT x FROM jsonb_array_elements(rows) x LOOP IF item->>'available'='true' THEN PERFORM irp_pms.report_exact_numbers(item->'totals');END IF;END LOOP;
 RETURN jsonb_build_object('property',to_jsonb(prop),'as_of',as_of,'business_date',(as_of AT TIME ZONE prop.time_zone)::date,'currency','USD','payment_recording','external_only','rows',rows,'totals',irp_pms.report_exact_numbers(totals),'rows_truncated',false,
 'definitions',jsonb_build_object('scope','Current amounts for every reservation status, including future stays, cancellations and zero or credit balances. There is no historical as-of or aging calculation.','opening','Frozen folio opening when present; otherwise current reservation charges shown as an unposted preview. Reading never opens a folio.','unknown','Unavailable rows have null opening and totals. Aggregate monetary values are known subtotals only; complete is false whenever a row is unavailable.','recorded_paid','External payment records minus external refunds and payment-record reductions; no provider settlement or collected-cash claim.','balance','Known charge basis plus additions minus reversals minus net externally recorded payments. A positive future or cancelled balance is not automatically overdue receivables; a credit is not an approved refund.','discrepancy','A frozen opening remains authoritative for its folio even when the reservation amount or pricing snapshot differs. Review flags do not automatically adjust either amount.'));
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_folio_activity_report(uuid,uuid,date,date),public.irp_pms_pilot_current_balances(uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_folio_activity_report(uuid,uuid,date,date),public.irp_pms_pilot_current_balances(uuid,uuid) TO authenticated;
COMMIT;

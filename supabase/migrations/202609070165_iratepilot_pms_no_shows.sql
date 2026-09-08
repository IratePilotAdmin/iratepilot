BEGIN;
-- No show is an explicit disposition of the existing terminal Cancelled
-- lifecycle. It never implies a fee, payment, waiver or earned revenue.
ALTER TABLE irp_pms.reservations ADD COLUMN cancellation_disposition text,
 ADD COLUMN no_show_recorded_at timestamptz,
 ADD CONSTRAINT reservation_no_show_disposition CHECK(
  (cancellation_disposition IS NULL AND no_show_recorded_at IS NULL)
  OR (cancellation_disposition IS NOT NULL AND cancellation_disposition='no_show' AND no_show_recorded_at IS NOT NULL AND status='Cancelled' AND source IN('direct','migration') AND checked_in_at IS NULL AND checked_out_at IS NULL));
CREATE TABLE irp_pms.no_show_requests(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,reservation_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),command jsonb NOT NULL,result jsonb NOT NULL,recorded_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,property_id,request_id),UNIQUE(tenant_id,property_id,reservation_id),
 FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.reservations(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.no_show_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.no_show_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON irp_pms.no_show_requests TO service_role;
CREATE FUNCTION irp_pms.no_show_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME='no_show_requests' THEN RAISE EXCEPTION 'No-show receipts are immutable';END IF;
 IF OLD.cancellation_disposition IS NOT NULL AND (NEW.cancellation_disposition IS DISTINCT FROM OLD.cancellation_disposition OR NEW.no_show_recorded_at IS DISTINCT FROM OLD.no_show_recorded_at) THEN RAISE EXCEPTION 'Recorded no-show disposition is immutable';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.no_show_immutable() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER irp_pms_no_show_receipt_immutable BEFORE UPDATE OR DELETE ON irp_pms.no_show_requests FOR EACH ROW EXECUTE FUNCTION irp_pms.no_show_immutable();
CREATE TRIGGER irp_pms_no_show_disposition_immutable BEFORE UPDATE ON irp_pms.reservations FOR EACH ROW EXECUTE FUNCTION irp_pms.no_show_immutable();

CREATE FUNCTION irp_pms.no_show_context(p_tenant uuid,p_property uuid,p_reservation uuid,p_now timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;res irp_pms.reservations;folio jsonb;business_date date;blockers jsonb:='[]';financial_review boolean;
BEGIN
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property;
 SELECT * INTO res FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped reservation';END IF;
 business_date:=(p_now AT TIME ZONE prop.time_zone)::date;
 IF res.source NOT IN('direct','migration') THEN blockers:=blockers||jsonb_build_array('source_owned_ota');END IF;
 IF res.status<>'Confirmed' THEN blockers:=blockers||jsonb_build_array('not_confirmed');END IF;
 IF res.checked_in_at IS NOT NULL OR res.checked_out_at IS NOT NULL THEN blockers:=blockers||jsonb_build_array('stay_has_started');END IF;
 IF res.arrival IS NULL OR res.departure IS NULL THEN blockers:=blockers||jsonb_build_array('stay_dates_unavailable');
 ELSIF res.departure>business_date THEN blockers:=blockers||jsonb_build_array('late_arrival_window_open');END IF;
 folio:=public.irp_pms_pilot_folio(p_tenant,p_property,p_reservation);
 financial_review:=NOT (folio->>'available')::boolean OR coalesce((folio->'totals'->>'charges_minor')::bigint,0)<>0 OR coalesce((folio->'totals'->>'paid_minor')::bigint,0)<>0 OR coalesce((folio->>'reservation_amounts_changed')::boolean,false) OR coalesce(res.charge_breakdown->>'requires_reconciliation'='true',false);
 RETURN jsonb_build_object('reservation_id',res.id,'status',res.status,'source',res.source,'source_version',res.source_version,'arrival',res.arrival,'departure',res.departure,'cancellation_disposition',res.cancellation_disposition,'no_show_recorded_at',res.no_show_recorded_at,'business_date',business_date,'eligible',jsonb_array_length(blockers)=0,'blockers',blockers,
 'folio_available',folio->'available','opening_mode',CASE WHEN folio->>'available'='true' THEN folio->>'opening_mode' ELSE 'unavailable' END,'charges_minor',folio->'totals'->'charges_minor','recorded_paid_minor',folio->'totals'->'paid_minor','balance_minor',folio->'totals'->'balance_minor','financial_review_required',financial_review,'financial_handling','separate_review',
 'service_warning','Decide retained or waived fees and any required allocation before closing their service dates. No-folio or zero-charge cancelled nights are skipped; a later fee is not covered by the fully allocated stay correction workflow. Nonzero unoccupied charges still require explicit financial and allocation review.',
 'late_arrival_policy','Only never-started reservations whose scheduled departure is on or before the current property date can be marked. No automatic cutoff or reinstatement is provided.','generated_at',p_now);
END $$;
REVOKE ALL ON FUNCTION irp_pms.no_show_context(uuid,uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.irp_pms_pilot_no_show_preview(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 RETURN irp_pms.no_show_context(p_tenant,p_property,p_reservation,clock_timestamp());
END $$;

CREATE FUNCTION public.irp_pms_pilot_mark_no_show(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_source_version bigint,p_expected_business_date date,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE res irp_pms.reservations;prior irp_pms.no_show_requests;command jsonb;context jsonb;recorded_at timestamptz;result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_reservation IS NULL OR p_expected_source_version IS NULL OR p_expected_source_version NOT BETWEEN 1 AND 9007199254740991 OR p_expected_business_date IS NULL OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 4 AND 500 OR p_reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Provide a scoped stay, request, expected source version and business date, and a4 to500 character review reason';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 command:=jsonb_build_object('reservation_id',p_reservation,'expected_source_version',p_expected_source_version,'expected_business_date',p_expected_business_date,'reason',trim(p_reason));
 SELECT * INTO prior FROM irp_pms.no_show_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'No-show request identity already used';END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO res FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped reservation';END IF;
 recorded_at:=clock_timestamp();context:=irp_pms.no_show_context(p_tenant,p_property,p_reservation,recorded_at);
 IF res.source_version<>p_expected_source_version OR (context->>'business_date')::date<>p_expected_business_date THEN RAISE EXCEPTION 'Reservation or property business date changed; refresh before no-show review' USING ERRCODE='40001';END IF;
 IF NOT(context->>'eligible')::boolean THEN RAISE EXCEPTION 'Only never-started direct or imported Confirmed stays with elapsed scheduled dates can be marked no-show';END IF;
 UPDATE irp_pms.reservations SET status='Cancelled',cancellation_disposition='no_show',no_show_recorded_at=recorded_at WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation;
 result:=jsonb_build_object('request_id',p_request,'reservation_id',p_reservation,'status','Cancelled','cancellation_disposition','no_show','recorded_at',recorded_at,'business_date',p_expected_business_date,'source_version',res.source_version,'capacity_configuration_changed',false,'current_future_inventory_released_units',0,'fees_changed',false,'folio_changed',false,'financial_review_required',context->'financial_review_required','financial_handling','separate_review','replayed',false);
 INSERT INTO irp_pms.no_show_requests(tenant_id,property_id,request_id,reservation_id,actor_id,command,result,recorded_at) VALUES(p_tenant,p_property,p_request,p_reservation,auth.uid(),command,result,recorded_at);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'no_show_recorded',p_reservation,command||jsonb_build_object('request_id',p_request,'recorded_at',recorded_at,'financial_handling','separate_review'));
 RETURN result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_no_show_request_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior irp_pms.no_show_requests;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL THEN RAISE EXCEPTION 'A request is required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO prior FROM irp_pms.no_show_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object('found',false);END IF;
 RETURN jsonb_build_object('found',true,'action','mark_no_show','result',prior.result);
END $$;

CREATE FUNCTION public.irp_pms_pilot_no_show_report(p_tenant uuid,p_property uuid,p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;rows jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_start IS NULL OR p_end IS NULL OR p_end<=p_start OR p_end-p_start>366 THEN RAISE EXCEPTION 'Read1 to366 scheduled arrival dates using an exclusive end date';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF (SELECT count(*) FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND cancellation_disposition='no_show' AND arrival>=p_start AND arrival<p_end)>10000 THEN RAISE EXCEPTION 'No-show report exceeds10000 rows; narrow the arrival period. No rows were truncated';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('reservation_id',r.id,'source',r.source,'source_booking_id',r.source_booking_id,'status',r.status,'arrival',r.arrival,'departure',r.departure,'cancellation_disposition',r.cancellation_disposition,'no_show_recorded_at',r.no_show_recorded_at,'recorded_by',n.actor_id,'reason',n.command->'reason','request_id',n.request_id) ORDER BY r.arrival,r.id),'[]') INTO rows
 FROM irp_pms.reservations r JOIN irp_pms.no_show_requests n ON n.tenant_id=r.tenant_id AND n.property_id=r.property_id AND n.reservation_id=r.id WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.cancellation_disposition='no_show' AND r.arrival>=p_start AND r.arrival<p_end;
 RETURN jsonb_build_object('property',to_jsonb(prop),'period',jsonb_build_object('start',p_start,'end',p_end,'end_exclusive',true,'basis','scheduled_arrival'),'generated_at',clock_timestamp(),'rows',rows,'count',jsonb_array_length(rows),'rows_truncated',false,'definition','Recorded no-show dispositions by scheduled arrival, not by recording date. These rows are already included in the generic cancellation cohort; do not add the two counts. No fee or money movement is implied.');
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_no_show_preview(uuid,uuid,uuid),public.irp_pms_pilot_mark_no_show(uuid,uuid,uuid,uuid,bigint,date,text),public.irp_pms_pilot_no_show_request_status(uuid,uuid,uuid),public.irp_pms_pilot_no_show_report(uuid,uuid,date,date) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_no_show_preview(uuid,uuid,uuid),public.irp_pms_pilot_mark_no_show(uuid,uuid,uuid,uuid,bigint,date,text),public.irp_pms_pilot_no_show_request_status(uuid,uuid,uuid),public.irp_pms_pilot_no_show_report(uuid,uuid,date,date) TO authenticated;
-- Explicit forward definitions of164. Only cancellation disposition labels
-- are added; the monetary basis, bounds and signed calculations are unchanged.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_folio_activity_report(p_tenant uuid,p_property uuid,p_start date,p_end date)
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
  SELECT e.*,r.source,r.source_booking_id,r.status,r.cancellation_disposition,r.no_show_recorded_at,
   CASE e.kind WHEN 'charge' THEN e.amount_minor WHEN 'charge_reversal' THEN -e.amount_minor ELSE 0 END charges_effect_minor,
   CASE e.kind WHEN 'external_payment' THEN e.amount_minor WHEN 'external_refund' THEN -e.amount_minor WHEN 'payment_correction' THEN -e.amount_minor ELSE 0 END recorded_paid_effect_minor
  FROM irp_pms.folio_entries e JOIN irp_pms.reservations r ON r.tenant_id=e.tenant_id AND r.property_id=e.property_id AND r.id=e.reservation_id
  WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.created_at>=start_at AND e.created_at<end_at
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'request_id',request_id,'reservation_id',reservation_id,'source',source,'source_booking_id',source_booking_id,'status',status,'cancellation_disposition',cancellation_disposition,'no_show_recorded_at',no_show_recorded_at,'kind',kind,'amount_minor',amount_minor,'currency',currency,'reference',reference,'reason',reason,'target_entry_id',target_entry_id,'actor_id',actor_id,'created_at',created_at,'local_date',(created_at AT TIME ZONE prop.time_zone)::date,'charges_effect_minor',charges_effect_minor,'recorded_paid_effect_minor',recorded_paid_effect_minor,'balance_effect_minor',charges_effect_minor-recorded_paid_effect_minor) ORDER BY created_at,id),'[]'),
 jsonb_build_object('entry_count',count(*),'additional_minor',coalesce(sum(amount_minor) FILTER(WHERE kind='charge'),0),'reversed_minor',coalesce(sum(amount_minor) FILTER(WHERE kind='charge_reversal'),0),'external_payments_minor',coalesce(sum(amount_minor) FILTER(WHERE kind='external_payment'),0),'external_refunds_minor',coalesce(sum(amount_minor) FILTER(WHERE kind='external_refund'),0),'corrected_payments_minor',coalesce(sum(amount_minor) FILTER(WHERE kind='payment_correction'),0),'charges_effect_minor',coalesce(sum(charges_effect_minor),0),'recorded_paid_effect_minor',coalesce(sum(recorded_paid_effect_minor),0),'balance_effect_minor',coalesce(sum(charges_effect_minor-recorded_paid_effect_minor),0),'complete',true)
 INTO rows,totals FROM entries;
 RETURN jsonb_build_object('property',to_jsonb(prop),'period',jsonb_build_object('start',p_start,'end',p_end,'end_exclusive',true,'start_at',start_at,'end_at',end_at),'generated_at',generated_at,'currency','USD','payment_recording','external_only','rows',rows,'totals',irp_pms.report_exact_numbers(totals),'rows_truncated',false,
 'definitions',jsonb_build_object('period','Immutable folio-entry recording timestamps in the current property time zone; not transaction, service or settlement dates. Reservation status and source labels are current.','charges','Additional charges and reversals only. Initial reservation charges and frozen opening amounts are not activity entries.','recorded_paid','External payment records minus external refund records and payment-record reductions. These records do not establish processor capture, bank settlement or collected cash.','payment_correction','Reduces a mistaken externally recorded payment amount; it does not assert a refund.','balance_effect','Charge effect minus recorded-payment effect. This is activity within the selected period, not the current balance or earned revenue.'));
END $$;

CREATE OR REPLACE FUNCTION public.irp_pms_pilot_current_balances(p_tenant uuid,p_property uuid)
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
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('reservation_id',id,'source',source,'source_booking_id',source_booking_id,'status',status,'cancellation_disposition',cancellation_disposition,'no_show_recorded_at',no_show_recorded_at,'arrival',arrival,'departure',departure,'available',available,'reason',CASE WHEN NOT available THEN 'reservation_charges_unavailable' ELSE NULL END,'opening_mode',CASE WHEN frozen THEN 'frozen' WHEN available THEN 'reservation_preview' ELSE 'unavailable' END,'reservation_amounts_changed',reservation_amounts_changed,'pricing_reconciliation_required',pricing_reconciliation_required,'current_reservation_total_minor',guest_total_minor,
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
COMMIT;

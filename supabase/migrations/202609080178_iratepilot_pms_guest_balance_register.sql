-- Draft current guest-balance register. Read-only; not installed.
BEGIN;
CREATE FUNCTION irp_pms.guest_balance_register_capture(p_tenant uuid,p_property uuid,p_status text,p_date_field text,p_start date,p_end date) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 WITH prop AS MATERIALIZED(SELECT tenant_id,id,name,currency,time_zone,operating_model FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property),
 reservations AS MATERIALIZED(SELECT r.* FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND(p_status='all' OR r.status=p_status) AND(p_date_field='all' OR(p_date_field='undated' AND(r.arrival IS NULL OR r.departure IS NULL)) OR(p_date_field='arrival' AND r.arrival>=p_start AND r.arrival<p_end) OR(p_date_field='departure' AND r.departure>=p_start AND r.departure<p_end)) ORDER BY r.id LIMIT 1001),
 entries AS MATERIALIZED(SELECT e.tenant_id,e.property_id,e.reservation_id,e.id,e.request_id,e.kind,e.amount_minor,e.currency,e.target_entry_id,e.created_at FROM irp_pms.folio_entries e JOIN reservations r ON r.tenant_id=e.tenant_id AND r.property_id=e.property_id AND r.id=e.reservation_id ORDER BY e.reservation_id,e.id LIMIT 10001),
 counts AS MATERIALIZED(SELECT(SELECT count(*) FROM reservations) reservation_count,(SELECT count(*) FROM entries) entry_count),
 grouped AS MATERIALIZED(SELECT reservation_id,jsonb_agg(to_jsonb(e) ORDER BY e.id) entries FROM entries e GROUP BY reservation_id),
 rows AS MATERIALIZED(SELECT r.id,jsonb_build_object(
 'reservation',jsonb_build_object('tenant_id',r.tenant_id,'property_id',r.property_id,'id',r.id,'source',r.source,'source_booking_id',r.source_booking_id,'source_version',r.source_version,'status',r.status,'cancellation_disposition',r.cancellation_disposition,'arrival',r.arrival,'departure',r.departure,'accommodation_minor',r.accommodation_minor,'taxes_minor',r.taxes_minor,'hotel_fees_minor',r.hotel_fees_minor,'ota_fees_minor',r.ota_fees_minor,'guest_total_minor',r.guest_total_minor,'charge_breakdown',r.charge_breakdown),
 'opening',CASE WHEN o.reservation_id IS NOT NULL THEN to_jsonb(o) END,'entries',coalesce(g.entries,'[]'::jsonb)) data
 FROM reservations r CROSS JOIN counts c LEFT JOIN irp_pms.folio_openings o ON o.tenant_id=r.tenant_id AND o.property_id=r.property_id AND o.reservation_id=r.id LEFT JOIN grouped g ON g.reservation_id=r.id WHERE c.reservation_count<=1000 AND c.entry_count<=10000)
 SELECT jsonb_build_object('property',to_jsonb(p),'reservation_count',c.reservation_count,'entry_count',c.entry_count,'rows',coalesce((SELECT jsonb_agg(data ORDER BY id) FROM rows),'[]'::jsonb)) FROM prop p CROSS JOIN counts c;
$$;
REVOKE ALL ON FUNCTION irp_pms.guest_balance_register_capture(uuid,uuid,text,text,date,date) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.irp_pms_pilot_guest_balance_register(p_tenant uuid,p_property uuid,p_status text DEFAULT 'all',p_date_field text DEFAULT 'all',p_start date DEFAULT NULL,p_end date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE role text;captured jsonb;row jsonb;context jsonb;booking jsonb;rows jsonb:='[]';generated timestamptz:=clock_timestamp();balance numeric;charges numeric:=0;paid numeric:=0;positive numeric:=0;credit numeric:=0;net numeric:=0;known integer:=0;unknown integer:=0;unfrozen integer:=0;
BEGIN
 role:=irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_status IS NULL OR p_status NOT IN('all','Confirmed','In house','Checked out','Cancelled') THEN RAISE EXCEPTION 'Choose a valid reservation status';END IF;
 IF p_date_field IS NULL OR p_date_field NOT IN('all','arrival','departure','undated') THEN RAISE EXCEPTION 'Choose all stays, arrival, departure or undated stays';END IF;
 IF p_date_field IN('arrival','departure') THEN
  IF p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end) OR p_end-p_start NOT BETWEEN 1 AND 366 THEN RAISE EXCEPTION 'Choose 1 to 366 stay dates with an exclusive end';END IF;
 ELSIF p_start IS NOT NULL OR p_end IS NOT NULL THEN RAISE EXCEPTION 'All or undated stays must not include a date range';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 role:=irp_pms.pilot_require(p_tenant,p_property,true);
 captured:=irp_pms.guest_balance_register_capture(p_tenant,p_property,p_status,p_date_field,p_start,p_end);
 IF captured IS NULL OR captured->'property'->>'currency'<>'USD' THEN RAISE EXCEPTION 'Property balance register unavailable';END IF;
 IF (captured->>'reservation_count')::integer>1000 OR(captured->>'entry_count')::integer>10000 THEN RAISE EXCEPTION 'Complete balance register exceeds 1000 stays or 10000 entries; select a narrower status or stay-date range';END IF;
 FOR row IN SELECT value FROM jsonb_array_elements(captured->'rows') LOOP
  booking:=row->'reservation';context:=irp_pms.balance_follow_up_context(booking,row->'opening',row->'entries');
  IF(context->>'available')::boolean THEN
   known:=known+1;balance:=(context->'totals'->>'balance_minor')::numeric;net:=net+balance;positive:=positive+greatest(balance,0);credit:=credit+greatest(-balance,0);charges:=charges+(context->'totals'->>'charges_minor')::numeric;paid:=paid+(context->'totals'->>'recorded_paid_minor')::numeric;
  ELSE unknown:=unknown+1;END IF;
  IF row->'opening'='null'::jsonb THEN unfrozen:=unfrozen+1;END IF;
  rows:=rows||jsonb_build_array(jsonb_build_object('reservation_id',booking->'id','source',booking->'source','reference',booking->'source_booking_id','status',booking->'status','cancellation_disposition',booking->'cancellation_disposition','arrival',booking->'arrival','departure',booking->'departure','available',context->'available','unavailable_reason',context->'unavailable_reason','opening_mode',context->'opening_mode','flags',context->'flags','context_fingerprint',context->'context_fingerprint','folio_entry_count',context->'folio_entry_count','charges_minor',CASE WHEN(context->>'available')::boolean THEN context->'totals'->>'charges_minor' END,'recorded_paid_minor',CASE WHEN(context->>'available')::boolean THEN context->'totals'->>'recorded_paid_minor' END,'balance_minor',CASE WHEN(context->>'available')::boolean THEN context->'totals'->>'balance_minor' END));
 END LOOP;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'role',role,'property',captured->'property','generated_at',generated,'business_date',(generated AT TIME ZONE(captured->'property'->>'time_zone'))::date,'status_filter',p_status,'date_filter',jsonb_build_object('field',p_date_field,'start',p_start,'end_exclusive',p_end),'basis','current_guest_balances','currency','USD','complete',true,'rows_truncated',false,'rows',rows,'summary',jsonb_build_object('reservation_count',captured->'reservation_count','known_count',known,'unknown_count',unknown,'unfrozen_count',unfrozen,'amounts_complete',unknown=0,'known_charges_minor',charges::text,'known_recorded_paid_minor',paid::text,'known_positive_balances_minor',positive::text,'known_credit_balances_minor',credit::text,'known_net_balance_minor',net::text),'semantics',jsonb_build_object('snapshot','current','date_filter_selects','scheduled stays, not historical balances','unfrozen_basis','current booked value','is_general_ledger',false,'is_invoice_aging',false,'verifies_payment_settlement',false,'includes_security_deposits',false));
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_guest_balance_register(uuid,uuid,text,text,date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_guest_balance_register(uuid,uuid,text,text,date,date) TO authenticated;
COMMIT;

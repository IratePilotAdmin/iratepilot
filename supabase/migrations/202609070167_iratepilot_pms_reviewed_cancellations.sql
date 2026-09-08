BEGIN;
-- Ordinary cancellation changes only the never-started local lifecycle.
-- Financial decisions and source-owned OTA cancellations remain separate.
CREATE TABLE irp_pms.cancellation_requests(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,reservation_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),command jsonb NOT NULL,result jsonb NOT NULL,recorded_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,property_id,request_id),UNIQUE(tenant_id,property_id,reservation_id),
 FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.reservations(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.cancellation_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cancellation_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON irp_pms.cancellation_requests TO service_role;
CREATE FUNCTION irp_pms.cancellation_receipt_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Cancellation receipts are immutable';END $$;
REVOKE ALL ON FUNCTION irp_pms.cancellation_receipt_immutable() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER irp_pms_cancellation_receipt_immutable BEFORE UPDATE OR DELETE ON irp_pms.cancellation_requests FOR EACH ROW EXECUTE FUNCTION irp_pms.cancellation_receipt_immutable();

CREATE FUNCTION irp_pms.cancellation_context(p_tenant uuid,p_property uuid,p_reservation uuid,p_now timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;res irp_pms.reservations;folio jsonb;business_date date;release_start date;release_end date;room_nights integer:=0;blockers jsonb:='[]';financial_review boolean;
BEGIN
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property;
 SELECT * INTO res FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped reservation';END IF;
 business_date:=(p_now AT TIME ZONE prop.time_zone)::date;
 IF res.source NOT IN('direct','migration') THEN blockers:=blockers||jsonb_build_array('source_owned_ota');END IF;
 IF res.status<>'Confirmed' THEN blockers:=blockers||jsonb_build_array('not_confirmed');END IF;
 IF res.checked_in_at IS NOT NULL OR res.checked_out_at IS NOT NULL THEN blockers:=blockers||jsonb_build_array('stay_has_started');END IF;
 IF res.cancellation_disposition IS NOT NULL THEN blockers:=blockers||jsonb_build_array('already_dispositioned');END IF;
 IF res.arrival IS NULL OR res.departure IS NULL OR res.departure<=res.arrival THEN blockers:=blockers||jsonb_build_array('stay_dates_unavailable');END IF;
 IF blockers='[]'::jsonb AND res.departure>business_date THEN
  release_start:=greatest(res.arrival,business_date);release_end:=res.departure;room_nights:=release_end-release_start;
 END IF;
 folio:=public.irp_pms_pilot_folio(p_tenant,p_property,p_reservation);
 financial_review:=NOT (folio->>'available')::boolean OR coalesce((folio->'totals'->>'charges_minor')::bigint,0)<>0 OR coalesce((folio->'totals'->>'paid_minor')::bigint,0)<>0 OR coalesce((folio->>'reservation_amounts_changed')::boolean,false) OR coalesce(res.charge_breakdown->>'requires_reconciliation'='true',false);
 RETURN jsonb_build_object('reservation_id',res.id,'status',res.status,'source',res.source,'source_version',res.source_version,'arrival',res.arrival,'departure',res.departure,'cancellation_disposition',res.cancellation_disposition,'no_show_recorded_at',res.no_show_recorded_at,
 'business_date',business_date,'eligible',blockers='[]'::jsonb,'blockers',blockers,'scheduled_stay_elapsed',res.departure<=business_date,
 'current_future_room_nights_released',room_nights,'release_start',release_start,'release_end',release_end,'release_end_exclusive',true,'inventory_definition','One reservation capacity commitment is released on each night in the displayed interval. Configured capacity and physical-room housekeeping are unchanged.',
 'folio_available',folio->'available','opening_mode',CASE WHEN folio->>'available'='true' THEN folio->>'opening_mode' ELSE 'unavailable' END,'charges_minor',folio->'totals'->'charges_minor','recorded_paid_minor',folio->'totals'->'paid_minor','balance_minor',folio->'totals'->'balance_minor','financial_review_required',financial_review,'financial_handling','separate_review',
 'service_warning','Decide retained or waived fees and any required allocation before closing their service dates. No-folio or zero-charge cancelled nights are skipped; a later fee is not covered by the fully allocated stay correction workflow. Nonzero unoccupied charges still require explicit financial and allocation review.',
 'cancellation_policy','Ordinary cancellation is terminal and does not classify a no-show, reinstate a stay, waive charges or move money. OTA-owned cancellations must be made at their source.','generated_at',p_now);
END $$;
REVOKE ALL ON FUNCTION irp_pms.cancellation_context(uuid,uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.irp_pms_pilot_cancellation_preview(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 RETURN irp_pms.cancellation_context(p_tenant,p_property,p_reservation,clock_timestamp());
END $$;

CREATE FUNCTION public.irp_pms_pilot_cancel_reservation(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_source_version bigint,p_expected_business_date date,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE res irp_pms.reservations;prior irp_pms.cancellation_requests;command jsonb;context jsonb;recorded_at timestamptz;result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL OR p_reservation IS NULL OR p_expected_source_version IS NULL OR p_expected_source_version NOT BETWEEN 1 AND 9007199254740991 OR p_expected_business_date IS NULL OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 4 AND 500 OR p_reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Provide scoped stay, request, expected source version and business date, and a 4 to 500 character cancellation reason';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 command:=jsonb_build_object('reservation_id',p_reservation,'expected_source_version',p_expected_source_version,'expected_business_date',p_expected_business_date,'reason',trim(p_reason));
 SELECT * INTO prior FROM irp_pms.cancellation_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Cancellation request identity already used';END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO res FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped reservation';END IF;
 recorded_at:=clock_timestamp();context:=irp_pms.cancellation_context(p_tenant,p_property,p_reservation,recorded_at);
 IF res.source_version<>p_expected_source_version OR (context->>'business_date')::date<>p_expected_business_date THEN RAISE EXCEPTION 'Reservation or property business date changed; refresh cancellation review' USING ERRCODE='40001';END IF;
 IF NOT(context->>'eligible')::boolean THEN RAISE EXCEPTION 'Only never-started direct or imported Confirmed stays can be cancelled through this reviewed API';END IF;
 UPDATE irp_pms.reservations SET status='Cancelled' WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation;
 result:=jsonb_build_object('request_id',p_request,'reservation_id',p_reservation,'status','Cancelled','cancellation_disposition',NULL,'recorded_at',recorded_at,'business_date',p_expected_business_date,'source_version',res.source_version,
 'current_future_room_nights_released',context->'current_future_room_nights_released','release_start',context->'release_start','release_end',context->'release_end','release_end_exclusive',true,
 'capacity_configuration_changed',false,'housekeeping_changed',false,'fees_changed',false,'folio_changed',false,'financial_review_required',context->'financial_review_required','financial_handling','separate_review','replayed',false);
 INSERT INTO irp_pms.cancellation_requests(tenant_id,property_id,request_id,reservation_id,actor_id,command,result,recorded_at) VALUES(p_tenant,p_property,p_request,p_reservation,auth.uid(),command,result,recorded_at);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'reservation_cancelled',p_reservation,command||jsonb_build_object('request_id',p_request,'recorded_at',recorded_at,'current_future_room_nights_released',context->'current_future_room_nights_released','financial_handling','separate_review'));
 RETURN result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_cancellation_request_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior irp_pms.cancellation_requests;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL THEN RAISE EXCEPTION 'A request is required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO prior FROM irp_pms.cancellation_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object('found',false);END IF;
 RETURN jsonb_build_object('found',true,'action','cancel_reservation','result',prior.result);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cancellation_preview(uuid,uuid,uuid),public.irp_pms_pilot_cancel_reservation(uuid,uuid,uuid,uuid,bigint,date,text),public.irp_pms_pilot_cancellation_request_status(uuid,uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cancellation_preview(uuid,uuid,uuid),public.irp_pms_pilot_cancel_reservation(uuid,uuid,uuid,uuid,bigint,date,text),public.irp_pms_pilot_cancellation_request_status(uuid,uuid,uuid) TO authenticated;

-- Explicit forward legacy function: only the cancel branch is replaced.
-- Check-in/out source is retained exactly from155; no dynamic DB rewriting.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_stay_action(p_tenant uuid,p_property uuid,p_reservation uuid,p_action text,p_room uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties; res irp_pms.reservations; room irp_pms.rooms; business_date date;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 business_date:=(clock_timestamp() AT TIME ZONE prop.time_zone)::date;
 SELECT * INTO res FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown reservation'; END IF;
 IF p_action='check_in' THEN
  IF res.status='In house' AND res.physical_room_id=p_room THEN RETURN to_jsonb(res); END IF;
  IF res.status<>'Confirmed' OR business_date<res.arrival OR business_date>=res.departure THEN RAISE EXCEPTION 'Reservation cannot check in on this business date'; END IF;
  SELECT * INTO room FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room FOR UPDATE;
  IF NOT FOUND OR room.room_type_id IS DISTINCT FROM res.room_type_id OR room.housekeeping<>'Clean' THEN RAISE EXCEPTION 'A clean room of the booked type is required'; END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND physical_room_id=p_room AND id<>res.id AND status='In house') THEN RAISE EXCEPTION 'Physical room is occupied'; END IF;
  UPDATE irp_pms.reservations SET status='In house',physical_room_id=p_room,checked_in_at=clock_timestamp() WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation RETURNING * INTO res;
 ELSIF p_action='check_out' THEN
  IF res.status='Checked out' THEN RETURN to_jsonb(res); END IF;
  IF res.status<>'In house' OR business_date<res.arrival THEN RAISE EXCEPTION 'Only an in-house reservation can check out'; END IF;
  UPDATE irp_pms.reservations SET status='Checked out',checked_out_at=clock_timestamp() WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation RETURNING * INTO res;
  UPDATE irp_pms.rooms SET housekeeping='Dirty' WHERE tenant_id=p_tenant AND property_id=p_property AND id=res.physical_room_id;
 ELSIF p_action='cancel' THEN
  RAISE EXCEPTION 'Cancellation now requires review; use irp_pms_pilot_cancellation_preview and irp_pms_pilot_cancel_reservation';
 ELSE RAISE EXCEPTION 'Unknown stay action';
 END IF;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id) VALUES(p_tenant,p_property,auth.uid(),p_action,res.id);
 RETURN to_jsonb(res);
END $$;

COMMIT;

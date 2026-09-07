BEGIN;
CREATE TABLE irp_pms.inbound_events(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,event_id text NOT NULL CHECK(length(event_id) BETWEEN 1 AND 128),
 booking_id text NOT NULL,source_version bigint NOT NULL,payload_hash text NOT NULL,application_outcome text NOT NULL,
 normalized_record jsonb,review_reason text,resolution_outcome text,resolved_at timestamptz,
 received_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(tenant_id,property_id,event_id),
 FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
CREATE INDEX inbound_booking_version ON irp_pms.inbound_events(tenant_id,property_id,booking_id,source_version DESC);
ALTER TABLE irp_pms.inbound_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.inbound_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON irp_pms.inbound_events TO service_role;
CREATE FUNCTION irp_pms.can_manage(p_tenant uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT EXISTS(SELECT 1 FROM irp_pms.memberships WHERE tenant_id=p_tenant AND user_id=auth.uid() AND role IN('owner','manager'))
$$;
REVOKE ALL ON FUNCTION irp_pms.can_manage(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION irp_pms.can_manage(uuid) TO authenticated,service_role;
GRANT SELECT ON irp_pms.inbound_events TO authenticated;
CREATE POLICY manager_inbound_events ON irp_pms.inbound_events FOR SELECT TO authenticated USING(irp_pms.can_manage(tenant_id));
CREATE FUNCTION irp_pms.receive_reservation(p_tenant uuid,p_property uuid,p_event text,p_booking text,p_version bigint,p_hash text,p_record jsonb,p_review_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior irp_pms.inbound_events; applied text; outcome text;
BEGIN
 IF p_event IS NULL OR length(p_event) NOT BETWEEN 1 AND 128 OR p_booking IS NULL OR length(p_booking) NOT BETWEEN 1 AND 128 OR p_version IS NULL OR p_version NOT BETWEEN 1 AND 9007199254740991 OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid event identity'; END IF;
 IF p_review_reason IS NOT NULL AND length(p_review_reason)>300 THEN RAISE EXCEPTION 'Invalid review reason'; END IF;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped property'; END IF;
 SELECT * INTO prior FROM irp_pms.inbound_events WHERE tenant_id=p_tenant AND property_id=p_property AND event_id=p_event;
 IF FOUND THEN
  applied:=coalesce(prior.resolution_outcome,prior.application_outcome);
  outcome:=CASE WHEN prior.booking_id=p_booking AND prior.source_version=p_version AND prior.payload_hash=p_hash THEN CASE WHEN applied='review:version_conflict' THEN 'version-conflict' WHEN applied LIKE 'review:%' THEN 'review-required' ELSE 'duplicate' END ELSE 'event-conflict' END;
  RETURN jsonb_build_object('outcome',outcome,'eventId',p_event,'sourceVersion',p_version,'applicationOutcome',applied);
 END IF;
 SELECT * INTO prior FROM irp_pms.inbound_events WHERE tenant_id=p_tenant AND property_id=p_property AND booking_id=p_booking AND application_outcome<>'review:version_conflict' ORDER BY source_version DESC LIMIT 1;
 IF FOUND AND prior.source_version>p_version THEN applied:='stale';
 ELSIF FOUND AND prior.source_version=p_version THEN
  applied:=CASE WHEN prior.payload_hash<>p_hash THEN 'review:version_conflict' WHEN coalesce(prior.resolution_outcome,prior.application_outcome) LIKE 'review:%' THEN coalesce(prior.resolution_outcome,prior.application_outcome) ELSE 'duplicate' END;
  IF prior.payload_hash=p_hash THEN p_record:=prior.normalized_record;p_review_reason:=prior.review_reason; END IF;
 ELSIF p_record IS NULL THEN applied:='review:upstream';
 ELSE
  IF p_record->>'source_booking_id' IS DISTINCT FROM p_booking OR (p_record->>'source_version')::bigint IS DISTINCT FROM p_version OR p_record->>'payload_hash' IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'Event and reservation disagree'; END IF;
  applied:=irp_pms.apply_reservation(p_tenant,p_property,p_record);
 END IF;
 INSERT INTO irp_pms.inbound_events(tenant_id,property_id,event_id,booking_id,source_version,payload_hash,application_outcome,normalized_record,review_reason) VALUES(p_tenant,p_property,p_event,p_booking,p_version,p_hash,applied,p_record,CASE WHEN applied LIKE 'review:%' THEN coalesce(p_review_reason,applied) END);
 outcome:=CASE WHEN applied='applied' THEN CASE WHEN p_record->>'status'='Cancelled' THEN 'cancellation-staged' ELSE 'reservation-staged' END WHEN applied='stale' THEN 'stale' WHEN applied='duplicate' THEN 'duplicate' WHEN applied='review:version_conflict' THEN 'version-conflict' ELSE 'review-required' END;
 RETURN jsonb_build_object('outcome',outcome,'eventId',p_event,'sourceVersion',p_version,'applicationOutcome',applied);
END $$;
REVOKE ALL ON FUNCTION irp_pms.receive_reservation(uuid,uuid,text,text,bigint,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION irp_pms.receive_reservation(uuid,uuid,text,text,bigint,text,jsonb,text) TO service_role;
-- Once the inbox gate exists, backend callers must not bypass newer review heads.
REVOKE EXECUTE ON FUNCTION irp_pms.apply_reservation(uuid,uuid,jsonb) FROM service_role;

CREATE TABLE irp_pms.review_actions(
 request_id uuid PRIMARY KEY,tenant_id uuid NOT NULL,property_id uuid NOT NULL,event_id text NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 8 AND 200),
 outcome text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,property_id,event_id) REFERENCES irp_pms.inbound_events(tenant_id,property_id,event_id)
);
ALTER TABLE irp_pms.review_actions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.review_actions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON irp_pms.review_actions TO authenticated,service_role;
CREATE POLICY manager_review_actions ON irp_pms.review_actions FOR SELECT TO authenticated USING(irp_pms.can_manage(tenant_id));
CREATE FUNCTION irp_pms.reprocess_reservation(p_tenant uuid,p_property uuid,p_event text,p_request uuid,p_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE receipt irp_pms.inbound_events; action irp_pms.review_actions; latest irp_pms.inbound_events; applied text; actor uuid:=auth.uid();
BEGIN
 IF actor IS NULL OR NOT irp_pms.can_manage(p_tenant) THEN RAISE EXCEPTION 'Manager membership required'; END IF;
 IF p_request IS NULL OR p_reference IS NULL OR length(trim(p_reference)) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Review request and reference required'; END IF;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped property'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,1));
 SELECT * INTO action FROM irp_pms.review_actions WHERE request_id=p_request;
 IF FOUND THEN
  IF action.tenant_id<>p_tenant OR action.property_id<>p_property OR action.event_id IS DISTINCT FROM p_event OR action.actor_id<>actor OR action.reference<>trim(p_reference) THEN RAISE EXCEPTION 'Review request identity already used'; END IF;
  RETURN jsonb_build_object('eventId',p_event,'requestId',p_request,'applicationOutcome',action.outcome);
 END IF;
 SELECT * INTO receipt FROM irp_pms.inbound_events WHERE tenant_id=p_tenant AND property_id=p_property AND event_id=p_event FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Review event required'; END IF;
 IF coalesce(receipt.resolution_outcome,receipt.application_outcome) NOT IN('review:capacity_missing','review:sold_out') OR receipt.normalized_record IS NULL THEN RAISE EXCEPTION 'This review requires a new corrected source event or manual reconciliation'; END IF;
 SELECT * INTO latest FROM irp_pms.inbound_events WHERE tenant_id=p_tenant AND property_id=p_property AND booking_id=receipt.booking_id AND application_outcome<>'review:version_conflict' ORDER BY source_version DESC LIMIT 1;
 IF latest.source_version>receipt.source_version THEN applied:='stale';
 ELSIF latest.source_version<>receipt.source_version OR latest.payload_hash<>receipt.payload_hash THEN RAISE EXCEPTION 'Review head conflicts with source';
 ELSE applied:=irp_pms.apply_reservation(p_tenant,p_property,receipt.normalized_record);
 END IF;
 -- Keep the original receipt and reason; resolution is a separate audit result.
 UPDATE irp_pms.inbound_events SET resolution_outcome=applied,resolved_at=CASE WHEN applied NOT LIKE 'review:%' THEN now() END WHERE tenant_id=p_tenant AND property_id=p_property AND booking_id=receipt.booking_id AND source_version=receipt.source_version AND payload_hash=receipt.payload_hash AND application_outcome IN('review:capacity_missing','review:sold_out');
 INSERT INTO irp_pms.review_actions(request_id,tenant_id,property_id,event_id,actor_id,reference,outcome) VALUES(p_request,p_tenant,p_property,p_event,actor,trim(p_reference),applied);
 RETURN jsonb_build_object('eventId',p_event,'requestId',p_request,'applicationOutcome',applied);
END $$;
REVOKE ALL ON FUNCTION irp_pms.reprocess_reservation(uuid,uuid,text,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION irp_pms.reprocess_reservation(uuid,uuid,text,uuid,text) TO authenticated;
COMMIT;

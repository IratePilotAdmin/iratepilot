BEGIN;
-- Apply after 139. Separate capture from delivery so a baseline can be reviewed.
ALTER TABLE public.irp_pms_outbox_connections ADD COLUMN delivery_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.irp_pms_outbox_connections ADD CONSTRAINT irp_pms_delivery_requires_capture CHECK(NOT delivery_enabled OR enabled);
REVOKE UPDATE ON public.irp_pms_outbox_connections FROM service_role;
REVOKE INSERT ON public.irp_pms_outbox_connections FROM service_role;
GRANT INSERT(property_id,connection_id,tenant_id,pms_property_id,environment) ON public.irp_pms_outbox_connections TO service_role;
CREATE TABLE public.irp_pms_baseline_runs(
 property_id uuid PRIMARY KEY REFERENCES public.properties(id),request_id uuid NOT NULL UNIQUE,
 from_date date NOT NULL,snapshot_count integer NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 release_reference text,released_at timestamptz
);
ALTER TABLE public.irp_pms_baseline_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.irp_pms_baseline_runs FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.irp_pms_baseline_runs TO service_role;
CREATE FUNCTION public.irp_pms_prepare_baseline(p_property uuid,p_request uuid,p_from date,p_expected_count integer)
RETURNS public.irp_pms_baseline_runs LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.irp_pms_outbox_connections; run public.irp_pms_baseline_runs; b public.bookings; n integer; e uuid;
BEGIN
 IF p_request IS NULL OR p_from IS NULL OR p_expected_count IS NULL OR p_expected_count<0 OR p_expected_count>1000 THEN RAISE EXCEPTION 'Invalid bounded baseline request'; END IF;
 -- Serialize against all booking writers before taking connection/row locks.
 -- This intentionally short sandbox operation briefly blocks writes across properties.
 LOCK TABLE public.bookings IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO c FROM public.irp_pms_outbox_connections WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Configure a sandbox connection first'; END IF;
 SELECT * INTO run FROM public.irp_pms_baseline_runs WHERE property_id=p_property;
 IF FOUND THEN
  IF run.request_id=p_request AND run.from_date=p_from AND run.snapshot_count=p_expected_count THEN RETURN run; END IF;
  RAISE EXCEPTION 'Baseline already exists; use the original request identity';
 END IF;
 IF c.enabled OR c.delivery_enabled OR c.environment<>'sandbox' THEN RAISE EXCEPTION 'Initial baseline requires disabled sandbox connection'; END IF;
 IF EXISTS(SELECT 1 FROM public.irp_pms_outbox WHERE property_id=p_property) OR EXISTS(SELECT 1 FROM public.irp_pms_booking_versions v JOIN public.bookings existing_booking ON existing_booking.id=v.booking_id WHERE existing_booking.property_id=p_property) THEN RAISE EXCEPTION 'Existing delivery history requires reconciliation, not initial baseline'; END IF;
 SELECT count(*) INTO n FROM public.bookings WHERE property_id=p_property AND check_out>=p_from;
 IF n<>p_expected_count OR n>1000 THEN RAISE EXCEPTION 'Baseline count changed or exceeds limit'; END IF;
 FOR b IN SELECT * FROM public.bookings WHERE property_id=p_property AND check_out>=p_from ORDER BY id LOOP
  e:=gen_random_uuid();
  INSERT INTO public.irp_pms_booking_versions VALUES(b.id,1);
  INSERT INTO public.irp_pms_outbox(event_id,booking_id,property_id,connection_id,tenant_id,pms_property_id,source_version,event_payload)
  VALUES(e,b.id,b.property_id,c.connection_id,c.tenant_id,c.pms_property_id,1,jsonb_build_object('eventId',e,'sourceVersion',1,'booking',public.irp_pms_booking_payload(b)));
 END LOOP;
 INSERT INTO public.irp_pms_baseline_runs(property_id,request_id,from_date,snapshot_count) VALUES(p_property,p_request,p_from,n) RETURNING * INTO run;
 UPDATE public.irp_pms_outbox_connections SET enabled=true,delivery_enabled=false WHERE property_id=p_property;
 RETURN run;
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_prepare_baseline(uuid,uuid,date,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.irp_pms_prepare_baseline(uuid,uuid,date,integer) TO service_role;
CREATE FUNCTION public.irp_pms_release_baseline(p_property uuid,p_request uuid,p_review_reference text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE run public.irp_pms_baseline_runs;
BEGIN
 IF p_review_reference IS NULL OR length(trim(p_review_reference)) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Provide a reviewed sandbox activation reference'; END IF;
 PERFORM 1 FROM public.irp_pms_outbox_connections WHERE property_id=p_property AND enabled AND environment='sandbox' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Capture must be enabled'; END IF;
 SELECT * INTO run FROM public.irp_pms_baseline_runs WHERE property_id=p_property AND request_id=p_request FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Matching baseline required'; END IF;
 IF run.released_at IS NOT NULL THEN
  IF run.release_reference=p_review_reference THEN RETURN true; END IF;
  RAISE EXCEPTION 'Activation reference cannot be replaced';
 END IF;
 UPDATE public.irp_pms_baseline_runs SET release_reference=p_review_reference,released_at=now() WHERE property_id=p_property;
 UPDATE public.irp_pms_outbox_connections SET delivery_enabled=true WHERE property_id=p_property;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_release_baseline(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.irp_pms_release_baseline(uuid,uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.irp_pms_claim_event() RETURNS SETOF public.irp_pms_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE picked uuid; t timestamptz:=clock_timestamp();
BEGIN
 SELECT o.event_id INTO picked FROM public.irp_pms_outbox o
 JOIN public.irp_pms_outbox_connections c ON c.property_id=o.property_id AND c.enabled AND c.delivery_enabled
 AND c.connection_id=o.connection_id AND c.tenant_id=o.tenant_id AND c.pms_property_id=o.pms_property_id
 WHERE ((o.state IN('pending','retry') AND o.due_at<=t) OR(o.state='leased' AND o.lease_until<=t))
 AND NOT EXISTS(SELECT 1 FROM public.irp_pms_outbox p WHERE p.booking_id=o.booking_id AND p.source_version<o.source_version AND p.state<>'delivered')
 ORDER BY o.due_at,o.source_version FOR UPDATE OF o SKIP LOCKED LIMIT 1;
 IF picked IS NULL THEN RETURN; END IF;
 RETURN QUERY UPDATE public.irp_pms_outbox SET state='leased',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=t+interval '30 seconds' WHERE event_id=picked RETURNING *;
END $$;
COMMIT;


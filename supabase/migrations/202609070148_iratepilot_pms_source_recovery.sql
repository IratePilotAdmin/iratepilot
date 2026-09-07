BEGIN;
-- OPTIONAL OTA source migration. Requires 139-141; independent of the PMS
-- tenant/pilot stack. It never creates, activates, or resumes a connection.
ALTER TABLE public.irp_pms_outbox ADD COLUMN recovery_count integer NOT NULL DEFAULT 0 CHECK(recovery_count>=0);
CREATE TABLE public.irp_pms_source_recoveries(
 request_id uuid PRIMARY KEY,event_id uuid NOT NULL REFERENCES public.irp_pms_outbox(event_id),
 connection_id text NOT NULL REFERENCES public.irp_pms_outbox_connections(connection_id),
 property_id uuid NOT NULL REFERENCES public.properties(id),
 previous_attempts integer NOT NULL,previous_recovery_count integer NOT NULL,previous_result_code text,
 review_reference text NOT NULL CHECK(length(trim(review_reference)) BETWEEN 8 AND 200),
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(event_id,previous_recovery_count)
);
ALTER TABLE public.irp_pms_source_recoveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.irp_pms_source_recoveries FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.irp_pms_source_recoveries TO service_role;
CREATE FUNCTION public.irp_pms_requeue_review(p_connection text,p_event uuid,p_request uuid,p_expected_attempts integer,p_expected_recovery integer,p_reference text)
RETURNS public.irp_pms_source_recoveries LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.irp_pms_outbox_connections; event public.irp_pms_outbox; action public.irp_pms_source_recoveries;
BEGIN
 IF p_connection IS NULL OR p_event IS NULL OR p_request IS NULL OR p_expected_attempts IS NULL OR p_expected_attempts<0 OR p_expected_recovery IS NULL OR p_expected_recovery<0 OR p_expected_recovery>=2147483647 OR p_reference IS NULL OR length(trim(p_reference)) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Invalid source review recovery request'; END IF;
 -- The service operator resolves an approved connection before invoking this
 -- RPC. No caller-supplied tenant/property ID can override that mapping.
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request::text,2));
 SELECT * INTO c FROM public.irp_pms_outbox_connections WHERE connection_id=p_connection FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Configured source connection required'; END IF;
 SELECT * INTO action FROM public.irp_pms_source_recoveries WHERE request_id=p_request;
 IF FOUND THEN
  IF action.event_id<>p_event OR action.connection_id<>p_connection OR action.property_id<>c.property_id OR action.previous_attempts<>p_expected_attempts OR action.previous_recovery_count<>p_expected_recovery OR action.review_reference<>trim(p_reference) THEN RAISE EXCEPTION 'Recovery request identity already used'; END IF;
  RETURN action;
 END IF;
 IF NOT c.enabled OR c.environment<>'sandbox' THEN RAISE EXCEPTION 'Active sandbox capture required'; END IF;
 SELECT * INTO event FROM public.irp_pms_outbox WHERE event_id=p_event AND property_id=c.property_id AND connection_id=c.connection_id AND tenant_id=c.tenant_id AND pms_property_id=c.pms_property_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Event does not match the approved connection scope'; END IF;
 IF event.state<>'review' OR event.attempts<>p_expected_attempts OR event.recovery_count<>p_expected_recovery THEN RAISE EXCEPTION 'Event review state changed; inspect before retrying'; END IF;
 INSERT INTO public.irp_pms_source_recoveries(request_id,event_id,connection_id,property_id,previous_attempts,previous_recovery_count,previous_result_code,review_reference)
 VALUES(p_request,p_event,c.connection_id,c.property_id,event.attempts,event.recovery_count,event.result_code,trim(p_reference)) RETURNING * INTO action;
 UPDATE public.irp_pms_outbox SET state='retry',attempts=0,recovery_count=recovery_count+1,due_at=clock_timestamp(),lease_token=NULL,lease_until=NULL,result_code=NULL WHERE event_id=p_event;
 RETURN action;
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_requeue_review(text,uuid,uuid,integer,integer,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.irp_pms_requeue_review(text,uuid,uuid,integer,integer,text) TO service_role;
COMMIT;

BEGIN;
-- Explicit sandbox opt-in; no row is enabled by this migration.
CREATE TABLE public.irp_pms_outbox_connections (
 property_id uuid PRIMARY KEY REFERENCES public.properties(id),
 connection_id text NOT NULL UNIQUE CHECK(connection_id ~ '^[A-Za-z0-9_-]{1,80}$'),
 tenant_id text NOT NULL CHECK(length(tenant_id) BETWEEN 1 AND 128),
 pms_property_id text NOT NULL CHECK(length(pms_property_id) BETWEEN 1 AND 128),
 enabled boolean NOT NULL DEFAULT false,
 environment text NOT NULL DEFAULT 'sandbox' CHECK(environment='sandbox')
);
CREATE TABLE public.irp_pms_booking_versions (
 booking_id uuid PRIMARY KEY REFERENCES public.bookings(id),
 version bigint NOT NULL CHECK(version BETWEEN 1 AND 9007199254740991)
);
CREATE TABLE public.irp_pms_outbox (
 event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 booking_id uuid NOT NULL REFERENCES public.bookings(id),
 property_id uuid NOT NULL REFERENCES public.properties(id),
 connection_id text NOT NULL,
 tenant_id text NOT NULL,
 pms_property_id text NOT NULL,
 source_version bigint NOT NULL CHECK(source_version BETWEEN 1 AND 9007199254740991),
 event_payload jsonb NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','leased','retry','delivered','review')),
 attempts integer NOT NULL DEFAULT 0,
 due_at timestamptz NOT NULL DEFAULT now(),
 lease_token uuid,
 lease_until timestamptz,
 result_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(booking_id,source_version)
);
CREATE INDEX irp_pms_outbox_due_idx ON public.irp_pms_outbox(state,due_at);
ALTER TABLE public.irp_pms_outbox_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.irp_pms_booking_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.irp_pms_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.irp_pms_outbox_connections,public.irp_pms_booking_versions,public.irp_pms_outbox FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.irp_pms_outbox_connections TO service_role;
GRANT SELECT ON public.irp_pms_booking_versions,public.irp_pms_outbox TO service_role;

CREATE FUNCTION public.irp_pms_booking_payload(b public.bookings) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('id',b.id,'confirmation_code',b.confirmation_code,
 'customer_id',b.customer_id,'property_id',b.property_id,'room_id',b.room_id,
 'check_in',b.check_in::text,'check_out',b.check_out::text,'guests',b.guests,
 'subtotal',b.subtotal::text,'taxes',b.taxes::text,'fees',b.fees::text,'total',b.total::text,'status',b.status::text)
$$;
REVOKE ALL ON FUNCTION public.irp_pms_booking_payload(public.bookings) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.irp_pms_enqueue_booking() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.irp_pms_outbox_connections; v bigint; e uuid; payload jsonb;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.id<>NEW.id OR OLD.property_id<>NEW.property_id THEN
   IF EXISTS(SELECT 1 FROM public.irp_pms_outbox_connections WHERE property_id IN(OLD.property_id,NEW.property_id) AND enabled) THEN
    RAISE EXCEPTION 'PMS-integrated booking identity cannot be reassigned';
   END IF;
  END IF;
  IF public.irp_pms_booking_payload(OLD)=public.irp_pms_booking_payload(NEW) THEN RETURN NEW; END IF;
 END IF;
 SELECT * INTO c FROM public.irp_pms_outbox_connections WHERE property_id=NEW.property_id AND enabled FOR SHARE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 INSERT INTO public.irp_pms_booking_versions AS versions(booking_id,version) VALUES(NEW.id,1)
 ON CONFLICT(booking_id) DO UPDATE SET version=versions.version+1 RETURNING version INTO v;
 e:=gen_random_uuid();payload:=public.irp_pms_booking_payload(NEW);
 INSERT INTO public.irp_pms_outbox(event_id,booking_id,property_id,connection_id,tenant_id,pms_property_id,source_version,event_payload)
 VALUES(e,NEW.id,NEW.property_id,c.connection_id,c.tenant_id,c.pms_property_id,v,
 jsonb_build_object('eventId',e,'sourceVersion',v,'booking',payload));
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_enqueue_booking() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER irp_pms_booking_outbox AFTER INSERT OR UPDATE ON public.bookings
 FOR EACH ROW EXECUTE FUNCTION public.irp_pms_enqueue_booking();

CREATE FUNCTION public.irp_pms_claim_event() RETURNS SETOF public.irp_pms_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE picked uuid; t timestamptz:=clock_timestamp();
BEGIN
 SELECT o.event_id INTO picked FROM public.irp_pms_outbox o
 JOIN public.irp_pms_outbox_connections c ON c.property_id=o.property_id AND c.enabled
  AND c.connection_id=o.connection_id AND c.tenant_id=o.tenant_id AND c.pms_property_id=o.pms_property_id
 WHERE ((o.state IN('pending','retry') AND o.due_at<=t) OR(o.state='leased' AND o.lease_until<=t))
 AND NOT EXISTS(SELECT 1 FROM public.irp_pms_outbox p WHERE p.booking_id=o.booking_id AND p.source_version<o.source_version AND p.state<>'delivered')
 ORDER BY o.due_at,o.source_version FOR UPDATE OF o SKIP LOCKED LIMIT 1;
 IF picked IS NULL THEN RETURN; END IF;
 RETURN QUERY UPDATE public.irp_pms_outbox SET state='leased',attempts=attempts+1,
 lease_token=gen_random_uuid(),lease_until=t+interval '30 seconds' WHERE event_id=picked RETURNING *;
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_claim_event() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.irp_pms_claim_event() TO service_role;

CREATE FUNCTION public.irp_pms_finish_event(p_event uuid,p_lease uuid,p_outcome text,p_code text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE n integer; t timestamptz:=clock_timestamp();
BEGIN
 IF p_outcome NOT IN('acknowledged','retry','review-required') OR p_outcome IS NULL THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
 IF p_code IS NOT NULL AND (length(p_code)>80 OR p_code !~ '^[a-z0-9_-]+$') THEN RAISE EXCEPTION 'Invalid result code'; END IF;
 UPDATE public.irp_pms_outbox SET
 state=CASE WHEN p_outcome='acknowledged' THEN 'delivered' WHEN p_outcome='review-required' OR attempts>=5 THEN 'review' ELSE 'retry' END,
 due_at=t+make_interval(secs=>LEAST(3600,power(2,LEAST(attempts-1,12))::integer)),
 result_code=p_code,lease_token=NULL,lease_until=NULL
 WHERE event_id=p_event AND state='leased' AND lease_token=p_lease AND lease_until>t;
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n=1;
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_finish_event(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.irp_pms_finish_event(uuid,uuid,text,text) TO service_role;
COMMIT;

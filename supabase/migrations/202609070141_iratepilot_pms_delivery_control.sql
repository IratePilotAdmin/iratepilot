BEGIN;
CREATE TABLE public.irp_pms_delivery_controls (
 request_id uuid PRIMARY KEY, property_id uuid NOT NULL REFERENCES public.properties(id),
 expected_enabled boolean NOT NULL, delivery_enabled boolean NOT NULL,
 review_reference text NOT NULL CHECK(length(trim(review_reference)) BETWEEN 8 AND 200),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.irp_pms_delivery_controls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.irp_pms_delivery_controls FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.irp_pms_delivery_controls TO service_role;
CREATE FUNCTION public.irp_pms_set_delivery(p_property uuid,p_request uuid,p_expected boolean,p_enabled boolean,p_reference text)
RETURNS public.irp_pms_delivery_controls LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c public.irp_pms_outbox_connections; receipt public.irp_pms_delivery_controls;
BEGIN
 IF p_request IS NULL OR p_expected IS NULL OR p_enabled IS NULL OR p_reference IS NULL OR length(trim(p_reference)) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'Invalid delivery control request'; END IF;
 SELECT * INTO c FROM public.irp_pms_outbox_connections WHERE property_id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Connection required'; END IF;
 SELECT * INTO receipt FROM public.irp_pms_delivery_controls WHERE request_id=p_request;
 IF FOUND THEN
  IF receipt.property_id=p_property AND receipt.expected_enabled=p_expected AND receipt.delivery_enabled=p_enabled AND receipt.review_reference=p_reference THEN RETURN receipt; END IF;
  RAISE EXCEPTION 'Request identity already used';
 END IF;
 IF c.environment<>'sandbox' OR NOT c.enabled THEN RAISE EXCEPTION 'Active sandbox capture required'; END IF;
 IF c.delivery_enabled<>p_expected THEN RAISE EXCEPTION 'Delivery state changed; inspect before retrying'; END IF;
 IF p_enabled AND NOT EXISTS(SELECT 1 FROM public.irp_pms_baseline_runs WHERE property_id=p_property AND released_at IS NOT NULL) THEN RAISE EXCEPTION 'Reviewed baseline release required'; END IF;
 UPDATE public.irp_pms_outbox_connections SET delivery_enabled=p_enabled WHERE property_id=p_property;
 INSERT INTO public.irp_pms_delivery_controls(request_id,property_id,expected_enabled,delivery_enabled,review_reference)
 VALUES(p_request,p_property,p_expected,p_enabled,p_reference) RETURNING * INTO receipt;
 RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_set_delivery(uuid,uuid,boolean,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.irp_pms_set_delivery(uuid,uuid,boolean,boolean,text) TO service_role;
COMMIT;


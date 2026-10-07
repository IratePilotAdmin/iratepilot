BEGIN;

-- Durable administrator evidence for the sandbox-only reservation baseline.
CREATE TABLE public.irp_pms_baseline_review_events (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES auth.users(id),
  property_id uuid NOT NULL REFERENCES public.properties(id),
  operation text NOT NULL CHECK (operation IN ('capture', 'release')),
  from_date date NOT NULL,
  snapshot_count integer NOT NULL CHECK (snapshot_count BETWEEN 0 AND 1000),
  evidence_reference text NOT NULL CHECK (length(trim(evidence_reference)) BETWEEN 8 AND 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.irp_pms_baseline_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.irp_pms_baseline_review_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.irp_pms_baseline_review_events TO service_role;

CREATE FUNCTION public.irp_pms_capture_reviewed_baseline(
  p_request uuid, p_actor uuid, p_property uuid, p_from date,
  p_expected_count integer, p_evidence_reference text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE preview jsonb; baseline public.irp_pms_baseline_runs%rowtype; prior public.irp_pms_baseline_review_events%rowtype;
BEGIN
  IF p_request IS NULL OR p_actor IS NULL OR p_property IS NULL OR p_from IS NULL
     OR p_expected_count IS NULL OR p_expected_count NOT BETWEEN 0 AND 1000
     OR p_evidence_reference IS NULL OR length(trim(p_evidence_reference)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'A bounded baseline request and maintenance evidence reference are required';
  END IF;
  SELECT * INTO prior FROM public.irp_pms_baseline_review_events WHERE request_id=p_request;
  IF FOUND THEN
    IF prior.actor_id=p_actor AND prior.property_id=p_property AND prior.operation='capture'
       AND prior.from_date=p_from AND prior.snapshot_count=p_expected_count
       AND prior.evidence_reference=p_evidence_reference THEN
      SELECT * INTO baseline FROM public.irp_pms_baseline_runs WHERE property_id=p_property;
      RETURN jsonb_build_object('baseline',to_jsonb(baseline),'replayed',true);
    END IF;
    RAISE EXCEPTION 'Baseline review request identity already used';
  END IF;
  SELECT public.irp_pms_preview_reservation_baseline(p_property,p_from) INTO preview;
  IF coalesce((preview->>'eligibleForCapture')::boolean,false) IS NOT TRUE
     OR (preview->>'reservationCount')::integer <> p_expected_count THEN
    RAISE EXCEPTION 'Baseline preview is no longer eligible or its count changed';
  END IF;
  SELECT * INTO baseline FROM public.irp_pms_prepare_baseline(p_property,p_request,p_from,p_expected_count);
  INSERT INTO public.irp_pms_baseline_review_events(request_id,actor_id,property_id,operation,from_date,snapshot_count,evidence_reference)
    VALUES(p_request,p_actor,p_property,'capture',p_from,p_expected_count,trim(p_evidence_reference));
  RETURN jsonb_build_object('baseline',to_jsonb(baseline),'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_capture_reviewed_baseline(uuid,uuid,uuid,date,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.irp_pms_capture_reviewed_baseline(uuid,uuid,uuid,date,integer,text) TO service_role;

CREATE FUNCTION public.irp_pms_release_reviewed_baseline(
  p_request uuid, p_actor uuid, p_property uuid, p_from date,
  p_expected_count integer, p_evidence_reference text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE baseline public.irp_pms_baseline_runs%rowtype; prior public.irp_pms_baseline_review_events%rowtype;
BEGIN
  IF p_request IS NULL OR p_actor IS NULL OR p_property IS NULL OR p_from IS NULL
     OR p_expected_count IS NULL OR p_expected_count NOT BETWEEN 0 AND 1000
     OR p_evidence_reference IS NULL OR length(trim(p_evidence_reference)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'A reviewed sandbox round-trip reference is required';
  END IF;
  SELECT * INTO prior FROM public.irp_pms_baseline_review_events WHERE request_id=p_request;
  IF FOUND THEN
    IF prior.actor_id=p_actor AND prior.property_id=p_property AND prior.operation='release'
       AND prior.from_date=p_from AND prior.snapshot_count=p_expected_count
       AND prior.evidence_reference=p_evidence_reference THEN
      RETURN jsonb_build_object('released',true,'replayed',true);
    END IF;
    RAISE EXCEPTION 'Baseline release request identity already used';
  END IF;
  SELECT * INTO baseline FROM public.irp_pms_baseline_runs WHERE property_id=p_property AND from_date=p_from AND snapshot_count=p_expected_count FOR UPDATE;
  IF NOT FOUND OR baseline.released_at IS NOT NULL THEN RAISE EXCEPTION 'Matching unreleased captured baseline required'; END IF;
  PERFORM public.irp_pms_release_baseline(p_property,baseline.request_id,trim(p_evidence_reference));
  INSERT INTO public.irp_pms_baseline_review_events(request_id,actor_id,property_id,operation,from_date,snapshot_count,evidence_reference)
    VALUES(p_request,p_actor,p_property,'release',p_from,p_expected_count,trim(p_evidence_reference));
  RETURN jsonb_build_object('released',true,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_release_reviewed_baseline(uuid,uuid,uuid,date,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.irp_pms_release_reviewed_baseline(uuid,uuid,uuid,date,integer,text) TO service_role;

COMMIT;

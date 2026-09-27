BEGIN;

ALTER TABLE public.properties
  ADD COLUMN pms_only boolean NOT NULL DEFAULT false;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_pms_only_inactive CHECK (NOT pms_only OR NOT active);

CREATE OR REPLACE FUNCTION public.review_revenue_recommendation(
  p_recommendation_id uuid, p_decision text
) RETURNS public.revenue_recommendations
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_recommendation public.revenue_recommendations;
  v_authorized boolean;
  v_status text;
BEGIN
  SELECT * INTO v_recommendation FROM public.revenue_recommendations
    WHERE id = p_recommendation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recommendation not found'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
    UNION ALL
    SELECT 1 FROM public.properties p JOIN public.partners pa ON pa.id = p.partner_id
      WHERE p.id = v_recommendation.property_id AND pa.owner_id = auth.uid() AND pa.status = 'approved'
  ) INTO v_authorized;
  IF NOT v_authorized THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_recommendation.status <> 'pending' THEN RAISE EXCEPTION 'Recommendation already reviewed'; END IF;
  IF p_decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'Invalid decision'; END IF;
  IF p_decision = 'approve' AND EXISTS (
    SELECT 1 FROM public.properties WHERE id = v_recommendation.property_id AND pms_only
  ) THEN RAISE EXCEPTION 'PMS-only properties require read-only revenue review'; END IF;
  v_status := CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END;
  IF v_status = 'approved' THEN
    UPDATE public.inventory SET rate = v_recommendation.recommended_rate
      WHERE room_id = v_recommendation.room_id AND stay_date = v_recommendation.stay_date;
  END IF;
  UPDATE public.revenue_recommendations SET status = v_status, reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = p_recommendation_id RETURNING * INTO v_recommendation;
  INSERT INTO public.revenue_audit_log (property_id,recommendation_id,actor_id,action,details)
    VALUES (v_recommendation.property_id,v_recommendation.id,auth.uid(),
      'recommendation_' || v_status,
      jsonb_build_object('stay_date',v_recommendation.stay_date,'old_rate',v_recommendation.current_rate,
        'recommended_rate',v_recommendation.recommended_rate,'inventory_updated',v_status = 'approved'));
  RETURN v_recommendation;
END;
$$;

REVOKE ALL ON FUNCTION public.review_revenue_recommendation(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_revenue_recommendation(uuid,text) TO authenticated;

COMMIT;

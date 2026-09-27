BEGIN;

ALTER TABLE public.properties
  ADD COLUMN pms_only boolean NOT NULL DEFAULT false;

ALTER TABLE public.properties
  ADD CONSTRAINT properties_pms_only_inactive CHECK (NOT pms_only OR NOT active);

-- A PMS-only pilot can be populated by a trusted PMS ingestion process, but
-- authenticated rate-editor clients cannot write its inventory directly.
CREATE FUNCTION public.guard_pms_only_inventory_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_room_id uuid;
  v_old_room_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN v_room_id := OLD.room_id;
  ELSE v_room_id := NEW.room_id;
  END IF;
  IF TG_OP = 'UPDATE' THEN v_old_room_id := OLD.room_id; END IF;
  IF auth.role() = 'authenticated' AND EXISTS (
    SELECT 1 FROM public.rooms r JOIN public.properties p ON p.id = r.property_id
    WHERE r.id IN (v_room_id, v_old_room_id) AND p.pms_only
  ) THEN
    RAISE EXCEPTION 'PMS-only inventory is read-only for authenticated clients';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_pms_only_inventory_write
BEFORE INSERT OR UPDATE OR DELETE ON public.inventory
FOR EACH ROW EXECUTE FUNCTION public.guard_pms_only_inventory_write();

REVOKE ALL ON FUNCTION public.guard_pms_only_inventory_write() FROM PUBLIC;

CREATE FUNCTION public.guard_pms_only_room_rate_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() = 'authenticated' AND NEW.base_rate IS DISTINCT FROM OLD.base_rate
    AND EXISTS (SELECT 1 FROM public.properties WHERE id IN (OLD.property_id, NEW.property_id) AND pms_only)
  THEN
    RAISE EXCEPTION 'PMS-only room rates are read-only for authenticated clients';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_pms_only_room_rate_write
BEFORE UPDATE OF base_rate ON public.rooms
FOR EACH ROW EXECUTE FUNCTION public.guard_pms_only_room_rate_write();

REVOKE ALL ON FUNCTION public.guard_pms_only_room_rate_write() FROM PUBLIC;

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

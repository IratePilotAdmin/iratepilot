BEGIN;
-- invoice-opening-review-draft.sql
CREATE FUNCTION public.irp_pms_pilot_opening_reversal_review(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE folio jsonb;opening jsonb;breakdown jsonb;lines jsonb:='[]';item jsonb;row record;tax_total numeric:=0;fee_total numeric:=0;net numeric;prior numeric;available numeric;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 folio:=public.irp_pms_pilot_folio(p_tenant,p_property,p_reservation);
 IF folio->>'available'<>'true' THEN RAISE EXCEPTION 'Reconcile unavailable folio charges before invoicing';END IF;
 IF folio->>'reservation_amounts_changed'='true' THEN RAISE EXCEPTION 'Reconcile changed reservation charges before invoicing';END IF;
 opening:=folio->'opening';breakdown:=opening->'charge_breakdown';
 lines:=jsonb_build_array(jsonb_build_object('source_key','opening:accommodation','description','Accommodation','category','accommodation','amount_minor',opening->>'accommodation_minor'));
 IF breakdown IS NOT NULL AND breakdown<>'null'::jsonb THEN
  FOR item IN SELECT value FROM jsonb_array_elements(breakdown->'taxes') LOOP
   tax_total:=tax_total+(item->>'amount_minor')::numeric;
   lines:=lines||jsonb_build_array(jsonb_build_object('source_key','opening:tax:'||(item->>'code'),'description',item->>'label','category','tax:'||(item->>'code'),'amount_minor',item->>'amount_minor'));
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(breakdown->'fees') LOOP
   fee_total:=fee_total+(item->>'amount_minor')::numeric;
   lines:=lines||jsonb_build_array(jsonb_build_object('source_key','opening:fee:'||(item->>'code'),'description',item->>'label','category','fee:'||(item->>'code'),'amount_minor',item->>'amount_minor'));
  END LOOP;
  IF tax_total<>(opening->>'taxes_minor')::numeric OR fee_total<>coalesce((opening->>'hotel_fees_minor')::numeric,0) THEN RAISE EXCEPTION 'Itemized invoice taxes and fees do not reconcile';END IF;
 ELSE
  lines:=lines||jsonb_build_array(jsonb_build_object('source_key','opening:tax:legacy','description','Recorded combined tax','category','tax:legacy','amount_minor',opening->>'taxes_minor'),jsonb_build_object('source_key','opening:fee:legacy','description','Recorded hotel fees','category','fee:legacy','amount_minor',coalesce(opening->>'hotel_fees_minor','0')));
 END IF;
 lines:=lines||jsonb_build_array(jsonb_build_object('source_key','opening:ota','description','Recorded OTA fee','category','ota_fee','amount_minor',opening->>'fees_minor'));
 FOR item IN SELECT value FROM jsonb_array_elements(lines) LOOP
  SELECT coalesce(sum((entry->>'amount_minor')::numeric),0) INTO prior FROM irp_pms.invoice_opening_adjustments a CROSS JOIN LATERAL jsonb_array_elements(a.lines) entry WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND a.reservation_id=p_reservation AND entry->>'source_key'=item->>'source_key';
  IF prior>(item->>'amount_minor')::numeric THEN RAISE EXCEPTION 'Opening reversal exceeds its original charge category';END IF;
  item:=item||jsonb_build_object('original_minor',item->>'amount_minor','itemized_minor',prior::text,'available_minor',((item->>'amount_minor')::numeric-prior)::text);
  lines:=jsonb_set(lines,ARRAY[(SELECT (ordinality-1)::text FROM jsonb_array_elements(lines) WITH ORDINALITY WHERE value->>'source_key'=item->>'source_key')],item);
 END LOOP;
 IF (SELECT count(*)<>count(DISTINCT value->>'source_key') FROM jsonb_array_elements(lines)) THEN RAISE EXCEPTION 'Duplicate opening categories';END IF;
 IF (SELECT count(*) FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND kind='charge_reversal' AND target_entry_id IS NULL)>1000 THEN RAISE EXCEPTION 'Too many opening reversals for complete review';END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'reservation_id',p_reservation,'actor_id',auth.uid(),'currency','USD','complete',true,'lines',lines,'reversals',coalesce((SELECT jsonb_agg(jsonb_build_object('reversal_id',e.id,'amount_minor',e.amount_minor::text,'reference',e.reference,'created_at',e.created_at,'itemized',a.reversal_id IS NOT NULL,'itemized_lines',a.lines) ORDER BY e.created_at,e.id) FROM irp_pms.folio_entries e LEFT JOIN irp_pms.invoice_opening_adjustments a ON a.tenant_id=e.tenant_id AND a.property_id=e.property_id AND a.reservation_id=e.reservation_id AND a.reversal_id=e.id WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.reservation_id=p_reservation AND e.kind='charge_reversal' AND e.target_entry_id IS NULL),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_opening_reversal_review(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_opening_reversal_review(uuid,uuid,uuid) TO authenticated;

-- invoice-opening-status-draft.sql
CREATE FUNCTION public.irp_pms_pilot_opening_itemization_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.invoice_opening_adjustments%ROWTYPE;receipt jsonb:=NULL;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Correction request is required';END IF;
 SELECT * INTO saved FROM irp_pms.invoice_opening_adjustments WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 IF FOUND THEN
  receipt:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'reservation_id',saved.reservation_id,'reversal_id',saved.reversal_id,'lines',saved.lines,'reason',saved.reason,'replayed',true);
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'found',receipt IS NOT NULL,'result',receipt);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_opening_itemization_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_opening_itemization_status(uuid,uuid,uuid) TO authenticated;

-- invoice-opening-cancel-draft.sql
CREATE TABLE irp_pms.opening_itemization_cancellations(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.opening_itemization_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.opening_itemization_cancellations FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.opening_itemization_cancellations FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION irp_pms.opening_itemization_cancel_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM irp_pms.opening_itemization_cancellations WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND request_id=NEW.request_id) THEN RAISE EXCEPTION 'Correction request was cancelled; review invoice corrections with a new request';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.opening_itemization_cancel_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cancelled_request BEFORE INSERT ON irp_pms.invoice_opening_adjustments FOR EACH ROW EXECUTE FUNCTION irp_pms.opening_itemization_cancel_guard();
CREATE FUNCTION public.irp_pms_pilot_cancel_opening_itemization_request(p_tenant uuid,p_property uuid,p_request uuid,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.opening_itemization_cancellations%ROWTYPE;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm cancellation of the unrecorded correction request';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.invoice_opening_adjustments WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Correction already recorded; recover the saved correction';END IF;
 SELECT * INTO saved FROM irp_pms.opening_itemization_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;replayed:=FOUND;
 IF replayed THEN IF saved.actor_id<>auth.uid() THEN RAISE EXCEPTION 'Correction cancellation belongs to another actor';END IF;
 ELSE
  INSERT INTO irp_pms.opening_itemization_cancellations VALUES(p_tenant,p_property,p_request,auth.uid(),clock_timestamp()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'opening_itemization_request_cancelled',p_request,'{}');
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'cancelled',true,'created_at',saved.created_at,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cancel_opening_itemization_request(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cancel_opening_itemization_request(uuid,uuid,uuid,boolean) TO authenticated;
COMMIT;

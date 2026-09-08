BEGIN;
CREATE FUNCTION irp_pms.service_tax_targets(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE opening irp_pms.folio_openings;pricing jsonb;targets jsonb:='{"legacy":0,"city":0,"state":0,"lodging":0,"unallocated":0}';item jsonb;code text;part record;
BEGIN
 pricing:=irp_pms.service_pricing(p_tenant,p_property,p_reservation);
 IF (pricing->>'component_totals_fixed')::boolean IS DISTINCT FROM true THEN RETURN NULL;END IF;
 SELECT * INTO opening FROM irp_pms.folio_openings WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF opening.charge_breakdown IS NULL OR opening.charge_breakdown='null'::jsonb THEN
  targets:=jsonb_set(targets,ARRAY['legacy'],to_jsonb(opening.taxes_minor));
 ELSE
  FOR item IN SELECT value FROM jsonb_array_elements(opening.charge_breakdown->'taxes') LOOP
   code:=item->>'code';IF code IS NULL OR code NOT IN ('city','state','lodging','legacy') THEN RAISE EXCEPTION 'Unknown recorded tax category';END IF;
   targets:=jsonb_set(targets,ARRAY[code],to_jsonb((targets->>code)::bigint+(item->>'amount_minor')::bigint));
  END LOOP;
 END IF;
 FOR part IN SELECT substring(x->>'source_key' FROM 13) AS code,sum((x->>'amount_minor')::bigint) AS amount FROM irp_pms.effective_opening_itemizations c CROSS JOIN LATERAL jsonb_array_elements(c.lines) x WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.reservation_id=p_reservation AND x->>'source_key' LIKE 'opening:tax:%' GROUP BY x->>'source_key' LOOP
  IF part.code NOT IN ('city','state','lodging','legacy') THEN RAISE EXCEPTION 'Unknown corrected tax category';END IF;
  targets:=jsonb_set(targets,ARRAY[part.code],to_jsonb((targets->>part.code)::bigint-part.amount));
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_each_text(targets) x WHERE x.value::bigint<0) OR (SELECT sum(x.value::bigint) FROM jsonb_each_text(targets) x)<>(pricing->'component_totals'->>'taxes_minor')::bigint THEN RAISE EXCEPTION 'Service tax targets do not reconcile';END IF;
 RETURN targets;
END $$;
REVOKE ALL ON FUNCTION irp_pms.service_tax_targets(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION irp_pms.service_forward_tax_target_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE targets jsonb;review jsonb;after_taxes jsonb;
BEGIN
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
 targets:=irp_pms.service_tax_targets(NEW.tenant_id,NEW.property_id,NEW.reservation_id);
 IF targets IS NOT NULL THEN
  review:=irp_pms.service_forward_data(NEW.tenant_id,NEW.property_id,NEW.reservation_id);
  after_taxes:=irp_pms.service_vector_add(review->'allocated_tax_buckets',NEW.tax_buckets);
  IF after_taxes IS DISTINCT FROM targets THEN RAISE EXCEPTION 'Forward adjustment must preserve each recorded tax category';END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.service_forward_tax_target_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER tax_targets BEFORE INSERT ON irp_pms.service_forward_approvals FOR EACH ROW EXECUTE FUNCTION irp_pms.service_forward_tax_target_guard();

DO $upgrade$
DECLARE definition text;needle text:=' RETURN result||jsonb_build_object(''preview_hash''';replacement text;
BEGIN
 definition:=pg_get_functiondef('irp_pms.service_forward_data(uuid,uuid,uuid)'::regprocedure);
 IF strpos(definition,needle)=0 OR strpos(definition,'target_tax_buckets')>0 THEN RAISE EXCEPTION 'Unexpected service forward preview definition';END IF;
 replacement:=' result:=result||jsonb_build_object(''target_tax_buckets'',irp_pms.service_tax_targets(p_tenant,p_property,p_reservation));
 IF result->''target_tax_buckets''<>''null''::jsonb THEN
  result:=result||jsonb_build_object(''suggested_tax_delta'',irp_pms.service_vector_add(result->''target_tax_buckets'',taxes,true));
 ELSE
  result:=result||jsonb_build_object(''suggested_tax_delta'',NULL);
 END IF;
 RETURN result||jsonb_build_object(''preview_hash''';
 EXECUTE replace(definition,needle,replacement);
END $upgrade$;
COMMIT;

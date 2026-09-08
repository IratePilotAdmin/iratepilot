BEGIN;
CREATE FUNCTION irp_pms.service_fee_targets(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE opening irp_pms.folio_openings;pricing jsonb;targets jsonb:='{"legacy":0,"resort":0,"technology":0,"cleaning":0,"unallocated":0}';item jsonb;code text;part record;
BEGIN
 pricing:=irp_pms.service_pricing(p_tenant,p_property,p_reservation);
 IF (pricing->>'component_totals_fixed')::boolean IS DISTINCT FROM true THEN RETURN NULL;END IF;
 SELECT * INTO opening FROM irp_pms.folio_openings WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF opening.charge_breakdown IS NULL OR opening.charge_breakdown='null'::jsonb THEN
  targets:=jsonb_set(targets,ARRAY['legacy'],to_jsonb(opening.hotel_fees_minor));
 ELSE
  FOR item IN SELECT value FROM jsonb_array_elements(opening.charge_breakdown->'fees') LOOP
   code:=item->>'code';IF code IS NULL OR code NOT IN ('resort','technology','cleaning','legacy') THEN RAISE EXCEPTION 'Unknown recorded fee category';END IF;
   targets:=jsonb_set(targets,ARRAY[code],to_jsonb((targets->>code)::bigint+(item->>'amount_minor')::bigint));
  END LOOP;
 END IF;
 FOR part IN SELECT substring(x->>'source_key' FROM 13) AS code,sum((x->>'amount_minor')::bigint) AS amount FROM irp_pms.effective_opening_itemizations c CROSS JOIN LATERAL jsonb_array_elements(c.lines) x WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.reservation_id=p_reservation AND x->>'source_key' LIKE 'opening:fee:%' GROUP BY x->>'source_key' LOOP
  IF part.code NOT IN ('resort','technology','cleaning','legacy') THEN RAISE EXCEPTION 'Unknown corrected fee category';END IF;
  targets:=jsonb_set(targets,ARRAY[part.code],to_jsonb((targets->>part.code)::bigint-part.amount));
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_each_text(targets) x WHERE x.value::bigint<0) OR (SELECT sum(x.value::bigint) FROM jsonb_each_text(targets) x)<>(pricing->'component_totals'->>'hotel_fees_minor')::bigint THEN RAISE EXCEPTION 'Service fee targets do not reconcile';END IF;
 RETURN targets;
END $$;
REVOKE ALL ON FUNCTION irp_pms.service_fee_targets(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION irp_pms.service_allocated_fee_buckets(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE buckets jsonb:='{"legacy":0,"resort":0,"technology":0,"cleaning":0,"unallocated":0}';entry irp_pms.service_day_entries;part record;code text;forward_total numeric;
BEGIN
 FOR entry IN SELECT * FROM irp_pms.service_day_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation LOOP
  FOR part IN SELECT key,value FROM jsonb_each_text(irp_pms.gl_service_components(entry)) WHERE key LIKE 'fee:%' LOOP
   code:=substring(part.key FROM 5);IF NOT(buckets ? code) THEN RAISE EXCEPTION 'Unknown historical fee category';END IF;
   buckets:=jsonb_set(buckets,ARRAY[code],to_jsonb((buckets->>code)::numeric+part.value::numeric));
  END LOOP;
 END LOOP;
 -- Count every approval once, including those not yet posted. Legacy rows retain aggregate attribution.
 FOR part IN SELECT x.key,sum(x.value::numeric) AS amount FROM irp_pms.service_forward_approvals a CROSS JOIN LATERAL jsonb_each_text(coalesce(nullif(to_jsonb(a)->'fee_buckets','null'::jsonb),jsonb_build_object('unallocated',(a.delta->>'hotel_fees_minor')::bigint))) x WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND a.reservation_id=p_reservation GROUP BY x.key LOOP
  IF NOT(buckets ? part.key) THEN RAISE EXCEPTION 'Unknown historical fee correction category';END IF;
  buckets:=jsonb_set(buckets,ARRAY[part.key],to_jsonb((buckets->>part.key)::numeric+part.amount));
 END LOOP;
 RETURN buckets;
END $$;
REVOKE ALL ON FUNCTION irp_pms.service_allocated_fee_buckets(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

DO $upgrade$
DECLARE definition text;needle text:=' RETURN result||jsonb_build_object(''preview_hash''';replacement text;
BEGIN
 definition:=pg_get_functiondef('irp_pms.service_forward_data(uuid,uuid,uuid)'::regprocedure);
 IF strpos(definition,needle)=0 OR strpos(definition,'target_fee_buckets')>0 THEN RAISE EXCEPTION 'Unexpected service forward preview definition';END IF;
 replacement:=' result:=result||jsonb_build_object(''target_fee_buckets'',irp_pms.service_fee_targets(p_tenant,p_property,p_reservation),''allocated_fee_buckets'',irp_pms.service_allocated_fee_buckets(p_tenant,p_property,p_reservation));
 IF result->''target_fee_buckets''<>''null''::jsonb THEN
  result:=result||jsonb_build_object(''suggested_fee_delta'',irp_pms.service_vector_add(result->''target_fee_buckets'',result->''allocated_fee_buckets'',true));
 ELSE
  result:=result||jsonb_build_object(''suggested_fee_delta'',NULL);
 END IF;
 RETURN result||jsonb_build_object(''preview_hash''';
 EXECUTE replace(definition,needle,replacement);
END $upgrade$;

ALTER TABLE irp_pms.service_forward_approvals ADD COLUMN fee_buckets jsonb;
CREATE FUNCTION irp_pms.service_forward_fee_buckets_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE targets jsonb;allocated jsonb;expected jsonb;
BEGIN
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
 targets:=irp_pms.service_fee_targets(NEW.tenant_id,NEW.property_id,NEW.reservation_id);
 IF targets IS NOT NULL THEN
  allocated:=irp_pms.service_allocated_fee_buckets(NEW.tenant_id,NEW.property_id,NEW.reservation_id);
  expected:=irp_pms.service_vector_add(targets,allocated,true);
 ELSE
  expected:=jsonb_build_object('legacy',0,'resort',0,'technology',0,'cleaning',0,'unallocated',(NEW.delta->>'hotel_fees_minor')::bigint);
 END IF;
 IF irp_pms.service_vector_sum(expected)<>(NEW.delta->>'hotel_fees_minor')::bigint THEN RAISE EXCEPTION 'Fee category adjustment does not reconcile';END IF;
 IF NEW.fee_buckets IS NOT NULL AND NEW.fee_buckets IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Forward adjustment must preserve each recorded fee category';END IF;
 NEW.fee_buckets:=expected;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.service_forward_fee_buckets_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER fee_targets BEFORE INSERT ON irp_pms.service_forward_approvals FOR EACH ROW EXECUTE FUNCTION irp_pms.service_forward_fee_buckets_guard();

ALTER TABLE irp_pms.service_forward_entries ADD COLUMN fee_buckets jsonb;
CREATE FUNCTION irp_pms.service_forward_copy_fee_buckets() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved jsonb;
BEGIN
 SELECT fee_buckets INTO saved FROM irp_pms.service_forward_approvals WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND reservation_id=NEW.reservation_id AND id=NEW.adjustment_id;
 IF saved IS NOT NULL AND irp_pms.service_vector_sum(saved)<>NEW.hotel_fees_minor THEN RAISE EXCEPTION 'Posted fee categories do not reconcile';END IF;
 IF NEW.fee_buckets IS NOT NULL AND NEW.fee_buckets IS DISTINCT FROM saved THEN RAISE EXCEPTION 'Posted fee categories differ from approval';END IF;
 NEW.fee_buckets:=saved;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.service_forward_copy_fee_buckets() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER copy_fee_buckets BEFORE INSERT ON irp_pms.service_forward_entries FOR EACH ROW EXECUTE FUNCTION irp_pms.service_forward_copy_fee_buckets();
DO $upgrade$
DECLARE definition text;needle text:=' RETURN result;';replacement text;
BEGIN
 definition:=pg_get_functiondef('irp_pms.gl_forward_components(irp_pms.service_forward_entries)'::regprocedure);
 IF strpos(definition,needle)=0 OR strpos(definition,'p_entry.fee_buckets')>0 THEN RAISE EXCEPTION 'Unexpected forward component definition';END IF;
 replacement:=' IF p_entry.fee_buckets IS NOT NULL THEN
  IF irp_pms.service_vector_sum(p_entry.fee_buckets)<>p_entry.hotel_fees_minor THEN RAISE EXCEPTION ''Forward fee categories do not reconcile'';END IF;
  result:=result-''fee:unallocated'';
  FOR item IN SELECT key,value FROM jsonb_each_text(p_entry.fee_buckets) LOOP
   IF item.key NOT IN (''legacy'',''resort'',''technology'',''cleaning'',''unallocated'') THEN RAISE EXCEPTION ''Unknown forward fee category'';END IF;
   IF item.value::bigint<>0 THEN result:=result||jsonb_build_object(''fee:''||item.key,item.value);END IF;
  END LOOP;
 END IF;
 RETURN result;';
 EXECUTE replace(definition,needle,replacement);
END $upgrade$;
COMMIT;

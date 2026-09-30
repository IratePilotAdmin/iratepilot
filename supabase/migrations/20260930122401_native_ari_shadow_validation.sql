CREATE FUNCTION public.irp_pms_validate_native_ari(p_connection text,p_property text,p_updates jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO pg_catalog AS $f$
DECLARE binding public.irp_pms_outbox_connections; item jsonb; room public.rooms; night public.inventory; observations jsonb:='[]'::jsonb; seen text[]:='{}'; identity text; inventory_present boolean;
BEGIN
 SELECT * INTO binding FROM public.irp_pms_outbox_connections WHERE connection_id=p_connection AND pms_property_id=p_property AND enabled AND environment='sandbox';
 IF NOT FOUND THEN RAISE EXCEPTION 'Sandbox property binding required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_updates) IS DISTINCT FROM 'array' OR jsonb_array_length(p_updates)<1 OR jsonb_array_length(p_updates)>366 THEN RAISE EXCEPTION 'Invalid updates'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_updates) LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(item))<>9
   OR NOT (item ?& ARRAY['date','roomTypeId','ratePlanId','available','rateMinor','currency','minimumStay','maximumStay','restrictions'])
   OR item->>'currency' IS DISTINCT FROM 'USD' OR item->'minimumStay' IS DISTINCT FROM '1'::jsonb OR item->'maximumStay' IS DISTINCT FROM 'null'::jsonb OR item->'restrictions' IS DISTINCT FROM '[]'::jsonb
   OR jsonb_typeof(item->'rateMinor') IS DISTINCT FROM 'number' OR jsonb_typeof(item->'available') IS DISTINCT FROM 'number'
   OR (item->>'rateMinor')::numeric<>trunc((item->>'rateMinor')::numeric) OR (item->>'rateMinor')::numeric NOT BETWEEN 2500 AND 2500000
   OR (item->>'available')::numeric<>trunc((item->>'available')::numeric) OR (item->>'available')::numeric NOT BETWEEN 0 AND 500
   OR coalesce(item->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Invalid native update'; END IF;
  identity:=item->>'date'||'|'||(item->>'roomTypeId')||'|'||(item->>'ratePlanId');
  IF identity=ANY(seen) THEN RAISE EXCEPTION 'Duplicate update'; END IF;seen:=array_append(seen,identity);
  SELECT * INTO room FROM public.rooms WHERE id=(item->>'roomTypeId')::uuid AND property_id=binding.property_id AND active;
  IF NOT FOUND OR room.direct_rate_plan_code IS DISTINCT FROM item->>'ratePlanId' OR room.direct_currency_code IS DISTINCT FROM 'USD' THEN RAISE EXCEPTION 'Destination room or rate identity mismatch'; END IF;
  SELECT * INTO night FROM public.inventory WHERE room_id=room.id AND stay_date=(item->>'date')::date;
  inventory_present:=FOUND;
  observations:=observations||jsonb_build_array(jsonb_build_object('date',item->>'date','roomTypeId',room.id,'ratePlanId',room.direct_rate_plan_code,'currency',room.direct_currency_code,
   'inventoryPresent',inventory_present,'rateMinorObserved',round(night.rate*100)::bigint,'availableObserved',night.available_units,
   'taxMinorObserved',round(night.direct_tax_amount*100)::bigint,'mandatoryFeeMinorObserved',round(night.direct_mandatory_fee_amount*100)::bigint,
   'targetMatches',inventory_present AND round(night.rate*100)::bigint=(item->>'rateMinor')::bigint AND night.available_units=(item->>'available')::integer));
 END LOOP;
 RETURN jsonb_build_object('outcome','validated','persisted',false,'certified',false,'observations',observations);
END $f$;
REVOKE ALL ON FUNCTION public.irp_pms_validate_native_ari(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.irp_pms_validate_native_ari(text,text,jsonb) TO service_role;

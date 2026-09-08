BEGIN;
-- Cleaning is a whole-home property setting used only by new rate quotes.
-- Existing plan configuration and all historical financial snapshots remain
-- unchanged. Its USD amount is allocated once, on the scheduled arrival night.
CREATE FUNCTION irp_pms.normalize_cleaning_fee(p_cleaning jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE taxes jsonb;amount numeric;
BEGIN
 IF p_cleaning IS NULL OR octet_length(p_cleaning::text)>2048 OR jsonb_typeof(p_cleaning) IS DISTINCT FROM 'object' OR
  (SELECT count(*) FROM jsonb_object_keys(p_cleaning))<>4 OR NOT(p_cleaning ?& ARRAY['enabled','amount_minor','basis','taxes']) OR
  jsonb_typeof(p_cleaning->'enabled') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_cleaning->'amount_minor') IS DISTINCT FROM 'number' OR
  jsonb_typeof(p_cleaning->'basis') IS DISTINCT FROM 'string' OR p_cleaning->>'basis'<>'per_stay' OR jsonb_typeof(p_cleaning->'taxes') IS DISTINCT FROM 'array'
 THEN RAISE EXCEPTION 'Cleaning fee requires only enabled, USD amount_minor, per_stay basis and tax categories';END IF;
 amount:=(p_cleaning->>'amount_minor')::numeric;
 IF amount<>trunc(amount) OR amount NOT BETWEEN 0 AND 999999999999 THEN RAISE EXCEPTION 'Cleaning fee must use a supported nonnegative integer USD amount';END IF;
 IF jsonb_array_length(p_cleaning->'taxes')>3 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_cleaning->'taxes') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR x#>>'{}' NOT IN('city','state','lodging')) OR
  (SELECT count(*) FROM jsonb_array_elements(p_cleaning->'taxes'))<>(SELECT count(DISTINCT x) FROM jsonb_array_elements(p_cleaning->'taxes') x)
 THEN RAISE EXCEPTION 'Cleaning tax categories must be unique City, State or Lodging categories';END IF;
 SELECT coalesce(jsonb_agg(code ORDER BY ord),'[]'::jsonb) INTO taxes FROM unnest(ARRAY['city','state','lodging']) WITH ORDINALITY AS t(code,ord) WHERE (p_cleaning->'taxes') ? code;
 RETURN jsonb_build_object('enabled',p_cleaning->'enabled','amount_minor',amount::bigint,'basis','per_stay','taxes',taxes);
END $$;
REVOKE ALL ON FUNCTION irp_pms.normalize_cleaning_fee(jsonb) FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE irp_pms.properties ADD COLUMN cleaning_fee jsonb NOT NULL DEFAULT '{"enabled":false,"amount_minor":0,"basis":"per_stay","taxes":[]}'::jsonb,
 ADD COLUMN property_fees_version bigint NOT NULL DEFAULT 1 CHECK(property_fees_version BETWEEN 1 AND 9007199254740991),
 ADD CONSTRAINT property_cleaning_fee_canonical CHECK(cleaning_fee=irp_pms.normalize_cleaning_fee(cleaning_fee)),
 ADD CONSTRAINT property_cleaning_whole_home CHECK(operating_model='whole_home' OR NOT (cleaning_fee->>'enabled')::boolean);
ALTER TABLE irp_pms.rate_quotes ADD COLUMN property_fees_version bigint NOT NULL DEFAULT 1 CHECK(property_fees_version BETWEEN 1 AND 9007199254740991),
 ADD COLUMN operating_model_version bigint CHECK(operating_model_version BETWEEN 1 AND 9007199254740991);

CREATE FUNCTION irp_pms.property_fee_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 NEW.cleaning_fee:=irp_pms.normalize_cleaning_fee(NEW.cleaning_fee);
 IF (NEW.cleaning_fee->>'enabled')::boolean AND NEW.operating_model<>'whole_home' THEN RAISE EXCEPTION 'Only whole-home properties can enable Cleaning; disable it before changing to hotel';END IF;
 IF TG_OP='INSERT' THEN NEW.property_fees_version:=1;
 ELSIF NEW.cleaning_fee IS DISTINCT FROM OLD.cleaning_fee OR NEW.operating_model IS DISTINCT FROM OLD.operating_model THEN
  IF OLD.property_fees_version>=9007199254740991 THEN RAISE EXCEPTION 'Property fee version limit reached';END IF;
  NEW.property_fees_version:=OLD.property_fees_version+1;
 ELSE NEW.property_fees_version:=OLD.property_fees_version;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.property_fee_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER irp_pms_property_fee_guard BEFORE INSERT OR UPDATE ON irp_pms.properties FOR EACH ROW EXECUTE FUNCTION irp_pms.property_fee_guard();

CREATE TABLE irp_pms.property_fee_requests(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 command jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.property_fee_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.property_fee_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON irp_pms.property_fee_requests TO service_role;
CREATE FUNCTION irp_pms.property_fee_receipt_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Property fee receipts are immutable';END $$;
REVOKE ALL ON FUNCTION irp_pms.property_fee_receipt_immutable() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER irp_pms_property_fee_receipt_immutable BEFORE UPDATE OR DELETE ON irp_pms.property_fee_requests FOR EACH ROW EXECUTE FUNCTION irp_pms.property_fee_receipt_immutable();

CREATE FUNCTION irp_pms.property_fees(p_tenant uuid,p_property uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('tenant_id',tenant_id,'property_id',id,'operating_model',operating_model,'version',property_fees_version,'currency','USD','cleaning',cleaning_fee)
 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property
$$;
REVOKE ALL ON FUNCTION irp_pms.property_fees(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.irp_pms_pilot_property_fees(p_tenant uuid,p_property uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 RETURN irp_pms.property_fees(p_tenant,p_property);
END $$;

CREATE FUNCTION public.irp_pms_pilot_save_property_fees(p_tenant uuid,p_property uuid,p_request uuid,p_expected_version bigint,p_cleaning jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE config jsonb;command jsonb;prior irp_pms.property_fee_requests;prop irp_pms.properties;result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 THEN RAISE EXCEPTION 'Request and current property fee version are required';END IF;
 config:=irp_pms.normalize_cleaning_fee(p_cleaning);
 command:=jsonb_build_object('expected_version',p_expected_version,'cleaning',config);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO prior FROM irp_pms.property_fee_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Property fee request identity already used';END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 IF prop.property_fees_version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Property fees or operating model changed; refresh before saving' USING ERRCODE='40001';END IF;
 IF (config->>'enabled')::boolean AND prop.operating_model<>'whole_home' THEN RAISE EXCEPTION 'Only whole-home properties can enable Cleaning';END IF;
 IF prop.cleaning_fee IS DISTINCT FROM config THEN UPDATE irp_pms.properties SET cleaning_fee=config WHERE tenant_id=p_tenant AND id=p_property;END IF;
 result:=irp_pms.property_fees(p_tenant,p_property)||jsonb_build_object('request_id',p_request,'replayed',false);
 INSERT INTO irp_pms.property_fee_requests(tenant_id,property_id,request_id,actor_id,command,result) VALUES(p_tenant,p_property,p_request,auth.uid(),command,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'property_fees_saved',p_property,jsonb_build_object('request_id',p_request,'previous_version',prop.property_fees_version,'version',result->'version','cleaning',config));
 RETURN result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_property_fee_request_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior irp_pms.property_fee_requests;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL THEN RAISE EXCEPTION 'A request is required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO prior FROM irp_pms.property_fee_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 IF NOT FOUND THEN RETURN jsonb_build_object('found',false);END IF;
 RETURN jsonb_build_object('found',true,'action','save_property_fees','result',prior.result);
END $$;

REVOKE ALL ON FUNCTION public.irp_pms_pilot_property_fees(uuid,uuid),public.irp_pms_pilot_save_property_fees(uuid,uuid,uuid,bigint,jsonb),public.irp_pms_pilot_property_fee_request_status(uuid,uuid,uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_property_fees(uuid,uuid),public.irp_pms_pilot_save_property_fees(uuid,uuid,uuid,bigint,jsonb),public.irp_pms_pilot_property_fee_request_status(uuid,uuid,uuid) TO authenticated;

-- Explicit forward definitions of the existing quote APIs follow.
-- Historical request/booking results precede live fee/model guards. This is
-- static source SQL, not runtime rewriting of installed function definitions.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_quote_rate(p_tenant uuid,p_property uuid,p_request uuid,p_plan uuid,p_arrival date,p_departure date,p_guests integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;plan irp_pms.rate_plans; quote irp_pms.rate_quotes; business_date date; property_time_zone text; guest_limit integer; day date; amount bigint; tax bigint; accommodation bigint:=0; taxes bigint:=0; hotel_fees bigint:=0; nights jsonb:='[]'::jsonb; created timestamptz;
 config jsonb; fee_code text; tax_code text; fee jsonb; tax_config jsonb; nightly_fees bigint; nightly_taxes bigint; fee_amount bigint; tax_base bigint; tax_amount bigint; bps integer;
 fee_lines jsonb:='[]';tax_lines jsonb:='[]';night_fee_lines jsonb;night_tax_lines jsonb;totals_by_tax jsonb:='{}';breakdown jsonb;quantity integer;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL OR p_plan IS NULL THEN RAISE EXCEPTION 'Quote request and rate plan are required'; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 property_time_zone:=prop.time_zone;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 business_date:=(clock_timestamp() AT TIME ZONE property_time_zone)::date;
 SELECT * INTO quote FROM irp_pms.rate_quotes WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request;
 IF FOUND THEN
  IF quote.created_by IS DISTINCT FROM auth.uid() OR quote.plan_id IS DISTINCT FROM p_plan OR quote.arrival IS DISTINCT FROM p_arrival OR quote.departure IS DISTINCT FROM p_departure OR quote.guests IS DISTINCT FROM p_guests THEN RAISE EXCEPTION 'Quote request identity already used'; END IF;
  RETURN to_jsonb(quote)||jsonb_build_object('currency','USD','inventory_held',false,'tax_rounding','half_up_per_category_per_night','replayed',true);
 END IF;
 IF p_arrival IS NULL OR p_departure IS NULL OR p_arrival<business_date OR p_departure<=p_arrival OR p_departure-p_arrival>30 THEN RAISE EXCEPTION 'Quote 1 to 30 nights on or after the property business date'; END IF;
 SELECT * INTO plan FROM irp_pms.rate_plans WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_plan;
 IF NOT FOUND OR NOT plan.active THEN RAISE EXCEPTION 'An active scoped rate plan is required'; END IF;
 SELECT max_guests INTO guest_limit FROM irp_pms.room_types WHERE tenant_id=p_tenant AND property_id=p_property AND id=plan.room_type_id;
 IF p_guests IS NULL OR p_guests NOT BETWEEN 1 AND guest_limit THEN RAISE EXCEPTION 'Guest count exceeds the room type limit'; END IF;
 config:=irp_pms.normalize_charges(coalesce(plan.charges,irp_pms.legacy_charges(plan.tax_basis_points)));
 config:=jsonb_set(config,'{fees,cleaning}',prop.cleaning_fee);
 FOREACH fee_code IN ARRAY ARRAY['resort','technology','cleaning'] LOOP
  fee:=config->'fees'->fee_code;
  IF (fee->>'enabled')::boolean THEN
   quantity:=CASE WHEN fee->>'basis'='per_stay' THEN 1 ELSE p_departure-p_arrival END;
   fee_lines:=fee_lines||jsonb_build_array(jsonb_build_object('code',fee_code,'label',CASE fee_code WHEN 'resort' THEN 'Resort fee' WHEN 'technology' THEN 'Technology fee' ELSE 'Cleaning fee' END,'basis',fee->>'basis','unit_amount_minor',(fee->>'amount_minor')::bigint,'quantity',quantity,'amount_minor',(fee->>'amount_minor')::bigint*quantity,'taxes',fee->'taxes'));
  END IF;
 END LOOP;
 FOR day IN SELECT generate_series(p_arrival,p_departure-1,interval '1 day')::date LOOP
  SELECT amount_minor INTO amount FROM irp_pms.nightly_rates WHERE tenant_id=p_tenant AND property_id=p_property AND plan_id=p_plan AND stay_date=day;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nightly rate is missing on %',day; END IF;
  nightly_fees:=0;nightly_taxes:=0;night_fee_lines:='[]';night_tax_lines:='[]';
  FOREACH fee_code IN ARRAY ARRAY['resort','technology','cleaning'] LOOP
   fee:=config->'fees'->fee_code;
   IF (fee->>'enabled')::boolean AND (fee->>'basis'='per_night' OR day=p_arrival) THEN
    fee_amount:=(fee->>'amount_minor')::bigint;nightly_fees:=nightly_fees+fee_amount;
    night_fee_lines:=night_fee_lines||jsonb_build_array(jsonb_build_object('code',fee_code,'amount_minor',fee_amount,'taxes',fee->'taxes'));
   END IF;
  END LOOP;
  FOREACH tax_code IN ARRAY ARRAY['legacy','city','state','lodging'] LOOP
   tax_config:=config->'taxes'->tax_code;
   IF (tax_config->>'enabled')::boolean THEN
    bps:=(tax_config->>'basis_points')::integer;tax_base:=amount;
    SELECT tax_base+coalesce(sum((f->>'amount_minor')::bigint),0) INTO tax_base FROM jsonb_array_elements(night_fee_lines) f WHERE (f->'taxes') ? tax_code;
    tax_amount:=(tax_base*bps+5000)/10000;nightly_taxes:=nightly_taxes+tax_amount;
    night_tax_lines:=night_tax_lines||jsonb_build_array(jsonb_build_object('code',tax_code,'basis_points',bps,'taxable_base_minor',tax_base,'amount_minor',tax_amount));
    totals_by_tax:=totals_by_tax||jsonb_build_object(tax_code,jsonb_build_object('taxable_base_minor',coalesce((totals_by_tax->tax_code->>'taxable_base_minor')::bigint,0)+tax_base,'amount_minor',coalesce((totals_by_tax->tax_code->>'amount_minor')::bigint,0)+tax_amount));
   END IF;
  END LOOP;
  accommodation:=accommodation+amount;taxes:=taxes+nightly_taxes;hotel_fees:=hotel_fees+nightly_fees;
  IF accommodation+taxes+hotel_fees>999999999999 THEN RAISE EXCEPTION 'Quoted total exceeds supported USD amount'; END IF;
  nights:=nights||jsonb_build_array(jsonb_build_object('date',day,'accommodation_minor',amount,'taxes_minor',nightly_taxes,'hotel_fees_minor',nightly_fees,'total_minor',amount+nightly_taxes+nightly_fees,'taxes',night_tax_lines,'fees',night_fee_lines));
 END LOOP;
 FOREACH tax_code IN ARRAY ARRAY['legacy','city','state','lodging'] LOOP
  IF (config->'taxes'->tax_code->>'enabled')::boolean THEN
   tax_lines:=tax_lines||jsonb_build_array(jsonb_build_object('code',tax_code,'label',CASE tax_code WHEN 'legacy' THEN 'Existing combined tax' WHEN 'city' THEN 'City tax' WHEN 'state' THEN 'State tax' ELSE 'Lodging tax' END,'basis_points',(config->'taxes'->tax_code->>'basis_points')::integer,'taxable_base_minor',(totals_by_tax->tax_code->>'taxable_base_minor')::bigint,'amount_minor',(totals_by_tax->tax_code->>'amount_minor')::bigint));
  END IF;
 END LOOP;
 breakdown:=jsonb_build_object('version',1,'mode',CASE WHEN plan.charges IS NULL THEN 'legacy' ELSE 'configured' END,'property_fees_version',prop.property_fees_version,'operating_model_version',prop.operating_model_version,'currency','USD','arrival',p_arrival,'departure',p_departure,'accommodation_minor',accommodation,'taxes_minor',taxes,'hotel_fees_minor',hotel_fees,'ota_fees_minor',0,'total_minor',accommodation+taxes+hotel_fees,'taxes',tax_lines,'fees',fee_lines);
 created:=clock_timestamp();
 INSERT INTO irp_pms.rate_quotes(tenant_id,property_id,id,plan_id,plan_version,property_fees_version,operating_model_version,room_type_id,arrival,departure,guests,tax_basis_points,accommodation_minor,taxes_minor,hotel_fees_minor,total_minor,nights,charge_breakdown,created_by,created_at,expires_at)
 VALUES(p_tenant,p_property,p_request,p_plan,plan.version,prop.property_fees_version,prop.operating_model_version,plan.room_type_id,p_arrival,p_departure,p_guests,plan.tax_basis_points,accommodation,taxes,hotel_fees,accommodation+taxes+hotel_fees,nights,breakdown,auth.uid(),created,created+interval '15 minutes') RETURNING * INTO quote;
 RETURN to_jsonb(quote)||jsonb_build_object('currency','USD','inventory_held',false,'tax_rounding','half_up_per_category_per_night','replayed',false);
END $$;


CREATE OR REPLACE FUNCTION public.irp_pms_pilot_book_quote(p_tenant uuid,p_property uuid,p_quote uuid,p_request uuid,p_guest_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;quote irp_pms.rate_quotes; prior irp_pms.quote_bookings; plan irp_pms.rate_plans; result jsonb; reservation jsonb; business_date date; property_time_zone text;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_quote IS NULL OR p_request IS NULL OR p_guest_name IS NULL OR length(trim(p_guest_name)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Quote, request and guest name are required'; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 property_time_zone:=prop.time_zone;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 business_date:=(clock_timestamp() AT TIME ZONE property_time_zone)::date;
 SELECT * INTO prior FROM irp_pms.quote_bookings WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.quote_id IS DISTINCT FROM p_quote OR prior.guest_name IS DISTINCT FROM trim(p_guest_name) THEN RAISE EXCEPTION 'Quote booking request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO quote FROM irp_pms.rate_quotes WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_quote;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped quote'; END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.quote_bookings WHERE tenant_id=p_tenant AND property_id=p_property AND quote_id=p_quote) THEN RAISE EXCEPTION 'Quote is already booked; recover the original request receipt'; END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.direct_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Request identity already belongs to a direct reservation'; END IF;
 IF clock_timestamp()>=quote.expires_at THEN RAISE EXCEPTION 'Quote expired; request a new quote'; END IF;
 IF quote.arrival<business_date THEN RAISE EXCEPTION 'Quote arrival is now in the past'; END IF;
 IF quote.property_fees_version<>prop.property_fees_version OR (quote.operating_model_version IS NOT NULL AND quote.operating_model_version<>prop.operating_model_version) THEN RAISE EXCEPTION 'Quoted property fees or operating model changed; request a new quote' USING ERRCODE='40001';END IF;
 SELECT * INTO plan FROM irp_pms.rate_plans WHERE tenant_id=p_tenant AND property_id=p_property AND id=quote.plan_id;
 IF NOT FOUND OR NOT plan.active OR plan.version<>quote.plan_version OR plan.room_type_id<>quote.room_type_id THEN RAISE EXCEPTION 'Quoted rate plan changed; request a new quote'; END IF;
 reservation:=public.irp_pms_pilot_create_reservation(p_tenant,p_property,p_request,quote.room_type_id,trim(p_guest_name),quote.arrival,quote.departure,quote.guests,quote.accommodation_minor,quote.taxes_minor);
 -- Admission, snapshot enrichment and receipt commit as one transaction under
 -- the same property lock. Legacy quotes retain their original null breakdown.
 UPDATE irp_pms.reservations AS r SET hotel_fees_minor=quote.hotel_fees_minor,guest_total_minor=quote.total_minor,charge_breakdown=quote.charge_breakdown
 WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.id=(reservation->>'id')::uuid RETURNING to_jsonb(r) INTO reservation;
 result:=jsonb_build_object('quote_id',p_quote,'request_id',p_request,'reservation',reservation,'currency','USD','quoted_total_minor',quote.total_minor,'payment_state','not_recorded','replayed',false);
 INSERT INTO irp_pms.quote_bookings(tenant_id,property_id,request_id,quote_id,reservation_id,guest_name,actor_id,result) VALUES(p_tenant,p_property,p_request,p_quote,(reservation->>'id')::uuid,trim(p_guest_name),auth.uid(),result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'quoted_reservation_created',(reservation->>'id')::uuid,jsonb_build_object('quote_id',p_quote,'plan_id',quote.plan_id,'plan_version',quote.plan_version));
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.irp_pms_pilot_quote_rate(uuid,uuid,uuid,uuid,date,date,integer),public.irp_pms_pilot_book_quote(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_quote_rate(uuid,uuid,uuid,uuid,date,date,integer),public.irp_pms_pilot_book_quote(uuid,uuid,uuid,uuid,text) TO authenticated;
COMMIT;

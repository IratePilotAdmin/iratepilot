BEGIN;
-- Additive, explicitly configured USD hotel charges. Existing rows retain their
-- exact totals and legacy combined tax; no historical reservation is repriced.
ALTER TABLE irp_pms.rate_plans ADD COLUMN charges jsonb CHECK(charges IS NULL OR jsonb_typeof(charges)='object');
ALTER TABLE irp_pms.rate_quotes ADD COLUMN hotel_fees_minor bigint NOT NULL DEFAULT 0 CHECK(hotel_fees_minor BETWEEN 0 AND 999999999999),ADD COLUMN charge_breakdown jsonb;
ALTER TABLE irp_pms.rate_quotes DROP CONSTRAINT rate_quotes_check1;
ALTER TABLE irp_pms.rate_quotes ADD CONSTRAINT rate_quote_component_total CHECK(accommodation_minor+taxes_minor+hotel_fees_minor=total_minor);
ALTER TABLE irp_pms.reservations ADD COLUMN hotel_fees_minor bigint NOT NULL DEFAULT 0 CHECK(hotel_fees_minor BETWEEN 0 AND 999999999999),ADD COLUMN charge_breakdown jsonb;
ALTER TABLE irp_pms.reservations DROP CONSTRAINT reservations_check2;
ALTER TABLE irp_pms.reservations ADD CONSTRAINT reservation_component_total CHECK(guest_total_minor IS NULL OR accommodation_minor+taxes_minor+ota_fees_minor+hotel_fees_minor=guest_total_minor);
ALTER TABLE irp_pms.folio_openings ADD COLUMN hotel_fees_minor bigint NOT NULL DEFAULT 0 CHECK(hotel_fees_minor BETWEEN 0 AND 999999999999),ADD COLUMN charge_breakdown jsonb;
ALTER TABLE irp_pms.folio_openings DROP CONSTRAINT folio_openings_check;
ALTER TABLE irp_pms.folio_openings ADD CONSTRAINT folio_opening_component_total CHECK(accommodation_minor+taxes_minor+fees_minor+hotel_fees_minor=total_minor);

CREATE FUNCTION irp_pms.normalize_charges(p_charges jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE item record; value jsonb; normalized_taxes jsonb:='{}';normalized_fees jsonb:='{}'; fee_taxes jsonb; n numeric;
BEGIN
 IF p_charges IS NULL OR jsonb_typeof(p_charges) IS DISTINCT FROM 'object' OR octet_length(p_charges::text)>8192 THEN RAISE EXCEPTION 'Provide a bounded charges configuration'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(p_charges))<>2 OR NOT(p_charges ?& ARRAY['taxes','fees']) THEN RAISE EXCEPTION 'Unexpected charges configuration fields'; END IF;
 IF jsonb_typeof(p_charges->'taxes') IS DISTINCT FROM 'object' OR jsonb_typeof(p_charges->'fees') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Taxes and fees must be objects'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(p_charges->'taxes'))<>4 OR NOT((p_charges->'taxes') ?& ARRAY['legacy','city','state','lodging']) OR (SELECT count(*) FROM jsonb_object_keys(p_charges->'fees'))<>2 OR NOT((p_charges->'fees') ?& ARRAY['resort','technology']) THEN RAISE EXCEPTION 'Provide only legacy, city, state, lodging taxes and resort, technology fees'; END IF;
 FOR item IN SELECT * FROM jsonb_each(p_charges->'taxes') LOOP
  value:=item.value;
  IF jsonb_typeof(value) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid tax configuration'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(value))<>2 OR NOT(value ?& ARRAY['enabled','basis_points']) OR jsonb_typeof(value->'enabled') IS DISTINCT FROM 'boolean' OR jsonb_typeof(value->'basis_points') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Tax requires enabled and integer basis_points'; END IF;
  n:=(value->>'basis_points')::numeric;
  IF n<>trunc(n) OR n NOT BETWEEN 0 AND 10000 THEN RAISE EXCEPTION 'Tax basis points must be an integer from 0 to 10000'; END IF;
  normalized_taxes:=normalized_taxes||jsonb_build_object(item.key,jsonb_build_object('enabled',(value->>'enabled')::boolean,'basis_points',n::integer));
 END LOOP;
 FOR item IN SELECT * FROM jsonb_each(p_charges->'fees') LOOP
  value:=item.value;
  IF jsonb_typeof(value) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid fee configuration'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(value))<>4 OR NOT(value ?& ARRAY['enabled','amount_minor','basis','taxes']) OR jsonb_typeof(value->'enabled') IS DISTINCT FROM 'boolean' OR jsonb_typeof(value->'amount_minor') IS DISTINCT FROM 'number' OR jsonb_typeof(value->'basis') IS DISTINCT FROM 'string' OR (value->>'basis') NOT IN('per_night','per_stay') OR jsonb_typeof(value->'taxes') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Fee requires enabled, integer amount_minor, per_night/per_stay basis and taxes list'; END IF;
  n:=(value->>'amount_minor')::numeric;
  IF n<>trunc(n) OR n NOT BETWEEN 0 AND 999999999999 THEN RAISE EXCEPTION 'Fee amount must be nonnegative supported USD integer minor units'; END IF;
  IF jsonb_array_length(value->'taxes')>4 OR EXISTS(SELECT 1 FROM jsonb_array_elements(value->'taxes') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR (x#>>'{}') NOT IN('legacy','city','state','lodging')) OR (SELECT count(DISTINCT x) FROM jsonb_array_elements(value->'taxes') x)<>jsonb_array_length(value->'taxes') THEN RAISE EXCEPTION 'Fee taxes must be unique known tax categories'; END IF;
  SELECT coalesce(jsonb_agg(code ORDER BY ord),'[]'::jsonb) INTO fee_taxes FROM unnest(ARRAY['legacy','city','state','lodging']) WITH ORDINALITY a(code,ord) WHERE (value->'taxes') ? code;
  normalized_fees:=normalized_fees||jsonb_build_object(item.key,jsonb_build_object('enabled',(value->>'enabled')::boolean,'amount_minor',n::bigint,'basis',value->>'basis','taxes',fee_taxes));
 END LOOP;
 RETURN jsonb_build_object('taxes',normalized_taxes,'fees',normalized_fees);
END $$;
REVOKE ALL ON FUNCTION irp_pms.normalize_charges(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION irp_pms.legacy_charges(p_basis_points integer) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('taxes',jsonb_build_object('legacy',jsonb_build_object('enabled',p_basis_points>0,'basis_points',p_basis_points),'city',jsonb_build_object('enabled',false,'basis_points',0),'state',jsonb_build_object('enabled',false,'basis_points',0),'lodging',jsonb_build_object('enabled',false,'basis_points',0)),
 'fees',jsonb_build_object('resort',jsonb_build_object('enabled',false,'amount_minor',0,'basis','per_night','taxes','[]'::jsonb),'technology',jsonb_build_object('enabled',false,'amount_minor',0,'basis','per_stay','taxes','[]'::jsonb)))
$$;
REVOKE ALL ON FUNCTION irp_pms.legacy_charges(integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE irp_pms.reservation_charge_snapshots(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,reservation_id uuid NOT NULL,source_version bigint NOT NULL,
 charge_breakdown jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,reservation_id,source_version),
 FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.reservations(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.reservation_charge_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.reservation_charge_snapshots FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON irp_pms.reservation_charge_snapshots TO service_role;

CREATE FUNCTION irp_pms.reservation_adjust_charge_breakdown() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE retained_fees jsonb;
BEGIN
 IF OLD.charge_breakdown IS NOT NULL AND NEW.charge_breakdown IS NOT DISTINCT FROM OLD.charge_breakdown AND
 (NEW.arrival IS DISTINCT FROM OLD.arrival OR NEW.departure IS DISTINCT FROM OLD.departure OR NEW.room_type_id IS DISTINCT FROM OLD.room_type_id OR NEW.accommodation_minor IS DISTINCT FROM OLD.accommodation_minor OR NEW.taxes_minor IS DISTINCT FROM OLD.taxes_minor OR NEW.hotel_fees_minor IS DISTINCT FROM OLD.hotel_fees_minor OR NEW.ota_fees_minor IS DISTINCT FROM OLD.ota_fees_minor OR NEW.guest_total_minor IS DISTINCT FROM OLD.guest_total_minor) THEN
  SELECT coalesce(jsonb_agg(f||jsonb_build_object('retained',true)),'[]'::jsonb) INTO retained_fees FROM jsonb_array_elements(OLD.charge_breakdown->'fees') f;
  NEW.charge_breakdown:=jsonb_build_object('version',1,'mode','adjusted','currency','USD','arrival',NEW.arrival,'departure',NEW.departure,
   'accommodation_minor',NEW.accommodation_minor,'taxes_minor',NEW.taxes_minor,'hotel_fees_minor',NEW.hotel_fees_minor,'ota_fees_minor',NEW.ota_fees_minor,'total_minor',NEW.guest_total_minor,
   'taxes',jsonb_build_array(jsonb_build_object('code','adjusted_total','label','Adjusted tax total','basis_points',NULL,'taxable_base_minor',NULL,'amount_minor',NEW.taxes_minor)),
   'fees',retained_fees,'fees_retained',true,'requires_reconciliation',true,
   'fee_basis_arrival',coalesce(OLD.charge_breakdown->'fee_basis_arrival',OLD.charge_breakdown->'arrival'),'fee_basis_departure',coalesce(OLD.charge_breakdown->'fee_basis_departure',OLD.charge_breakdown->'departure'));
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION irp_pms.reservation_record_charge_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.charge_breakdown IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.charge_breakdown IS NOT DISTINCT FROM NEW.charge_breakdown AND OLD.source_version=NEW.source_version THEN RETURN NEW; END IF;
 INSERT INTO irp_pms.reservation_charge_snapshots(tenant_id,property_id,reservation_id,source_version,charge_breakdown) VALUES(NEW.tenant_id,NEW.property_id,NEW.id,NEW.source_version,NEW.charge_breakdown);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.reservation_adjust_charge_breakdown(),irp_pms.reservation_record_charge_snapshot() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER irp_pms_adjust_charge_breakdown BEFORE UPDATE ON irp_pms.reservations FOR EACH ROW EXECUTE FUNCTION irp_pms.reservation_adjust_charge_breakdown();
CREATE TRIGGER irp_pms_record_charge_snapshot AFTER INSERT OR UPDATE ON irp_pms.reservations FOR EACH ROW EXECUTE FUNCTION irp_pms.reservation_record_charge_snapshot();


CREATE OR REPLACE FUNCTION public.irp_pms_pilot_save_rate_plan(p_tenant uuid,p_property uuid,p_request uuid,p_plan uuid,p_expected_version bigint,p_room_type uuid,p_name text,p_tax_basis_points integer,p_active boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE plan irp_pms.rate_plans; prior irp_pms.rate_actions; command jsonb; result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 100 OR p_tax_basis_points IS NULL OR p_tax_basis_points NOT BETWEEN 0 AND 10000 OR p_active IS NULL OR p_room_type IS NULL THEN RAISE EXCEPTION 'Explicit name, room type, tax basis points, active state and request are required'; END IF;
 command:=jsonb_build_object('action','save_plan','plan',p_plan,'expected_version',p_expected_version,'room_type',p_room_type,'name',trim(p_name),'tax_basis_points',p_tax_basis_points,'active',p_active);
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO prior FROM irp_pms.rate_actions WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.payload IS DISTINCT FROM command THEN RAISE EXCEPTION 'Rate request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 PERFORM 1 FROM irp_pms.room_types WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room_type;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped room type'; END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.rate_plans WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=p_room_type AND lower(name)=lower(trim(p_name)) AND (p_plan IS NULL OR id<>p_plan)) THEN RAISE EXCEPTION 'A rate plan with this name already exists for the room type'; END IF;
 IF p_plan IS NULL THEN
  IF p_expected_version IS NOT NULL THEN RAISE EXCEPTION 'A new rate plan has no previous version'; END IF;
  IF (SELECT count(*) FROM irp_pms.rate_plans WHERE tenant_id=p_tenant AND property_id=p_property)>=50 THEN RAISE EXCEPTION 'The pilot supports at most 50 rate plans per property'; END IF;
  INSERT INTO irp_pms.rate_plans(tenant_id,property_id,room_type_id,name,tax_basis_points,active) VALUES(p_tenant,p_property,p_room_type,trim(p_name),p_tax_basis_points,p_active) RETURNING * INTO plan;
 ELSE
  SELECT * INTO plan FROM irp_pms.rate_plans WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_plan FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped rate plan'; END IF;
  IF plan.charges IS NOT NULL THEN RAISE EXCEPTION 'Use the structured tax and fee editor for this rate plan'; END IF;
  IF p_expected_version IS DISTINCT FROM plan.version THEN RAISE EXCEPTION 'Rate plan version changed; refresh before saving'; END IF;
  IF plan.room_type_id<>p_room_type THEN RAISE EXCEPTION 'An existing rate plan cannot change room type'; END IF;
  IF plan.name IS DISTINCT FROM trim(p_name) OR plan.tax_basis_points IS DISTINCT FROM p_tax_basis_points OR plan.active IS DISTINCT FROM p_active THEN
   UPDATE irp_pms.rate_plans SET name=trim(p_name),tax_basis_points=p_tax_basis_points,active=p_active,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_plan RETURNING * INTO plan;
  END IF;
 END IF;
 result:=to_jsonb(plan)||jsonb_build_object('replayed',false);
 INSERT INTO irp_pms.rate_actions(tenant_id,property_id,request_id,actor_id,payload,result) VALUES(p_tenant,p_property,p_request,auth.uid(),command,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'rate_plan_saved',plan.id,jsonb_build_object('version',plan.version));
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.irp_pms_pilot_save_rate_plan_v2(p_tenant uuid,p_property uuid,p_request uuid,p_plan uuid,p_expected_version bigint,p_room_type uuid,p_name text,p_charges jsonb,p_active boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE plan irp_pms.rate_plans; prior irp_pms.rate_actions; command jsonb; result jsonb; config jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 100 OR p_active IS NULL OR p_room_type IS NULL THEN RAISE EXCEPTION 'Explicit name, room type, charges, active state and request are required'; END IF;
 config:=irp_pms.normalize_charges(p_charges);
 command:=jsonb_build_object('action','save_plan_v2','plan',p_plan,'expected_version',p_expected_version,'room_type',p_room_type,'name',trim(p_name),'charges',config,'active',p_active);
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO prior FROM irp_pms.rate_actions WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.payload IS DISTINCT FROM command THEN RAISE EXCEPTION 'Rate request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 PERFORM 1 FROM irp_pms.room_types WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room_type;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped room type'; END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.rate_plans WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=p_room_type AND lower(name)=lower(trim(p_name)) AND (p_plan IS NULL OR id<>p_plan)) THEN RAISE EXCEPTION 'A rate plan with this name already exists for the room type'; END IF;
 IF p_plan IS NULL THEN
  IF p_expected_version IS NOT NULL THEN RAISE EXCEPTION 'A new rate plan has no previous version'; END IF;
  IF (SELECT count(*) FROM irp_pms.rate_plans WHERE tenant_id=p_tenant AND property_id=p_property)>=50 THEN RAISE EXCEPTION 'The pilot supports at most 50 rate plans per property'; END IF;
  INSERT INTO irp_pms.rate_plans(tenant_id,property_id,room_type_id,name,tax_basis_points,charges,active) VALUES(p_tenant,p_property,p_room_type,trim(p_name),0,config,p_active) RETURNING * INTO plan;
 ELSE
  SELECT * INTO plan FROM irp_pms.rate_plans WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_plan FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped rate plan'; END IF;
  IF p_expected_version IS DISTINCT FROM plan.version THEN RAISE EXCEPTION 'Rate plan version changed; refresh before saving'; END IF;
  IF plan.room_type_id<>p_room_type THEN RAISE EXCEPTION 'An existing rate plan cannot change room type'; END IF;
  IF plan.name IS DISTINCT FROM trim(p_name) OR plan.charges IS DISTINCT FROM config OR plan.active IS DISTINCT FROM p_active THEN
   UPDATE irp_pms.rate_plans SET name=trim(p_name),tax_basis_points=0,charges=config,active=p_active,version=version+1,updated_at=clock_timestamp() WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_plan RETURNING * INTO plan;
  END IF;
 END IF;
 result:=to_jsonb(plan)||jsonb_build_object('replayed',false);
 INSERT INTO irp_pms.rate_actions(tenant_id,property_id,request_id,actor_id,payload,result) VALUES(p_tenant,p_property,p_request,auth.uid(),command,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'rate_plan_saved',plan.id,jsonb_build_object('version',plan.version));
 RETURN result;
END $$;

-- Tax each category on its combined nightly accommodation and selected fee
-- base, once. Per-stay fees belong to the arrival night. All amounts are USD
-- integer minor units; configured percentages are hotel-entered values.
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_quote_rate(p_tenant uuid,p_property uuid,p_request uuid,p_plan uuid,p_arrival date,p_departure date,p_guests integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE plan irp_pms.rate_plans; quote irp_pms.rate_quotes; business_date date; property_time_zone text; guest_limit integer; day date; amount bigint; tax bigint; accommodation bigint:=0; taxes bigint:=0; hotel_fees bigint:=0; nights jsonb:='[]'::jsonb; created timestamptz;
 config jsonb; fee_code text; tax_code text; fee jsonb; tax_config jsonb; nightly_fees bigint; nightly_taxes bigint; fee_amount bigint; tax_base bigint; tax_amount bigint; bps integer;
 fee_lines jsonb:='[]';tax_lines jsonb:='[]';night_fee_lines jsonb;night_tax_lines jsonb;totals_by_tax jsonb:='{}';breakdown jsonb;quantity integer;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL OR p_plan IS NULL THEN RAISE EXCEPTION 'Quote request and rate plan are required'; END IF;
 SELECT time_zone INTO property_time_zone FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
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
 FOREACH fee_code IN ARRAY ARRAY['resort','technology'] LOOP
  fee:=config->'fees'->fee_code;
  IF (fee->>'enabled')::boolean THEN
   quantity:=CASE WHEN fee->>'basis'='per_stay' THEN 1 ELSE p_departure-p_arrival END;
   fee_lines:=fee_lines||jsonb_build_array(jsonb_build_object('code',fee_code,'label',CASE fee_code WHEN 'resort' THEN 'Resort fee' ELSE 'Technology fee' END,'basis',fee->>'basis','unit_amount_minor',(fee->>'amount_minor')::bigint,'quantity',quantity,'amount_minor',(fee->>'amount_minor')::bigint*quantity,'taxes',fee->'taxes'));
  END IF;
 END LOOP;
 FOR day IN SELECT generate_series(p_arrival,p_departure-1,interval '1 day')::date LOOP
  SELECT amount_minor INTO amount FROM irp_pms.nightly_rates WHERE tenant_id=p_tenant AND property_id=p_property AND plan_id=p_plan AND stay_date=day;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nightly rate is missing on %',day; END IF;
  nightly_fees:=0;nightly_taxes:=0;night_fee_lines:='[]';night_tax_lines:='[]';
  FOREACH fee_code IN ARRAY ARRAY['resort','technology'] LOOP
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
 breakdown:=jsonb_build_object('version',1,'mode',CASE WHEN plan.charges IS NULL THEN 'legacy' ELSE 'configured' END,'currency','USD','arrival',p_arrival,'departure',p_departure,'accommodation_minor',accommodation,'taxes_minor',taxes,'hotel_fees_minor',hotel_fees,'ota_fees_minor',0,'total_minor',accommodation+taxes+hotel_fees,'taxes',tax_lines,'fees',fee_lines);
 created:=clock_timestamp();
 INSERT INTO irp_pms.rate_quotes(tenant_id,property_id,id,plan_id,plan_version,room_type_id,arrival,departure,guests,tax_basis_points,accommodation_minor,taxes_minor,hotel_fees_minor,total_minor,nights,charge_breakdown,created_by,created_at,expires_at)
 VALUES(p_tenant,p_property,p_request,p_plan,plan.version,plan.room_type_id,p_arrival,p_departure,p_guests,plan.tax_basis_points,accommodation,taxes,hotel_fees,accommodation+taxes+hotel_fees,nights,breakdown,auth.uid(),created,created+interval '15 minutes') RETURNING * INTO quote;
 RETURN to_jsonb(quote)||jsonb_build_object('currency','USD','inventory_held',false,'tax_rounding','half_up_per_category_per_night','replayed',false);
END $$;


CREATE OR REPLACE FUNCTION public.irp_pms_pilot_book_quote(p_tenant uuid,p_property uuid,p_quote uuid,p_request uuid,p_guest_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE quote irp_pms.rate_quotes; prior irp_pms.quote_bookings; plan irp_pms.rate_plans; result jsonb; reservation jsonb; business_date date; property_time_zone text;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_quote IS NULL OR p_request IS NULL OR p_guest_name IS NULL OR length(trim(p_guest_name)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Quote, request and guest name are required'; END IF;
 SELECT time_zone INTO property_time_zone FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
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

CREATE OR REPLACE FUNCTION public.irp_pms_pilot_amend_reservation(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_version bigint,p_guest_name text,p_room_type uuid,p_arrival date,p_departure date,p_guests integer,p_accommodation_minor bigint,p_taxes_minor bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text; prop irp_pms.properties; previous irp_pms.reservations; changed irp_pms.reservations; prior irp_pms.reservation_amendments; opening irp_pms.folio_openings;
 command jsonb; result jsonb; day date; available integer; used integer; guest_limit integer; has_opening boolean; needs_reconciliation boolean; total bigint; business_date date;
BEGIN
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 IF p_reservation IS NULL OR p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 THEN RAISE EXCEPTION 'Reservation, request and expected version are required'; END IF;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 business_date:=(clock_timestamp() AT TIME ZONE prop.time_zone)::date;
 command:=jsonb_build_object('reservation_id',p_reservation,'expected_version',p_expected_version,'guest_name',trim(p_guest_name),'room_type_id',p_room_type,'arrival',p_arrival,'departure',p_departure,'guests',p_guests,'accommodation_minor',p_accommodation_minor,'taxes_minor',p_taxes_minor);
 SELECT * INTO prior FROM irp_pms.reservation_amendments WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Amendment request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO previous FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped reservation'; END IF;
 IF previous.source NOT IN('direct','migration') THEN RAISE EXCEPTION 'Amend an OTA reservation at its source'; END IF;
 IF previous.status<>'Confirmed' THEN RAISE EXCEPTION 'Only confirmed unstarted reservations can be amended'; END IF;
 IF previous.source_version<>p_expected_version THEN RAISE EXCEPTION 'Reservation changed; refresh and review before amending' USING ERRCODE='40001'; END IF;
 IF previous.source_version>=9007199254740991 THEN RAISE EXCEPTION 'Reservation version limit reached'; END IF;
 IF p_guest_name IS NULL OR length(trim(p_guest_name)) NOT BETWEEN 1 AND 200 OR p_arrival IS NULL OR p_departure IS NULL OR p_arrival<business_date OR p_departure<=p_arrival OR p_departure-p_arrival>30 THEN RAISE EXCEPTION 'Invalid guest name or future stay dates'; END IF;
 SELECT max_guests INTO guest_limit FROM irp_pms.room_types WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_room_type;
 IF NOT FOUND OR p_guests IS NULL OR p_guests NOT BETWEEN 1 AND guest_limit THEN RAISE EXCEPTION 'Invalid scoped room type or guest count'; END IF;
 IF p_accommodation_minor IS NULL OR p_taxes_minor IS NULL OR p_accommodation_minor NOT BETWEEN 0 AND 999999999999 OR p_taxes_minor NOT BETWEEN 0 AND 999999999999 OR p_accommodation_minor+p_taxes_minor+previous.ota_fees_minor+previous.hotel_fees_minor>999999999999 THEN RAISE EXCEPTION 'Invalid reservation amounts'; END IF;
 total:=p_accommodation_minor+p_taxes_minor+previous.ota_fees_minor+previous.hotel_fees_minor;
 SELECT * INTO opening FROM irp_pms.folio_openings WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 has_opening:=FOUND;
 IF has_opening AND member_role NOT IN('owner','manager') AND (p_accommodation_minor IS DISTINCT FROM previous.accommodation_minor OR p_taxes_minor IS DISTINCT FROM previous.taxes_minor) THEN RAISE EXCEPTION 'Owner or manager required to amend amounts after the folio opens' USING ERRCODE='42501'; END IF;
 IF previous.physical_room_id IS NOT NULL THEN
  IF previous.room_type_id IS DISTINCT FROM p_room_type OR previous.arrival IS DISTINCT FROM p_arrival OR previous.departure IS DISTINCT FROM p_departure THEN RAISE EXCEPTION 'Assigned-room date or room-type changes require separate room reassignment'; END IF;
  IF NOT EXISTS(SELECT 1 FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=previous.physical_room_id AND room_type_id=p_room_type) THEN RAISE EXCEPTION 'Assigned physical room does not match this room type'; END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id<>p_reservation AND physical_room_id=previous.physical_room_id AND (status IN('Confirmed','In house') AND arrival<p_departure AND departure>p_arrival OR status='In house' AND departure<business_date AND p_departure>business_date)) THEN RAISE EXCEPTION 'Assigned physical room overlaps another active stay'; END IF;
 END IF;
 FOR day IN SELECT generate_series(p_arrival,p_departure-1,interval '1 day')::date LOOP
  SELECT units INTO available FROM irp_pms.nightly_capacity WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=p_room_type AND stay_date=day FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Capacity is not configured on %',day; END IF;
  SELECT count(*) INTO used FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id<>p_reservation AND room_type_id=p_room_type AND irp_pms.inventory_occupies(status,arrival,departure,day,business_date);
  IF used>=available THEN RAISE EXCEPTION 'No availability on %',day; END IF;
 END LOOP;
 UPDATE irp_pms.reservations SET guest_name=trim(p_guest_name),room_type_id=p_room_type,arrival=p_arrival,departure=p_departure,guests=p_guests,
 accommodation_minor=p_accommodation_minor,taxes_minor=p_taxes_minor,guest_total_minor=total,source_version=source_version+1,
 payload_hash=encode(sha256(convert_to(command::text,'UTF8')),'hex')
 WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation RETURNING * INTO changed;
 needs_reconciliation:=has_opening AND (opening.accommodation_minor IS DISTINCT FROM changed.accommodation_minor OR opening.taxes_minor IS DISTINCT FROM changed.taxes_minor OR opening.fees_minor IS DISTINCT FROM changed.ota_fees_minor OR opening.total_minor IS DISTINCT FROM changed.guest_total_minor OR opening.hotel_fees_minor IS DISTINCT FROM changed.hotel_fees_minor OR opening.charge_breakdown IS DISTINCT FROM changed.charge_breakdown);
 result:=jsonb_build_object('reservation',to_jsonb(changed),'replayed',false,'folio_opening_retained',has_opening,'financial_reconciliation_required',needs_reconciliation,'hotel_fees_retained',previous.hotel_fees_minor>0,'pricing_reconciliation_required',coalesce((changed.charge_breakdown->>'requires_reconciliation')::boolean,false));
 INSERT INTO irp_pms.reservation_amendments(tenant_id,property_id,reservation_id,request_id,actor_id,command,before_reservation,result)
 VALUES(p_tenant,p_property,p_reservation,p_request,auth.uid(),command,to_jsonb(previous),result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'reservation_amended',p_reservation,
 jsonb_build_object('previous_version',previous.source_version,'source_version',changed.source_version,'folio_opening_retained',has_opening,'financial_reconciliation_required',needs_reconciliation,'hotel_fees_retained',previous.hotel_fees_minor>0,'pricing_reconciliation_required',coalesce((changed.charge_breakdown->>'requires_reconciliation')::boolean,false)));
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.irp_pms_pilot_extend_stay(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_version bigint,p_departure date,p_accommodation_minor bigint,p_taxes_minor bigint,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties; previous irp_pms.reservations; changed irp_pms.reservations; prior irp_pms.stay_extensions; opening irp_pms.folio_openings;
 command jsonb; result jsonb; business_date date; day date; available integer; used integer; has_opening boolean; needs_reconciliation boolean; total bigint;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_reservation IS NULL OR p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 THEN RAISE EXCEPTION 'Reservation, request and expected version are required'; END IF;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 business_date:=(clock_timestamp() AT TIME ZONE prop.time_zone)::date;
 command:=jsonb_build_object('reservation_id',p_reservation,'expected_version',p_expected_version,'departure',p_departure,'accommodation_minor',p_accommodation_minor,'taxes_minor',p_taxes_minor,'reason',trim(p_reason));
 SELECT * INTO prior FROM irp_pms.stay_extensions WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Extension request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO previous FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped reservation'; END IF;
 IF previous.source NOT IN('direct','migration') THEN RAISE EXCEPTION 'Extend an OTA reservation through its source; local source-owned stay changes require review'; END IF;
 IF previous.status<>'In house' THEN RAISE EXCEPTION 'Only an in-house reservation can be extended'; END IF;
 IF previous.source_version<>p_expected_version THEN RAISE EXCEPTION 'Reservation changed; refresh and review before extending' USING ERRCODE='40001'; END IF;
 IF previous.source_version>=9007199254740991 THEN RAISE EXCEPTION 'Reservation version limit reached'; END IF;
 IF p_departure IS NULL OR p_departure<=previous.departure OR p_departure<=business_date OR p_departure-previous.arrival>30 THEN RAISE EXCEPTION 'Extension must depart after today and the existing departure, within 30 total nights'; END IF;
 IF p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 4 AND 500 THEN RAISE EXCEPTION 'Provide an extension reason of 4 to 500 characters'; END IF;
 IF p_accommodation_minor IS NULL OR p_taxes_minor IS NULL OR p_accommodation_minor NOT BETWEEN 0 AND 999999999999 OR p_taxes_minor NOT BETWEEN 0 AND 999999999999 OR p_accommodation_minor+p_taxes_minor+previous.ota_fees_minor+previous.hotel_fees_minor>999999999999 THEN RAISE EXCEPTION 'Invalid reservation amounts'; END IF;
 total:=p_accommodation_minor+p_taxes_minor+previous.ota_fees_minor+previous.hotel_fees_minor;
 IF NOT EXISTS(SELECT 1 FROM irp_pms.rooms WHERE tenant_id=p_tenant AND property_id=p_property AND id=previous.physical_room_id AND room_type_id=previous.room_type_id) THEN RAISE EXCEPTION 'In-house physical room does not match the booked room type'; END IF;
 -- Validate all remaining nights with the same scope and predicate as every
 -- other admission. Exclude only this reservation, never a source booking ID.
 FOR day IN SELECT generate_series(business_date,p_departure-1,interval '1 day')::date LOOP
  SELECT units INTO available FROM irp_pms.nightly_capacity WHERE tenant_id=p_tenant AND property_id=p_property AND room_type_id=previous.room_type_id AND stay_date=day FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Capacity is not configured on %',day; END IF;
  SELECT count(*) INTO used FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id<>p_reservation AND room_type_id=previous.room_type_id AND irp_pms.inventory_occupies(status,arrival,departure,day,business_date);
  IF used>=available THEN RAISE EXCEPTION 'No availability on %',day; END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id<>p_reservation AND physical_room_id=previous.physical_room_id AND irp_pms.inventory_occupies(status,arrival,departure,day,business_date)) THEN RAISE EXCEPTION 'Physical room overlaps another active stay on %',day; END IF;
 END LOOP;
 SELECT * INTO opening FROM irp_pms.folio_openings WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 has_opening:=FOUND;
 UPDATE irp_pms.reservations SET departure=p_departure,accommodation_minor=p_accommodation_minor,taxes_minor=p_taxes_minor,guest_total_minor=total,source_version=source_version+1,
 payload_hash=encode(sha256(convert_to(command::text,'UTF8')),'hex')
 WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation RETURNING * INTO changed;
 needs_reconciliation:=has_opening AND (opening.accommodation_minor IS DISTINCT FROM changed.accommodation_minor OR opening.taxes_minor IS DISTINCT FROM changed.taxes_minor OR opening.fees_minor IS DISTINCT FROM changed.ota_fees_minor OR opening.total_minor IS DISTINCT FROM changed.guest_total_minor OR opening.hotel_fees_minor IS DISTINCT FROM changed.hotel_fees_minor OR opening.charge_breakdown IS DISTINCT FROM changed.charge_breakdown);
 result:=jsonb_build_object('reservation',to_jsonb(changed),'replayed',false,'previous_departure',previous.departure,'business_date',business_date,'overdue_resolved',previous.departure<business_date,'folio_opening_retained',has_opening,'financial_reconciliation_required',needs_reconciliation,'hotel_fees_retained',previous.hotel_fees_minor>0,'pricing_reconciliation_required',coalesce((changed.charge_breakdown->>'requires_reconciliation')::boolean,false));
 INSERT INTO irp_pms.stay_extensions(tenant_id,property_id,reservation_id,request_id,actor_id,command,before_reservation,result) VALUES(p_tenant,p_property,p_reservation,p_request,auth.uid(),command,to_jsonb(previous),result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'stay_extended',p_reservation,
 jsonb_build_object('previous_departure',previous.departure,'departure',changed.departure,'previous_version',previous.source_version,'source_version',changed.source_version,'reason',trim(p_reason),'folio_opening_retained',has_opening,'financial_reconciliation_required',needs_reconciliation,'hotel_fees_retained',previous.hotel_fees_minor>0,'pricing_reconciliation_required',coalesce((changed.charge_breakdown->>'requires_reconciliation')::boolean,false)));
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.irp_pms_pilot_folio(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE res irp_pms.reservations; opening irp_pms.folio_openings; frozen boolean; additional bigint; reversed bigint; payments bigint; refunds bigint; corrections bigint; entries jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 -- A shared property lock makes the opening, current reservation and entry
 -- aggregates one consistent view while operating/financial writers serialize.
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO res FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped reservation'; END IF;
 SELECT * INTO opening FROM irp_pms.folio_openings WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 frozen:=FOUND;
 IF NOT frozen THEN
  IF res.guest_total_minor IS NULL OR res.accommodation_minor IS NULL OR res.taxes_minor IS NULL OR res.ota_fees_minor IS NULL THEN
   RETURN jsonb_build_object('reservation_id',p_reservation,'available',false,'reason','reservation_charges_unavailable','currency','USD','entries','[]'::jsonb,'payment_recording','external_only');
  END IF;
  opening.accommodation_minor:=res.accommodation_minor;opening.taxes_minor:=res.taxes_minor;opening.fees_minor:=res.ota_fees_minor;opening.total_minor:=res.guest_total_minor;opening.hotel_fees_minor:=res.hotel_fees_minor;opening.charge_breakdown:=res.charge_breakdown;
 END IF;
 SELECT coalesce(sum(amount_minor) FILTER(WHERE kind='charge'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='charge_reversal'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='external_payment'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='external_refund'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='payment_correction'),0),
 coalesce(jsonb_agg(jsonb_build_object('id',id,'request_id',request_id,'kind',kind,'amount_minor',amount_minor,'currency',currency,'reference',reference,'reason',reason,'target_entry_id',target_entry_id,'actor_id',actor_id,'created_at',created_at) ORDER BY created_at,id),'[]'::jsonb)
 INTO additional,reversed,payments,refunds,corrections,entries FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 RETURN jsonb_build_object('reservation_id',p_reservation,'available',true,'currency','USD','payment_recording','external_only','opening_mode',CASE WHEN frozen THEN 'frozen' ELSE 'reservation_preview' END,
 'reservation_amounts_changed',frozen AND (opening.accommodation_minor IS DISTINCT FROM res.accommodation_minor OR opening.taxes_minor IS DISTINCT FROM res.taxes_minor OR opening.fees_minor IS DISTINCT FROM res.ota_fees_minor OR opening.total_minor IS DISTINCT FROM res.guest_total_minor OR opening.hotel_fees_minor IS DISTINCT FROM res.hotel_fees_minor OR opening.charge_breakdown IS DISTINCT FROM res.charge_breakdown),
 'opening',jsonb_build_object('accommodation_minor',opening.accommodation_minor,'taxes_minor',opening.taxes_minor,'fees_minor',opening.fees_minor,'hotel_fees_minor',opening.hotel_fees_minor,'charge_breakdown',opening.charge_breakdown,'total_minor',opening.total_minor,'opened_at',opening.opened_at),
 'totals',jsonb_build_object('additional_minor',additional,'reversed_minor',reversed,'charges_minor',opening.total_minor+additional-reversed,'external_payments_minor',payments,'external_refunds_minor',refunds,'corrected_payments_minor',corrections,'paid_minor',payments-refunds-corrections,'balance_minor',opening.total_minor+additional-reversed-payments+refunds+corrections),
 'charge_breakdown',res.charge_breakdown,
 'charge_history',coalesce((SELECT jsonb_agg(jsonb_build_object('source_version',s.source_version,'charge_breakdown',s.charge_breakdown,'created_at',s.created_at) ORDER BY s.source_version) FROM irp_pms.reservation_charge_snapshots s WHERE s.tenant_id=p_tenant AND s.property_id=p_property AND s.reservation_id=p_reservation),'[]'::jsonb),
 'entries',entries);
END $$;

CREATE OR REPLACE FUNCTION public.irp_pms_pilot_post_folio(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_kind text,p_amount_minor bigint,p_reference text,p_reason text,p_target uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE res irp_pms.reservations; opening irp_pms.folio_openings; prior irp_pms.folio_entries; target irp_pms.folio_entries; entry irp_pms.folio_entries;
 reference_value text:=trim(p_reference);reason_value text:=trim(p_reason);additional bigint;reversed bigint;payments bigint;refunds bigint;corrections bigint;against_target bigint;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_reservation IS NULL OR p_kind IS NULL OR p_kind NOT IN('charge','charge_reversal','external_payment','external_refund','payment_correction') OR p_amount_minor IS NULL OR p_amount_minor NOT BETWEEN 1 AND 999999999999 OR reference_value IS NULL OR length(reference_value) NOT BETWEEN 4 AND 200 OR reason_value IS NULL OR length(reason_value) NOT BETWEEN 4 AND 500 THEN RAISE EXCEPTION 'Valid entry kind, positive USD minor units, request, reference and reason are required'; END IF;
 IF (p_kind IN('charge','external_payment') AND p_target IS NOT NULL) OR (p_kind IN('external_refund','payment_correction') AND p_target IS NULL) THEN RAISE EXCEPTION 'Invalid entry target'; END IF;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO prior FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.reservation_id IS DISTINCT FROM p_reservation OR prior.actor_id IS DISTINCT FROM auth.uid() OR prior.kind IS DISTINCT FROM p_kind OR prior.amount_minor IS DISTINCT FROM p_amount_minor OR prior.reference IS DISTINCT FROM reference_value OR prior.reason IS DISTINCT FROM reason_value OR prior.target_entry_id IS DISTINCT FROM p_target THEN RAISE EXCEPTION 'Folio request identity already used'; END IF;
  RETURN jsonb_build_object('entry_id',prior.id,'request_id',prior.request_id,'kind',prior.kind,'amount_minor',prior.amount_minor,'reference',prior.reference,'reason',prior.reason,'target_entry_id',prior.target_entry_id,'created_at',prior.created_at,'payment_recording','external_only','replayed',true);
 END IF;
 IF p_kind IN('external_payment','external_refund') AND EXISTS(SELECT 1 FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND kind=p_kind AND reference=reference_value) THEN RAISE EXCEPTION 'This external transaction reference is already recorded for this reservation and entry kind'; END IF;
 SELECT * INTO res FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped reservation'; END IF;
 SELECT * INTO opening FROM irp_pms.folio_openings WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 IF NOT FOUND THEN
  IF res.guest_total_minor IS NULL OR res.accommodation_minor IS NULL OR res.taxes_minor IS NULL OR res.ota_fees_minor IS NULL THEN RAISE EXCEPTION 'Reservation charge data is unavailable'; END IF;
  INSERT INTO irp_pms.folio_openings(tenant_id,property_id,reservation_id,accommodation_minor,taxes_minor,fees_minor,hotel_fees_minor,charge_breakdown,total_minor,reservation_source,source_version,opened_by)
  VALUES(p_tenant,p_property,p_reservation,res.accommodation_minor,res.taxes_minor,res.ota_fees_minor,res.hotel_fees_minor,res.charge_breakdown,res.guest_total_minor,res.source,res.source_version,auth.uid()) RETURNING * INTO opening;
 END IF;
 SELECT coalesce(sum(amount_minor) FILTER(WHERE kind='charge'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='charge_reversal'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='external_payment'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='external_refund'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='payment_correction'),0)
 INTO additional,reversed,payments,refunds,corrections FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 IF p_target IS NOT NULL THEN
  SELECT * INTO target FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND id=p_target;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped folio target'; END IF;
 END IF;
 IF p_kind='charge' THEN
  IF additional+p_amount_minor>999999999999 OR opening.total_minor+additional-reversed+p_amount_minor>999999999999 THEN RAISE EXCEPTION 'Charge total exceeds supported range'; END IF;
 ELSIF p_kind='charge_reversal' THEN
  IF p_target IS NOT NULL AND target.kind<>'charge' THEN RAISE EXCEPTION 'A reversal must target an added charge or the opening charges'; END IF;
  SELECT coalesce(sum(amount_minor),0) INTO against_target FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND kind='charge_reversal' AND target_entry_id IS NOT DISTINCT FROM p_target;
  IF against_target+p_amount_minor>(CASE WHEN p_target IS NULL THEN opening.total_minor ELSE target.amount_minor END) OR reversed+p_amount_minor>999999999999 THEN RAISE EXCEPTION 'Reversal exceeds unreversed target charges'; END IF;
 ELSIF p_kind='external_payment' THEN
  IF payments+p_amount_minor>999999999999 THEN RAISE EXCEPTION 'Recorded payments exceed supported range'; END IF;
 ELSE
  IF target.kind<>'external_payment' THEN RAISE EXCEPTION 'A refund or correction must target an externally recorded payment'; END IF;
  SELECT coalesce(sum(amount_minor),0) INTO against_target FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND kind IN('external_refund','payment_correction') AND target_entry_id=p_target;
  IF against_target+p_amount_minor>target.amount_minor OR p_amount_minor>payments-refunds-corrections OR (p_kind='external_refund' AND refunds+p_amount_minor>999999999999) OR (p_kind='payment_correction' AND corrections+p_amount_minor>999999999999) THEN RAISE EXCEPTION 'Refund or payment correction exceeds unrefunded or uncorrected externally recorded payments'; END IF;
 END IF;
 INSERT INTO irp_pms.folio_entries(tenant_id,property_id,reservation_id,request_id,kind,amount_minor,reference,reason,target_entry_id,actor_id)
 VALUES(p_tenant,p_property,p_reservation,p_request,p_kind,p_amount_minor,reference_value,reason_value,p_target,auth.uid()) RETURNING * INTO entry;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'folio_entry_recorded',p_reservation,jsonb_build_object('entry_id',entry.id,'kind',p_kind,'amount_minor',p_amount_minor,'payment_recording','external_only'));
 RETURN jsonb_build_object('entry_id',entry.id,'request_id',entry.request_id,'kind',entry.kind,'amount_minor',entry.amount_minor,'reference',entry.reference,'reason',entry.reason,'target_entry_id',entry.target_entry_id,'created_at',entry.created_at,'payment_recording','external_only','replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.irp_pms_pilot_rates(p_tenant uuid,p_property uuid,p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_start IS NULL OR p_end IS NULL OR p_end<=p_start OR p_end-p_start>366 THEN RAISE EXCEPTION 'Read 1 to 366 nights'; END IF;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 RETURN jsonb_build_object('currency','USD','tax_rounding','half_up_per_category_per_night','start',p_start,'end',p_end,
 'plans',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.name,p.id) FROM irp_pms.rate_plans p WHERE tenant_id=p_tenant AND property_id=p_property),'[]'::jsonb),
 'nightly_rates',coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.stay_date,n.plan_id) FROM irp_pms.nightly_rates n WHERE tenant_id=p_tenant AND property_id=p_property AND stay_date>=p_start AND stay_date<p_end),'[]'::jsonb));
END $$;

REVOKE ALL ON FUNCTION public.irp_pms_pilot_save_rate_plan_v2(uuid,uuid,uuid,uuid,bigint,uuid,text,jsonb,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_save_rate_plan_v2(uuid,uuid,uuid,uuid,bigint,uuid,text,jsonb,boolean) TO authenticated;
-- Existing replaced public RPCs retain their installed authenticated-only ACLs.
COMMIT;

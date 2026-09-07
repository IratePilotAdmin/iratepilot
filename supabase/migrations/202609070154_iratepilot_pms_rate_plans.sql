BEGIN;
-- Hotel-configured USD rates and a single accommodation tax percentage. No
-- jurisdiction defaults, processor calls, or inventory holds are implied.
CREATE TABLE irp_pms.rate_plans(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),room_type_id uuid NOT NULL,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100 AND name=trim(name)),tax_basis_points integer NOT NULL CHECK(tax_basis_points BETWEEN 0 AND 10000),
 active boolean NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,id),FOREIGN KEY(tenant_id,property_id,room_type_id) REFERENCES irp_pms.room_types(tenant_id,property_id,id)
);
CREATE UNIQUE INDEX rate_plan_room_name ON irp_pms.rate_plans(tenant_id,property_id,room_type_id,lower(name));
CREATE TABLE irp_pms.nightly_rates(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,plan_id uuid NOT NULL,stay_date date NOT NULL,amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 0 AND 999999999999),
 PRIMARY KEY(tenant_id,property_id,plan_id,stay_date),FOREIGN KEY(tenant_id,property_id,plan_id) REFERENCES irp_pms.rate_plans(tenant_id,property_id,id)
);
CREATE TABLE irp_pms.rate_actions(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),payload jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
CREATE TABLE irp_pms.rate_quotes(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL,plan_id uuid NOT NULL,plan_version bigint NOT NULL,room_type_id uuid NOT NULL,
 arrival date NOT NULL,departure date NOT NULL,guests integer NOT NULL CHECK(guests BETWEEN 1 AND 20),tax_basis_points integer NOT NULL CHECK(tax_basis_points BETWEEN 0 AND 10000),
 accommodation_minor bigint NOT NULL CHECK(accommodation_minor BETWEEN 0 AND 999999999999),taxes_minor bigint NOT NULL CHECK(taxes_minor BETWEEN 0 AND 999999999999),total_minor bigint NOT NULL CHECK(total_minor BETWEEN 0 AND 999999999999),
 nights jsonb NOT NULL,created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,
 PRIMARY KEY(tenant_id,property_id,id),FOREIGN KEY(tenant_id,property_id,plan_id) REFERENCES irp_pms.rate_plans(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,room_type_id) REFERENCES irp_pms.room_types(tenant_id,property_id,id),
 CHECK(departure>arrival AND departure-arrival<=30),CHECK(accommodation_minor+taxes_minor=total_minor),CHECK(expires_at=created_at+interval '15 minutes')
);
CREATE TABLE irp_pms.quote_bookings(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,quote_id uuid NOT NULL,reservation_id uuid NOT NULL,guest_name text NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),UNIQUE(tenant_id,property_id,quote_id),
 FOREIGN KEY(tenant_id,property_id,quote_id) REFERENCES irp_pms.rate_quotes(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.reservations(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.rate_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.nightly_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.rate_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.rate_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.quote_bookings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.rate_plans,irp_pms.nightly_rates,irp_pms.rate_actions,irp_pms.rate_quotes,irp_pms.quote_bookings FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON irp_pms.rate_plans,irp_pms.nightly_rates,irp_pms.rate_actions,irp_pms.rate_quotes,irp_pms.quote_bookings TO service_role;

CREATE FUNCTION public.irp_pms_pilot_save_rate_plan(p_tenant uuid,p_property uuid,p_request uuid,p_plan uuid,p_expected_version bigint,p_room_type uuid,p_name text,p_tax_basis_points integer,p_active boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE plan irp_pms.rate_plans; prior irp_pms.rate_actions; command jsonb; result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 100 OR p_tax_basis_points IS NULL OR p_tax_basis_points NOT BETWEEN 0 AND 10000 OR p_active IS NULL OR p_room_type IS NULL THEN RAISE EXCEPTION 'Explicit name, room type, tax basis points, active state and request are required'; END IF;
 command:=jsonb_build_object('action','save_plan','plan',p_plan,'expected_version',p_expected_version,'room_type',p_room_type,'name',trim(p_name),'tax_basis_points',p_tax_basis_points,'active',p_active);
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
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

CREATE FUNCTION public.irp_pms_pilot_set_nightly_rate(p_tenant uuid,p_property uuid,p_request uuid,p_plan uuid,p_expected_version bigint,p_start date,p_end date,p_amount_minor bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE plan irp_pms.rate_plans; prior irp_pms.rate_actions; command jsonb; result jsonb; business_date date; property_time_zone text; changed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_plan IS NULL OR p_expected_version IS NULL OR p_start IS NULL OR p_end IS NULL OR p_end<=p_start OR p_end-p_start>366 OR p_amount_minor IS NULL OR p_amount_minor NOT BETWEEN 0 AND 999999999999 THEN RAISE EXCEPTION 'Provide a versioned plan, request, 1 to 366 nights and nonnegative USD minor units'; END IF;
 command:=jsonb_build_object('action','set_nightly','plan',p_plan,'expected_version',p_expected_version,'start',p_start,'end',p_end,'amount_minor',p_amount_minor);
 SELECT time_zone INTO property_time_zone FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 business_date:=(clock_timestamp() AT TIME ZONE property_time_zone)::date;
 SELECT * INTO prior FROM irp_pms.rate_actions WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.payload IS DISTINCT FROM command THEN RAISE EXCEPTION 'Rate request identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 IF p_start<business_date THEN RAISE EXCEPTION 'Nightly pricing changes must start on or after the property business date'; END IF;
 SELECT * INTO plan FROM irp_pms.rate_plans WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_plan FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped rate plan'; END IF;
 IF plan.version IS DISTINCT FROM p_expected_version THEN RAISE EXCEPTION 'Rate plan version changed; refresh before saving'; END IF;
 SELECT EXISTS(SELECT 1 FROM generate_series(p_start,p_end-1,interval '1 day') d LEFT JOIN irp_pms.nightly_rates n ON n.tenant_id=p_tenant AND n.property_id=p_property AND n.plan_id=p_plan AND n.stay_date=d::date WHERE n.amount_minor IS DISTINCT FROM p_amount_minor) INTO changed;
 INSERT INTO irp_pms.nightly_rates(tenant_id,property_id,plan_id,stay_date,amount_minor) SELECT p_tenant,p_property,p_plan,d::date,p_amount_minor FROM generate_series(p_start,p_end-1,interval '1 day') d
 ON CONFLICT(tenant_id,property_id,plan_id,stay_date) DO UPDATE SET amount_minor=excluded.amount_minor;
 IF changed THEN UPDATE irp_pms.rate_plans SET version=version+1,updated_at=clock_timestamp() WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_plan RETURNING * INTO plan; END IF;
 result:=jsonb_build_object('plan_id',p_plan,'version',plan.version,'start',p_start,'end',p_end,'nights',p_end-p_start,'amount_minor',p_amount_minor,'changed',changed,'replayed',false);
 INSERT INTO irp_pms.rate_actions(tenant_id,property_id,request_id,actor_id,payload,result) VALUES(p_tenant,p_property,p_request,auth.uid(),command,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'nightly_rates_saved',p_plan,jsonb_build_object('version',plan.version,'start',p_start,'end',p_end));
 RETURN result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_rates(p_tenant uuid,p_property uuid,p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_start IS NULL OR p_end IS NULL OR p_end<=p_start OR p_end-p_start>366 THEN RAISE EXCEPTION 'Read 1 to 366 nights'; END IF;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 RETURN jsonb_build_object('currency','USD','tax_rounding','half_up_per_night','start',p_start,'end',p_end,
 'plans',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.name,p.id) FROM irp_pms.rate_plans p WHERE tenant_id=p_tenant AND property_id=p_property),'[]'::jsonb),
 'nightly_rates',coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.stay_date,n.plan_id) FROM irp_pms.nightly_rates n WHERE tenant_id=p_tenant AND property_id=p_property AND stay_date>=p_start AND stay_date<p_end),'[]'::jsonb));
END $$;

CREATE FUNCTION public.irp_pms_pilot_quote_rate(p_tenant uuid,p_property uuid,p_request uuid,p_plan uuid,p_arrival date,p_departure date,p_guests integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE plan irp_pms.rate_plans; quote irp_pms.rate_quotes; business_date date; property_time_zone text; guest_limit integer; day date; amount bigint; tax bigint; accommodation bigint:=0; taxes bigint:=0; nights jsonb:='[]'::jsonb; created timestamptz;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL OR p_plan IS NULL THEN RAISE EXCEPTION 'Quote request and rate plan are required'; END IF;
 SELECT time_zone INTO property_time_zone FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 business_date:=(clock_timestamp() AT TIME ZONE property_time_zone)::date;
 SELECT * INTO quote FROM irp_pms.rate_quotes WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request;
 IF FOUND THEN
  IF quote.created_by IS DISTINCT FROM auth.uid() OR quote.plan_id IS DISTINCT FROM p_plan OR quote.arrival IS DISTINCT FROM p_arrival OR quote.departure IS DISTINCT FROM p_departure OR quote.guests IS DISTINCT FROM p_guests THEN RAISE EXCEPTION 'Quote request identity already used'; END IF;
  RETURN to_jsonb(quote)||jsonb_build_object('currency','USD','inventory_held',false,'tax_rounding','half_up_per_night','replayed',true);
 END IF;
 IF p_arrival IS NULL OR p_departure IS NULL OR p_arrival<business_date OR p_departure<=p_arrival OR p_departure-p_arrival>30 THEN RAISE EXCEPTION 'Quote 1 to 30 nights on or after the property business date'; END IF;
 SELECT * INTO plan FROM irp_pms.rate_plans WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_plan;
 IF NOT FOUND OR NOT plan.active THEN RAISE EXCEPTION 'An active scoped rate plan is required'; END IF;
 SELECT max_guests INTO guest_limit FROM irp_pms.room_types WHERE tenant_id=p_tenant AND property_id=p_property AND id=plan.room_type_id;
 IF p_guests IS NULL OR p_guests NOT BETWEEN 1 AND guest_limit THEN RAISE EXCEPTION 'Guest count exceeds the room type limit'; END IF;
 FOR day IN SELECT generate_series(p_arrival,p_departure-1,interval '1 day')::date LOOP
  SELECT amount_minor INTO amount FROM irp_pms.nightly_rates WHERE tenant_id=p_tenant AND property_id=p_property AND plan_id=p_plan AND stay_date=day;
  IF NOT FOUND THEN RAISE EXCEPTION 'Nightly rate is missing on %',day; END IF;
  tax:=(amount*plan.tax_basis_points+5000)/10000;
  accommodation:=accommodation+amount;taxes:=taxes+tax;
  IF accommodation+taxes>999999999999 THEN RAISE EXCEPTION 'Quoted total exceeds supported USD amount'; END IF;
  nights:=nights||jsonb_build_array(jsonb_build_object('date',day,'accommodation_minor',amount,'taxes_minor',tax,'total_minor',amount+tax));
 END LOOP;
 created:=clock_timestamp();
 INSERT INTO irp_pms.rate_quotes(tenant_id,property_id,id,plan_id,plan_version,room_type_id,arrival,departure,guests,tax_basis_points,accommodation_minor,taxes_minor,total_minor,nights,created_by,created_at,expires_at)
 VALUES(p_tenant,p_property,p_request,p_plan,plan.version,plan.room_type_id,p_arrival,p_departure,p_guests,plan.tax_basis_points,accommodation,taxes,accommodation+taxes,nights,auth.uid(),created,created+interval '15 minutes') RETURNING * INTO quote;
 RETURN to_jsonb(quote)||jsonb_build_object('currency','USD','inventory_held',false,'tax_rounding','half_up_per_night','replayed',false);
END $$;

CREATE FUNCTION public.irp_pms_pilot_book_quote(p_tenant uuid,p_property uuid,p_quote uuid,p_request uuid,p_guest_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE quote irp_pms.rate_quotes; prior irp_pms.quote_bookings; plan irp_pms.rate_plans; result jsonb; reservation jsonb; business_date date; property_time_zone text;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_quote IS NULL OR p_request IS NULL OR p_guest_name IS NULL OR length(trim(p_guest_name)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Quote, request and guest name are required'; END IF;
 SELECT time_zone INTO property_time_zone FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
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
 result:=jsonb_build_object('quote_id',p_quote,'request_id',p_request,'reservation',reservation,'currency','USD','quoted_total_minor',quote.total_minor,'payment_state','not_recorded','replayed',false);
 INSERT INTO irp_pms.quote_bookings(tenant_id,property_id,request_id,quote_id,reservation_id,guest_name,actor_id,result) VALUES(p_tenant,p_property,p_request,p_quote,(reservation->>'id')::uuid,trim(p_guest_name),auth.uid(),result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'quoted_reservation_created',(reservation->>'id')::uuid,jsonb_build_object('quote_id',p_quote,'plan_id',quote.plan_id,'plan_version',quote.plan_version));
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.irp_pms_pilot_save_rate_plan(uuid,uuid,uuid,uuid,bigint,uuid,text,integer,boolean),public.irp_pms_pilot_set_nightly_rate(uuid,uuid,uuid,uuid,bigint,date,date,bigint),public.irp_pms_pilot_rates(uuid,uuid,date,date),public.irp_pms_pilot_quote_rate(uuid,uuid,uuid,uuid,date,date,integer),public.irp_pms_pilot_book_quote(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_save_rate_plan(uuid,uuid,uuid,uuid,bigint,uuid,text,integer,boolean),public.irp_pms_pilot_set_nightly_rate(uuid,uuid,uuid,uuid,bigint,date,date,bigint),public.irp_pms_pilot_rates(uuid,uuid,date,date),public.irp_pms_pilot_quote_rate(uuid,uuid,uuid,uuid,date,date,integer),public.irp_pms_pilot_book_quote(uuid,uuid,uuid,uuid,text) TO authenticated;
COMMIT;

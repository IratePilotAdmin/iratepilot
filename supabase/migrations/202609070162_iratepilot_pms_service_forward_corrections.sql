BEGIN;
-- Reporting-only corrections. Never rewrite original160 entries or guest folios.
CREATE TABLE irp_pms.service_forward_approvals(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),reservation_id uuid NOT NULL,service_date date NOT NULL,
 request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),source_version bigint NOT NULL,pricing_hash text NOT NULL,preview_hash text NOT NULL,
 delta jsonb NOT NULL,tax_buckets jsonb NOT NULL,reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 4 AND 500),review_snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,property_id,id),UNIQUE(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.service_books(tenant_id,property_id),
 FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.reservations(tenant_id,property_id,id)
);
CREATE INDEX service_forward_reservation ON irp_pms.service_forward_approvals(tenant_id,property_id,reservation_id,created_at,id);
CREATE INDEX service_forward_day ON irp_pms.service_forward_approvals(tenant_id,property_id,service_date,id);
CREATE TABLE irp_pms.service_forward_entries(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,service_date date NOT NULL,adjustment_id uuid NOT NULL,reservation_id uuid NOT NULL,
 accommodation_minor bigint NOT NULL CHECK(accommodation_minor BETWEEN -999999999999 AND 999999999999),taxes_minor bigint NOT NULL CHECK(taxes_minor BETWEEN -999999999999 AND 999999999999),
 hotel_fees_minor bigint NOT NULL CHECK(hotel_fees_minor BETWEEN -999999999999 AND 999999999999),ota_fees_minor bigint NOT NULL CHECK(ota_fees_minor BETWEEN -999999999999 AND 999999999999),
 other_revenue_minor bigint NOT NULL CHECK(other_revenue_minor BETWEEN -999999999999 AND 999999999999),total_minor bigint NOT NULL CHECK(total_minor BETWEEN -999999999999 AND 999999999999),
 tax_buckets jsonb NOT NULL,details jsonb NOT NULL,PRIMARY KEY(tenant_id,property_id,adjustment_id),
 FOREIGN KEY(tenant_id,property_id,adjustment_id) REFERENCES irp_pms.service_forward_approvals(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,service_date) REFERENCES irp_pms.service_day_closes(tenant_id,property_id,service_date),
 FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.reservations(tenant_id,property_id,id),
 CHECK(accommodation_minor+taxes_minor+hotel_fees_minor+ota_fees_minor+other_revenue_minor=total_minor)
);
ALTER TABLE irp_pms.service_forward_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.service_forward_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.service_forward_approvals,irp_pms.service_forward_entries FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON irp_pms.service_forward_approvals,irp_pms.service_forward_entries TO service_role;

CREATE FUNCTION irp_pms.service_delta(p_value jsonb,p_tax boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE keys text[]:=CASE WHEN p_tax THEN ARRAY['legacy','city','state','lodging','unallocated'] ELSE ARRAY['accommodation_minor','taxes_minor','hotel_fees_minor','ota_fees_minor','other_revenue_minor'] END;k text;n numeric;result jsonb:='{}';
BEGIN
 IF p_value IS NULL OR jsonb_typeof(p_value) IS DISTINCT FROM 'object' OR octet_length(p_value::text)>4096 OR (SELECT count(*) FROM jsonb_object_keys(p_value))<>5 OR NOT(p_value ?& keys) THEN RAISE EXCEPTION 'Provide exactly the five supported signed amount fields';END IF;
 FOREACH k IN ARRAY keys LOOP
  IF jsonb_typeof(p_value->k) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Correction amounts must be signed integer USD minor units';END IF;
  n:=(p_value->>k)::numeric;
  IF n<>trunc(n) OR n NOT BETWEEN -999999999999 AND 999999999999 THEN RAISE EXCEPTION 'Correction amount is outside the supported range';END IF;
  result:=result||jsonb_build_object(k,n::bigint);
 END LOOP;
 RETURN result;
END $$;
CREATE FUNCTION irp_pms.service_vector_add(p_a jsonb,p_b jsonb,p_subtract boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_object_agg(k,(v#>>'{}')::bigint+CASE WHEN p_subtract THEN -1 ELSE 1 END*coalesce((p_b->>k)::bigint,0)) FROM jsonb_each(p_a) a(k,v)
$$;
CREATE FUNCTION irp_pms.service_vector_sum(p_a jsonb) RETURNS bigint
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT coalesce(sum((v#>>'{}')::bigint),0)::bigint FROM jsonb_each(p_a) a(k,v) $$;
REVOKE ALL ON FUNCTION irp_pms.service_delta(jsonb,boolean),irp_pms.service_vector_add(jsonb,jsonb,boolean),irp_pms.service_vector_sum(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION irp_pms.service_forward_data(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE book irp_pms.service_books;pricing jsonb;r irp_pms.reservations;original jsonb;allocated jsonb;taxes jsonb:='{"legacy":0,"city":0,"state":0,"lodging":0,"unallocated":0}';a irp_pms.service_forward_approvals;e irp_pms.service_day_entries;
 line jsonb;k text;count_nights integer;first_night date;last_night date;blockers jsonb:='[]';history jsonb:='[]';result jsonb;reconciliation boolean;expected_total bigint;
BEGIN
 pricing:=irp_pms.service_pricing(p_tenant,p_property,p_reservation);r:=jsonb_populate_record(NULL::irp_pms.reservations,pricing->'reservation');
 SELECT * INTO book FROM irp_pms.service_books WHERE tenant_id=p_tenant AND property_id=p_property;
 IF NOT FOUND THEN blockers:=blockers||jsonb_build_array('ledger_not_initialized');END IF;
 IF r.status NOT IN('Checked out','Cancelled') THEN blockers:=blockers||jsonb_build_array('stay_not_completed');END IF;
 SELECT count(*)::integer,min(service_date),max(service_date),jsonb_build_object('accommodation_minor',coalesce(sum(accommodation_minor),0),'taxes_minor',coalesce(sum(taxes_minor),0),'hotel_fees_minor',coalesce(sum(hotel_fees_minor),0),'ota_fees_minor',coalesce(sum(ota_fees_minor),0),'other_revenue_minor',coalesce(sum(other_revenue_minor),0)) INTO count_nights,first_night,last_night,original FROM irp_pms.service_day_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 IF r.arrival IS NULL OR r.departure IS NULL OR count_nights<>r.departure-r.arrival OR first_night IS DISTINCT FROM r.arrival OR last_night IS DISTINCT FROM r.departure-1 OR last_night>=book.next_service_date THEN blockers:=blockers||jsonb_build_array('stay_not_fully_allocated_with_same_dates');END IF;
 IF (pricing->>'total_minor') IS NULL OR (pricing->>'total_minor')::bigint NOT BETWEEN 0 AND 999999999999 THEN blockers:=blockers||jsonb_build_array('charge_data_unavailable');END IF;
 IF (SELECT count(*) FROM irp_pms.service_forward_approvals WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation)>1000 THEN RAISE EXCEPTION 'More than1000 corrections for one stay require an operator review; no history was truncated';END IF;
 FOR e IN SELECT * FROM irp_pms.service_day_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation LOOP
  IF e.details->>'tax_allocation'='itemized' THEN
   FOR line IN SELECT x FROM jsonb_array_elements(e.details->'taxes') x LOOP
    k:=line->>'code';IF NOT(taxes ? k) OR k='unallocated' THEN RAISE EXCEPTION 'Unknown original tax category requires operator review';END IF;
    taxes:=jsonb_set(taxes,ARRAY[k],to_jsonb((taxes->>k)::bigint+(line->>'amount_minor')::bigint));
   END LOOP;
  ELSE
   k:=CASE WHEN e.details->>'tax_allocation'='legacy_aggregate' THEN 'legacy' ELSE 'unallocated' END;
   taxes:=jsonb_set(taxes,ARRAY[k],to_jsonb((taxes->>k)::bigint+e.taxes_minor));
  END IF;
 END LOOP;
 allocated:=original;
 FOR a IN SELECT * FROM irp_pms.service_forward_approvals WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation ORDER BY created_at,id LOOP
  allocated:=irp_pms.service_vector_add(allocated,a.delta);taxes:=irp_pms.service_vector_add(taxes,a.tax_buckets);
  history:=history||jsonb_build_array(jsonb_build_object('adjustment_id',a.id,'service_date',a.service_date,'delta',a.delta,'tax_buckets',a.tax_buckets,'reason',a.reason,'created_at',a.created_at,'posted',EXISTS(SELECT 1 FROM irp_pms.service_forward_entries WHERE tenant_id=p_tenant AND property_id=p_property AND adjustment_id=a.id)));
  IF a.service_date<book.next_service_date AND NOT EXISTS(SELECT 1 FROM irp_pms.service_forward_entries WHERE tenant_id=p_tenant AND property_id=p_property AND adjustment_id=a.id) THEN blockers:=blockers||jsonb_build_array('approved_correction_posting_missing');END IF;
 END LOOP;
 IF irp_pms.service_vector_sum(taxes)<>(allocated->>'taxes_minor')::bigint THEN blockers:=blockers||jsonb_build_array('tax_bucket_history_mismatch');END IF;
 SELECT EXISTS(SELECT 1 FROM irp_pms.service_reconciliation WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation) INTO reconciliation;
 expected_total:=(pricing->>'total_minor')::bigint-irp_pms.service_vector_sum(allocated);
 result:=jsonb_build_object('reservation_id',p_reservation,'guest_name',r.guest_name,'status',r.status,'arrival',r.arrival,'departure',r.departure,'original_service_start',first_night,'original_service_end',last_night+1,'allocated_nights',count_nights,'source_version',r.source_version,'book_version',book.version,'service_date',book.next_service_date,'time_zone',book.time_zone,'currency','USD','accounting_scope','service_date_allocation',
 'pricing_hash',pricing->>'pricing_hash','financial_basis',pricing->>'financial_basis','current_total_minor',pricing->'total_minor','component_totals_fixed',pricing->'component_totals_fixed','target_components',pricing->'component_totals','original_components',original,'allocated_components',allocated,'allocated_tax_buckets',taxes,'required_total_delta',expected_total,'suggested_delta',CASE WHEN (pricing->>'component_totals_fixed')::boolean THEN irp_pms.service_vector_add(pricing->'component_totals',allocated,true) ELSE NULL END,'reconciliation_pending',reconciliation,'prior_adjustments',history,'blockers',blockers,'eligible',jsonb_array_length(blockers)=0);
 RETURN result||jsonb_build_object('preview_hash',encode(sha256(convert_to(result::text,'UTF8')),'hex'));
END $$;
REVOKE ALL ON FUNCTION irp_pms.service_forward_data(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.irp_pms_pilot_service_forward_preview(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;PERFORM irp_pms.pilot_require(p_tenant,p_property);
 RETURN irp_pms.service_forward_data(p_tenant,p_property,p_reservation)||jsonb_build_object('generated_at',clock_timestamp());
END $$;

CREATE FUNCTION public.irp_pms_pilot_approve_service_forward(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_book_version bigint,p_expected_source_version bigint,p_expected_pricing_hash text,p_expected_preview_hash text,p_delta jsonb,p_tax_buckets jsonb,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior irp_pms.service_requests;book irp_pms.service_books;command jsonb;data jsonb;delta jsonb;tax_buckets jsonb;after_components jsonb;after_taxes jsonb;result jsonb;approval irp_pms.service_forward_approvals;k text;n bigint;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_reservation IS NULL OR p_expected_book_version IS NULL OR p_expected_source_version IS NULL OR p_expected_pricing_hash IS NULL OR p_expected_pricing_hash!~'^[a-f0-9]{64}$' OR p_expected_preview_hash IS NULL OR p_expected_preview_hash!~'^[a-f0-9]{64}$' OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 4 AND 500 THEN RAISE EXCEPTION 'Provide scoped versioned pricing, both reviewed hashes, request and a correction reason';END IF;
 delta:=irp_pms.service_delta(p_delta);tax_buckets:=irp_pms.service_delta(p_tax_buckets,true);
 IF irp_pms.service_vector_sum(tax_buckets)<>(delta->>'taxes_minor')::bigint THEN RAISE EXCEPTION 'Signed tax buckets must sum exactly to the tax correction';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 command:=jsonb_build_object('action','service_forward','reservation_id',p_reservation,'expected_book_version',p_expected_book_version,'expected_source_version',p_expected_source_version,'pricing_hash',p_expected_pricing_hash,'preview_hash',p_expected_preview_hash,'delta',delta,'tax_buckets',tax_buckets,'reason',trim(p_reason));
 SELECT * INTO prior FROM irp_pms.service_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Service request identity already used';END IF;RETURN prior.result||jsonb_build_object('replayed',true);END IF;
 data:=irp_pms.service_forward_data(p_tenant,p_property,p_reservation);
 IF NOT(data->>'eligible')::boolean THEN RAISE EXCEPTION 'Only completed stays with every unchanged service date already allocated can use a forward correction';END IF;
 IF (data->>'book_version')::bigint IS DISTINCT FROM p_expected_book_version OR (data->>'source_version')::bigint IS DISTINCT FROM p_expected_source_version OR data->>'pricing_hash' IS DISTINCT FROM p_expected_pricing_hash OR data->>'preview_hash' IS DISTINCT FROM p_expected_preview_hash THEN RAISE EXCEPTION 'Forward correction data changed; refresh and review again' USING ERRCODE='40001';END IF;
 IF irp_pms.service_vector_sum(delta) IS DISTINCT FROM (data->>'required_total_delta')::bigint THEN RAISE EXCEPTION 'Signed component delta must equal the current unallocated charge difference';END IF;
 after_components:=irp_pms.service_vector_add(data->'allocated_components',delta);after_taxes:=irp_pms.service_vector_add(data->'allocated_tax_buckets',tax_buckets);
 FOR k,n IN SELECT key,(value#>>'{}')::bigint FROM jsonb_each(after_components) LOOP IF n NOT BETWEEN 0 AND 999999999999 THEN RAISE EXCEPTION 'Correction would make a cumulative charge component negative or excessive';END IF;END LOOP;
 FOR k,n IN SELECT key,(value#>>'{}')::bigint FROM jsonb_each(after_taxes) LOOP IF n NOT BETWEEN 0 AND 999999999999 THEN RAISE EXCEPTION 'Correction would make a cumulative tax bucket negative or excessive';END IF;END LOOP;
 IF (data->>'component_totals_fixed')::boolean AND after_components IS DISTINCT FROM data->'target_components' THEN RAISE EXCEPTION 'Known charge component totals must be preserved';END IF;
 IF NOT(data->>'reconciliation_pending')::boolean AND NOT EXISTS(SELECT 1 FROM jsonb_each(delta) WHERE (value#>>'{}')::bigint<>0) AND NOT EXISTS(SELECT 1 FROM jsonb_each(tax_buckets) WHERE (value#>>'{}')::bigint<>0) THEN RAISE EXCEPTION 'No financial correction or unresolved review remains';END IF;
 IF (SELECT count(*) FROM irp_pms.service_forward_approvals a WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND a.reservation_id=p_reservation)>=1000 THEN RAISE EXCEPTION 'At most1000 forward corrections can be approved for one stay';END IF;
 IF (SELECT count(*) FROM irp_pms.service_forward_approvals a WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND a.service_date=(data->>'service_date')::date)>=1000 THEN RAISE EXCEPTION 'At most1000 forward corrections can be approved on one service day';END IF;
 INSERT INTO irp_pms.service_forward_approvals(tenant_id,property_id,reservation_id,service_date,request_id,actor_id,source_version,pricing_hash,preview_hash,delta,tax_buckets,reason,review_snapshot) VALUES(p_tenant,p_property,p_reservation,(data->>'service_date')::date,p_request,auth.uid(),p_expected_source_version,p_expected_pricing_hash,p_expected_preview_hash,delta,tax_buckets,trim(p_reason),(data-'prior_adjustments')||jsonb_build_object('prior_adjustment_count',jsonb_array_length(data->'prior_adjustments'),'prior_adjustments_hash',encode(sha256(convert_to((data->'prior_adjustments')::text,'UTF8')),'hex'))) RETURNING * INTO approval;
 DELETE FROM irp_pms.service_reconciliation WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 UPDATE irp_pms.service_books SET version=version+1 WHERE tenant_id=p_tenant AND property_id=p_property RETURNING * INTO book;
 result:=jsonb_build_object('adjustment_id',approval.id,'reservation_id',p_reservation,'service_date',approval.service_date,'delta',delta,'tax_buckets',tax_buckets,'total_minor',irp_pms.service_vector_sum(delta),'allocated_components_after',after_components,'allocated_tax_buckets_after',after_taxes,'pricing_hash',p_expected_pricing_hash,'book_version',book.version,'posted',false,'folio_changed',false,'reason',trim(p_reason),'replayed',false);
 INSERT INTO irp_pms.service_requests VALUES(p_tenant,p_property,p_request,auth.uid(),command,result,clock_timestamp());
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'service_forward_approved',p_reservation,jsonb_build_object('adjustment_id',approval.id,'service_date',approval.service_date,'delta',delta,'tax_buckets',tax_buckets,'reason',trim(p_reason)));
 RETURN result;
END $$;

-- An old full-stay approval cannot clear a fully closed stay's reconciliation
-- while ignoring earlier forward corrections. Exact old receipt replay remains safe.
CREATE FUNCTION irp_pms.service_allocation_forward_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r irp_pms.reservations;count_nights integer;first_night date;last_night date;
BEGIN
 SELECT * INTO r FROM irp_pms.reservations WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.reservation_id;
 SELECT count(*)::integer,min(service_date),max(service_date) INTO count_nights,first_night,last_night FROM irp_pms.service_day_entries WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND reservation_id=NEW.reservation_id;
 IF EXISTS(SELECT 1 FROM irp_pms.service_forward_approvals WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND reservation_id=NEW.reservation_id) OR (r.status IN('Checked out','Cancelled') AND count_nights=r.departure-r.arrival AND first_night=r.arrival AND last_night=r.departure-1) THEN RAISE EXCEPTION 'Use the forward correction workflow for this fully closed stay';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.service_allocation_forward_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER irp_pms_service_allocation_forward_guard BEFORE INSERT ON irp_pms.service_allocation_approvals FOR EACH ROW EXECUTE FUNCTION irp_pms.service_allocation_forward_guard();

-- Pending approvals are consumed only by a reviewed close of their target date.
CREATE FUNCTION irp_pms.service_pending_forward(p_tenant uuid,p_property uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 IF (SELECT count(*) FROM irp_pms.service_forward_approvals a WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND NOT EXISTS(SELECT 1 FROM irp_pms.service_forward_entries e WHERE e.tenant_id=a.tenant_id AND e.property_id=a.property_id AND e.adjustment_id=a.id))>1000 THEN RAISE EXCEPTION 'More than1000 pending corrections require an operator review; no rows were truncated';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('adjustment_id',a.id,'reservation_id',a.reservation_id,'service_date',a.service_date,'source_version',a.source_version,'pricing_hash',a.pricing_hash,'delta',a.delta,'tax_buckets',a.tax_buckets,'total_minor',irp_pms.service_vector_sum(a.delta),'reason',a.reason,'approved_by',a.actor_id,'approved_at',a.created_at,'original_service_start',a.review_snapshot->'original_service_start','original_service_end',a.review_snapshot->'original_service_end') ORDER BY a.created_at,a.id),'[]') INTO result FROM irp_pms.service_forward_approvals a WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND NOT EXISTS(SELECT 1 FROM irp_pms.service_forward_entries e WHERE e.tenant_id=a.tenant_id AND e.property_id=a.property_id AND e.adjustment_id=a.id);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION irp_pms.service_pending_forward(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION irp_pms.service_day_data_v2(p_tenant uuid,p_property uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;pending jsonb;line jsonb;corrections jsonb:='{"accommodation_minor":0,"taxes_minor":0,"hotel_fees_minor":0,"ota_fees_minor":0,"other_revenue_minor":0}';totals jsonb;k text;n numeric;bad_date boolean:=false;
BEGIN
 result:=irp_pms.service_day_data(p_tenant,p_property)-'preview_hash';pending:=irp_pms.service_pending_forward(p_tenant,p_property);
 FOR line IN SELECT x FROM jsonb_array_elements(pending) x LOOP
  IF line->>'service_date' IS DISTINCT FROM result->>'next_service_date' THEN bad_date:=true;END IF;
  corrections:=irp_pms.service_vector_add(corrections,line->'delta');
 END LOOP;
 corrections:=corrections||jsonb_build_object('total_minor',irp_pms.service_vector_sum(corrections),'revenue_minor',(corrections->>'accommodation_minor')::bigint+(corrections->>'hotel_fees_minor')::bigint+(corrections->>'other_revenue_minor')::bigint,'occupied_nights',0,'correction_rows',jsonb_array_length(pending));
 IF bad_date THEN result:=result||jsonb_build_object('can_close',false,'blockers',(result->'blockers')||jsonb_build_array(jsonb_build_object('code','approved_correction_date_mismatch')));END IF;
 totals:=result->'totals';
 IF totals IS NOT NULL AND jsonb_typeof(totals)='object' THEN
  FOREACH k IN ARRAY ARRAY['accommodation_minor','taxes_minor','hotel_fees_minor','ota_fees_minor','other_revenue_minor','revenue_minor','total_minor'] LOOP
   n:=(totals->>k)::numeric+(corrections->>k)::numeric;
   IF abs(n)>9007199254740991 THEN RAISE EXCEPTION 'Service-day totals exceed exact JSON integer range';END IF;
   totals:=jsonb_set(totals,ARRAY[k],to_jsonb(n::bigint));
  END LOOP;
  totals:=totals||jsonb_build_object('complete',(result->>'can_close')::boolean,'correction_rows',jsonb_array_length(pending));
 END IF;
 result:=result||jsonb_build_object('api_version',2,'ordinary_totals',result->'totals','correction_totals',corrections,'totals',totals,'pending_adjustments',pending,'corrections_hash',encode(sha256(convert_to(pending::text,'UTF8')),'hex'));
 RETURN result||jsonb_build_object('preview_hash',encode(sha256(convert_to(result::text,'UTF8')),'hex'));
END $$;
REVOKE ALL ON FUNCTION irp_pms.service_day_data_v2(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.irp_pms_pilot_service_day_preview(p_tenant uuid,p_property uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;PERFORM irp_pms.pilot_require(p_tenant,p_property);
 result:=irp_pms.service_day_data(p_tenant,p_property);
 IF jsonb_array_length(irp_pms.service_pending_forward(p_tenant,p_property))>0 THEN result:=result||jsonb_build_object('can_close',false,'blockers',(result->'blockers')||jsonb_build_array(jsonb_build_object('code','forward_adjustments_require_updated_client')),'totals',(result->'totals')||jsonb_build_object('complete',false));END IF;
 RETURN result||jsonb_build_object('generated_at',clock_timestamp());
END $$;

CREATE FUNCTION public.irp_pms_pilot_service_day_preview_v2(p_tenant uuid,p_property uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;PERFORM irp_pms.pilot_require(p_tenant,p_property);
 RETURN irp_pms.service_day_data_v2(p_tenant,p_property)||jsonb_build_object('generated_at',clock_timestamp());
END $$;

CREATE FUNCTION irp_pms.service_close(p_tenant uuid,p_property uuid,p_request uuid,p_expected_version bigint,p_expected_preview_hash text,p_expected_corrections_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE book irp_pms.service_books;prior irp_pms.service_requests;command jsonb;data jsonb;result jsonb;row_data jsonb;line jsonb;close_row irp_pms.service_day_closes;a irp_pms.service_forward_approvals;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 OR p_expected_preview_hash IS NULL OR p_expected_preview_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'A request, expected close version and reviewed preview hash are required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 command:=CASE WHEN p_expected_corrections_hash IS NULL THEN jsonb_build_object('action','close','expected_version',p_expected_version,'preview_hash',p_expected_preview_hash) ELSE jsonb_build_object('action','close_v2','expected_version',p_expected_version,'preview_hash',p_expected_preview_hash,'corrections_hash',p_expected_corrections_hash) END;
 SELECT * INTO prior FROM irp_pms.service_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Service request identity already used';END IF;RETURN prior.result||jsonb_build_object('replayed',true);END IF;
 SELECT * INTO book FROM irp_pms.service_books WHERE tenant_id=p_tenant AND property_id=p_property;
 IF NOT FOUND THEN RAISE EXCEPTION 'Initialize the service ledger first';END IF;
 IF book.version<>p_expected_version THEN RAISE EXCEPTION 'Service close version changed; refresh the preview' USING ERRCODE='40001';END IF;
 IF p_expected_corrections_hash IS NULL THEN
  IF jsonb_array_length(irp_pms.service_pending_forward(p_tenant,p_property))>0 THEN RAISE EXCEPTION 'Use the updated close workflow to review pending forward corrections';END IF;
  data:=irp_pms.service_day_data(p_tenant,p_property);
 ELSE
  data:=irp_pms.service_day_data_v2(p_tenant,p_property);
  IF data->>'corrections_hash' IS DISTINCT FROM p_expected_corrections_hash THEN RAISE EXCEPTION 'Forward corrections changed; refresh and review before closing' USING ERRCODE='40001';END IF;
 END IF;
 IF data->>'preview_hash'<>p_expected_preview_hash THEN RAISE EXCEPTION 'Service-day data changed; refresh and review the preview' USING ERRCODE='40001';END IF;
 IF NOT (data->>'can_close')::boolean THEN RAISE EXCEPTION 'Resolve all service-day blockers before closing';END IF;
 INSERT INTO irp_pms.service_day_closes(tenant_id,property_id,service_date,request_id,actor_id,preview_hash,snapshot) VALUES(p_tenant,p_property,book.next_service_date,p_request,auth.uid(),p_expected_preview_hash,data) RETURNING * INTO close_row;
 FOR row_data IN SELECT x FROM jsonb_array_elements(data->'rows') x LOOP
  line:=row_data->'allocation';
  INSERT INTO irp_pms.service_day_entries(tenant_id,property_id,service_date,reservation_id,source_version,pricing_hash,allocation_source,room_type_id,physical_room_id,occupied_night,accommodation_minor,taxes_minor,hotel_fees_minor,ota_fees_minor,other_revenue_minor,total_minor,details)
  VALUES(p_tenant,p_property,book.next_service_date,(row_data->>'reservation_id')::uuid,(row_data->>'source_version')::bigint,row_data->>'pricing_hash',row_data->>'allocation_source',(row_data->>'room_type_id')::uuid,(row_data->>'physical_room_id')::uuid,(row_data->>'occupied_night')::boolean,(line->>'accommodation_minor')::bigint,(line->>'taxes_minor')::bigint,(line->>'hotel_fees_minor')::bigint,(line->>'ota_fees_minor')::bigint,(line->>'other_revenue_minor')::bigint,(line->>'total_minor')::bigint,line||jsonb_build_object('guest_name',row_data->>'guest_name','source',row_data->>'source','status',row_data->>'status'));
 END LOOP;
 FOR a IN SELECT ap.* FROM irp_pms.service_forward_approvals ap WHERE ap.tenant_id=p_tenant AND ap.property_id=p_property AND ap.service_date=book.next_service_date AND NOT EXISTS(SELECT 1 FROM irp_pms.service_forward_entries e WHERE e.tenant_id=ap.tenant_id AND e.property_id=ap.property_id AND e.adjustment_id=ap.id) ORDER BY ap.created_at,ap.id LOOP
  INSERT INTO irp_pms.service_forward_entries(tenant_id,property_id,service_date,adjustment_id,reservation_id,accommodation_minor,taxes_minor,hotel_fees_minor,ota_fees_minor,other_revenue_minor,total_minor,tax_buckets,details)
  VALUES(p_tenant,p_property,book.next_service_date,a.id,a.reservation_id,(a.delta->>'accommodation_minor')::bigint,(a.delta->>'taxes_minor')::bigint,(a.delta->>'hotel_fees_minor')::bigint,(a.delta->>'ota_fees_minor')::bigint,(a.delta->>'other_revenue_minor')::bigint,irp_pms.service_vector_sum(a.delta),a.tax_buckets,jsonb_build_object('reason',a.reason,'approved_by',a.actor_id,'approved_at',a.created_at,'source_version',a.source_version,'pricing_hash',a.pricing_hash,'original_service_start',a.review_snapshot->'original_service_start','original_service_end',a.review_snapshot->'original_service_end','guest_name',a.review_snapshot->'guest_name','financial_basis',a.review_snapshot->'financial_basis'));
 END LOOP;
 UPDATE irp_pms.service_books SET next_service_date=next_service_date+1,version=version+1 WHERE tenant_id=p_tenant AND property_id=p_property RETURNING * INTO book;
 result:=jsonb_build_object('close_id',close_row.id,'service_date',close_row.service_date,'closed_at',close_row.closed_at,'next_service_date',book.next_service_date,'version',book.version,'totals',data->'totals','entry_count',jsonb_array_length(data->'rows'),'currency','USD','accounting_scope','service_date_allocation','folio_changed',false,'replayed',false);
 IF p_expected_corrections_hash IS NOT NULL THEN result:=result||jsonb_build_object('api_version',2,'ordinary_entry_count',jsonb_array_length(data->'rows'),'correction_entry_count',jsonb_array_length(data->'pending_adjustments'),'corrections_hash',p_expected_corrections_hash,'ordinary_totals',data->'ordinary_totals','correction_totals',data->'correction_totals');END IF;
 INSERT INTO irp_pms.service_requests VALUES(p_tenant,p_property,p_request,auth.uid(),command,result,clock_timestamp());
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'service_day_closed',close_row.id,jsonb_build_object('service_date',close_row.service_date,'entry_count',jsonb_array_length(data->'rows'),'preview_hash',p_expected_preview_hash));
 RETURN result;
END $$;
CREATE FUNCTION irp_pms.service_original_report(p_tenant uuid,p_property uuid,p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE book irp_pms.service_books;days jsonb;entries jsonb;totals jsonb;aggregate_total numeric;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_start IS NULL OR p_end IS NULL OR p_end<=p_start OR p_end-p_start>366 THEN RAISE EXCEPTION 'Read1 to366 service days using an exclusive end date';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO book FROM irp_pms.service_books WHERE tenant_id=p_tenant AND property_id=p_property;
 IF (SELECT count(*) FROM irp_pms.service_reconciliation WHERE tenant_id=p_tenant AND property_id=p_property)>1000 THEN RAISE EXCEPTION 'More than1000 post-close changes require review; no report rows were truncated';END IF;
 IF (SELECT count(*) FROM irp_pms.service_day_entries WHERE tenant_id=p_tenant AND property_id=p_property AND service_date>=p_start AND service_date<p_end)>10000 THEN RAISE EXCEPTION 'Report exceeds10000 allocation rows; narrow the date range';END IF;
 SELECT coalesce(sum(total_minor),0) INTO aggregate_total FROM irp_pms.service_day_entries WHERE tenant_id=p_tenant AND property_id=p_property AND service_date>=p_start AND service_date<p_end;
 IF aggregate_total>9007199254740991 THEN RAISE EXCEPTION 'Report exceeds exact JSON integer range; narrow the date range';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('service_date',service_date,'close_id',id,'closed_at',closed_at,'closed_by',actor_id,'totals',snapshot->'totals','entry_count',jsonb_array_length(snapshot->'rows')) ORDER BY service_date),'[]') INTO days FROM irp_pms.service_day_closes WHERE tenant_id=p_tenant AND property_id=p_property AND service_date>=p_start AND service_date<p_end;
 SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY service_date,reservation_id),'[]'),jsonb_build_object('accommodation_minor',coalesce(sum(accommodation_minor),0),'taxes_minor',coalesce(sum(taxes_minor),0),'hotel_fees_minor',coalesce(sum(hotel_fees_minor),0),'ota_fees_minor',coalesce(sum(ota_fees_minor),0),'other_revenue_minor',coalesce(sum(other_revenue_minor),0),'revenue_minor',coalesce(sum(accommodation_minor+hotel_fees_minor+other_revenue_minor),0),'total_minor',coalesce(sum(total_minor),0),'occupied_nights',count(*) FILTER(WHERE occupied_night),'allocated_rows',count(*)) INTO entries,totals FROM irp_pms.service_day_entries e WHERE tenant_id=p_tenant AND property_id=p_property AND service_date>=p_start AND service_date<p_end;
 RETURN jsonb_build_object('currency','USD','accounting_scope','service_date_allocation','start',p_start,'end',p_end,'end_exclusive',true,'initialized',book.tenant_id IS NOT NULL,'first_service_date',book.first_service_date,'next_service_date',book.next_service_date,'time_zone',book.time_zone,'days',days,'entries',entries,'totals',totals,'rows_truncated',false,'reconciliation_pending',coalesce((SELECT jsonb_agg(jsonb_build_object('reservation_id',reservation_id,'changed_at',changed_at) ORDER BY reservation_id) FROM irp_pms.service_reconciliation WHERE tenant_id=p_tenant AND property_id=p_property),'[]'::jsonb),'generated_at',clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION irp_pms.service_close(uuid,uuid,uuid,bigint,text,text),irp_pms.service_original_report(uuid,uuid,date,date) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.irp_pms_pilot_close_service_day(p_tenant uuid,p_property uuid,p_request uuid,p_expected_version bigint,p_expected_preview_hash text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT irp_pms.service_close(p_tenant,p_property,p_request,p_expected_version,p_expected_preview_hash,NULL) $$;

CREATE FUNCTION public.irp_pms_pilot_close_service_day_v2(p_tenant uuid,p_property uuid,p_request uuid,p_expected_version bigint,p_expected_preview_hash text,p_expected_corrections_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF p_expected_corrections_hash IS NULL OR p_expected_corrections_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'The reviewed forward-corrections hash is required';END IF;
 RETURN irp_pms.service_close(p_tenant,p_property,p_request,p_expected_version,p_expected_preview_hash,p_expected_corrections_hash);
END $$;

CREATE OR REPLACE FUNCTION public.irp_pms_pilot_service_day_report(p_tenant uuid,p_property uuid,p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 result:=irp_pms.service_original_report(p_tenant,p_property,p_start,p_end);
 IF EXISTS(SELECT 1 FROM irp_pms.service_forward_entries WHERE tenant_id=p_tenant AND property_id=p_property AND service_date>=p_start AND service_date<p_end) THEN RAISE EXCEPTION 'Use the updated service-day report to include posted forward corrections';END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_service_day_report_v2(p_tenant uuid,p_property uuid,p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;days jsonb;forward_entries jsonb;correction_totals jsonb;totals jsonb;pending jsonb;k text;n numeric;forward_count integer;
BEGIN
 -- The original report acquires and holds tenant/property read locks, validates
 -- scope/range and returns only immutable original rows. Corrections stay separate.
 result:=irp_pms.service_original_report(p_tenant,p_property,p_start,p_end);
 SELECT count(*)::integer INTO forward_count FROM irp_pms.service_forward_entries WHERE tenant_id=p_tenant AND property_id=p_property AND service_date>=p_start AND service_date<p_end;
 IF forward_count+jsonb_array_length(result->'entries')>10000 THEN RAISE EXCEPTION 'Report exceeds10000 original and correction rows; narrow the date range';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY service_date,adjustment_id),'[]'),jsonb_build_object('accommodation_minor',coalesce(sum(accommodation_minor),0),'taxes_minor',coalesce(sum(taxes_minor),0),'hotel_fees_minor',coalesce(sum(hotel_fees_minor),0),'ota_fees_minor',coalesce(sum(ota_fees_minor),0),'other_revenue_minor',coalesce(sum(other_revenue_minor),0),'revenue_minor',coalesce(sum(accommodation_minor+hotel_fees_minor+other_revenue_minor),0),'total_minor',coalesce(sum(total_minor),0),'occupied_nights',0,'correction_rows',count(*)) INTO forward_entries,correction_totals FROM irp_pms.service_forward_entries e WHERE tenant_id=p_tenant AND property_id=p_property AND service_date>=p_start AND service_date<p_end;
 totals:=result->'totals';
 FOREACH k IN ARRAY ARRAY['accommodation_minor','taxes_minor','hotel_fees_minor','ota_fees_minor','other_revenue_minor','revenue_minor','total_minor'] LOOP
  n:=(totals->>k)::numeric+(correction_totals->>k)::numeric;
  IF abs(n)>9007199254740991 OR abs((correction_totals->>k)::numeric)>9007199254740991 THEN RAISE EXCEPTION 'Report exceeds exact JSON integer range; narrow the date range';END IF;
  totals:=jsonb_set(totals,ARRAY[k],to_jsonb(n::bigint));
 END LOOP;
 totals:=totals||jsonb_build_object('correction_rows',forward_count);
 pending:=irp_pms.service_pending_forward(p_tenant,p_property);
 SELECT coalesce(jsonb_agg(d||jsonb_build_object('ordinary_entry_count',(d->>'entry_count')::integer,'correction_entry_count',coalesce((SELECT count(*) FROM irp_pms.service_forward_entries e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.service_date=(d->>'service_date')::date),0)) ORDER BY d->>'service_date'),'[]') INTO days FROM jsonb_array_elements(result->'days') d;
 -- Keep the immutable original close fields, adding a separately labeled count.
 RETURN result||jsonb_build_object('api_version',2,'days',days,'forward_entries',forward_entries,'ordinary_totals',result->'totals','correction_totals',correction_totals,'totals',totals,'pending_adjustments',pending);
END $$;

CREATE FUNCTION irp_pms.service_forward_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'Forward correction approvals and posted entries are immutable';END $$;
REVOKE ALL ON FUNCTION irp_pms.service_forward_immutable() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER irp_pms_service_forward_approval_immutable BEFORE UPDATE OR DELETE ON irp_pms.service_forward_approvals FOR EACH ROW EXECUTE FUNCTION irp_pms.service_forward_immutable();
CREATE TRIGGER irp_pms_service_forward_entry_immutable BEFORE UPDATE OR DELETE ON irp_pms.service_forward_entries FOR EACH ROW EXECUTE FUNCTION irp_pms.service_forward_immutable();

REVOKE ALL ON FUNCTION public.irp_pms_pilot_service_forward_preview(uuid,uuid,uuid),public.irp_pms_pilot_approve_service_forward(uuid,uuid,uuid,uuid,bigint,bigint,text,text,jsonb,jsonb,text),public.irp_pms_pilot_service_day_preview_v2(uuid,uuid),public.irp_pms_pilot_close_service_day_v2(uuid,uuid,uuid,bigint,text,text),public.irp_pms_pilot_service_day_report_v2(uuid,uuid,date,date),public.irp_pms_pilot_service_day_preview(uuid,uuid),public.irp_pms_pilot_close_service_day(uuid,uuid,uuid,bigint,text),public.irp_pms_pilot_service_day_report(uuid,uuid,date,date) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_service_forward_preview(uuid,uuid,uuid),public.irp_pms_pilot_approve_service_forward(uuid,uuid,uuid,uuid,bigint,bigint,text,text,jsonb,jsonb,text),public.irp_pms_pilot_service_day_preview_v2(uuid,uuid),public.irp_pms_pilot_close_service_day_v2(uuid,uuid,uuid,bigint,text,text),public.irp_pms_pilot_service_day_report_v2(uuid,uuid,date,date),public.irp_pms_pilot_service_day_preview(uuid,uuid),public.irp_pms_pilot_close_service_day(uuid,uuid,uuid,bigint,text),public.irp_pms_pilot_service_day_report(uuid,uuid,date,date) TO authenticated;
COMMIT;

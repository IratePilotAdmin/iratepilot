BEGIN;
-- Operational service-date allocation only. This never posts a folio charge,
-- moves money, advances the admission clock, or supplies a general ledger.
CREATE TABLE irp_pms.service_books(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,first_service_date date NOT NULL,next_service_date date NOT NULL,
 time_zone text NOT NULL,version bigint NOT NULL DEFAULT 1 CHECK(version BETWEEN 1 AND 9007199254740991),
 opened_by uuid NOT NULL REFERENCES auth.users(id),opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id),CHECK(next_service_date>=first_service_date)
);
CREATE TABLE irp_pms.service_requests(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 command jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
CREATE TABLE irp_pms.service_allocation_approvals(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,tenant_id uuid NOT NULL,property_id uuid NOT NULL,reservation_id uuid NOT NULL,
 request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),source_version bigint NOT NULL,pricing_hash text NOT NULL CHECK(pricing_hash~'^[a-f0-9]{64}$'),
 lines jsonb NOT NULL,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.reservations(tenant_id,property_id,id)
);
CREATE INDEX service_approval_lookup ON irp_pms.service_allocation_approvals(tenant_id,property_id,reservation_id,id DESC);
CREATE TABLE irp_pms.service_day_closes(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,service_date date NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),preview_hash text NOT NULL,snapshot jsonb NOT NULL,
 closed_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(tenant_id,property_id,service_date),UNIQUE(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.service_books(tenant_id,property_id)
);
CREATE TABLE irp_pms.service_day_entries(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,service_date date NOT NULL,reservation_id uuid NOT NULL,
 source_version bigint NOT NULL,pricing_hash text NOT NULL,allocation_source text NOT NULL CHECK(allocation_source IN('quote','manager_approved')),
 room_type_id uuid,physical_room_id uuid,occupied_night boolean NOT NULL,
 accommodation_minor bigint NOT NULL CHECK(accommodation_minor BETWEEN 0 AND 999999999999),taxes_minor bigint NOT NULL CHECK(taxes_minor BETWEEN 0 AND 999999999999),
 hotel_fees_minor bigint NOT NULL CHECK(hotel_fees_minor BETWEEN 0 AND 999999999999),ota_fees_minor bigint NOT NULL CHECK(ota_fees_minor BETWEEN 0 AND 999999999999),
 other_revenue_minor bigint NOT NULL CHECK(other_revenue_minor BETWEEN 0 AND 999999999999),total_minor bigint NOT NULL CHECK(total_minor BETWEEN 0 AND 999999999999),details jsonb NOT NULL,
 PRIMARY KEY(tenant_id,property_id,service_date,reservation_id),
 FOREIGN KEY(tenant_id,property_id,service_date) REFERENCES irp_pms.service_day_closes(tenant_id,property_id,service_date),
 FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.reservations(tenant_id,property_id,id),
 CHECK(accommodation_minor+taxes_minor+hotel_fees_minor+ota_fees_minor+other_revenue_minor=total_minor)
);
CREATE TABLE irp_pms.service_reconciliation(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,reservation_id uuid NOT NULL,changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,reservation_id),FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.reservations(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.service_reconciliation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.service_reconciliation FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON irp_pms.service_reconciliation TO service_role;
ALTER TABLE irp_pms.service_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.service_allocation_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.service_day_closes ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.service_day_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.service_books,irp_pms.service_requests,irp_pms.service_allocation_approvals,irp_pms.service_day_closes,irp_pms.service_day_entries FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON irp_pms.service_books,irp_pms.service_requests,irp_pms.service_allocation_approvals,irp_pms.service_day_closes,irp_pms.service_day_entries TO service_role;
REVOKE ALL ON SEQUENCE irp_pms.service_allocation_approvals_id_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION irp_pms.service_pricing(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r irp_pms.reservations;f irp_pms.folio_openings;q irp_pms.rate_quotes;a irp_pms.service_allocation_approvals;
 has_folio boolean;adjustments jsonb;net_adjustment bigint;basis bigint;fingerprint jsonb;hash text;auto_lines jsonb;reason text;line jsonb;lines jsonb:='[]';components jsonb;
BEGIN
 SELECT * INTO r FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped reservation'; END IF;
 SELECT * INTO f FROM irp_pms.folio_openings WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;has_folio:=FOUND;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'amount_minor',amount_minor,'target_entry_id',target_entry_id) ORDER BY id),'[]'),
 coalesce(sum(CASE kind WHEN 'charge' THEN amount_minor ELSE -amount_minor END),0) INTO adjustments,net_adjustment
 FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND kind IN('charge','charge_reversal');
 basis:=CASE WHEN has_folio THEN f.total_minor+net_adjustment ELSE r.guest_total_minor END;
 components:=jsonb_build_object('accommodation_minor',CASE WHEN has_folio THEN f.accommodation_minor ELSE r.accommodation_minor END,'taxes_minor',CASE WHEN has_folio THEN f.taxes_minor ELSE r.taxes_minor END,'hotel_fees_minor',CASE WHEN has_folio THEN f.hotel_fees_minor ELSE r.hotel_fees_minor END,'ota_fees_minor',CASE WHEN has_folio THEN f.fees_minor ELSE r.ota_fees_minor END,'other_revenue_minor',0);
 fingerprint:=jsonb_build_object('arrival',r.arrival,'departure',r.departure,'room_type_id',r.room_type_id,'accommodation_minor',r.accommodation_minor,'taxes_minor',r.taxes_minor,'hotel_fees_minor',r.hotel_fees_minor,'ota_fees_minor',r.ota_fees_minor,'total_minor',r.guest_total_minor,'charge_breakdown',r.charge_breakdown,
 'opening',CASE WHEN has_folio THEN jsonb_build_object('accommodation_minor',f.accommodation_minor,'taxes_minor',f.taxes_minor,'hotel_fees_minor',f.hotel_fees_minor,'ota_fees_minor',f.fees_minor,'total_minor',f.total_minor,'charge_breakdown',f.charge_breakdown)
 ELSE jsonb_build_object('accommodation_minor',r.accommodation_minor,'taxes_minor',r.taxes_minor,'hotel_fees_minor',r.hotel_fees_minor,'ota_fees_minor',r.ota_fees_minor,'total_minor',r.guest_total_minor,'charge_breakdown',r.charge_breakdown) END,'adjustments',adjustments);
 hash:=encode(sha256(convert_to(fingerprint::text,'UTF8')),'hex');
 SELECT * INTO a FROM irp_pms.service_allocation_approvals WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation ORDER BY id DESC LIMIT 1;
 IF FOUND AND a.pricing_hash=hash THEN
  RETURN jsonb_build_object('reservation',to_jsonb(r),'pricing_hash',hash,'financial_basis',CASE WHEN has_folio THEN 'folio_charges' ELSE 'reservation_charges' END,'total_minor',basis,'component_totals',components,'component_totals_fixed',adjustments='[]'::jsonb,'allocation_source','manager_approved','approval_id',a.id,'lines',a.lines,'reason',NULL,'has_folio',has_folio);
 END IF;
 SELECT sq.* INTO q FROM irp_pms.quote_bookings qb JOIN irp_pms.rate_quotes sq ON sq.tenant_id=qb.tenant_id AND sq.property_id=qb.property_id AND sq.id=qb.quote_id WHERE qb.tenant_id=p_tenant AND qb.property_id=p_property AND qb.reservation_id=p_reservation;
 IF NOT FOUND THEN reason:='nightly_allocation_required';
 ELSIF r.arrival IS DISTINCT FROM q.arrival OR r.departure IS DISTINCT FROM q.departure OR r.room_type_id IS DISTINCT FROM q.room_type_id OR r.accommodation_minor IS DISTINCT FROM q.accommodation_minor OR r.taxes_minor IS DISTINCT FROM q.taxes_minor OR r.hotel_fees_minor IS DISTINCT FROM q.hotel_fees_minor OR r.ota_fees_minor IS DISTINCT FROM 0 OR r.guest_total_minor IS DISTINCT FROM q.total_minor OR r.charge_breakdown IS DISTINCT FROM q.charge_breakdown THEN reason:='pricing_changed';
 ELSIF has_folio AND (f.accommodation_minor IS DISTINCT FROM r.accommodation_minor OR f.taxes_minor IS DISTINCT FROM r.taxes_minor OR f.hotel_fees_minor IS DISTINCT FROM r.hotel_fees_minor OR f.fees_minor IS DISTINCT FROM r.ota_fees_minor OR f.total_minor IS DISTINCT FROM r.guest_total_minor OR f.charge_breakdown IS DISTINCT FROM r.charge_breakdown) THEN reason:='folio_pricing_difference';
 ELSIF adjustments<>'[]'::jsonb THEN reason:='folio_adjustment_allocation_required';
 ELSIF basis IS NULL OR basis NOT BETWEEN 0 AND 999999999999 THEN reason:='charge_data_unavailable';
 ELSE
  FOR line IN SELECT x FROM jsonb_array_elements(q.nights) x LOOP
   lines:=lines||jsonb_build_array(jsonb_build_object('date',line->>'date','accommodation_minor',(line->>'accommodation_minor')::bigint,'taxes_minor',(line->>'taxes_minor')::bigint,'hotel_fees_minor',coalesce((line->>'hotel_fees_minor')::bigint,0),'ota_fees_minor',0,'other_revenue_minor',0,'total_minor',(line->>'total_minor')::bigint,'taxes',coalesce(line->'taxes','[]'::jsonb),'fees',coalesce(line->'fees','[]'::jsonb),'tax_allocation',CASE WHEN line ? 'taxes' THEN 'itemized' ELSE 'legacy_aggregate' END));
  END LOOP;
 END IF;
 RETURN jsonb_build_object('reservation',to_jsonb(r),'pricing_hash',hash,'financial_basis',CASE WHEN has_folio THEN 'folio_charges' ELSE 'reservation_charges' END,'total_minor',basis,'component_totals',components,'component_totals_fixed',adjustments='[]'::jsonb,'allocation_source',CASE WHEN reason IS NULL THEN 'quote' ELSE NULL END,'lines',CASE WHEN reason IS NULL THEN lines ELSE '[]'::jsonb END,'reason',reason,'has_folio',has_folio);
END $$;
REVOKE ALL ON FUNCTION irp_pms.service_pricing(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.irp_pms_pilot_start_service_ledger(p_tenant uuid,p_property uuid,p_request uuid,p_first_service_date date,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prop irp_pms.properties;book irp_pms.service_books;prior irp_pms.service_requests;command jsonb;result jsonb;today date;
BEGIN
 PERFORM irp_pms.pilot_require_owner(p_tenant,p_property,false);
 IF p_request IS NULL OR p_first_service_date IS NULL OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 4 AND 500 THEN RAISE EXCEPTION 'A request, explicit first service date and reason are required'; END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require_owner(p_tenant,p_property,false);
 command:=jsonb_build_object('action','start','first_service_date',p_first_service_date,'reason',trim(p_reason));
 SELECT * INTO prior FROM irp_pms.service_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Service request identity already used'; END IF;RETURN prior.result||jsonb_build_object('replayed',true);END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.service_books WHERE tenant_id=p_tenant AND property_id=p_property) THEN RAISE EXCEPTION 'Service ledger is already initialized'; END IF;
 today:=(clock_timestamp() AT TIME ZONE prop.time_zone)::date;
 IF p_first_service_date>today OR p_first_service_date<today-31 THEN RAISE EXCEPTION 'Explicit first service date must be today or one of the previous31 days'; END IF;
 INSERT INTO irp_pms.service_books(tenant_id,property_id,first_service_date,next_service_date,time_zone,opened_by) VALUES(p_tenant,p_property,p_first_service_date,p_first_service_date,prop.time_zone,auth.uid()) RETURNING * INTO book;
 result:=to_jsonb(book)||jsonb_build_object('initialized',true,'replayed',false,'historical_backfill',false,'accounting_scope','service_date_allocation');
 INSERT INTO irp_pms.service_requests VALUES(p_tenant,p_property,p_request,auth.uid(),command,result,clock_timestamp());
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'service_ledger_started',p_property,jsonb_build_object('first_service_date',p_first_service_date,'reason',trim(p_reason)));
 RETURN result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_service_allocation(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE data jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 data:=irp_pms.service_pricing(p_tenant,p_property,p_reservation);
 RETURN data||jsonb_build_object('currency','USD','accounting_scope','service_date_allocation','closed_lines',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY service_date) FROM irp_pms.service_day_entries e WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation),'[]'::jsonb));
END $$;

CREATE FUNCTION public.irp_pms_pilot_approve_service_allocation(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_expected_source_version bigint,p_expected_pricing_hash text,p_lines jsonb,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE data jsonb;r irp_pms.reservations;book irp_pms.service_books;prior irp_pms.service_requests;command jsonb;result jsonb;line jsonb;normalized jsonb:='[]';values_sum bigint:=0;row_sum bigint;amount numeric;key text;date_value date;previous_date date;normalized_line jsonb;approval irp_pms.service_allocation_approvals;closed irp_pms.service_day_entries;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_reservation IS NULL OR p_expected_source_version IS NULL OR p_expected_pricing_hash IS NULL OR p_expected_pricing_hash!~'^[a-f0-9]{64}$' OR p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 4 AND 500 OR p_lines IS NULL OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR octet_length(p_lines::text)>65536 OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Provide versioned pricing,1 to30 explicit nightly allocations and a reconciliation reason'; END IF;
 FOR line IN SELECT x FROM jsonb_array_elements(p_lines) x LOOP
  IF jsonb_typeof(line) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(line))<>6 OR NOT(line ?& ARRAY['date','accommodation_minor','taxes_minor','hotel_fees_minor','ota_fees_minor','other_revenue_minor']) OR jsonb_typeof(line->'date') IS DISTINCT FROM 'string' OR (line->>'date')!~'^\d{4}-\d{2}-\d{2}$' THEN RAISE EXCEPTION 'Unexpected nightly allocation fields'; END IF;
  date_value:=(line->>'date')::date;
  IF previous_date IS NOT NULL AND date_value<>previous_date+1 THEN RAISE EXCEPTION 'Allocation dates must be unique, contiguous and ordered'; END IF;previous_date:=date_value;
  row_sum:=0;normalized_line:=jsonb_build_object('date',date_value);
  FOREACH key IN ARRAY ARRAY['accommodation_minor','taxes_minor','hotel_fees_minor','ota_fees_minor','other_revenue_minor'] LOOP
   IF jsonb_typeof(line->key) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Allocation amounts must be integer USD minor units'; END IF;
   amount:=(line->>key)::numeric;
   IF amount<>trunc(amount) OR amount NOT BETWEEN 0 AND 999999999999 THEN RAISE EXCEPTION 'Allocation amount is outside the supported range'; END IF;
   row_sum:=row_sum+amount::bigint;normalized_line:=normalized_line||jsonb_build_object(key,amount::bigint);
  END LOOP;
  values_sum:=values_sum+row_sum;
  IF values_sum>999999999999 THEN RAISE EXCEPTION 'Allocation total exceeds supported USD amount'; END IF;
  normalized:=normalized||jsonb_build_array(normalized_line||jsonb_build_object('total_minor',row_sum,'tax_allocation','manager_aggregate','taxes','[]'::jsonb,'fees','[]'::jsonb));
 END LOOP;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 command:=jsonb_build_object('action','approve_allocation','reservation_id',p_reservation,'expected_source_version',p_expected_source_version,'pricing_hash',p_expected_pricing_hash,'lines',normalized,'reason',trim(p_reason));
 SELECT * INTO prior FROM irp_pms.service_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Service request identity already used'; END IF;RETURN prior.result||jsonb_build_object('replayed',true);END IF;
 SELECT * INTO book FROM irp_pms.service_books WHERE tenant_id=p_tenant AND property_id=p_property;
 IF NOT FOUND THEN RAISE EXCEPTION 'Initialize the service ledger first'; END IF;
 data:=irp_pms.service_pricing(p_tenant,p_property,p_reservation);r:=jsonb_populate_record(NULL::irp_pms.reservations,data->'reservation');
 IF r.source_version IS DISTINCT FROM p_expected_source_version OR data->>'pricing_hash' IS DISTINCT FROM p_expected_pricing_hash THEN RAISE EXCEPTION 'Reservation pricing changed; refresh before approval' USING ERRCODE='40001'; END IF;
 IF r.arrival IS NULL OR r.departure IS NULL OR (normalized->0->>'date')::date<>r.arrival OR previous_date<>r.departure-1 THEN RAISE EXCEPTION 'Allocation must cover every original stay date exactly'; END IF;
 IF (data->>'total_minor') IS NULL OR values_sum IS DISTINCT FROM (data->>'total_minor')::bigint THEN RAISE EXCEPTION 'Allocation must equal the current folio charge total, or booked total before a folio opens'; END IF;
 IF (data->>'component_totals_fixed')::boolean THEN
  FOREACH key IN ARRAY ARRAY['accommodation_minor','taxes_minor','hotel_fees_minor','ota_fees_minor','other_revenue_minor'] LOOP
   SELECT sum((x->>key)::bigint) INTO amount FROM jsonb_array_elements(normalized) x;
   IF amount IS DISTINCT FROM (data->'component_totals'->>key)::numeric THEN RAISE EXCEPTION 'Known charge component totals must be preserved; nightly allocation cannot reclassify tax or fees';END IF;
  END LOOP;
 END IF;
 FOR closed IN SELECT * FROM irp_pms.service_day_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation LOOP
  SELECT x INTO line FROM jsonb_array_elements(normalized) x WHERE (x->>'date')::date=closed.service_date;
  IF NOT FOUND OR (line->>'accommodation_minor')::bigint<>closed.accommodation_minor OR (line->>'taxes_minor')::bigint<>closed.taxes_minor OR (line->>'hotel_fees_minor')::bigint<>closed.hotel_fees_minor OR (line->>'ota_fees_minor')::bigint<>closed.ota_fees_minor OR (line->>'other_revenue_minor')::bigint<>closed.other_revenue_minor THEN RAISE EXCEPTION 'Closed service-day allocations are immutable; a separate forward adjustment is required'; END IF;
 END LOOP;
 INSERT INTO irp_pms.service_allocation_approvals(tenant_id,property_id,reservation_id,request_id,actor_id,source_version,pricing_hash,lines,reason) VALUES(p_tenant,p_property,p_reservation,p_request,auth.uid(),r.source_version,p_expected_pricing_hash,normalized,trim(p_reason)) RETURNING * INTO approval;
 DELETE FROM irp_pms.service_reconciliation WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 UPDATE irp_pms.service_books SET version=version+1 WHERE tenant_id=p_tenant AND property_id=p_property RETURNING * INTO book;
 result:=jsonb_build_object('reservation_id',p_reservation,'approval_id',approval.id,'pricing_hash',p_expected_pricing_hash,'lines',normalized,'total_minor',values_sum,'version',book.version,'replayed',false);
 INSERT INTO irp_pms.service_requests VALUES(p_tenant,p_property,p_request,auth.uid(),command,result,clock_timestamp());
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'service_allocation_approved',p_reservation,jsonb_build_object('approval_id',approval.id,'reason',trim(p_reason),'pricing_hash',p_expected_pricing_hash));
 RETURN result;
END $$;

CREATE FUNCTION irp_pms.service_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE reservation_uuid uuid;
BEGIN
 IF TG_TABLE_NAME='reservations' THEN
  IF NEW.arrival IS NOT DISTINCT FROM OLD.arrival AND NEW.departure IS NOT DISTINCT FROM OLD.departure AND NEW.room_type_id IS NOT DISTINCT FROM OLD.room_type_id AND NEW.accommodation_minor IS NOT DISTINCT FROM OLD.accommodation_minor AND NEW.taxes_minor IS NOT DISTINCT FROM OLD.taxes_minor AND NEW.hotel_fees_minor IS NOT DISTINCT FROM OLD.hotel_fees_minor AND NEW.ota_fees_minor IS NOT DISTINCT FROM OLD.ota_fees_minor AND NEW.guest_total_minor IS NOT DISTINCT FROM OLD.guest_total_minor AND NEW.charge_breakdown IS NOT DISTINCT FROM OLD.charge_breakdown THEN RETURN NEW;END IF;
  reservation_uuid:=NEW.id;
 ELSE
  IF NEW.kind NOT IN('charge','charge_reversal') THEN RETURN NEW;END IF;
  reservation_uuid:=NEW.reservation_id;
 END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.service_day_entries WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND reservation_id=reservation_uuid) THEN
  INSERT INTO irp_pms.service_reconciliation(tenant_id,property_id,reservation_id) VALUES(NEW.tenant_id,NEW.property_id,reservation_uuid) ON CONFLICT(tenant_id,property_id,reservation_id) DO UPDATE SET changed_at=clock_timestamp();
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.service_changed() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER irp_pms_service_reservation_changed AFTER UPDATE ON irp_pms.reservations FOR EACH ROW EXECUTE FUNCTION irp_pms.service_changed();
CREATE TRIGGER irp_pms_service_folio_changed AFTER INSERT ON irp_pms.folio_entries FOR EACH ROW EXECUTE FUNCTION irp_pms.service_changed();

CREATE FUNCTION irp_pms.service_day_data(p_tenant uuid,p_property uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE book irp_pms.service_books;prop irp_pms.properties;r irp_pms.reservations;data jsonb;line jsonb;row_data jsonb;rows jsonb:='[]';blockers jsonb:='[]';result jsonb;
 today date;day date;occupied boolean;code text;count_rows integer:=0;room_amount bigint:=0;tax_amount bigint:=0;hotel_amount bigint:=0;ota_amount bigint:=0;other_amount bigint:=0;total_amount bigint:=0;occupied_count integer:=0;
BEGIN
 SELECT * INTO prop FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property;
 SELECT * INTO book FROM irp_pms.service_books WHERE tenant_id=p_tenant AND property_id=p_property;
 IF NOT FOUND THEN RETURN jsonb_build_object('initialized',false,'can_close',false,'currency','USD','blockers',jsonb_build_array(jsonb_build_object('code','ledger_not_initialized')),'rows','[]'::jsonb,'totals',NULL,'preview_hash',NULL,'accounting_scope','service_date_allocation');END IF;
 today:=(clock_timestamp() AT TIME ZONE book.time_zone)::date;day:=book.next_service_date;
 IF prop.time_zone<>book.time_zone THEN blockers:=blockers||jsonb_build_array(jsonb_build_object('code','property_time_zone_changed'));END IF;
 IF day>=today THEN blockers:=blockers||jsonb_build_array(jsonb_build_object('code','service_day_not_finished'));END IF;
 IF (SELECT count(*) FROM irp_pms.service_reconciliation WHERE tenant_id=p_tenant AND property_id=p_property)>1000 THEN RAISE EXCEPTION 'More than1000 post-close changes require review; use an operator reconciliation procedure';END IF;
 SELECT blockers||coalesce(jsonb_agg(jsonb_build_object('code','post_close_pricing_changed','reservation_id',reservation_id) ORDER BY reservation_id),'[]'::jsonb) INTO blockers FROM irp_pms.service_reconciliation WHERE tenant_id=p_tenant AND property_id=p_property;
 IF (SELECT count(*) FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND arrival<=day AND (departure>day OR status IN('Confirmed','In house')))>1000 THEN RAISE EXCEPTION 'Service-day preview supports at most1000 candidate stays; no rows were truncated';END IF;
 FOR r IN SELECT * FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND arrival<=day AND (departure>day OR status IN('Confirmed','In house')) ORDER BY id LOOP
  count_rows:=count_rows+1;code:=NULL;line:=NULL;data:=irp_pms.service_pricing(p_tenant,p_property,r.id);
  occupied:=coalesce(r.checked_in_at IS NOT NULL AND (r.checked_in_at AT TIME ZONE book.time_zone)::date<=day AND r.physical_room_id IS NOT NULL AND (r.status='In house' OR r.status='Checked out' AND r.checked_out_at IS NOT NULL AND (r.checked_out_at AT TIME ZONE book.time_zone)::date>day),false);
  IF r.status='Confirmed' THEN code:='arrival_not_resolved';
  ELSIF r.status='In house' AND r.departure<=day THEN code:='overdue_stay_requires_extension';
  ELSIF r.status='Cancelled' AND (NOT (data->>'has_folio')::boolean OR coalesce((data->>'total_minor')::bigint,0)=0) THEN CONTINUE;
  ELSE
   code:=data->>'reason';
   SELECT x INTO line FROM jsonb_array_elements(data->'lines') x WHERE (x->>'date')::date=day;
   IF code IS NULL AND line IS NULL THEN code:='service_date_allocation_missing';END IF;
   IF code IS NULL AND NOT occupied AND (data->>'allocation_source'<>'manager_approved' OR (line->>'accommodation_minor')::bigint<>0 OR (line->>'hotel_fees_minor')::bigint<>0) THEN code:='unoccupied_night_requires_explicit_allocation';END IF;
  END IF;
  row_data:=jsonb_build_object('reservation_id',r.id,'source',r.source,'status',r.status,'guest_name',r.guest_name,'source_version',r.source_version,'room_type_id',r.room_type_id,'physical_room_id',r.physical_room_id,'occupied_night',occupied,'pricing_hash',data->>'pricing_hash','financial_basis',data->>'financial_basis','allocation_source',data->>'allocation_source','blocker',code,'allocation',line);
  rows:=rows||jsonb_build_array(row_data);
  IF code IS NOT NULL THEN blockers:=blockers||jsonb_build_array(jsonb_build_object('reservation_id',r.id,'code',code));
  ELSE
   room_amount:=room_amount+(line->>'accommodation_minor')::bigint;tax_amount:=tax_amount+(line->>'taxes_minor')::bigint;hotel_amount:=hotel_amount+(line->>'hotel_fees_minor')::bigint;ota_amount:=ota_amount+(line->>'ota_fees_minor')::bigint;other_amount:=other_amount+(line->>'other_revenue_minor')::bigint;total_amount:=total_amount+(line->>'total_minor')::bigint;
   IF occupied THEN occupied_count:=occupied_count+1;END IF;
  END IF;
 END LOOP;
 result:=jsonb_build_object('initialized',true,'first_service_date',book.first_service_date,'next_service_date',day,'version',book.version,'time_zone',book.time_zone,'civil_date',today,'currency','USD','accounting_scope','service_date_allocation','operating_date_unchanged',true,'can_close',jsonb_array_length(blockers)=0,'blockers',blockers,'rows',rows,'candidate_count',count_rows,'rows_truncated',false,
 'totals',jsonb_build_object('accommodation_minor',room_amount,'taxes_minor',tax_amount,'hotel_fees_minor',hotel_amount,'ota_fees_minor',ota_amount,'other_revenue_minor',other_amount,'revenue_minor',room_amount+hotel_amount+other_amount,'total_minor',total_amount,'occupied_nights',occupied_count,'complete',jsonb_array_length(blockers)=0));
 RETURN result||jsonb_build_object('preview_hash',encode(sha256(convert_to(result::text,'UTF8')),'hex'));
END $$;
REVOKE ALL ON FUNCTION irp_pms.service_day_data(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.irp_pms_pilot_service_day_preview(p_tenant uuid,p_property uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 RETURN irp_pms.service_day_data(p_tenant,p_property)||jsonb_build_object('generated_at',clock_timestamp());
END $$;

CREATE FUNCTION public.irp_pms_pilot_close_service_day(p_tenant uuid,p_property uuid,p_request uuid,p_expected_version bigint,p_expected_preview_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE book irp_pms.service_books;prior irp_pms.service_requests;command jsonb;data jsonb;result jsonb;row_data jsonb;line jsonb;close_row irp_pms.service_day_closes;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991 OR p_expected_preview_hash IS NULL OR p_expected_preview_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'A request, expected close version and reviewed preview hash are required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 command:=jsonb_build_object('action','close','expected_version',p_expected_version,'preview_hash',p_expected_preview_hash);
 SELECT * INTO prior FROM irp_pms.service_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN IF prior.actor_id IS DISTINCT FROM auth.uid() OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Service request identity already used';END IF;RETURN prior.result||jsonb_build_object('replayed',true);END IF;
 SELECT * INTO book FROM irp_pms.service_books WHERE tenant_id=p_tenant AND property_id=p_property;
 IF NOT FOUND THEN RAISE EXCEPTION 'Initialize the service ledger first';END IF;
 IF book.version<>p_expected_version THEN RAISE EXCEPTION 'Service close version changed; refresh the preview' USING ERRCODE='40001';END IF;
 data:=irp_pms.service_day_data(p_tenant,p_property);
 IF data->>'preview_hash'<>p_expected_preview_hash THEN RAISE EXCEPTION 'Service-day data changed; refresh and review the preview' USING ERRCODE='40001';END IF;
 IF NOT (data->>'can_close')::boolean THEN RAISE EXCEPTION 'Resolve all service-day blockers before closing';END IF;
 INSERT INTO irp_pms.service_day_closes(tenant_id,property_id,service_date,request_id,actor_id,preview_hash,snapshot) VALUES(p_tenant,p_property,book.next_service_date,p_request,auth.uid(),p_expected_preview_hash,data) RETURNING * INTO close_row;
 FOR row_data IN SELECT x FROM jsonb_array_elements(data->'rows') x LOOP
  line:=row_data->'allocation';
  INSERT INTO irp_pms.service_day_entries(tenant_id,property_id,service_date,reservation_id,source_version,pricing_hash,allocation_source,room_type_id,physical_room_id,occupied_night,accommodation_minor,taxes_minor,hotel_fees_minor,ota_fees_minor,other_revenue_minor,total_minor,details)
  VALUES(p_tenant,p_property,book.next_service_date,(row_data->>'reservation_id')::uuid,(row_data->>'source_version')::bigint,row_data->>'pricing_hash',row_data->>'allocation_source',(row_data->>'room_type_id')::uuid,(row_data->>'physical_room_id')::uuid,(row_data->>'occupied_night')::boolean,(line->>'accommodation_minor')::bigint,(line->>'taxes_minor')::bigint,(line->>'hotel_fees_minor')::bigint,(line->>'ota_fees_minor')::bigint,(line->>'other_revenue_minor')::bigint,(line->>'total_minor')::bigint,line||jsonb_build_object('guest_name',row_data->>'guest_name','source',row_data->>'source','status',row_data->>'status'));
 END LOOP;
 UPDATE irp_pms.service_books SET next_service_date=next_service_date+1,version=version+1 WHERE tenant_id=p_tenant AND property_id=p_property RETURNING * INTO book;
 result:=jsonb_build_object('close_id',close_row.id,'service_date',close_row.service_date,'closed_at',close_row.closed_at,'next_service_date',book.next_service_date,'version',book.version,'totals',data->'totals','entry_count',jsonb_array_length(data->'rows'),'currency','USD','accounting_scope','service_date_allocation','folio_changed',false,'replayed',false);
 INSERT INTO irp_pms.service_requests VALUES(p_tenant,p_property,p_request,auth.uid(),command,result,clock_timestamp());
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'service_day_closed',close_row.id,jsonb_build_object('service_date',close_row.service_date,'entry_count',jsonb_array_length(data->'rows'),'preview_hash',p_expected_preview_hash));
 RETURN result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_service_day_report(p_tenant uuid,p_property uuid,p_start date,p_end date) RETURNS jsonb
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

REVOKE ALL ON FUNCTION public.irp_pms_pilot_start_service_ledger(uuid,uuid,uuid,date,text),public.irp_pms_pilot_service_allocation(uuid,uuid,uuid),public.irp_pms_pilot_approve_service_allocation(uuid,uuid,uuid,uuid,bigint,text,jsonb,text),public.irp_pms_pilot_service_day_preview(uuid,uuid),public.irp_pms_pilot_close_service_day(uuid,uuid,uuid,bigint,text),public.irp_pms_pilot_service_day_report(uuid,uuid,date,date) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_start_service_ledger(uuid,uuid,uuid,date,text),public.irp_pms_pilot_service_allocation(uuid,uuid,uuid),public.irp_pms_pilot_approve_service_allocation(uuid,uuid,uuid,uuid,bigint,text,jsonb,text),public.irp_pms_pilot_service_day_preview(uuid,uuid),public.irp_pms_pilot_close_service_day(uuid,uuid,uuid,bigint,text),public.irp_pms_pilot_service_day_report(uuid,uuid,date,date) TO authenticated;
COMMIT;

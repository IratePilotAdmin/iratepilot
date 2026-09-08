-- 175 isolated DRAFT: internal staff balance follow-up; no financial mutation.
BEGIN;

CREATE TABLE irp_pms.balance_follow_up_heads(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,reservation_id uuid NOT NULL,
 version bigint NOT NULL CHECK(version BETWEEN 1 AND 1000),current_event_id uuid NOT NULL,
 state text NOT NULL CHECK(state IN('open','completed','stopped')),
 follow_up_on date NOT NULL CHECK(isfinite(follow_up_on)),
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL CHECK(isfinite(created_at)),
 updated_at timestamptz NOT NULL CHECK(isfinite(updated_at)),
 PRIMARY KEY(tenant_id,property_id,reservation_id),
 FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.reservations(tenant_id,property_id,id)
);
CREATE TABLE irp_pms.balance_follow_up_events(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,reservation_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 recorded_at timestamptz NOT NULL CHECK(isfinite(recorded_at)),recording_time_zone text NOT NULL CHECK(length(recording_time_zone) BETWEEN 1 AND 100),
 recording_business_date date NOT NULL CHECK(isfinite(recording_business_date)),
 action text NOT NULL CHECK(action IN('schedule','reschedule','complete','stop','reopen')),
 from_version bigint NOT NULL CHECK(from_version BETWEEN 0 AND 999),
 to_version bigint NOT NULL CHECK(to_version BETWEEN 1 AND 1000 AND to_version=from_version+1),
 before_state text,before_follow_up_on date,after_state text NOT NULL,after_follow_up_on date NOT NULL CHECK(isfinite(after_follow_up_on)),
 reason text NOT NULL CHECK(length(reason) BETWEEN 4 AND 500 AND reason=btrim(reason) AND reason !~ '[[:cntrl:]]'),
 context jsonb NOT NULL CHECK(jsonb_typeof(context)='object' AND octet_length(context::text)<=8192),
 PRIMARY KEY(tenant_id,property_id,reservation_id,id),
 UNIQUE(tenant_id,property_id,reservation_id,to_version),UNIQUE(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.balance_follow_up_heads(tenant_id,property_id,reservation_id) DEFERRABLE INITIALLY DEFERRED,
 CHECK((from_version=0 AND action='schedule' AND before_state IS NULL AND before_follow_up_on IS NULL AND after_state='open')
 OR(from_version>0 AND before_state IS NOT NULL AND before_follow_up_on IS NOT NULL AND isfinite(before_follow_up_on)
 AND((action='reschedule' AND before_state='open' AND after_state='open')
 OR(action='complete' AND before_state='open' AND after_state='completed' AND after_follow_up_on=before_follow_up_on)
 OR(action='stop' AND before_state='open' AND after_state='stopped' AND after_follow_up_on=before_follow_up_on)
 OR(action='reopen' AND before_state IN('completed','stopped') AND after_state='open'))))
);
ALTER TABLE irp_pms.balance_follow_up_heads ADD CONSTRAINT balance_follow_up_head_latest
 FOREIGN KEY(tenant_id,property_id,reservation_id,current_event_id) REFERENCES irp_pms.balance_follow_up_events(tenant_id,property_id,reservation_id,id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE irp_pms.balance_follow_up_requests(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,reservation_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),outcome text NOT NULL CHECK(outcome IN('recorded','retired')),
 event_id uuid,retirement_reason text,
 command jsonb NOT NULL CHECK(jsonb_typeof(command)='object' AND octet_length(command::text)<=4096),
 result jsonb NOT NULL CHECK(jsonb_typeof(result)='object' AND octet_length(result::text)<=32768),
 recorded_at timestamptz NOT NULL CHECK(isfinite(recorded_at)),
 PRIMARY KEY(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.reservations(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,reservation_id,event_id) REFERENCES irp_pms.balance_follow_up_events(tenant_id,property_id,reservation_id,id) DEFERRABLE INITIALLY DEFERRED,
 CHECK((outcome='recorded' AND event_id IS NOT NULL AND retirement_reason IS NULL)
 OR(outcome='retired' AND event_id IS NULL AND retirement_reason IS NOT NULL AND length(retirement_reason) BETWEEN 4 AND 500 AND retirement_reason=btrim(retirement_reason) AND retirement_reason !~ '[[:cntrl:]]'))
);
ALTER TABLE irp_pms.balance_follow_up_events ADD CONSTRAINT balance_follow_up_event_request
 FOREIGN KEY(tenant_id,property_id,request_id) REFERENCES irp_pms.balance_follow_up_requests(tenant_id,property_id,request_id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX balance_follow_up_queue_state ON irp_pms.balance_follow_up_heads(tenant_id,property_id,state,follow_up_on,reservation_id);
-- Event-id-first lookup avoids property-wide scans for each current queue event.
CREATE INDEX balance_follow_up_event_lookup ON irp_pms.balance_follow_up_events(id,tenant_id,property_id,reservation_id);
ALTER TABLE irp_pms.balance_follow_up_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.balance_follow_up_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.balance_follow_up_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.balance_follow_up_heads,irp_pms.balance_follow_up_events,irp_pms.balance_follow_up_requests FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON irp_pms.balance_follow_up_heads,irp_pms.balance_follow_up_events,irp_pms.balance_follow_up_requests TO service_role;

CREATE FUNCTION irp_pms.balance_follow_up_hash(p_value jsonb) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT encode(sha256(convert_to(p_value::text,'UTF8')),'hex')
$$;
CREATE FUNCTION irp_pms.balance_follow_up_timestamp(p_value timestamptz) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
BEGIN
 IF p_value IS NULL OR NOT isfinite(p_value) THEN RAISE EXCEPTION 'A finite balance follow-up timestamp is required';END IF;
 RETURN to_char(p_value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
END $$;
CREATE FUNCTION irp_pms.balance_follow_up_date(p_value jsonb,p_nullable boolean DEFAULT false) RETURNS date
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE result date;
BEGIN
 IF p_nullable AND p_value='null'::jsonb THEN RETURN NULL;END IF;
 IF jsonb_typeof(p_value) IS DISTINCT FROM 'string' OR p_value#>>'{}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'A canonical follow-up civil date is required';END IF;
 BEGIN result:=(p_value#>>'{}')::date;EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RAISE EXCEPTION 'Invalid follow-up civil date';END;
 IF result IS NULL OR NOT isfinite(result) OR result::text IS DISTINCT FROM p_value#>>'{}' THEN RAISE EXCEPTION 'A finite follow-up civil date is required';END IF;
 RETURN result;
END $$;
CREATE FUNCTION irp_pms.normalize_balance_follow_up(p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE reservation uuid;version bigint;action text;fingerprint text;business_date date;zone text;follow_date date;reason text;result jsonb;
BEGIN
 IF p_data IS NULL OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>4096
 OR NOT(p_data?&ARRAY['reservation_id','action','expected_version','expected_context_fingerprint','expected_business_date','expected_time_zone','follow_up_on','reason','confirmed'])
 OR p_data-ARRAY['reservation_id','action','expected_version','expected_context_fingerprint','expected_business_date','expected_time_zone','follow_up_on','reason','confirmed']<>'{}'::jsonb
 OR jsonb_typeof(p_data->'reservation_id') IS DISTINCT FROM 'string' OR jsonb_typeof(p_data->'action') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_data->'expected_context_fingerprint') IS DISTINCT FROM 'string' OR jsonb_typeof(p_data->'expected_time_zone') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p_data->'reason') IS DISTINCT FROM 'string' OR p_data->'confirmed' IS DISTINCT FROM 'true'::jsonb
 THEN RAISE EXCEPTION 'Follow-up command requires its exact typed fields and confirmation';END IF;
 BEGIN reservation:=(p_data->>'reservation_id')::uuid;EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'Invalid follow-up reservation identity';END;
 IF reservation IS NULL OR reservation::text IS DISTINCT FROM p_data->>'reservation_id' THEN RAISE EXCEPTION 'A canonical reservation identity is required';END IF;
 version:=irp_pms.guest_document_number(p_data->'expected_version',0,1000);action:=p_data->>'action';fingerprint:=p_data->>'expected_context_fingerprint';
 business_date:=irp_pms.balance_follow_up_date(p_data->'expected_business_date');follow_date:=irp_pms.balance_follow_up_date(p_data->'follow_up_on',true);
 zone:=p_data->>'expected_time_zone';reason:=btrim(p_data->>'reason');
 IF action NOT IN('schedule','reschedule','complete','stop','reopen') OR fingerprint !~ '^[0-9a-f]{64}$'
 OR length(zone) NOT BETWEEN 1 AND 100 OR zone~'[[:cntrl:]]'
 OR length(reason) NOT BETWEEN 4 AND 500 OR reason~'[[:cntrl:]]'
 OR(action IN('schedule','reschedule','reopen') AND follow_date IS NULL) OR(action IN('complete','stop') AND follow_date IS NOT NULL)
 THEN RAISE EXCEPTION 'Invalid follow-up action, date, context or reason';END IF;
 result:=jsonb_build_object('reservation_id',reservation,'action',action,'expected_version',version,'expected_context_fingerprint',fingerprint,
 'expected_business_date',business_date,'expected_time_zone',zone,'follow_up_on',follow_date,'reason',reason,'confirmed',true);
 IF octet_length(result::text)>4096 THEN RAISE EXCEPTION 'Follow-up command exceeds its byte limit';END IF;
 RETURN result;
END $$;
CREATE FUNCTION irp_pms.balance_follow_up_no_effects() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('financial_changed',false,'folio_changed',false,'security_deposit_changed',false,'revenue_changed',false,'taxes_changed',false,'money_moved',false,'reservation_changed',false,'guest_message_sent',false)
$$;
CREATE FUNCTION irp_pms.balance_follow_up_semantics() RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('mode','internal_balance_follow_up','schedule_basis','staff_follow_up_date','payment_recording','external_only','debt_aging',false,'collectibility_verified',false,'payment_due_date_set',false,'settlement_verified',false,'security_funds_applied',false)
$$;

-- Private projections and the five public RPCs follow; draft remains unreviewed.

CREATE FUNCTION irp_pms.balance_follow_up_components(p_value jsonb,p_nullable boolean) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE key text;n bigint;out jsonb:='{}';known boolean:=true;
BEGIN
 IF p_value IS NULL OR jsonb_typeof(p_value) IS DISTINCT FROM 'object'
 OR NOT(p_value?&ARRAY['accommodation_minor','taxes_minor','hotel_fees_minor','ota_fees_minor','total_minor'])
 OR p_value-ARRAY['accommodation_minor','taxes_minor','hotel_fees_minor','ota_fees_minor','total_minor']<>'{}'::jsonb THEN RAISE EXCEPTION 'Balance components require the exact five amounts';END IF;
 FOREACH key IN ARRAY ARRAY['accommodation_minor','taxes_minor','hotel_fees_minor','ota_fees_minor','total_minor'] LOOP
  n:=irp_pms.guest_document_number(p_value->key,0,999999999999,p_nullable);known:=known AND n IS NOT NULL;out:=out||jsonb_build_object(key,n);
 END LOOP;
 IF known AND (out->>'accommodation_minor')::numeric+(out->>'taxes_minor')::numeric+(out->>'hotel_fees_minor')::numeric+(out->>'ota_fees_minor')::numeric IS DISTINCT FROM (out->>'total_minor')::numeric THEN RAISE EXCEPTION 'Balance component equation does not reconcile';END IF;
 RETURN out;
END $$;

CREATE FUNCTION irp_pms.balance_follow_up_context(p_res jsonb,p_opening jsonb,p_entries jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE tenant uuid;property uuid;reservation uuid;source_version bigint;arrival date;departure date;components jsonb;opening_components jsonb;current_item jsonb;opening_item jsonb;opening jsonb;
 frozen boolean;known boolean;available boolean;changed boolean:=false;current_warning boolean:=false;opening_warning boolean:=false;entry_count integer;bad bigint;ids bigint;requests bigint;
 additional numeric;reversed numeric;payments numeric;refunds numeric;corrections numeric;null_reversals numeric;charges numeric;paid numeric;balance numeric;
 entry_fingerprint text;opening_fingerprint text;pricing_fingerprint text;totals jsonb;flags jsonb;out jsonb;source_snapshot jsonb;
BEGIN
 IF jsonb_typeof(p_res) IS DISTINCT FROM 'object' OR jsonb_typeof(p_entries) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Balance source capture is incomplete';END IF;
 tenant:=(p_res->>'tenant_id')::uuid;property:=(p_res->>'property_id')::uuid;reservation:=(p_res->>'id')::uuid;
 IF tenant IS NULL OR property IS NULL OR reservation IS NULL OR p_res->>'source' IS NULL OR p_res->>'source' NOT IN('direct','migration','iratepilot-ota')
 OR p_res->>'status' IS NULL OR p_res->>'status' NOT IN('Confirmed','In house','Checked out','Cancelled')
 OR (p_res->>'cancellation_disposition'='no_show' AND p_res->>'status'<>'Cancelled') THEN RAISE EXCEPTION 'Unsupported balance reservation context';END IF;
 source_version:=irp_pms.guest_document_number(p_res->'source_version',1,9007199254740991);
 arrival:=irp_pms.balance_follow_up_date(p_res->'arrival',true);departure:=irp_pms.balance_follow_up_date(p_res->'departure',true);
 IF arrival IS NOT NULL AND departure IS NOT NULL AND departure-arrival NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Invalid balance stay interval';END IF;
 components:=irp_pms.balance_follow_up_components(jsonb_build_object('accommodation_minor',p_res->'accommodation_minor','taxes_minor',p_res->'taxes_minor','hotel_fees_minor',p_res->'hotel_fees_minor','ota_fees_minor',p_res->'ota_fees_minor','total_minor',p_res->'guest_total_minor'),true);
 SELECT bool_and(value<>'null'::jsonb) INTO known FROM jsonb_each(components);
 current_item:=irp_pms.guest_document_itemization(p_res->'charge_breakdown',components);
 IF current_item IS NOT NULL AND ((arrival IS NOT NULL AND current_item->>'arrival' IS DISTINCT FROM arrival::text) OR(departure IS NOT NULL AND current_item->>'departure' IS DISTINCT FROM departure::text)) THEN RAISE EXCEPTION 'Balance pricing dates disagree with the current stay';END IF;
 current_warning:=coalesce((current_item->>'requires_reconciliation')::boolean,false);
 IF p_res->'charge_breakdown' IS NOT NULL AND p_res->'charge_breakdown'<>'null'::jsonb THEN pricing_fingerprint:=irp_pms.balance_follow_up_hash(p_res->'charge_breakdown');END IF;
 frozen:=p_opening IS NOT NULL AND p_opening<>'null'::jsonb;available:=frozen OR known;
 entry_count:=jsonb_array_length(p_entries);IF entry_count>10000 THEN RAISE EXCEPTION 'Balance capture exceeds the complete 10000-entry limit';END IF;
 IF NOT frozen AND entry_count<>0 THEN RAISE EXCEPTION 'Balance entries require a frozen opening';END IF;
 IF frozen THEN
  IF jsonb_typeof(p_opening) IS DISTINCT FROM 'object' OR(p_opening->>'tenant_id',p_opening->>'property_id',p_opening->>'reservation_id') IS DISTINCT FROM(tenant::text,property::text,reservation::text)
  OR p_opening->>'currency' IS DISTINCT FROM 'USD' OR p_opening->>'reservation_source' IS NULL OR p_opening->>'reservation_source' NOT IN('direct','migration','iratepilot-ota') THEN RAISE EXCEPTION 'Balance opening context is incomplete';END IF;
  opening_components:=irp_pms.balance_follow_up_components(jsonb_build_object('accommodation_minor',p_opening->'accommodation_minor','taxes_minor',p_opening->'taxes_minor','hotel_fees_minor',p_opening->'hotel_fees_minor','ota_fees_minor',p_opening->'fees_minor','total_minor',p_opening->'total_minor'),false);
  opening_item:=irp_pms.guest_document_itemization(p_opening->'charge_breakdown',opening_components);
  opening:=jsonb_build_object('components',opening_components,'source',p_opening->>'reservation_source','source_version',irp_pms.guest_document_number(p_opening->'source_version',1,9007199254740991),'opened_at',irp_pms.balance_follow_up_timestamp((p_opening->>'opened_at')::timestamptz));
  changed:=opening_components IS DISTINCT FROM components OR p_opening->'charge_breakdown' IS DISTINCT FROM p_res->'charge_breakdown';
  source_snapshot:=jsonb_build_object('tenant_id',tenant,'property_id',property,'reservation_id',reservation,'currency','USD','reservation_source',p_opening->>'reservation_source','source_version',opening->'source_version','opened_at',opening->'opened_at','components',opening_components,'charge_breakdown',p_opening->'charge_breakdown');
  opening_fingerprint:=irp_pms.balance_follow_up_hash(source_snapshot);
 ELSIF known THEN
  opening_components:=components;opening_item:=current_item;
  opening:=jsonb_build_object('components',components,'source',p_res->>'source','source_version',source_version,'opened_at',NULL);
 END IF;
 opening_warning:=coalesce((opening_item->>'requires_reconciliation')::boolean,false);
 -- Validate exact captured source fields, then perform all target/cap arithmetic
 -- over a materialized typed set rather than scanning the JSON array per entry.
 -- An already validated empty array has no identities, targets or adjustments.
 IF entry_count=0 THEN
  bad:=0;ids:=0;requests:=0;additional:=0;reversed:=0;payments:=0;refunds:=0;corrections:=0;null_reversals:=0;
  entry_fingerprint:=irp_pms.balance_follow_up_hash('[]'::jsonb);
 ELSE
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_entries) e WHERE jsonb_typeof(e) IS DISTINCT FROM 'object'
 OR NOT(e?&ARRAY['tenant_id','property_id','reservation_id','id','request_id','kind','amount_minor','currency','target_entry_id','created_at'])
 OR e-ARRAY['tenant_id','property_id','reservation_id','id','request_id','kind','amount_minor','currency','target_entry_id','created_at']<>'{}'::jsonb
 OR jsonb_typeof(e->'id') IS DISTINCT FROM 'string' OR jsonb_typeof(e->'request_id') IS DISTINCT FROM 'string'
 OR jsonb_typeof(e->'kind') IS DISTINCT FROM 'string' OR jsonb_typeof(e->'target_entry_id') NOT IN('string','null')
 OR jsonb_typeof(e->'created_at') IS DISTINCT FROM 'string'
 OR(e->>'tenant_id',e->>'property_id',e->>'reservation_id',e->>'currency') IS DISTINCT FROM(tenant::text,property::text,reservation::text,'USD'))
 THEN RAISE EXCEPTION 'Malformed or cross-scope balance entry';END IF;
 WITH entries AS MATERIALIZED(
  SELECT (e->>'id')::uuid id,(e->>'request_id')::uuid request_id,e->>'kind' kind,
   irp_pms.guest_document_number(e->'amount_minor',1,999999999999) amount,(e->>'target_entry_id')::uuid target,
   (e->>'created_at')::timestamptz recorded,e
  FROM jsonb_array_elements(p_entries) e
 ), targets AS MATERIALIZED(SELECT target,sum(amount::numeric) amount FROM entries WHERE target IS NOT NULL GROUP BY target)
 SELECT count(*) FILTER(WHERE a.id IS NULL OR a.request_id IS NULL OR a.id::text IS DISTINCT FROM a.e->>'id' OR a.request_id::text IS DISTINCT FROM a.e->>'request_id'
  OR a.kind IS NULL OR a.kind NOT IN('charge','charge_reversal','external_payment','external_refund','payment_correction')
  OR a.recorded IS NULL OR NOT isfinite(a.recorded)
  OR(a.kind IN('charge','external_payment') AND a.target IS NOT NULL) OR(a.kind IN('external_refund','payment_correction') AND a.target IS NULL)
  OR(a.target IS NOT NULL AND(t.id IS NULL OR t.kind IS DISTINCT FROM CASE WHEN a.kind='charge_reversal' THEN 'charge' ELSE 'external_payment' END))
  OR(a.target IS NULL AND a.kind IN('charge','external_payment') AND coalesce(c.amount,0)>a.amount)),
  count(DISTINCT a.id),count(DISTINCT a.request_id),
  coalesce(sum(a.amount) FILTER(WHERE a.kind='charge'),0),coalesce(sum(a.amount) FILTER(WHERE a.kind='charge_reversal'),0),
  coalesce(sum(a.amount) FILTER(WHERE a.kind='external_payment'),0),coalesce(sum(a.amount) FILTER(WHERE a.kind='external_refund'),0),
  coalesce(sum(a.amount) FILTER(WHERE a.kind='payment_correction'),0),coalesce(sum(a.amount) FILTER(WHERE a.kind='charge_reversal' AND a.target IS NULL),0),
  irp_pms.balance_follow_up_hash(coalesce(jsonb_agg(jsonb_build_object('id',a.id,'request_id',a.request_id,'kind',a.kind,'amount_minor',a.amount,'currency','USD','target_entry_id',a.target) ORDER BY a.id),'[]'::jsonb))
 INTO bad,ids,requests,additional,reversed,payments,refunds,corrections,null_reversals,entry_fingerprint
 FROM entries a LEFT JOIN entries t ON t.id=a.target LEFT JOIN targets c ON c.target=a.id;
 IF bad<>0 OR ids<>entry_count OR requests<>entry_count THEN RAISE EXCEPTION 'Balance entry identities, targets or adjustment caps are invalid';END IF;
 END IF;
 IF available THEN
  IF null_reversals>(opening_components->>'total_minor')::numeric THEN RAISE EXCEPTION 'Opening reversals exceed the frozen opening';END IF;
  charges:=(opening_components->>'total_minor')::numeric+additional-reversed;paid:=payments-refunds-corrections;balance:=charges-paid;
  IF least(charges,paid)<0 OR greatest(additional,reversed,payments,refunds,corrections,charges)>999999999999 OR abs(balance)>9007199254740991 THEN RAISE EXCEPTION 'Balance totals exceed supported financial limits';END IF;
  totals:=jsonb_build_object('additional_minor',additional::bigint,'reversed_minor',reversed::bigint,'charges_minor',charges::bigint,'external_payments_minor',payments::bigint,'external_refunds_minor',refunds::bigint,'corrected_payments_minor',corrections::bigint,'recorded_paid_minor',paid::bigint,'balance_minor',balance::bigint);
 END IF;
 flags:=jsonb_build_object('reservation_amounts_changed',changed,'opening_pricing_reconciliation_required',opening_warning,'current_pricing_reconciliation_required',current_warning,'pricing_reconciliation_required',changed OR opening_warning OR current_warning);
 out:=jsonb_build_object('schema_version',1,'tenant_id',tenant,'property_id',property,'reservation_id',reservation,'currency','USD',
 'reservation',jsonb_build_object('source',p_res->>'source','source_version',source_version,'status',p_res->>'status','cancellation_kind',CASE WHEN p_res->>'cancellation_disposition'='no_show' THEN 'no_show' END,'arrival',arrival,'departure',departure),
 'current_components',components,'available',available,'unavailable_reason',CASE WHEN NOT available THEN 'reservation_charges_unavailable' END,'opening_mode',CASE WHEN frozen THEN 'frozen' WHEN known THEN 'reservation_preview' ELSE 'unavailable' END,
 'opening',opening,'totals',totals,'flags',flags,'folio_entry_count',entry_count,'source_fingerprints',jsonb_build_object('current_pricing',pricing_fingerprint,'opening',opening_fingerprint,'entries',entry_fingerprint));
 out:=out||jsonb_build_object('context_fingerprint',irp_pms.balance_follow_up_hash(out));
 IF octet_length(out::text)>8192 THEN RAISE EXCEPTION 'Balance context exceeds its complete byte limit';END IF;
 RETURN out;
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN RAISE EXCEPTION 'Invalid typed balance source';
END $$;

CREATE FUNCTION irp_pms.balance_follow_up_validate_context(p_value jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE c jsonb;oc jsonb;opening jsonb:=p_value->'opening';r jsonb:=p_value->'reservation';f jsonb:=p_value->'flags';s jsonb:=p_value->'source_fingerprints';t jsonb:=p_value->'totals';key text;n bigint;known boolean;available boolean;mode text;count_entries bigint;a date;d date;
 additional bigint;reversed bigint;charges bigint;payments bigint;refunds bigint;corrections bigint;paid bigint;balance bigint;
BEGIN
 IF jsonb_typeof(p_value) IS DISTINCT FROM 'object' OR octet_length(p_value::text)>8192
 OR NOT(p_value?&ARRAY['schema_version','tenant_id','property_id','reservation_id','currency','reservation','current_components','available','unavailable_reason','opening_mode','opening','totals','flags','folio_entry_count','source_fingerprints','context_fingerprint'])
 OR p_value-ARRAY['schema_version','tenant_id','property_id','reservation_id','currency','reservation','current_components','available','unavailable_reason','opening_mode','opening','totals','flags','folio_entry_count','source_fingerprints','context_fingerprint']<>'{}'::jsonb
 OR p_value->'schema_version' IS DISTINCT FROM '1'::jsonb OR p_value->>'currency' IS DISTINCT FROM 'USD'
 OR jsonb_typeof(p_value->'available') IS DISTINCT FROM 'boolean' OR p_value->>'context_fingerprint' IS DISTINCT FROM irp_pms.balance_follow_up_hash(p_value-'context_fingerprint') THEN RAISE EXCEPTION 'Invalid immutable balance context shape or fingerprint';END IF;
 FOREACH key IN ARRAY ARRAY['tenant_id','property_id','reservation_id'] LOOP
  IF jsonb_typeof(p_value->key) IS DISTINCT FROM 'string' OR (p_value->>key)::uuid::text IS DISTINCT FROM p_value->>key THEN RAISE EXCEPTION 'Invalid balance context identity';END IF;
 END LOOP;
 IF jsonb_typeof(r) IS DISTINCT FROM 'object' OR NOT(r?&ARRAY['source','source_version','status','cancellation_kind','arrival','departure']) OR r-ARRAY['source','source_version','status','cancellation_kind','arrival','departure']<>'{}'::jsonb
 OR r->>'source' IS NULL OR r->>'source' NOT IN('direct','migration','iratepilot-ota') OR r->>'status' IS NULL OR r->>'status' NOT IN('Confirmed','In house','Checked out','Cancelled')
 OR(r->'cancellation_kind'<>'null'::jsonb AND (r->>'cancellation_kind' IS DISTINCT FROM 'no_show' OR r->>'status'<>'Cancelled')) THEN RAISE EXCEPTION 'Invalid historical booking context';END IF;
 PERFORM irp_pms.guest_document_number(r->'source_version',1,9007199254740991);a:=irp_pms.balance_follow_up_date(r->'arrival',true);d:=irp_pms.balance_follow_up_date(r->'departure',true);
 IF a IS NOT NULL AND d IS NOT NULL AND d-a NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Invalid historical stay dates';END IF;
 c:=irp_pms.balance_follow_up_components(p_value->'current_components',true);SELECT bool_and(value<>'null'::jsonb) INTO known FROM jsonb_each(c);
 IF jsonb_typeof(f) IS DISTINCT FROM 'object' OR NOT(f?&ARRAY['reservation_amounts_changed','opening_pricing_reconciliation_required','current_pricing_reconciliation_required','pricing_reconciliation_required']) OR f-ARRAY['reservation_amounts_changed','opening_pricing_reconciliation_required','current_pricing_reconciliation_required','pricing_reconciliation_required']<>'{}'::jsonb
 OR EXISTS(SELECT 1 FROM jsonb_each(f) x WHERE jsonb_typeof(x.value) IS DISTINCT FROM 'boolean')
 OR(f->>'pricing_reconciliation_required')::boolean IS DISTINCT FROM ((f->>'reservation_amounts_changed')::boolean OR(f->>'opening_pricing_reconciliation_required')::boolean OR(f->>'current_pricing_reconciliation_required')::boolean) THEN RAISE EXCEPTION 'Historical pricing flags do not reconcile';END IF;
 IF jsonb_typeof(s) IS DISTINCT FROM 'object' OR NOT(s?&ARRAY['current_pricing','opening','entries']) OR s-ARRAY['current_pricing','opening','entries']<>'{}'::jsonb
 OR jsonb_typeof(s->'entries') IS DISTINCT FROM 'string' OR s->>'entries' !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid source fingerprint set';END IF;
 FOREACH key IN ARRAY ARRAY['current_pricing','opening'] LOOP
  IF s->key<>'null'::jsonb AND(jsonb_typeof(s->key) IS DISTINCT FROM 'string' OR s->>key !~ '^[0-9a-f]{64}$') THEN RAISE EXCEPTION 'Invalid optional source fingerprint';END IF;
 END LOOP;
 count_entries:=irp_pms.guest_document_number(p_value->'folio_entry_count',0,10000);available:=(p_value->>'available')::boolean;mode:=p_value->>'opening_mode';
 IF mode IS NULL OR mode NOT IN('unavailable','frozen','reservation_preview') THEN RAISE EXCEPTION 'Invalid balance opening mode';END IF;
 IF available THEN
  IF p_value->'unavailable_reason' IS DISTINCT FROM 'null'::jsonb OR mode='unavailable' OR jsonb_typeof(opening) IS DISTINCT FROM 'object'
  OR NOT(opening?&ARRAY['components','source','source_version','opened_at']) OR opening-ARRAY['components','source','source_version','opened_at']<>'{}'::jsonb
  OR opening->>'source' IS NULL OR opening->>'source' NOT IN('direct','migration','iratepilot-ota') THEN RAISE EXCEPTION 'Known historical balance needs an exact opening basis';END IF;
  oc:=irp_pms.balance_follow_up_components(opening->'components',false);PERFORM irp_pms.guest_document_number(opening->'source_version',1,9007199254740991);
  IF mode='frozen' THEN
   IF jsonb_typeof(s->'opening') IS DISTINCT FROM 'string' OR jsonb_typeof(opening->'opened_at') IS DISTINCT FROM 'string' OR opening->>'opened_at' IS DISTINCT FROM irp_pms.balance_follow_up_timestamp((opening->>'opened_at')::timestamptz)
   OR(oc IS DISTINCT FROM c AND f->'reservation_amounts_changed' IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION 'Frozen balance context is incomplete';END IF;
  ELSE
   IF NOT known OR oc IS DISTINCT FROM c OR(opening->'source',opening->'source_version') IS DISTINCT FROM(r->'source',r->'source_version') OR opening->'opened_at' IS DISTINCT FROM 'null'::jsonb OR s->'opening' IS DISTINCT FROM 'null'::jsonb OR count_entries<>0
   OR f->'reservation_amounts_changed' IS DISTINCT FROM 'false'::jsonb OR f->'opening_pricing_reconciliation_required' IS DISTINCT FROM f->'current_pricing_reconciliation_required' THEN RAISE EXCEPTION 'Unposted balance preview context is inconsistent';END IF;
  END IF;
  IF jsonb_typeof(t) IS DISTINCT FROM 'object' OR NOT(t?&ARRAY['additional_minor','reversed_minor','charges_minor','external_payments_minor','external_refunds_minor','corrected_payments_minor','recorded_paid_minor','balance_minor']) OR t-ARRAY['additional_minor','reversed_minor','charges_minor','external_payments_minor','external_refunds_minor','corrected_payments_minor','recorded_paid_minor','balance_minor']<>'{}'::jsonb THEN RAISE EXCEPTION 'Historical balance totals are incomplete';END IF;
  additional:=irp_pms.guest_document_number(t->'additional_minor');reversed:=irp_pms.guest_document_number(t->'reversed_minor');charges:=irp_pms.guest_document_number(t->'charges_minor');payments:=irp_pms.guest_document_number(t->'external_payments_minor');refunds:=irp_pms.guest_document_number(t->'external_refunds_minor');corrections:=irp_pms.guest_document_number(t->'corrected_payments_minor');paid:=irp_pms.guest_document_number(t->'recorded_paid_minor');balance:=irp_pms.guest_document_number(t->'balance_minor',-9007199254740991,9007199254740991);
  IF charges IS DISTINCT FROM (oc->>'total_minor')::bigint+additional-reversed OR paid IS DISTINCT FROM payments-refunds-corrections OR balance IS DISTINCT FROM charges-paid OR(count_entries=0 AND greatest(additional,reversed,payments,refunds,corrections)<>0) THEN RAISE EXCEPTION 'Historical balance equations do not reconcile';END IF;
 ELSE
  IF known OR mode<>'unavailable' OR p_value->>'unavailable_reason' IS DISTINCT FROM 'reservation_charges_unavailable' OR opening IS DISTINCT FROM 'null'::jsonb OR t IS DISTINCT FROM 'null'::jsonb OR count_entries<>0 OR s->'opening' IS DISTINCT FROM 'null'::jsonb
  OR f->'reservation_amounts_changed' IS DISTINCT FROM 'false'::jsonb OR f->'opening_pricing_reconciliation_required' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'Unavailable balance must remain explicitly unknown';END IF;
 END IF;
 IF count_entries=0 AND s->>'entries' IS DISTINCT FROM irp_pms.balance_follow_up_hash('[]'::jsonb) THEN RAISE EXCEPTION 'Empty source history fingerprint does not match';END IF;
 RETURN p_value;
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN RAISE EXCEPTION 'Invalid typed historical balance context';
END $$;

CREATE FUNCTION irp_pms.balance_follow_up_event_json(p_row irp_pms.balance_follow_up_events) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('id',p_row.id,'tenant_id',p_row.tenant_id,'property_id',p_row.property_id,'reservation_id',p_row.reservation_id,'request_id',p_row.request_id,'actor_id',p_row.actor_id,
 'recorded_at',irp_pms.balance_follow_up_timestamp(p_row.recorded_at),'recording_time_zone',p_row.recording_time_zone,'recording_business_date',p_row.recording_business_date,
 'action',p_row.action,'from_version',p_row.from_version,'to_version',p_row.to_version,
 'before',CASE WHEN p_row.from_version>0 THEN jsonb_build_object('state',p_row.before_state,'follow_up_on',p_row.before_follow_up_on) END,
 'after',jsonb_build_object('state',p_row.after_state,'follow_up_on',p_row.after_follow_up_on),'reason',p_row.reason,'context',p_row.context)
$$;
CREATE FUNCTION irp_pms.balance_follow_up_event_command(p_row irp_pms.balance_follow_up_events) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT irp_pms.normalize_balance_follow_up(jsonb_build_object('reservation_id',p_row.reservation_id,'action',p_row.action,'expected_version',p_row.from_version,'expected_context_fingerprint',p_row.context->>'context_fingerprint','expected_business_date',p_row.recording_business_date,'expected_time_zone',p_row.recording_time_zone,'follow_up_on',CASE WHEN p_row.action IN('schedule','reschedule','reopen') THEN p_row.after_follow_up_on END,'reason',p_row.reason,'confirmed',true))
$$;
CREATE FUNCTION irp_pms.balance_follow_up_result(p_row irp_pms.balance_follow_up_events) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('schema_version',1,'outcome','recorded','action','save_balance_follow_up','tenant_id',p_row.tenant_id,'property_id',p_row.property_id,'reservation_id',p_row.reservation_id,'request_id',p_row.request_id,'command',irp_pms.balance_follow_up_event_command(p_row),'event',irp_pms.balance_follow_up_event_json(p_row),'expected_version',p_row.from_version,'version',p_row.to_version,'financial_effects',irp_pms.balance_follow_up_no_effects(),'semantics',irp_pms.balance_follow_up_semantics(),'replayed',false)
$$;
CREATE FUNCTION irp_pms.balance_follow_up_retired_result(p_row irp_pms.balance_follow_up_requests) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('schema_version',1,'outcome','retired','action','retire_balance_follow_up_request','tenant_id',p_row.tenant_id,'property_id',p_row.property_id,'reservation_id',p_row.reservation_id,'request_id',p_row.request_id,'command',p_row.command,'retirement_reason',p_row.retirement_reason,'retired_by',p_row.actor_id,'retired_at',irp_pms.balance_follow_up_timestamp(p_row.recorded_at),'follow_up_version_changed',false,'financial_effects',irp_pms.balance_follow_up_no_effects(),'semantics',irp_pms.balance_follow_up_semantics(),'replayed',false)
$$;
CREATE FUNCTION irp_pms.balance_follow_up_head_json(p_row irp_pms.balance_follow_up_heads) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('version',p_row.version,'current_event_id',p_row.current_event_id,'state',p_row.state,'follow_up_on',p_row.follow_up_on,'created_by',p_row.created_by,'created_at',irp_pms.balance_follow_up_timestamp(p_row.created_at),'updated_at',irp_pms.balance_follow_up_timestamp(p_row.updated_at))
$$;

CREATE FUNCTION irp_pms.balance_follow_up_capture(p_tenant uuid,p_property uuid,p_reservation uuid,p_with_history boolean DEFAULT true) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 -- FOLLOWUP175_DETAIL_CAPTURE_BEGIN: one persistent relational statement.
 WITH entries AS MATERIALIZED(
  SELECT e.tenant_id,e.property_id,e.reservation_id,e.id,e.request_id,e.kind,e.amount_minor,e.currency,e.target_entry_id,e.created_at
  FROM irp_pms.folio_entries e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.reservation_id=p_reservation ORDER BY e.id LIMIT 10001
 ), history AS MATERIALIZED(
  SELECT e.* FROM irp_pms.balance_follow_up_events e WHERE p_with_history AND e.tenant_id=p_tenant AND e.property_id=p_property AND e.reservation_id=p_reservation ORDER BY e.to_version LIMIT 1001
 )
 SELECT jsonb_build_object('tenant_id',p_tenant,'property_id',p_property,'reservation_id',p_reservation,
 'property',jsonb_build_object('tenant_id',p.tenant_id,'id',p.id,'name',p.name,'currency',p.currency,'time_zone',p.time_zone,'operating_model',p.operating_model),
 'zone_supported',EXISTS(SELECT 1 FROM pg_timezone_names z WHERE z.name=p.time_zone),
 'reservation',jsonb_build_object('tenant_id',r.tenant_id,'property_id',r.property_id,'id',r.id,'source',r.source,'source_booking_id',r.source_booking_id,'source_version',r.source_version,'status',r.status,'cancellation_disposition',r.cancellation_disposition,'arrival',r.arrival,'departure',r.departure,'accommodation_minor',r.accommodation_minor,'taxes_minor',r.taxes_minor,'hotel_fees_minor',r.hotel_fees_minor,'ota_fees_minor',r.ota_fees_minor,'guest_total_minor',r.guest_total_minor,'charge_breakdown',r.charge_breakdown),
 'opening',CASE WHEN o.reservation_id IS NOT NULL THEN jsonb_build_object('tenant_id',o.tenant_id,'property_id',o.property_id,'reservation_id',o.reservation_id,'currency',o.currency,'reservation_source',o.reservation_source,'source_version',o.source_version,'opened_at',o.opened_at,'accommodation_minor',o.accommodation_minor,'taxes_minor',o.taxes_minor,'hotel_fees_minor',o.hotel_fees_minor,'fees_minor',o.fees_minor,'total_minor',o.total_minor,'charge_breakdown',o.charge_breakdown) END,
 'entries',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM entries e),'[]'::jsonb),
 'head',CASE WHEN h.reservation_id IS NOT NULL THEN to_jsonb(h) END,
 'events',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.to_version) FROM history e),'[]'::jsonb),
 'requests',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY e.to_version) FROM history e LEFT JOIN irp_pms.balance_follow_up_requests q ON q.tenant_id=e.tenant_id AND q.property_id=e.property_id AND q.request_id=e.request_id),'[]'::jsonb))
 FROM irp_pms.properties p JOIN irp_pms.reservations r ON r.tenant_id=p.tenant_id AND r.property_id=p.id AND r.id=p_reservation
 LEFT JOIN irp_pms.folio_openings o ON o.tenant_id=r.tenant_id AND o.property_id=r.property_id AND o.reservation_id=r.id
 LEFT JOIN irp_pms.balance_follow_up_heads h ON p_with_history AND h.tenant_id=r.tenant_id AND h.property_id=r.property_id AND h.reservation_id=r.id
 WHERE p.tenant_id=p_tenant AND p.id=p_property
 -- FOLLOWUP175_DETAIL_CAPTURE_END: all later projections use these values.
$$;

CREATE FUNCTION irp_pms.balance_follow_up_validate_event(p_row irp_pms.balance_follow_up_events,p_request irp_pms.balance_follow_up_requests,p_zone_supported boolean DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE command jsonb;event jsonb;expected_result jsonb;
BEGIN
 IF p_row.id IS NULL OR p_row.actor_id IS NULL OR p_row.request_id IS NULL OR p_row.tenant_id IS NULL OR p_row.property_id IS NULL OR p_row.reservation_id IS NULL
 OR p_row.from_version IS NULL OR p_row.to_version IS NULL OR p_row.from_version NOT BETWEEN 0 AND 999 OR p_row.to_version<>p_row.from_version+1
 OR p_row.reason IS NULL OR p_row.reason<>btrim(p_row.reason) OR p_row.recording_business_date IS NULL OR NOT isfinite(p_row.recording_business_date)
 OR p_row.recording_time_zone IS NULL OR coalesce(p_zone_supported,EXISTS(SELECT 1 FROM pg_timezone_names z WHERE z.name=p_row.recording_time_zone)) IS DISTINCT FROM true
 OR p_row.recorded_at IS NULL OR NOT isfinite(p_row.recorded_at) OR (p_row.recorded_at AT TIME ZONE p_row.recording_time_zone)::date IS DISTINCT FROM p_row.recording_business_date THEN RAISE EXCEPTION 'Invalid immutable follow-up event identity or recording context';END IF;
 IF ((p_row.from_version=0 AND p_row.action='schedule' AND p_row.before_state IS NULL AND p_row.before_follow_up_on IS NULL AND p_row.after_state='open')
 OR(p_row.from_version>0 AND p_row.before_state IS NOT NULL AND p_row.before_follow_up_on IS NOT NULL AND isfinite(p_row.before_follow_up_on)
 AND((p_row.action='reschedule' AND p_row.before_state='open' AND p_row.after_state='open')
 OR(p_row.action='complete' AND p_row.before_state='open' AND p_row.after_state='completed' AND p_row.after_follow_up_on=p_row.before_follow_up_on)
 OR(p_row.action='stop' AND p_row.before_state='open' AND p_row.after_state='stopped' AND p_row.after_follow_up_on=p_row.before_follow_up_on)
 OR(p_row.action='reopen' AND p_row.before_state IN('completed','stopped') AND p_row.after_state='open')))) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Invalid follow-up transition';END IF;
 IF p_row.after_follow_up_on IS NULL OR NOT isfinite(p_row.after_follow_up_on)
 OR(p_row.action IN('schedule','reschedule','reopen') AND p_row.after_follow_up_on NOT BETWEEN p_row.recording_business_date AND p_row.recording_business_date+365) THEN RAISE EXCEPTION 'Invalid recorded staff follow-up date';END IF;
 PERFORM irp_pms.balance_follow_up_validate_context(p_row.context);
 IF(p_row.context->>'tenant_id',p_row.context->>'property_id',p_row.context->>'reservation_id') IS DISTINCT FROM(p_row.tenant_id::text,p_row.property_id::text,p_row.reservation_id::text) THEN RAISE EXCEPTION 'Follow-up context belongs to another reservation';END IF;
 expected_result:=irp_pms.balance_follow_up_result(p_row);command:=expected_result->'command';event:=expected_result->'event';
 IF p_request.request_id IS NULL OR(p_request.tenant_id,p_request.property_id,p_request.reservation_id,p_request.request_id,p_request.actor_id,p_request.event_id,p_request.recorded_at,p_request.outcome)
 IS DISTINCT FROM(p_row.tenant_id,p_row.property_id,p_row.reservation_id,p_row.request_id,p_row.actor_id,p_row.id,p_row.recorded_at,'recorded'::text)
 OR p_request.retirement_reason IS NOT NULL OR p_request.command IS DISTINCT FROM command OR p_request.result IS DISTINCT FROM expected_result
 THEN RAISE EXCEPTION 'Follow-up event needs its exact immutable accepted request receipt';END IF;
 RETURN event;
END $$;

CREATE FUNCTION irp_pms.balance_follow_up_history(p_head jsonb,p_events jsonb,p_requests jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE h irp_pms.balance_follow_up_heads;e irp_pms.balance_follow_up_events;q irp_pms.balance_follow_up_requests;previous irp_pms.balance_follow_up_events;
 n integer;i integer;out jsonb:='[]';event jsonb;zones jsonb;
BEGIN
 IF jsonb_typeof(p_events) IS DISTINCT FROM 'array' OR jsonb_typeof(p_requests) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Follow-up history capture is incomplete';END IF;
 n:=jsonb_array_length(p_events);
 IF n>1000 OR jsonb_array_length(p_requests)<>n THEN RAISE EXCEPTION 'Follow-up history count exceeds or differs from its complete receipt count';END IF;
 IF p_head IS NULL OR p_head='null'::jsonb THEN
  IF n<>0 THEN RAISE EXCEPTION 'Follow-up history has no head';END IF;RETURN out;
 END IF;
 IF jsonb_typeof(p_head) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid follow-up head';END IF;
 h:=jsonb_populate_record(NULL::irp_pms.balance_follow_up_heads,p_head);
 IF h.version IS NULL OR h.version NOT BETWEEN 1 AND 1000 OR h.version<>n OR h.created_by IS NULL THEN RAISE EXCEPTION 'Follow-up head version does not match complete history';END IF;
 IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_events) x)<>n OR(SELECT count(DISTINCT x->>'request_id') FROM jsonb_array_elements(p_events) x)<>n THEN RAISE EXCEPTION 'Duplicate or missing follow-up event identities';END IF;
 SELECT coalesce(jsonb_object_agg(z.name,true),'{}'::jsonb) INTO zones FROM pg_timezone_names z WHERE z.name IN(SELECT x->>'recording_time_zone' FROM jsonb_array_elements(p_events) x);
 FOR i IN 0..n-1 LOOP
  IF jsonb_typeof(p_events->i) IS DISTINCT FROM 'object' OR jsonb_typeof(p_requests->i) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Missing follow-up event or request';END IF;
  e:=jsonb_populate_record(NULL::irp_pms.balance_follow_up_events,p_events->i);q:=jsonb_populate_record(NULL::irp_pms.balance_follow_up_requests,p_requests->i);
  IF(e.tenant_id,e.property_id,e.reservation_id,e.from_version,e.to_version) IS DISTINCT FROM(h.tenant_id,h.property_id,h.reservation_id,i::bigint,(i+1)::bigint) THEN RAISE EXCEPTION 'Follow-up event scope or version is not contiguous';END IF;
  event:=irp_pms.balance_follow_up_validate_event(e,q,coalesce((zones->>e.recording_time_zone)::boolean,false));
  IF i=0 THEN
   IF(h.created_by,h.created_at) IS DISTINCT FROM(e.actor_id,e.recorded_at) THEN RAISE EXCEPTION 'Follow-up creation metadata differs from its first action';END IF;
  ELSIF(e.before_state,e.before_follow_up_on) IS DISTINCT FROM(previous.after_state,previous.after_follow_up_on) THEN RAISE EXCEPTION 'Follow-up state history is not adjacent';END IF;
  out:=out||jsonb_build_array(event);previous:=e;
 END LOOP;
 IF(h.current_event_id,h.updated_at,h.state,h.follow_up_on) IS DISTINCT FROM(e.id,e.recorded_at,e.after_state,e.after_follow_up_on) THEN RAISE EXCEPTION 'Follow-up head differs from its current event';END IF;
 IF octet_length(out::text)>3145728 THEN RAISE EXCEPTION 'Follow-up complete history exceeds its 3MiB limit';END IF;
 RETURN out;
END $$;

CREATE FUNCTION irp_pms.balance_follow_up_history_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_NAME<>'balance_follow_up_heads' OR TG_OP='DELETE' THEN RAISE EXCEPTION 'Follow-up events and requests are immutable; heads cannot be deleted';END IF;
 IF(NEW.tenant_id,NEW.property_id,NEW.reservation_id,NEW.created_by,NEW.created_at) IS DISTINCT FROM(OLD.tenant_id,OLD.property_id,OLD.reservation_id,OLD.created_by,OLD.created_at)
 OR NEW.version IS NULL OR NEW.version IS DISTINCT FROM OLD.version+1 THEN RAISE EXCEPTION 'Follow-up head identity is immutable and version must advance exactly once';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER balance_follow_up_head_immutable BEFORE UPDATE OR DELETE ON irp_pms.balance_follow_up_heads FOR EACH ROW EXECUTE FUNCTION irp_pms.balance_follow_up_history_guard();
CREATE TRIGGER balance_follow_up_event_immutable BEFORE UPDATE OR DELETE ON irp_pms.balance_follow_up_events FOR EACH ROW EXECUTE FUNCTION irp_pms.balance_follow_up_history_guard();
CREATE TRIGGER balance_follow_up_request_immutable BEFORE UPDATE OR DELETE ON irp_pms.balance_follow_up_requests FOR EACH ROW EXECUTE FUNCTION irp_pms.balance_follow_up_history_guard();

CREATE FUNCTION irp_pms.balance_follow_up_insert_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE captured jsonb;current_context jsonb;h irp_pms.balance_follow_up_heads;
BEGIN
 PERFORM 1 FROM irp_pms.tenants WHERE id=NEW.tenant_id FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
 PERFORM 1 FROM irp_pms.reservations WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.reservation_id FOR UPDATE;
 SELECT * INTO h FROM irp_pms.balance_follow_up_heads WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND reservation_id=NEW.reservation_id FOR UPDATE;
 IF(h.version,h.current_event_id,h.state,h.follow_up_on) IS DISTINCT FROM(NEW.to_version,NEW.id,NEW.after_state,NEW.after_follow_up_on) THEN RAISE EXCEPTION 'A new follow-up event must match its prospective head';END IF;
 captured:=irp_pms.balance_follow_up_capture(NEW.tenant_id,NEW.property_id,NEW.reservation_id,false);
 IF captured IS NULL THEN RAISE EXCEPTION 'Unknown follow-up source reservation';END IF;
 IF NEW.recording_time_zone IS DISTINCT FROM captured->'property'->>'time_zone' OR captured->'zone_supported' IS DISTINCT FROM 'true'::jsonb
 OR NEW.recorded_at IS NULL OR NOT isfinite(NEW.recorded_at) OR NEW.recording_business_date IS DISTINCT FROM (NEW.recorded_at AT TIME ZONE NEW.recording_time_zone)::date
 THEN RAISE EXCEPTION 'A new follow-up event must retain the currently locked property recording zone and date';END IF;
 current_context:=irp_pms.balance_follow_up_context(captured->'reservation',captured->'opening',captured->'entries');
 IF NEW.context IS DISTINCT FROM current_context THEN RAISE EXCEPTION 'A new follow-up event must retain the currently locked balance context';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER balance_follow_up_current_context BEFORE INSERT ON irp_pms.balance_follow_up_events FOR EACH ROW EXECUTE FUNCTION irp_pms.balance_follow_up_insert_guard();

CREATE FUNCTION irp_pms.balance_follow_up_consistency() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE head jsonb;events jsonb;requests jsonb;r irp_pms.balance_follow_up_requests;accepted_event irp_pms.balance_follow_up_events;
BEGIN
 IF TG_TABLE_NAME='balance_follow_up_requests' THEN
  SELECT * INTO r FROM irp_pms.balance_follow_up_requests WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND request_id=NEW.request_id;
  IF r.command IS DISTINCT FROM irp_pms.normalize_balance_follow_up(r.command) OR r.command->>'reservation_id' IS DISTINCT FROM r.reservation_id::text THEN RAISE EXCEPTION 'Follow-up request command is not canonical and scoped';END IF;
  IF r.outcome='retired' THEN
   IF r.result IS DISTINCT FROM irp_pms.balance_follow_up_retired_result(r) OR EXISTS(SELECT 1 FROM irp_pms.balance_follow_up_events e WHERE e.tenant_id=r.tenant_id AND e.property_id=r.property_id AND e.request_id=r.request_id) THEN RAISE EXCEPTION 'Retired follow-up request cannot contain an accepted event';END IF;
   RETURN NULL;
  END IF;
  SELECT * INTO accepted_event FROM irp_pms.balance_follow_up_events WHERE tenant_id=r.tenant_id AND property_id=r.property_id AND reservation_id=r.reservation_id AND id=r.event_id;
  PERFORM irp_pms.balance_follow_up_validate_event(accepted_event,r);
  RETURN NULL;
 END IF;
 SELECT to_jsonb(h) INTO head FROM irp_pms.balance_follow_up_heads h WHERE h.tenant_id=NEW.tenant_id AND h.property_id=NEW.property_id AND h.reservation_id=NEW.reservation_id;
 IF head IS NULL THEN RAISE EXCEPTION 'Accepted follow-up history needs its head';END IF;
 -- At deferred flush, earlier append callbacks need not repeat the same final
 -- chain proof. The latest head and event callbacks remain queued and validate
 -- every immutable event, request and before/after transition below.
 IF TG_TABLE_NAME='balance_follow_up_heads' THEN
  IF NEW.version IS DISTINCT FROM (head->>'version')::bigint THEN RETURN NULL;END IF;
 ELSE
  IF NEW.to_version IS DISTINCT FROM (head->>'version')::bigint THEN RETURN NULL;END IF;
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.to_version),'[]'::jsonb),coalesce(jsonb_agg(to_jsonb(q) ORDER BY e.to_version),'[]'::jsonb) INTO events,requests
 FROM irp_pms.balance_follow_up_events e LEFT JOIN irp_pms.balance_follow_up_requests q ON q.tenant_id=e.tenant_id AND q.property_id=e.property_id AND q.request_id=e.request_id
 WHERE e.tenant_id=NEW.tenant_id AND e.property_id=NEW.property_id AND e.reservation_id=NEW.reservation_id;
 PERFORM irp_pms.balance_follow_up_history(head,events,requests);
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER balance_follow_up_head_consistency AFTER INSERT OR UPDATE ON irp_pms.balance_follow_up_heads DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.balance_follow_up_consistency();
CREATE CONSTRAINT TRIGGER balance_follow_up_event_consistency AFTER INSERT ON irp_pms.balance_follow_up_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.balance_follow_up_consistency();
CREATE CONSTRAINT TRIGGER balance_follow_up_request_consistency AFTER INSERT ON irp_pms.balance_follow_up_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.balance_follow_up_consistency();

CREATE FUNCTION irp_pms.balance_follow_up_detail_projection(p_capture jsonb,p_actor uuid,p_role text,p_generated timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE prop jsonb;booking jsonb;context jsonb;events jsonb;current_event jsonb;h irp_pms.balance_follow_up_heads;version bigint:=0;head_json jsonb;out jsonb;
BEGIN
 IF p_capture IS NULL OR p_actor IS NULL OR p_role IS NULL OR p_role NOT IN('owner','manager','staff') OR p_generated IS NULL OR NOT isfinite(p_generated) THEN RAISE EXCEPTION 'Incomplete follow-up prepared detail';END IF;
 prop:=irp_pms.payment_review_property(p_capture->'property',(p_capture->>'zone_supported')::boolean);booking:=irp_pms.payment_review_booking(p_capture->'reservation');
 context:=irp_pms.balance_follow_up_context(p_capture->'reservation',p_capture->'opening',p_capture->'entries');
 IF(p_capture->>'tenant_id',p_capture->>'property_id',p_capture->>'reservation_id') IS DISTINCT FROM(context->>'tenant_id',context->>'property_id',context->>'reservation_id')
 OR(p_capture->'property'->>'tenant_id',prop->>'id',booking->>'id') IS DISTINCT FROM(context->>'tenant_id',context->>'property_id',context->>'reservation_id') THEN RAISE EXCEPTION 'Follow-up detail crosses scope';END IF;
 events:=irp_pms.balance_follow_up_history(p_capture->'head',p_capture->'events',p_capture->'requests');
 IF p_capture->'head' IS NOT NULL AND p_capture->'head'<>'null'::jsonb THEN
  h:=jsonb_populate_record(NULL::irp_pms.balance_follow_up_heads,p_capture->'head');
  IF(h.tenant_id::text,h.property_id::text,h.reservation_id::text) IS DISTINCT FROM(context->>'tenant_id',context->>'property_id',context->>'reservation_id') THEN RAISE EXCEPTION 'Follow-up head belongs to another reservation';END IF;
  version:=h.version;head_json:=irp_pms.balance_follow_up_head_json(h);current_event:=events->(version::integer-1);
 END IF;
 out:=jsonb_build_object('schema_version',1,'tenant_id',context->'tenant_id','property_id',context->'property_id','reservation_id',context->'reservation_id','actor_id',p_actor,'role',p_role,'can_manage',p_role IN('owner','manager'),'generated_at',irp_pms.balance_follow_up_timestamp(p_generated),'property_business_date',(p_generated AT TIME ZONE(prop->>'time_zone'))::date,'property',prop,'reservation',booking,
 'recorded',version>0,'version',version,'head',head_json,'current_event',current_event,'events',events,'current_context',context,
 'context_changed_since_recording',version>0 AND context->>'context_fingerprint' IS DISTINCT FROM current_event->'context'->>'context_fingerprint',
 'schedule_zone_changed',version>0 AND prop->>'time_zone' IS DISTINCT FROM current_event->>'recording_time_zone','events_truncated',false,'financial_effects',irp_pms.balance_follow_up_no_effects(),'semantics',irp_pms.balance_follow_up_semantics());
 IF octet_length((out-'events')::text)>65536 OR octet_length(out::text)>4194304 THEN RAISE EXCEPTION 'Follow-up detail exceeds its complete readable byte limit';END IF;
 RETURN out;
END $$;

CREATE FUNCTION public.irp_pms_pilot_balance_follow_up(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE role text;generated timestamptz;capture jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_reservation IS NULL THEN RAISE EXCEPTION 'A scoped reservation is required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 role:=irp_pms.pilot_require(p_tenant,p_property);generated:=clock_timestamp();
 capture:=irp_pms.balance_follow_up_capture(p_tenant,p_property,p_reservation);
 IF capture IS NULL THEN RAISE EXCEPTION 'Unknown scoped follow-up reservation';END IF;
 RETURN irp_pms.balance_follow_up_detail_projection(capture,auth.uid(),role,generated);
END $$;

CREATE FUNCTION public.irp_pms_pilot_save_balance_follow_up(p_tenant uuid,p_property uuid,p_request uuid,p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE command jsonb;reservation uuid;role text;prior irp_pms.balance_follow_up_requests;request irp_pms.balance_follow_up_requests;
 h irp_pms.balance_follow_up_heads;e irp_pms.balance_follow_up_events;has_head boolean;version bigint;generated timestamptz;capture jsonb;detail jsonb;prospective jsonb;current_context jsonb;business_date date;zone text;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL THEN RAISE EXCEPTION 'A follow-up request identity is required';END IF;
 command:=irp_pms.normalize_balance_follow_up(p_command);reservation:=(command->>'reservation_id')::uuid;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 role:=irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped follow-up reservation';END IF;
 SELECT * INTO prior FROM irp_pms.balance_follow_up_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF(prior.reservation_id,prior.actor_id) IS DISTINCT FROM(reservation,auth.uid()) OR prior.command IS DISTINCT FROM command THEN RAISE EXCEPTION 'Follow-up request identity already used';END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO h FROM irp_pms.balance_follow_up_heads WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=reservation FOR UPDATE;
 has_head:=FOUND;version:=CASE WHEN has_head THEN h.version ELSE 0 END;
 IF version IS DISTINCT FROM(command->>'expected_version')::bigint THEN RAISE EXCEPTION 'Follow-up version changed; refresh before acting' USING ERRCODE='PT409';END IF;
 generated:=clock_timestamp();capture:=irp_pms.balance_follow_up_capture(p_tenant,p_property,reservation);
 detail:=irp_pms.balance_follow_up_detail_projection(capture,auth.uid(),role,generated);current_context:=detail->'current_context';zone:=detail->'property'->>'time_zone';business_date:=(detail->>'property_business_date')::date;
 IF current_context->>'context_fingerprint' IS DISTINCT FROM command->>'expected_context_fingerprint' THEN RAISE EXCEPTION 'Balance or booking context changed; refresh before acting' USING ERRCODE='PT409';END IF;
 IF(zone,business_date::text) IS DISTINCT FROM(command->>'expected_time_zone',command->>'expected_business_date') THEN RAISE EXCEPTION 'Property date or time zone changed; review the staff follow-up date again' USING ERRCODE='PT412';END IF;
 IF version>=1000 THEN RAISE EXCEPTION 'This reservation has reached 1000 follow-up actions; history and request recovery remain available';END IF;
 IF NOT((version=0 AND command->>'action'='schedule') OR(version>0 AND h.state='open' AND command->>'action' IN('reschedule','complete','stop')) OR(version>0 AND h.state IN('completed','stopped') AND command->>'action'='reopen')) THEN RAISE EXCEPTION 'Follow-up action is not allowed in its current state';END IF;
 IF command->>'action' IN('schedule','reschedule','reopen') AND(command->>'follow_up_on')::date NOT BETWEEN business_date AND business_date+365 THEN RAISE EXCEPTION 'Staff follow-up date must be within today and the next 365 days';END IF;
 e.tenant_id:=p_tenant;e.property_id:=p_property;e.reservation_id:=reservation;e.id:=gen_random_uuid();e.request_id:=p_request;e.actor_id:=auth.uid();e.recorded_at:=generated;e.recording_time_zone:=zone;e.recording_business_date:=business_date;e.action:=command->>'action';e.from_version:=version;e.to_version:=version+1;
 e.before_state:=CASE WHEN has_head THEN h.state END;e.before_follow_up_on:=CASE WHEN has_head THEN h.follow_up_on END;
 e.after_state:=CASE e.action WHEN 'complete' THEN 'completed' WHEN 'stop' THEN 'stopped' ELSE 'open' END;e.after_follow_up_on:=CASE WHEN e.action IN('complete','stop') THEN h.follow_up_on ELSE(command->>'follow_up_on')::date END;e.reason:=command->>'reason';e.context:=current_context;
 request.tenant_id:=p_tenant;request.property_id:=p_property;request.reservation_id:=reservation;request.request_id:=p_request;request.actor_id:=auth.uid();request.outcome:='recorded';request.event_id:=e.id;request.command:=command;request.recorded_at:=generated;request.result:=irp_pms.balance_follow_up_result(e);
 IF octet_length(request.result::text)>32768 THEN RAISE EXCEPTION 'Follow-up receipt exceeds its byte limit';END IF;
 IF NOT has_head THEN h.tenant_id:=p_tenant;h.property_id:=p_property;h.reservation_id:=reservation;h.created_by:=auth.uid();h.created_at:=generated;END IF;
 h.version:=version+1;h.current_event_id:=e.id;h.state:=e.after_state;h.follow_up_on:=e.after_follow_up_on;h.updated_at:=generated;
 prospective:=irp_pms.balance_follow_up_detail_projection(capture||jsonb_build_object('head',to_jsonb(h),'events',(capture->'events')||jsonb_build_array(to_jsonb(e)),'requests',(capture->'requests')||jsonb_build_array(to_jsonb(request))),auth.uid(),role,generated);
 IF prospective->>'version' IS DISTINCT FROM h.version::text THEN RAISE EXCEPTION 'Prospective follow-up detail is inconsistent';END IF;
 IF NOT has_head THEN INSERT INTO irp_pms.balance_follow_up_heads SELECT h.*;
 ELSE UPDATE irp_pms.balance_follow_up_heads SET version=h.version,current_event_id=h.current_event_id,state=h.state,follow_up_on=h.follow_up_on,updated_at=h.updated_at WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=reservation;END IF;
 INSERT INTO irp_pms.balance_follow_up_events SELECT e.*;INSERT INTO irp_pms.balance_follow_up_requests SELECT request.*;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details,created_at)
 VALUES(p_tenant,p_property,auth.uid(),'balance_follow_up_recorded',reservation,jsonb_build_object('request_id',p_request,'event_id',e.id,'follow_up_action',e.action,'from_version',e.from_version,'to_version',e.to_version),generated);
 RETURN request.result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_retire_balance_follow_up_request(p_tenant uuid,p_property uuid,p_request uuid,p_command jsonb,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE command jsonb;reservation uuid;reason text:=btrim(p_reason);prior irp_pms.balance_follow_up_requests;r irp_pms.balance_follow_up_requests;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);command:=irp_pms.normalize_balance_follow_up(p_command);reservation:=(command->>'reservation_id')::uuid;
 IF p_request IS NULL OR reason IS NULL OR length(reason) NOT BETWEEN 4 AND 500 OR reason~'[[:cntrl:]]' THEN RAISE EXCEPTION 'Retirement requires an exact original command, request and reviewed reason';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped follow-up reservation';END IF;
 PERFORM 1 FROM irp_pms.balance_follow_up_heads WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=reservation FOR UPDATE;
 SELECT * INTO prior FROM irp_pms.balance_follow_up_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF(prior.reservation_id,prior.actor_id) IS DISTINCT FROM(reservation,auth.uid()) OR prior.command IS DISTINCT FROM command OR(prior.outcome='retired' AND prior.retirement_reason IS DISTINCT FROM reason) THEN RAISE EXCEPTION 'Follow-up request identity already used';END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 r.tenant_id:=p_tenant;r.property_id:=p_property;r.reservation_id:=reservation;r.request_id:=p_request;r.actor_id:=auth.uid();r.outcome:='retired';r.retirement_reason:=reason;r.command:=command;r.recorded_at:=clock_timestamp();r.result:=irp_pms.balance_follow_up_retired_result(r);
 INSERT INTO irp_pms.balance_follow_up_requests SELECT r.*;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details,created_at)
 VALUES(p_tenant,p_property,auth.uid(),'balance_follow_up_request_retired',reservation,jsonb_build_object('request_id',p_request,'follow_up_action',command->>'action','expected_version',(command->>'expected_version')::bigint),r.recorded_at);
 RETURN r.result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_balance_follow_up_request_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r irp_pms.balance_follow_up_requests;found_request boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);IF p_request IS NULL THEN RAISE EXCEPTION 'A follow-up request identity is required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO r FROM irp_pms.balance_follow_up_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();found_request:=FOUND;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'request_id',p_request,'actor_id',auth.uid(),'found',found_request,'action',CASE WHEN found_request THEN r.result->>'action' END,'result',CASE WHEN found_request THEN r.result END);
END $$;

CREATE FUNCTION irp_pms.balance_follow_up_summary(p_context jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('context_fingerprint',p_context->'context_fingerprint','available',p_context->'available','unavailable_reason',p_context->'unavailable_reason','opening_mode',p_context->'opening_mode','current_reservation_total_minor',p_context->'current_components'->'total_minor','opening_total_minor',p_context->'opening'->'components'->'total_minor','charges_minor',p_context->'totals'->'charges_minor','recorded_paid_minor',p_context->'totals'->'recorded_paid_minor','balance_minor',p_context->'totals'->'balance_minor','folio_entry_count',p_context->'folio_entry_count','flags',p_context->'flags')
$$;
CREATE FUNCTION irp_pms.normalize_balance_follow_up_filters(p_value jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
BEGIN
 IF jsonb_typeof(p_value) IS DISTINCT FROM 'object' OR NOT(p_value?&ARRAY['state','schedule']) OR p_value-ARRAY['state','schedule']<>'{}'::jsonb
 OR jsonb_typeof(p_value->'state') IS DISTINCT FROM 'string' OR jsonb_typeof(p_value->'schedule') IS DISTINCT FROM 'string'
 OR p_value->>'state' NOT IN('open','completed','stopped','all') OR p_value->>'schedule' NOT IN('all','past','today','future') OR(p_value->>'schedule'<>'all' AND p_value->>'state'<>'open') THEN RAISE EXCEPTION 'Choose exact follow-up state and staff-date filters';END IF;
 RETURN p_value;
END $$;

CREATE FUNCTION irp_pms.balance_follow_up_queue_capture(p_tenant uuid,p_property uuid,p_filters jsonb,p_generated timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog AS $$
 -- FOLLOWUP175_QUEUE_CAPTURE_BEGIN: one snapshot across selected heads and money.
 WITH selected_property AS MATERIALIZED(SELECT p.tenant_id,p.id,p.name,p.currency,p.time_zone,p.operating_model,(p_generated AT TIME ZONE p.time_zone)::date business_date FROM irp_pms.properties p WHERE p.tenant_id=p_tenant AND p.id=p_property),
 selected_heads AS MATERIALIZED(
  SELECT h.* FROM irp_pms.balance_follow_up_heads h JOIN selected_property p ON h.tenant_id=p.tenant_id AND h.property_id=p.id
  WHERE(p_filters->>'state'='all' OR h.state=p_filters->>'state')
  AND(p_filters->>'schedule'='all' OR(p_filters->>'schedule'='past' AND h.follow_up_on<p.business_date) OR(p_filters->>'schedule'='today' AND h.follow_up_on=p.business_date) OR(p_filters->>'schedule'='future' AND h.follow_up_on>p.business_date))
  ORDER BY CASE h.state WHEN 'open' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END,h.follow_up_on,h.reservation_id LIMIT 10001
 ), selected_entries AS MATERIALIZED(
  SELECT e.tenant_id,e.property_id,e.reservation_id,e.id,e.request_id,e.kind,e.amount_minor,e.currency,e.target_entry_id,e.created_at
  FROM irp_pms.folio_entries e JOIN selected_heads h ON h.tenant_id=e.tenant_id AND h.property_id=e.property_id AND h.reservation_id=e.reservation_id
  ORDER BY e.reservation_id,e.id LIMIT 10001
 ), counts AS MATERIALIZED(SELECT(SELECT count(*) FROM selected_heads) head_count,(SELECT count(*) FROM selected_entries) entry_count),
 grouped_entries AS MATERIALIZED(SELECT e.reservation_id,jsonb_agg(to_jsonb(e) ORDER BY e.id) entries FROM selected_entries e GROUP BY e.reservation_id),
 selected_rows AS MATERIALIZED(
  SELECT h.state,h.follow_up_on,h.reservation_id,
   jsonb_build_object('head',to_jsonb(h),'event',CASE WHEN e.id IS NOT NULL THEN to_jsonb(e) END,'request',CASE WHEN q.request_id IS NOT NULL THEN to_jsonb(q) END,
   'reservation',CASE WHEN r.id IS NOT NULL THEN jsonb_build_object('tenant_id',r.tenant_id,'property_id',r.property_id,'id',r.id,'source',r.source,'source_booking_id',r.source_booking_id,'source_version',r.source_version,'status',r.status,'cancellation_disposition',r.cancellation_disposition,'arrival',r.arrival,'departure',r.departure,'accommodation_minor',r.accommodation_minor,'taxes_minor',r.taxes_minor,'hotel_fees_minor',r.hotel_fees_minor,'ota_fees_minor',r.ota_fees_minor,'guest_total_minor',r.guest_total_minor,'charge_breakdown',r.charge_breakdown) END,
   'opening',CASE WHEN o.reservation_id IS NOT NULL THEN jsonb_build_object('tenant_id',o.tenant_id,'property_id',o.property_id,'reservation_id',o.reservation_id,'currency',o.currency,'reservation_source',o.reservation_source,'source_version',o.source_version,'opened_at',o.opened_at,'accommodation_minor',o.accommodation_minor,'taxes_minor',o.taxes_minor,'hotel_fees_minor',o.hotel_fees_minor,'fees_minor',o.fees_minor,'total_minor',o.total_minor,'charge_breakdown',o.charge_breakdown) END,
   'entries',coalesce(g.entries,'[]'::jsonb)) row_data
  FROM selected_heads h CROSS JOIN counts c
  LEFT JOIN irp_pms.reservations r ON r.tenant_id=h.tenant_id AND r.property_id=h.property_id AND r.id=h.reservation_id
  LEFT JOIN irp_pms.folio_openings o ON o.tenant_id=h.tenant_id AND o.property_id=h.property_id AND o.reservation_id=h.reservation_id
  LEFT JOIN irp_pms.balance_follow_up_events e ON e.tenant_id=h.tenant_id AND e.property_id=h.property_id AND e.reservation_id=h.reservation_id AND e.id=h.current_event_id
  LEFT JOIN irp_pms.balance_follow_up_requests q ON q.tenant_id=e.tenant_id AND q.property_id=e.property_id AND q.request_id=e.request_id
  LEFT JOIN grouped_entries g ON g.reservation_id=h.reservation_id
  WHERE c.head_count<=10000 AND c.entry_count<=10000
 )
 SELECT jsonb_build_object('tenant_id',p_tenant,'property_id',p_property,'property',to_jsonb(p)-'business_date','zone_supported',EXISTS(SELECT 1 FROM pg_timezone_names z WHERE z.name=p.time_zone),
 'supported_event_zones',coalesce((SELECT jsonb_object_agg(z.name,true) FROM pg_timezone_names z WHERE z.name IN(SELECT s.row_data->'event'->>'recording_time_zone' FROM selected_rows s)),'{}'::jsonb),
 'head_count',c.head_count,'entry_count',c.entry_count,'rows',coalesce((SELECT jsonb_agg(s.row_data ORDER BY CASE s.state WHEN 'open' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END,s.follow_up_on,s.reservation_id) FROM selected_rows s),'[]'::jsonb))
 FROM selected_property p CROSS JOIN counts c
 -- FOLLOWUP175_QUEUE_CAPTURE_END: no later persistent source lookup.
$$;

CREATE FUNCTION irp_pms.balance_follow_up_queue_projection(p_capture jsonb,p_actor uuid,p_role text,p_generated timestamptz,p_filters jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE prop jsonb;filters jsonb;business_date date;row jsonb;h irp_pms.balance_follow_up_heads;e irp_pms.balance_follow_up_events;q irp_pms.balance_follow_up_requests;
 event jsonb;booking jsonb;context jsonb;current_balance jsonb;reviewed_balance jsonb;changed boolean;zone_changed boolean;bucket text;days integer;entry_count bigint:=0;head_count bigint;rank integer;previous_rank integer;previous_date date;previous_id uuid;
 output_rows jsonb[]:=ARRAY[]::jsonb[];summary jsonb;out jsonb;balance bigint;captured_tenant text;captured_property text;captured_zones jsonb;
 open_count bigint:=0;completed_count bigint:=0;stopped_count bigint:=0;past_count bigint:=0;today_count bigint:=0;future_count bigint:=0;available_count bigint:=0;unavailable_count bigint:=0;
 positive_count bigint:=0;zero_count bigint:=0;credit_count bigint:=0;changed_count bigint:=0;zone_count bigint:=0;pricing_count bigint:=0;
 known_charges numeric:=0;known_paid numeric:=0;known_balance numeric:=0;known_positive numeric:=0;known_credit numeric:=0;
BEGIN
 filters:=irp_pms.normalize_balance_follow_up_filters(p_filters);
 IF p_actor IS NULL OR p_role IS NULL OR p_role NOT IN('owner','manager','staff') OR p_generated IS NULL OR NOT isfinite(p_generated) OR jsonb_typeof(p_capture) IS DISTINCT FROM 'object' OR jsonb_typeof(p_capture->'rows') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Incomplete follow-up queue capture';END IF;
 head_count:=irp_pms.guest_document_number(p_capture->'head_count',0,10001);PERFORM irp_pms.guest_document_number(p_capture->'entry_count',0,10001);
 IF head_count>10000 OR(p_capture->>'entry_count')::bigint>10000 THEN RAISE EXCEPTION 'Follow-up queue exceeds the complete 10000-head or 10000-entry limit; narrow its filters';END IF;
 IF jsonb_array_length(p_capture->'rows')<>head_count OR(SELECT count(DISTINCT x->'head'->>'reservation_id') FROM jsonb_array_elements(p_capture->'rows') x)<>head_count THEN RAISE EXCEPTION 'Follow-up queue has missing or duplicate reservations';END IF;
 prop:=irp_pms.payment_review_property(p_capture->'property',(p_capture->>'zone_supported')::boolean);business_date:=(p_generated AT TIME ZONE(prop->>'time_zone'))::date;
 IF(p_capture->'property'->>'tenant_id',prop->>'id') IS DISTINCT FROM(p_capture->>'tenant_id',p_capture->>'property_id') OR jsonb_typeof(p_capture->'supported_event_zones') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Follow-up queue scope or recording zones are incomplete';END IF;
 captured_tenant:=p_capture->>'tenant_id';captured_property:=p_capture->>'property_id';captured_zones:=p_capture->'supported_event_zones';
 FOR row IN SELECT x FROM jsonb_array_elements(p_capture->'rows') x LOOP
  IF jsonb_typeof(row->'head') IS DISTINCT FROM 'object' OR jsonb_typeof(row->'event') IS DISTINCT FROM 'object' OR jsonb_typeof(row->'request') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Follow-up queue lost a current event or receipt';END IF;
  h:=jsonb_populate_record(NULL::irp_pms.balance_follow_up_heads,row->'head');e:=jsonb_populate_record(NULL::irp_pms.balance_follow_up_events,row->'event');q:=jsonb_populate_record(NULL::irp_pms.balance_follow_up_requests,row->'request');
  event:=irp_pms.balance_follow_up_validate_event(e,q,coalesce((captured_zones->>e.recording_time_zone)::boolean,false));
  IF(h.tenant_id,h.property_id,h.reservation_id,h.current_event_id,h.version,h.state,h.follow_up_on,h.updated_at) IS DISTINCT FROM(e.tenant_id,e.property_id,e.reservation_id,e.id,e.to_version,e.after_state,e.after_follow_up_on,e.recorded_at)
  OR(h.tenant_id::text,h.property_id::text) IS DISTINCT FROM(captured_tenant,captured_property) OR h.created_by IS NULL THEN RAISE EXCEPTION 'Follow-up queue head differs from its accepted current event';END IF;
  booking:=irp_pms.payment_review_booking(row->'reservation');context:=irp_pms.balance_follow_up_context(row->'reservation',row->'opening',row->'entries');
  IF(context->>'tenant_id',context->>'property_id',context->>'reservation_id') IS DISTINCT FROM(h.tenant_id::text,h.property_id::text,h.reservation_id::text) THEN RAISE EXCEPTION 'Follow-up queue financial context crosses scope';END IF;
  rank:=CASE h.state WHEN 'open' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END;
  IF previous_id IS NOT NULL AND(rank,h.follow_up_on,h.reservation_id)<=(previous_rank,previous_date,previous_id) THEN RAISE EXCEPTION 'Follow-up queue order is not canonical';END IF;
  previous_rank:=rank;previous_date:=h.follow_up_on;previous_id:=h.reservation_id;
  bucket:=CASE WHEN h.state<>'open' THEN 'inactive' WHEN h.follow_up_on<business_date THEN 'past' WHEN h.follow_up_on=business_date THEN 'today' ELSE 'future' END;days:=CASE WHEN h.state='open' THEN greatest(0,business_date-h.follow_up_on) END;
  IF(filters->>'state'<>'all' AND h.state IS DISTINCT FROM filters->>'state') OR(filters->>'schedule'<>'all' AND bucket IS DISTINCT FROM filters->>'schedule') THEN RAISE EXCEPTION 'Follow-up queue row does not match its prepared filters';END IF;
  current_balance:=irp_pms.balance_follow_up_summary(context);reviewed_balance:=irp_pms.balance_follow_up_summary(e.context);changed:=context->>'context_fingerprint' IS DISTINCT FROM e.context->>'context_fingerprint';zone_changed:=prop->>'time_zone' IS DISTINCT FROM e.recording_time_zone;
  entry_count:=entry_count+(context->>'folio_entry_count')::bigint;
  open_count:=open_count+CASE WHEN h.state='open' THEN 1 ELSE 0 END;completed_count:=completed_count+CASE WHEN h.state='completed' THEN 1 ELSE 0 END;stopped_count:=stopped_count+CASE WHEN h.state='stopped' THEN 1 ELSE 0 END;
  past_count:=past_count+CASE WHEN bucket='past' THEN 1 ELSE 0 END;today_count:=today_count+CASE WHEN bucket='today' THEN 1 ELSE 0 END;future_count:=future_count+CASE WHEN bucket='future' THEN 1 ELSE 0 END;
  changed_count:=changed_count+CASE WHEN changed THEN 1 ELSE 0 END;zone_count:=zone_count+CASE WHEN zone_changed THEN 1 ELSE 0 END;pricing_count:=pricing_count+CASE WHEN(context->'flags'->>'pricing_reconciliation_required')::boolean THEN 1 ELSE 0 END;
  IF(context->>'available')::boolean THEN
   available_count:=available_count+1;balance:=(context->'totals'->>'balance_minor')::bigint;positive_count:=positive_count+CASE WHEN balance>0 THEN 1 ELSE 0 END;zero_count:=zero_count+CASE WHEN balance=0 THEN 1 ELSE 0 END;credit_count:=credit_count+CASE WHEN balance<0 THEN 1 ELSE 0 END;
   known_charges:=known_charges+(context->'totals'->>'charges_minor')::numeric;known_paid:=known_paid+(context->'totals'->>'recorded_paid_minor')::numeric;known_balance:=known_balance+balance;known_positive:=known_positive+greatest(balance,0);known_credit:=known_credit+least(balance,0);
  ELSE unavailable_count:=unavailable_count+1;END IF;
  output_rows:=array_append(output_rows,jsonb_build_object('reservation',booking,'head',irp_pms.balance_follow_up_head_json(h),'last_action',jsonb_build_object('event_id',e.id,'action',e.action,'actor_id',e.actor_id,'recorded_at',irp_pms.balance_follow_up_timestamp(e.recorded_at),'recording_time_zone',e.recording_time_zone,'recording_business_date',e.recording_business_date,'reviewed_balance',reviewed_balance),
  'current_balance',current_balance,'context_changed_since_recording',changed,'schedule_zone_changed',zone_changed,'follow_up_bucket',bucket,'days_past_follow_up',days));
 END LOOP;
 IF entry_count IS DISTINCT FROM(p_capture->>'entry_count')::bigint THEN RAISE EXCEPTION 'Follow-up queue source entry count is incomplete';END IF;
 IF greatest(abs(known_charges),abs(known_paid),abs(known_balance),abs(known_positive),abs(known_credit))>9007199254740991 THEN RAISE EXCEPTION 'Follow-up queue known gross or signed totals exceed safe integer limits';END IF;
 summary:=jsonb_build_object('row_count',head_count,'open_count',open_count,'completed_count',completed_count,'stopped_count',stopped_count,'past_count',past_count,'today_count',today_count,'future_count',future_count,'available_count',available_count,'unavailable_count',unavailable_count,'positive_balance_count',positive_count,'zero_balance_count',zero_count,'credit_balance_count',credit_count,'context_changed_count',changed_count,'schedule_zone_changed_count',zone_count,'pricing_review_count',pricing_count,
 'known_charges_minor',known_charges::bigint,'known_recorded_paid_minor',known_paid::bigint,'known_balance_minor',known_balance::bigint,'known_positive_balances_minor',known_positive::bigint,'known_credit_balances_minor',known_credit::bigint,'amounts_complete',unavailable_count=0);
 out:=jsonb_build_object('schema_version',1,'tenant_id',p_capture->'tenant_id','property_id',p_capture->'property_id','actor_id',p_actor,'role',p_role,'can_manage',p_role IN('owner','manager'),'property',prop,'generated_at',irp_pms.balance_follow_up_timestamp(p_generated),'property_business_date',business_date,'filters',filters,'population','recorded_follow_ups','rows',to_jsonb(output_rows),'summary',summary,'complete',true,'rows_truncated',false,'financial_effects',irp_pms.balance_follow_up_no_effects(),'semantics',irp_pms.balance_follow_up_semantics());
 IF octet_length(out::text)>33554432 THEN RAISE EXCEPTION 'Follow-up queue exceeds its complete 32MiB limit; narrow its filters';END IF;
 RETURN out;
END $$;
CREATE FUNCTION public.irp_pms_pilot_balance_follow_up_queue(p_tenant uuid,p_property uuid,p_filters jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE role text;filters jsonb;generated timestamptz;capture jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);filters:=irp_pms.normalize_balance_follow_up_filters(p_filters);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 role:=irp_pms.pilot_require(p_tenant,p_property);generated:=clock_timestamp();
 capture:=irp_pms.balance_follow_up_queue_capture(p_tenant,p_property,filters,generated);
 IF capture IS NULL THEN RAISE EXCEPTION 'Unknown scoped follow-up property';END IF;
 RETURN irp_pms.balance_follow_up_queue_projection(capture,auth.uid(),role,generated,filters);
END $$;

-- New objects only: no changes to any existing function grants.
REVOKE ALL ON FUNCTION irp_pms.balance_follow_up_hash(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.balance_follow_up_timestamp(timestamptz) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.balance_follow_up_date(jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.normalize_balance_follow_up(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.balance_follow_up_no_effects() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.balance_follow_up_semantics() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.balance_follow_up_components(jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.balance_follow_up_context(jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.balance_follow_up_validate_context(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.balance_follow_up_event_json(irp_pms.balance_follow_up_events) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.balance_follow_up_event_command(irp_pms.balance_follow_up_events) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.balance_follow_up_result(irp_pms.balance_follow_up_events) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.balance_follow_up_retired_result(irp_pms.balance_follow_up_requests) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.balance_follow_up_head_json(irp_pms.balance_follow_up_heads) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.balance_follow_up_capture(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.balance_follow_up_validate_event(irp_pms.balance_follow_up_events,irp_pms.balance_follow_up_requests,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.balance_follow_up_history(jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.balance_follow_up_history_guard() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.balance_follow_up_insert_guard() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.balance_follow_up_consistency() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.balance_follow_up_detail_projection(jsonb,uuid,text,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_balance_follow_up(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_balance_follow_up(uuid,uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_save_balance_follow_up(uuid,uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_save_balance_follow_up(uuid,uuid,uuid,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_retire_balance_follow_up_request(uuid,uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_retire_balance_follow_up_request(uuid,uuid,uuid,jsonb,text) TO authenticated;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_balance_follow_up_request_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_balance_follow_up_request_status(uuid,uuid,uuid) TO authenticated;
REVOKE ALL ON FUNCTION irp_pms.balance_follow_up_summary(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.normalize_balance_follow_up_filters(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.balance_follow_up_queue_capture(uuid,uuid,jsonb,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.balance_follow_up_queue_projection(jsonb,uuid,text,timestamptz,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_balance_follow_up_queue(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_balance_follow_up_queue(uuid,uuid,jsonb) TO authenticated;

COMMIT;

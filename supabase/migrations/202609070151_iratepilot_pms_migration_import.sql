BEGIN;
-- Future confirmed reservations only. Imported amounts are charges, not evidence
-- of payment, captured deposits, refunds, or settled balances.
ALTER TABLE irp_pms.reservations DROP CONSTRAINT reservations_source_check;
ALTER TABLE irp_pms.reservations ADD CONSTRAINT reservations_source_check CHECK(source IN('iratepilot-ota','direct','migration'));
ALTER TABLE irp_pms.reservations ADD COLUMN migration_provider text,ADD COLUMN migration_source_id text;
ALTER TABLE irp_pms.reservations ADD CONSTRAINT reservation_migration_identity CHECK(
 (source='migration' AND migration_provider IS NOT NULL AND migration_provider ~ '^[a-z0-9][a-z0-9_-]{0,79}$' AND migration_source_id IS NOT NULL AND length(trim(migration_source_id)) BETWEEN 1 AND 128)
 OR (source<>'migration' AND migration_provider IS NULL AND migration_source_id IS NULL));
CREATE UNIQUE INDEX migration_source_identity ON irp_pms.reservations(tenant_id,property_id,migration_provider,migration_source_id) WHERE source='migration';
CREATE TABLE irp_pms.import_batches(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL,provider text NOT NULL,
 source_rows jsonb NOT NULL,preview jsonb NOT NULL,status text NOT NULL DEFAULT 'staged' CHECK(status IN('staged','committed','discarded')),
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,property_id,id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
CREATE TABLE irp_pms.import_actions(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,batch_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),action text NOT NULL CHECK(action IN('commit','discard')),result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id,batch_id) REFERENCES irp_pms.import_batches(tenant_id,property_id,id)
);
CREATE TABLE irp_pms.import_commits(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,batch_id uuid NOT NULL,request_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),reservation_ids jsonb NOT NULL,committed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,property_id,batch_id),FOREIGN KEY(tenant_id,property_id,batch_id) REFERENCES irp_pms.import_batches(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.import_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.import_commits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.import_batches,irp_pms.import_actions,irp_pms.import_commits FROM PUBLIC,anon,authenticated;
GRANT SELECT ON irp_pms.import_batches,irp_pms.import_actions,irp_pms.import_commits TO service_role;

CREATE FUNCTION irp_pms.validate_import(p_tenant uuid,p_property uuid,p_provider text,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item record; raw jsonb; errors jsonb; rows jsonb:='[]'::jsonb; normalized jsonb; source_id text; guest_name text; type_id uuid;
 arrival date; departure date; guest_count integer; max_guests integer; accommodation bigint; taxes bigint; business_date date; valid_count integer;
BEGIN
 IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 500 OR octet_length(p_rows::text)>1048576 THEN RAISE EXCEPTION 'Provide 1 to 500 reservation rows within 1 MiB'; END IF;
 -- Reject unsupported/sensitive fields and nested payloads before any caller
 -- persists source_rows, previews, actions or activity. Invalid scalar values
 -- still receive the normal row-specific preview errors below.
 FOR raw IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF jsonb_typeof(raw)='array' THEN RAISE EXCEPTION 'Import rows cannot contain nested arrays or objects'; END IF;
  IF jsonb_typeof(raw)='object' THEN
   IF EXISTS(SELECT 1 FROM jsonb_each(raw) f WHERE f.key NOT IN('source_id','guest_name','room_type_id','arrival','departure','guests','currency','accommodation_minor','taxes_minor') OR jsonb_typeof(f.value) IN('object','array')) THEN
    RAISE EXCEPTION 'Import payload contains unsupported fields or nested values; no payment, deposit or identity-document data is accepted';
   END IF;
  END IF;
 END LOOP;
 SELECT (clock_timestamp() AT TIME ZONE time_zone)::date INTO business_date FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped property'; END IF;
 FOR item IN SELECT value,ordinality::integer AS row_number FROM jsonb_array_elements(p_rows) WITH ORDINALITY LOOP
  raw:=item.value;errors:='[]'::jsonb;normalized:=NULL;source_id:=NULL;guest_name:=NULL;type_id:=NULL;arrival:=NULL;departure:=NULL;guest_count:=NULL;max_guests:=NULL;accommodation:=NULL;taxes:=NULL;
  IF jsonb_typeof(raw) IS DISTINCT FROM 'object' THEN errors:=errors||jsonb_build_array('invalid_row_object');
  ELSE
   IF jsonb_typeof(raw->'source_id') IS DISTINCT FROM 'string' OR length(trim(raw->>'source_id')) NOT BETWEEN 1 AND 128 THEN errors:=errors||jsonb_build_array('invalid_source_id');
   ELSE
    source_id:=trim(raw->>'source_id');
    IF (SELECT count(*) FROM jsonb_array_elements(p_rows) r WHERE jsonb_typeof(r)='object' AND jsonb_typeof(r->'source_id')='string' AND trim(r->>'source_id')=source_id)>1 THEN errors:=errors||jsonb_build_array('duplicate_source_id_in_batch'); END IF;
    IF EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND source='migration' AND migration_provider=p_provider AND migration_source_id=source_id) THEN errors:=errors||jsonb_build_array('source_id_already_imported'); END IF;
   END IF;
   IF jsonb_typeof(raw->'guest_name') IS DISTINCT FROM 'string' OR length(trim(raw->>'guest_name')) NOT BETWEEN 1 AND 200 THEN errors:=errors||jsonb_build_array('invalid_guest_name'); ELSE guest_name:=trim(raw->>'guest_name'); END IF;
   BEGIN
    IF jsonb_typeof(raw->'room_type_id') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Invalid type'; END IF;
    type_id:=(raw->>'room_type_id')::uuid;
    SELECT t.max_guests INTO max_guests FROM irp_pms.room_types t WHERE tenant_id=p_tenant AND property_id=p_property AND id=type_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped type'; END IF;
   EXCEPTION WHEN OTHERS THEN type_id:=NULL;errors:=errors||jsonb_build_array('invalid_scoped_room_type'); END;
   BEGIN
    IF jsonb_typeof(raw->'arrival') IS DISTINCT FROM 'string' OR jsonb_typeof(raw->'departure') IS DISTINCT FROM 'string' OR (raw->>'arrival') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (raw->>'departure') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Invalid dates'; END IF;
    arrival:=(raw->>'arrival')::date;departure:=(raw->>'departure')::date;
    IF arrival<business_date OR departure<=arrival OR departure-arrival>30 THEN RAISE EXCEPTION 'Invalid stay'; END IF;
   EXCEPTION WHEN OTHERS THEN arrival:=NULL;departure:=NULL;errors:=errors||jsonb_build_array('invalid_future_stay_1_to_30_nights'); END;
   BEGIN
    IF jsonb_typeof(raw->'guests') IS DISTINCT FROM 'number' OR (raw->>'guests')::numeric NOT BETWEEN 1 AND 20 OR trunc((raw->>'guests')::numeric)<>(raw->>'guests')::numeric THEN RAISE EXCEPTION 'Invalid guests'; END IF;
    guest_count:=(raw->>'guests')::integer;
    IF max_guests IS NOT NULL AND guest_count>max_guests THEN RAISE EXCEPTION 'Guest limit exceeded'; END IF;
   EXCEPTION WHEN OTHERS THEN guest_count:=NULL;errors:=errors||jsonb_build_array('invalid_guest_count'); END;
   IF raw->>'currency' IS DISTINCT FROM 'USD' OR jsonb_typeof(raw->'currency') IS DISTINCT FROM 'string' THEN errors:=errors||jsonb_build_array('currency_must_be_USD'); END IF;
   BEGIN
    IF jsonb_typeof(raw->'accommodation_minor') IS DISTINCT FROM 'number' OR jsonb_typeof(raw->'taxes_minor') IS DISTINCT FROM 'number' OR (raw->>'accommodation_minor')::numeric NOT BETWEEN 0 AND 999999999999 OR (raw->>'taxes_minor')::numeric NOT BETWEEN 0 AND 999999999999 OR trunc((raw->>'accommodation_minor')::numeric)<>(raw->>'accommodation_minor')::numeric OR trunc((raw->>'taxes_minor')::numeric)<>(raw->>'taxes_minor')::numeric THEN RAISE EXCEPTION 'Invalid minor units'; END IF;
    accommodation:=(raw->>'accommodation_minor')::bigint;taxes:=(raw->>'taxes_minor')::bigint;
    IF accommodation+taxes>999999999999 THEN RAISE EXCEPTION 'Total amount exceeds supported range'; END IF;
   EXCEPTION WHEN OTHERS THEN accommodation:=NULL;taxes:=NULL;errors:=errors||jsonb_build_array('invalid_integer_minor_unit_amounts'); END;
   IF errors='[]'::jsonb THEN normalized:=jsonb_build_object('source_id',source_id,'guest_name',guest_name,'room_type_id',type_id,'arrival',arrival,'departure',departure,'guests',guest_count,'currency','USD','accommodation_minor',accommodation,'taxes_minor',taxes,'ota_fees_minor',0,'guest_total_minor',accommodation+taxes,'status','Confirmed'); END IF;
  END IF;
  rows:=rows||jsonb_build_array(jsonb_build_object('row_number',item.row_number,'source_id',source_id,'valid',errors='[]'::jsonb,'errors',errors,'normalized',normalized));
 END LOOP;
 -- Evaluate aggregate batch demand, not each row in isolation, against the same
 -- existing inventory snapshot protected by the caller's property lock.
 WITH ready AS (
  SELECT (r->>'row_number')::integer row_number,r->'normalized' n FROM jsonb_array_elements(rows) r WHERE r->>'valid'='true'
 ), demand AS (
  SELECT (n->>'room_type_id')::uuid type_id,d::date stay_date,count(*)::integer units
  FROM ready CROSS JOIN LATERAL generate_series((n->>'arrival')::date,(n->>'departure')::date-1,interval '1 day') d GROUP BY 1,2
 ), availability AS (
  SELECT d.*,c.units capacity,(SELECT count(*) FROM irp_pms.reservations r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.room_type_id=d.type_id AND r.status IN('Confirmed','In house') AND r.arrival<=d.stay_date AND r.departure>d.stay_date) used
  FROM demand d LEFT JOIN irp_pms.nightly_capacity c ON c.tenant_id=p_tenant AND c.property_id=p_property AND c.room_type_id=d.type_id AND c.stay_date=d.stay_date
 ), invalid_nights AS (
  SELECT ready.row_number,jsonb_agg((CASE WHEN a.capacity IS NULL THEN 'capacity_missing:' ELSE 'insufficient_capacity:' END)||a.stay_date::text ORDER BY a.stay_date) errors
  FROM ready JOIN availability a ON a.type_id=(n->>'room_type_id')::uuid AND a.stay_date>=(n->>'arrival')::date AND a.stay_date<(n->>'departure')::date
  WHERE a.capacity IS NULL OR a.used+a.units>a.capacity GROUP BY ready.row_number
 )
 SELECT coalesce(jsonb_agg(CASE WHEN i.row_number IS NULL THEN r ELSE r||jsonb_build_object('valid',false,'errors',(r->'errors')||i.errors) END ORDER BY (r->>'row_number')::integer),'[]'::jsonb)
 INTO rows FROM jsonb_array_elements(rows) r LEFT JOIN invalid_nights i ON i.row_number=(r->>'row_number')::integer;
 SELECT count(*) INTO valid_count FROM jsonb_array_elements(rows) r WHERE r->>'valid'='true';
 RETURN jsonb_build_object('row_count',jsonb_array_length(p_rows),'valid_count',valid_count,'error_count',jsonb_array_length(p_rows)-valid_count,'rows',rows,'currency','USD','payment_state','not_recorded');
END $$;
REVOKE ALL ON FUNCTION irp_pms.validate_import(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.irp_pms_pilot_stage_import(p_tenant uuid,p_property uuid,p_request uuid,p_provider text,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE provider text:=lower(trim(p_provider)); prior irp_pms.import_batches; preview jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR provider IS NULL OR provider !~ '^[a-z0-9][a-z0-9_-]{0,79}$' THEN RAISE EXCEPTION 'A request identity and provider code are required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('import-stage:'||p_tenant::text||':'||p_property::text||':'||p_request::text,0));
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 SELECT * INTO prior FROM irp_pms.import_batches WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request;
 IF FOUND THEN
  IF prior.provider IS DISTINCT FROM provider OR prior.source_rows IS DISTINCT FROM p_rows OR prior.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Import request identity already used'; END IF;
  RETURN prior.preview||jsonb_build_object('batch_id',prior.id,'provider',prior.provider,'status',prior.status,'replayed',true);
 END IF;
 preview:=irp_pms.validate_import(p_tenant,p_property,provider,p_rows);
 INSERT INTO irp_pms.import_batches(tenant_id,property_id,id,provider,source_rows,preview,created_by) VALUES(p_tenant,p_property,p_request,provider,p_rows,preview,auth.uid());
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'import_staged',p_request,jsonb_build_object('row_count',preview->'row_count','error_count',preview->'error_count','provider',provider));
 RETURN preview||jsonb_build_object('batch_id',p_request,'provider',provider,'status','staged','replayed',false);
END $$;

CREATE FUNCTION public.irp_pms_pilot_list_imports(p_tenant uuid,p_property uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('batch_id',b.id,'provider',b.provider,'status',b.status,'row_count',b.preview->'row_count','valid_count',b.preview->'valid_count','error_count',b.preview->'error_count','created_at',b.created_at) ORDER BY b.created_at DESC,b.id)
 FROM (SELECT * FROM irp_pms.import_batches WHERE tenant_id=p_tenant AND property_id=p_property ORDER BY created_at DESC,id LIMIT 100) b),'[]'::jsonb);
END $$;

CREATE FUNCTION public.irp_pms_pilot_import_detail(p_tenant uuid,p_property uuid,p_batch uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE batch irp_pms.import_batches;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO batch FROM irp_pms.import_batches WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_batch;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped import batch'; END IF;
 RETURN batch.preview||jsonb_build_object('batch_id',batch.id,'provider',batch.provider,'status',batch.status,'created_at',batch.created_at,
 'commit',(SELECT jsonb_build_object('request_id',request_id,'reservation_ids',reservation_ids,'committed_at',committed_at) FROM irp_pms.import_commits WHERE tenant_id=p_tenant AND property_id=p_property AND batch_id=p_batch),
 'latest_attempt',(SELECT a.result FROM irp_pms.import_actions a WHERE tenant_id=p_tenant AND property_id=p_property AND batch_id=p_batch ORDER BY created_at DESC,request_id DESC LIMIT 1));
END $$;

CREATE FUNCTION public.irp_pms_pilot_commit_import(p_tenant uuid,p_property uuid,p_batch uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE batch irp_pms.import_batches; prior irp_pms.import_actions; receipt irp_pms.import_commits; preview jsonb; result jsonb; row jsonb; n jsonb; reservation_id uuid; ids jsonb:='[]'::jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_batch IS NULL THEN RAISE EXCEPTION 'Batch and request identities are required'; END IF;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 SELECT * INTO prior FROM irp_pms.import_actions WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.batch_id IS DISTINCT FROM p_batch OR prior.action<>'commit' OR prior.actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Import action identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO batch FROM irp_pms.import_batches WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_batch FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped import batch'; END IF;
 IF batch.status='discarded' THEN RAISE EXCEPTION 'A discarded import cannot be committed'; END IF;
 SELECT * INTO receipt FROM irp_pms.import_commits WHERE tenant_id=p_tenant AND property_id=p_property AND batch_id=p_batch;
 IF FOUND THEN result:=jsonb_build_object('batch_id',p_batch,'status','committed','reservation_ids',receipt.reservation_ids,'payment_state','not_recorded','replayed',true);
 ELSE
  preview:=irp_pms.validate_import(p_tenant,p_property,batch.provider,batch.source_rows);
  IF (batch.preview->>'error_count')::integer>0 OR (preview->>'error_count')::integer>0 THEN
   -- Preserve the original preview and a separate fresh failure receipt. A new
   -- request can retry a formerly valid stage after inventory is corrected.
   result:=CASE WHEN (batch.preview->>'error_count')::integer>0 THEN batch.preview ELSE preview END||jsonb_build_object('batch_id',p_batch,'status','validation_failed','replayed',false);
   INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id) VALUES(p_tenant,p_property,auth.uid(),'import_validation_failed',p_batch);
  ELSE
   FOR row IN SELECT value FROM jsonb_array_elements(preview->'rows') LOOP
    n:=row->'normalized';reservation_id:=gen_random_uuid();
    INSERT INTO irp_pms.reservations(tenant_id,property_id,id,source,source_booking_id,source_version,payload_hash,status,room_type_id,arrival,departure,guests,accommodation_minor,taxes_minor,ota_fees_minor,guest_total_minor,guest_name,migration_provider,migration_source_id)
    VALUES(p_tenant,p_property,reservation_id,'migration',reservation_id::text,1,encode(sha256(convert_to(n::text,'UTF8')),'hex'),'Confirmed',(n->>'room_type_id')::uuid,(n->>'arrival')::date,(n->>'departure')::date,(n->>'guests')::integer,(n->>'accommodation_minor')::bigint,(n->>'taxes_minor')::bigint,0,(n->>'guest_total_minor')::bigint,n->>'guest_name',batch.provider,n->>'source_id');
    ids:=ids||jsonb_build_array(reservation_id);
   END LOOP;
   INSERT INTO irp_pms.import_commits(tenant_id,property_id,batch_id,request_id,actor_id,reservation_ids) VALUES(p_tenant,p_property,p_batch,p_request,auth.uid(),ids);
   UPDATE irp_pms.import_batches SET status='committed' WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_batch;
   result:=jsonb_build_object('batch_id',p_batch,'status','committed','reservation_ids',ids,'payment_state','not_recorded','replayed',false);
   INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'import_committed',p_batch,jsonb_build_object('row_count',jsonb_array_length(ids),'provider',batch.provider));
  END IF;
 END IF;
 INSERT INTO irp_pms.import_actions(tenant_id,property_id,request_id,batch_id,actor_id,action,result) VALUES(p_tenant,p_property,p_request,p_batch,auth.uid(),'commit',result);
 RETURN result;
END $$;

CREATE FUNCTION public.irp_pms_pilot_discard_import(p_tenant uuid,p_property uuid,p_batch uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE batch irp_pms.import_batches; prior irp_pms.import_actions; result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_batch IS NULL THEN RAISE EXCEPTION 'Batch and request identities are required'; END IF;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 SELECT * INTO prior FROM irp_pms.import_actions WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.batch_id IS DISTINCT FROM p_batch OR prior.action<>'discard' OR prior.actor_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Import action identity already used'; END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO batch FROM irp_pms.import_batches WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_batch FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped import batch'; END IF;
 IF batch.status='committed' THEN RAISE EXCEPTION 'Committed reservations cannot be discarded as a staged import'; END IF;
 result:=jsonb_build_object('batch_id',p_batch,'status','discarded','replayed',batch.status='discarded');
 IF batch.status<>'discarded' THEN
  UPDATE irp_pms.import_batches SET status='discarded' WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_batch;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id) VALUES(p_tenant,p_property,auth.uid(),'import_discarded',p_batch);
 END IF;
 INSERT INTO irp_pms.import_actions(tenant_id,property_id,request_id,batch_id,actor_id,action,result) VALUES(p_tenant,p_property,p_request,p_batch,auth.uid(),'discard',result);
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.irp_pms_pilot_stage_import(uuid,uuid,uuid,text,jsonb),public.irp_pms_pilot_list_imports(uuid,uuid),public.irp_pms_pilot_import_detail(uuid,uuid,uuid),public.irp_pms_pilot_commit_import(uuid,uuid,uuid,uuid),public.irp_pms_pilot_discard_import(uuid,uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_stage_import(uuid,uuid,uuid,text,jsonb),public.irp_pms_pilot_list_imports(uuid,uuid),public.irp_pms_pilot_import_detail(uuid,uuid,uuid),public.irp_pms_pilot_commit_import(uuid,uuid,uuid,uuid),public.irp_pms_pilot_discard_import(uuid,uuid,uuid,uuid) TO authenticated;
COMMIT;

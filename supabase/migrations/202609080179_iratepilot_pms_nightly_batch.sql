-- Atomic reviewed nightly posting batches with immutable retry and retirement receipts.
BEGIN;
CREATE TABLE irp_pms.gl_service_batches (
 tenant_id uuid NOT NULL, property_id uuid NOT NULL, request_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id), command jsonb NOT NULL, result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id),
 CHECK(jsonb_typeof(command)='array' AND jsonb_array_length(command) BETWEEN 1 AND 100 AND octet_length(command::text)<=2097152)
);
ALTER TABLE irp_pms.gl_service_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.gl_service_batches FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER gl_service_batch_immutable BEFORE UPDATE OR DELETE ON irp_pms.gl_service_batches FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE TABLE irp_pms.gl_service_batch_retirements (
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),command jsonb NOT NULL,retired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id),
 CHECK(jsonb_typeof(command)='array' AND jsonb_array_length(command) BETWEEN 1 AND 100 AND octet_length(command::text)<=2097152)
);
ALTER TABLE irp_pms.gl_service_batch_retirements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.gl_service_batch_retirements FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER gl_service_batch_retirement_immutable BEFORE UPDATE OR DELETE ON irp_pms.gl_service_batch_retirements FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_post_service_batch(p_tenant uuid,p_property uuid,p_request uuid,p_items jsonb,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_service_batches; item jsonb; preview jsonb; actual jsonb; result jsonb; receipts jsonb:='[]'; child_ids uuid[]:='{}'; source_keys text[]:='{}'; child uuid; source_key text;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true OR p_items IS NULL OR jsonb_typeof(p_items)<>'array' THEN RAISE EXCEPTION 'Batch identity, reviewed items and confirmation required';END IF;
 IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 OR octet_length(p_items::text)>2097152 THEN RAISE EXCEPTION 'Review between 1 and 100 sources within the batch size limit';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.gl_service_batch_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Batch request was cancelled; prepare a new review';END IF;
 SELECT * INTO saved FROM irp_pms.gl_service_batches WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF saved.actor_id IS DISTINCT FROM auth.uid() OR saved.command IS DISTINCT FROM p_items THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Batch request identity already used with different details';END IF;
  RETURN saved.result||jsonb_build_object('replayed',true);
 END IF;
 -- Preflight all entries before the first posting. The property lock covers both passes.
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF jsonb_typeof(item)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(item) key) IS DISTINCT FROM ARRAY['preview','request_id']::text[] THEN RAISE EXCEPTION 'Invalid batch item';END IF;
  child:=(item->>'request_id')::uuid;preview:=item->'preview';
  IF child IS NULL OR child=p_request OR child=ANY(child_ids) OR jsonb_typeof(preview) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid or duplicate batch child request';END IF;
  child_ids:=array_append(child_ids,child);
  IF preview->>'tenant_id' IS DISTINCT FROM p_tenant::text OR preview->>'property_id' IS DISTINCT FROM p_property::text OR preview->>'actor_id' IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'Reviewed source belongs to another scope';END IF;
  source_key:=(preview->>'service_date')||'/'||(preview->>'reservation_id');
  IF source_key IS NULL OR source_key=ANY(source_keys) THEN RAISE EXCEPTION 'Duplicate or missing batch source';END IF;
  source_keys:=array_append(source_keys,source_key);
  actual:=public.irp_pms_pilot_preview_service_journal(p_tenant,p_property,(preview->>'service_date')::date,(preview->>'reservation_id')::uuid,(preview->>'mapping_id')::uuid,(preview->>'period_id')::uuid,(preview->>'posting_date')::date);
  IF actual IS DISTINCT FROM preview OR actual->'already_processed' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='A reviewed source changed or was already processed; refresh the entire batch';END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  preview:=item->'preview';
  receipts:=receipts||jsonb_build_array(public.irp_pms_pilot_post_service_journal(p_tenant,p_property,(item->>'request_id')::uuid,(preview->>'service_date')::date,(preview->>'reservation_id')::uuid,(preview->>'mapping_id')::uuid,(preview->>'period_id')::uuid,(preview->>'posting_date')::date,true));
 END LOOP;
 result:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'item_count',jsonb_array_length(p_items),'receipts',receipts,'replayed',false);
 INSERT INTO irp_pms.gl_service_batches(tenant_id,property_id,request_id,actor_id,command,result) VALUES(p_tenant,p_property,p_request,auth.uid(),p_items,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'service_batch_posted',p_request,jsonb_build_object('item_count',jsonb_array_length(p_items)));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_post_service_batch(uuid,uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_post_service_batch(uuid,uuid,uuid,jsonb,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_service_batch_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_service_batches; exists_saved boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Batch request identity required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 SELECT * INTO saved FROM irp_pms.gl_service_batches WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();exists_saved:=FOUND;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'found',exists_saved,'command',CASE WHEN exists_saved THEN saved.command END,'result',CASE WHEN exists_saved THEN saved.result END);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_service_batch_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_service_batch_status(uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_retire_service_batch(p_tenant uuid,p_property uuid,p_request uuid,p_items jsonb,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_service_batch_retirements; item jsonb; replayed boolean:=false;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true OR p_items IS NULL OR jsonb_typeof(p_items)<>'array' THEN RAISE EXCEPTION 'Batch cancellation identity, items and confirmation required';END IF;
 IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 OR octet_length(p_items::text)>2097152 THEN RAISE EXCEPTION 'Invalid batch cancellation size';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF jsonb_typeof(item)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(item) key) IS DISTINCT FROM ARRAY['preview','request_id']::text[] OR (item->>'request_id')::uuid IS NULL OR jsonb_typeof(item->'preview') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid retained batch item';END IF;
  IF item->'preview'->>'tenant_id' IS DISTINCT FROM p_tenant::text OR item->'preview'->>'property_id' IS DISTINCT FROM p_property::text OR item->'preview'->>'actor_id' IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'Retained batch belongs to another scope';END IF;
 END LOOP;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.gl_service_batches WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Saved batch cannot be cancelled; recover its receipt';END IF;
 SELECT * INTO saved FROM irp_pms.gl_service_batch_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF saved.actor_id IS DISTINCT FROM auth.uid() OR saved.command IS DISTINCT FROM p_items THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Batch cancellation details differ';END IF;
  replayed:=true;
 ELSE
  INSERT INTO irp_pms.gl_service_batch_retirements(tenant_id,property_id,request_id,actor_id,command) VALUES(p_tenant,p_property,p_request,auth.uid(),p_items) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'service_batch_cancelled',p_request,jsonb_build_object('item_count',jsonb_array_length(p_items)));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'retired',true,'command',saved.command,'retired_at',saved.retired_at,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_retire_service_batch(uuid,uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_retire_service_batch(uuid,uuid,uuid,jsonb,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_service_batch_retirement_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_service_batch_retirements; exists_saved boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Batch request identity required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 SELECT * INTO saved FROM irp_pms.gl_service_batch_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();exists_saved:=FOUND;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'retired',exists_saved,'command',CASE WHEN exists_saved THEN saved.command END,'retired_at',CASE WHEN exists_saved THEN saved.retired_at END,'replayed',true);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_service_batch_retirement_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_service_batch_retirement_status(uuid,uuid,uuid) TO authenticated;
COMMIT;


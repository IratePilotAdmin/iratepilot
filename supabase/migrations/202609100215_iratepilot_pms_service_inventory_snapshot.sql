-- Preserve reviewed inventory denominators in future nightly close snapshots.
BEGIN;
-- Snapshot the inventory configuration reviewed at close; never reconstruct older closes.
CREATE FUNCTION irp_pms.service_inventory_snapshot(p_tenant uuid,p_property uuid,p_day date) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH inventory AS (
  SELECT t.id AS room_type_id,t.name AS room_type_name,m.configured_units,m.physical_units,m.closed_units,m.effective_units
  FROM irp_pms.room_types t CROSS JOIN LATERAL irp_pms.maintenance_capacity(p_tenant,p_property,t.id,p_day) m
  WHERE t.tenant_id=p_tenant AND t.property_id=p_property
 )
 SELECT jsonb_build_object('schema_version',1,'service_date',p_day,'basis','inventory_configuration_at_close',
  'room_types',coalesce(jsonb_agg(to_jsonb(inventory) ORDER BY room_type_id),'[]'::jsonb),
  'physical_units',coalesce(sum(physical_units),0),'closed_units',coalesce(sum(closed_units),0),
  'configured_units',CASE WHEN count(*)=0 OR count(*) FILTER(WHERE configured_units IS NULL)>0 THEN NULL ELSE sum(configured_units) END,
  'effective_units',CASE WHEN count(*)=0 OR count(*) FILTER(WHERE effective_units IS NULL)>0 THEN NULL ELSE sum(effective_units) END,
  'missing_capacity_types',count(*) FILTER(WHERE configured_units IS NULL),'room_type_count',count(*),
  'complete',count(*)>0 AND count(*) FILTER(WHERE effective_units IS NULL)=0)
 FROM inventory
$$;
REVOKE ALL ON FUNCTION irp_pms.service_inventory_snapshot(uuid,uuid,date) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION irp_pms.service_day_data(p_tenant uuid,p_property uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE book irp_pms.service_books;prop irp_pms.properties;r irp_pms.reservations;data jsonb;line jsonb;row_data jsonb;rows jsonb:='[]';blockers jsonb:='[]';result jsonb;
 today date;day date;occupied boolean;same_day_use boolean;code text;count_rows integer:=0;room_amount bigint:=0;tax_amount bigint:=0;hotel_amount bigint:=0;ota_amount bigint:=0;other_amount bigint:=0;total_amount bigint:=0;occupied_count integer:=0;
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
  -- A completed same-calendar-day physical stay earns its charges without an overnight count.
  -- Missing/reversed timestamps, cancellations and later unused nights never qualify.
  same_day_use:=coalesce(r.status='Checked out' AND r.physical_room_id IS NOT NULL
    AND r.checked_in_at IS NOT NULL AND r.checked_out_at>r.checked_in_at
    AND (r.checked_in_at AT TIME ZONE book.time_zone)::date=day
    AND (r.checked_out_at AT TIME ZONE book.time_zone)::date=day,false);
  IF r.status='Confirmed' THEN code:='arrival_not_resolved';
  ELSIF r.status='In house' AND r.departure<=day THEN code:='overdue_stay_requires_extension';
  ELSIF r.status='Cancelled' AND (NOT (data->>'has_folio')::boolean OR coalesce((data->>'total_minor')::bigint,0)=0) THEN CONTINUE;
  ELSE
   code:=data->>'reason';
   SELECT x INTO line FROM jsonb_array_elements(data->'lines') x WHERE (x->>'date')::date=day;
   IF code IS NULL AND line IS NULL THEN code:='service_date_allocation_missing';END IF;
   IF code IS NULL AND NOT occupied AND NOT same_day_use AND (data->>'allocation_source'<>'manager_approved' OR (line->>'accommodation_minor')::bigint<>0 OR (line->>'hotel_fees_minor')::bigint<>0) THEN code:='unoccupied_night_requires_explicit_allocation';END IF;
  END IF;
  IF line IS NOT NULL THEN
   line:=line||jsonb_build_object('service_usage',CASE WHEN occupied THEN 'overnight' WHEN same_day_use THEN 'same_day_use' ELSE 'unoccupied' END);
  END IF;
  row_data:=jsonb_build_object('reservation_id',r.id,'source',r.source,'status',r.status,'guest_name',r.guest_name,'source_version',r.source_version,'room_type_id',r.room_type_id,'physical_room_id',r.physical_room_id,'occupied_night',occupied,'same_day_use',same_day_use,'pricing_hash',data->>'pricing_hash','financial_basis',data->>'financial_basis','allocation_source',data->>'allocation_source','blocker',code,'allocation',line);
  rows:=rows||jsonb_build_array(row_data);
  IF code IS NOT NULL THEN blockers:=blockers||jsonb_build_array(jsonb_build_object('reservation_id',r.id,'code',code));
  ELSE
   room_amount:=room_amount+(line->>'accommodation_minor')::bigint;tax_amount:=tax_amount+(line->>'taxes_minor')::bigint;hotel_amount:=hotel_amount+(line->>'hotel_fees_minor')::bigint;ota_amount:=ota_amount+(line->>'ota_fees_minor')::bigint;other_amount:=other_amount+(line->>'other_revenue_minor')::bigint;total_amount:=total_amount+(line->>'total_minor')::bigint;
   IF occupied THEN occupied_count:=occupied_count+1;END IF;
  END IF;
 END LOOP;
 result:=jsonb_build_object('initialized',true,'first_service_date',book.first_service_date,'next_service_date',day,'version',book.version,'time_zone',book.time_zone,'civil_date',today,'currency','USD','accounting_scope','service_date_allocation','operating_date_unchanged',true,'can_close',jsonb_array_length(blockers)=0,'blockers',blockers,'rows',rows,'candidate_count',count_rows,'rows_truncated',false,'inventory_snapshot',irp_pms.service_inventory_snapshot(p_tenant,p_property,day),
 'totals',jsonb_build_object('accommodation_minor',room_amount,'taxes_minor',tax_amount,'hotel_fees_minor',hotel_amount,'ota_fees_minor',ota_amount,'other_revenue_minor',other_amount,'revenue_minor',room_amount+hotel_amount+other_amount,'total_minor',total_amount,'occupied_nights',occupied_count,'complete',jsonb_array_length(blockers)=0));
 RETURN result||jsonb_build_object('preview_hash',encode(sha256(convert_to(result::text,'UTF8')),'hex'));
END $$;
REVOKE ALL ON FUNCTION irp_pms.service_day_data(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;


COMMIT;


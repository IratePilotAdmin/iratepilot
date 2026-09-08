BEGIN;
CREATE OR REPLACE FUNCTION irp_pms.service_pricing(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE r irp_pms.reservations;f irp_pms.folio_openings;q irp_pms.rate_quotes;a irp_pms.service_allocation_approvals;
 has_folio boolean;adjustments jsonb;net_adjustment bigint;basis bigint;fingerprint jsonb;hash text;auto_lines jsonb;reason text;line jsonb;lines jsonb:='[]';components jsonb;fixed boolean;part record;component_key text;
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
 IF EXISTS(SELECT 1 FROM irp_pms.effective_opening_itemizations WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation) THEN
  fingerprint:=fingerprint||jsonb_build_object('opening_classifications',(SELECT jsonb_agg(jsonb_build_object('reversal_id',reversal_id,'revision',revision,'lines',ci.lines) ORDER BY reversal_id) FROM irp_pms.effective_opening_itemizations ci WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation));
 END IF;
 fixed:=adjustments='[]'::jsonb;
 IF has_folio AND adjustments<>'[]'::jsonb AND NOT EXISTS(SELECT 1 FROM irp_pms.folio_entries e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.reservation_id=p_reservation AND e.kind='charge_reversal' AND e.target_entry_id IS NULL AND NOT EXISTS(SELECT 1 FROM irp_pms.effective_opening_itemizations c WHERE c.tenant_id=e.tenant_id AND c.property_id=e.property_id AND c.reservation_id=e.reservation_id AND c.reversal_id=e.id)) THEN
  FOR part IN SELECT x->>'source_key' AS source_key,sum((x->>'amount_minor')::bigint) AS amount FROM irp_pms.effective_opening_itemizations c CROSS JOIN LATERAL jsonb_array_elements(c.lines) x WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.reservation_id=p_reservation GROUP BY x->>'source_key' LOOP
   component_key:=CASE WHEN part.source_key='opening:accommodation' THEN 'accommodation_minor' WHEN part.source_key='opening:ota' THEN 'ota_fees_minor' WHEN part.source_key LIKE 'opening:tax:%' THEN 'taxes_minor' WHEN part.source_key LIKE 'opening:fee:%' THEN 'hotel_fees_minor' END;
   IF component_key IS NULL THEN RAISE EXCEPTION 'Unknown opening service category';END IF;
   components:=jsonb_set(components,ARRAY[component_key],to_jsonb((components->>component_key)::bigint-part.amount));
  END LOOP;
  SELECT coalesce(sum(CASE WHEN kind='charge' THEN amount_minor ELSE -amount_minor END),0) INTO net_adjustment FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND (kind='charge' OR (kind='charge_reversal' AND target_entry_id IS NOT NULL));
  components:=jsonb_set(components,ARRAY['other_revenue_minor'],to_jsonb(net_adjustment));
  IF EXISTS(SELECT 1 FROM jsonb_each_text(components) v WHERE v.value::bigint<0) OR (SELECT sum(v.value::bigint) FROM jsonb_each_text(components) v)<>basis THEN RAISE EXCEPTION 'Service category totals do not reconcile';END IF;
  fixed:=true;
 END IF;
 hash:=encode(sha256(convert_to(fingerprint::text,'UTF8')),'hex');
 SELECT * INTO a FROM irp_pms.service_allocation_approvals WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation ORDER BY id DESC LIMIT 1;
 IF FOUND AND a.pricing_hash=hash THEN
  RETURN jsonb_build_object('reservation',to_jsonb(r),'pricing_hash',hash,'financial_basis',CASE WHEN has_folio THEN 'folio_charges' ELSE 'reservation_charges' END,'total_minor',basis,'component_totals',components,'component_totals_fixed',fixed,'allocation_source','manager_approved','approval_id',a.id,'lines',a.lines,'reason',NULL,'has_folio',has_folio);
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
 RETURN jsonb_build_object('reservation',to_jsonb(r),'pricing_hash',hash,'financial_basis',CASE WHEN has_folio THEN 'folio_charges' ELSE 'reservation_charges' END,'total_minor',basis,'component_totals',components,'component_totals_fixed',fixed,'allocation_source',CASE WHEN reason IS NULL THEN 'quote' ELSE NULL END,'lines',CASE WHEN reason IS NULL THEN lines ELSE '[]'::jsonb END,'reason',reason,'has_folio',has_folio);
END $$;

CREATE FUNCTION irp_pms.opening_classification_service_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM irp_pms.service_day_entries WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND reservation_id=NEW.reservation_id) THEN
  INSERT INTO irp_pms.service_reconciliation(tenant_id,property_id,reservation_id) VALUES(NEW.tenant_id,NEW.property_id,NEW.reservation_id)
  ON CONFLICT(tenant_id,property_id,reservation_id) DO UPDATE SET changed_at=clock_timestamp();
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.opening_classification_service_changed() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER service_classification_changed AFTER INSERT ON irp_pms.invoice_opening_adjustments FOR EACH ROW EXECUTE FUNCTION irp_pms.opening_classification_service_changed();
CREATE TRIGGER service_classification_changed AFTER INSERT ON irp_pms.opening_itemization_revisions FOR EACH ROW EXECUTE FUNCTION irp_pms.opening_classification_service_changed();
COMMIT;

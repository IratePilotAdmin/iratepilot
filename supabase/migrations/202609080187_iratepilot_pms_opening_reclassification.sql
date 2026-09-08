BEGIN;
-- Source: invoice-opening-revisions-draft.sql
-- Append-only category corrections. Original request receipts remain unchanged.
CREATE TABLE irp_pms.opening_itemization_revisions (
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,reservation_id uuid NOT NULL,reversal_id uuid NOT NULL,
 revision bigint NOT NULL CHECK(revision BETWEEN 1 AND 999999999999),
 previous_revision bigint,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 lines jsonb NOT NULL CHECK(jsonb_typeof(lines)='array' AND jsonb_array_length(lines) BETWEEN 1 AND 100),
 reason text NOT NULL CHECK(length(reason) BETWEEN 4 AND 500 AND reason=trim(reason) AND reason!~'[[:cntrl:]]'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,reservation_id,reversal_id,revision),UNIQUE(tenant_id,property_id,request_id),
 CHECK((revision=1 AND previous_revision IS NULL) OR (revision>1 AND previous_revision=revision-1 AND previous_revision IS NOT NULL)),
 FOREIGN KEY(tenant_id,property_id,reservation_id,reversal_id) REFERENCES irp_pms.invoice_opening_adjustments(tenant_id,property_id,reservation_id,reversal_id),
 FOREIGN KEY(tenant_id,property_id,reservation_id,reversal_id,previous_revision) REFERENCES irp_pms.opening_itemization_revisions(tenant_id,property_id,reservation_id,reversal_id,revision)
);
ALTER TABLE irp_pms.opening_itemization_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.opening_itemization_revisions FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.opening_itemization_revisions FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE VIEW irp_pms.effective_opening_itemizations AS
SELECT a.tenant_id,a.property_id,a.reservation_id,a.reversal_id,
 coalesce(r.revision,0) AS revision,coalesce(r.lines,a.lines) AS lines
FROM irp_pms.invoice_opening_adjustments a LEFT JOIN LATERAL (
 SELECT revision,lines FROM irp_pms.opening_itemization_revisions r
 WHERE r.tenant_id=a.tenant_id AND r.property_id=a.property_id AND r.reservation_id=a.reservation_id AND r.reversal_id=a.reversal_id ORDER BY revision DESC LIMIT 1
) r ON true;
REVOKE ALL ON irp_pms.effective_opening_itemizations FROM PUBLIC,anon,authenticated,service_role;

-- Source: invoice-opening-effective-readers-draft.sql
CREATE OR REPLACE FUNCTION public.irp_pms_pilot_itemize_opening_reversal(p_tenant uuid,p_property uuid,p_reservation uuid,p_reversal uuid,p_request uuid,p_lines jsonb,p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.invoice_opening_adjustments;reversal irp_pms.folio_entries;opening jsonb;item jsonb;category text;base numeric;used numeric;total numeric:=0;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_reversal IS NULL OR p_confirmed IS DISTINCT FROM true OR p_reason IS NULL OR p_reason<>trim(p_reason) OR length(p_reason) NOT BETWEEN 4 AND 500 OR p_reason~'[[:cntrl:]]' OR p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Confirm itemized opening reversal';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO saved FROM irp_pms.invoice_opening_adjustments WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;replayed:=FOUND;
 IF replayed THEN
  IF saved.actor_id IS DISTINCT FROM auth.uid() OR saved.reservation_id IS DISTINCT FROM p_reservation OR saved.reversal_id IS DISTINCT FROM p_reversal OR saved.lines IS DISTINCT FROM p_lines OR saved.reason IS DISTINCT FROM p_reason THEN RAISE EXCEPTION 'Opening reversal request has different details';END IF;
 ELSE
  SELECT * INTO STRICT reversal FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND id=p_reversal;
  IF reversal.kind<>'charge_reversal' OR reversal.target_entry_id IS NOT NULL THEN RAISE EXCEPTION 'Select an opening charge reversal';END IF;
  IF EXISTS(SELECT 1 FROM irp_pms.invoice_opening_adjustments WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND reversal_id=p_reversal) THEN RAISE EXCEPTION 'Opening reversal already itemized';END IF;
  opening:=public.irp_pms_pilot_folio(p_tenant,p_property,p_reservation)->'opening';
  IF (SELECT count(*)<>count(DISTINCT value->>'source_key') FROM jsonb_array_elements(p_lines)) THEN RAISE EXCEPTION 'Duplicate opening reversal category';END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
   IF jsonb_typeof(item)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(item))<>2 OR jsonb_typeof(item->'source_key') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'amount_minor') IS DISTINCT FROM 'string' OR item->>'amount_minor'!~'^[1-9][0-9]{0,11}$' THEN RAISE EXCEPTION 'Invalid opening reversal amount';END IF;
   category:=item->>'source_key';base:=NULL;
   IF category='opening:accommodation' THEN base:=(opening->>'accommodation_minor')::numeric;
   ELSIF category='opening:ota' THEN base:=(opening->>'fees_minor')::numeric;
   ELSIF opening->'charge_breakdown' IS NULL OR opening->'charge_breakdown'='null'::jsonb THEN
    IF category='opening:tax:legacy' THEN base:=(opening->>'taxes_minor')::numeric;ELSIF category='opening:fee:legacy' THEN base:=coalesce((opening->>'hotel_fees_minor')::numeric,0);END IF;
   ELSE
    SELECT sum((value->>'amount_minor')::numeric) INTO base FROM (SELECT value FROM jsonb_array_elements(opening->'charge_breakdown'->'taxes') WHERE 'opening:tax:'||(value->>'code')=category UNION ALL SELECT value FROM jsonb_array_elements(opening->'charge_breakdown'->'fees') WHERE 'opening:fee:'||(value->>'code')=category) components;
   END IF;
   SELECT coalesce(sum((entry->>'amount_minor')::numeric),0) INTO used FROM irp_pms.effective_opening_itemizations a CROSS JOIN LATERAL jsonb_array_elements(a.lines) entry WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND a.reservation_id=p_reservation AND entry->>'source_key'=category;
   IF base IS NULL OR used+(item->>'amount_minor')::numeric>base THEN RAISE EXCEPTION 'Opening reversal exceeds original category';END IF;
   total:=total+(item->>'amount_minor')::numeric;
  END LOOP;
  IF total<>reversal.amount_minor THEN RAISE EXCEPTION 'Itemization must equal the opening reversal';END IF;
  INSERT INTO irp_pms.invoice_opening_adjustments VALUES(p_tenant,p_property,p_reservation,p_reversal,p_request,auth.uid(),p_lines,p_reason,clock_timestamp()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'invoice_opening_reversal_itemized',p_reservation,jsonb_build_object('reversal_id',p_reversal,'request_id',p_request));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'reservation_id',p_reservation,'reversal_id',p_reversal,'lines',saved.lines,'reason',saved.reason,'replayed',replayed);
END $$;

CREATE OR REPLACE FUNCTION public.irp_pms_pilot_invoice_sources(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE folio jsonb;opening jsonb;breakdown jsonb;lines jsonb:='[]';item jsonb;row record;tax_total numeric:=0;fee_total numeric:=0;net numeric;prior numeric;available numeric;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 folio:=public.irp_pms_pilot_folio(p_tenant,p_property,p_reservation);
 IF folio->>'available'<>'true' THEN RAISE EXCEPTION 'Reconcile unavailable folio charges before invoicing';END IF;
 IF folio->>'reservation_amounts_changed'='true' THEN RAISE EXCEPTION 'Reconcile changed reservation charges before invoicing';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.folio_entries e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.reservation_id=p_reservation AND e.kind='charge_reversal' AND e.target_entry_id IS NULL AND NOT EXISTS(SELECT 1 FROM irp_pms.effective_opening_itemizations a WHERE a.tenant_id=e.tenant_id AND a.property_id=e.property_id AND a.reservation_id=e.reservation_id AND a.reversal_id=e.id)) THEN RAISE EXCEPTION 'Opening charge reversals require itemized invoice reconciliation';END IF;
 opening:=folio->'opening';breakdown:=opening->'charge_breakdown';
 lines:=jsonb_build_array(jsonb_build_object('source_key','opening:accommodation','description','Accommodation','category','accommodation','amount_minor',opening->>'accommodation_minor'));
 IF breakdown IS NOT NULL AND breakdown<>'null'::jsonb THEN
  FOR item IN SELECT value FROM jsonb_array_elements(breakdown->'taxes') LOOP
   tax_total:=tax_total+(item->>'amount_minor')::numeric;
   lines:=lines||jsonb_build_array(jsonb_build_object('source_key','opening:tax:'||(item->>'code'),'description',item->>'label','category','tax:'||(item->>'code'),'amount_minor',item->>'amount_minor'));
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(breakdown->'fees') LOOP
   fee_total:=fee_total+(item->>'amount_minor')::numeric;
   lines:=lines||jsonb_build_array(jsonb_build_object('source_key','opening:fee:'||(item->>'code'),'description',item->>'label','category','fee:'||(item->>'code'),'amount_minor',item->>'amount_minor'));
  END LOOP;
  IF tax_total<>(opening->>'taxes_minor')::numeric OR fee_total<>coalesce((opening->>'hotel_fees_minor')::numeric,0) THEN RAISE EXCEPTION 'Itemized invoice taxes and fees do not reconcile';END IF;
 ELSE
  lines:=lines||jsonb_build_array(jsonb_build_object('source_key','opening:tax:legacy','description','Recorded combined tax','category','tax:legacy','amount_minor',opening->>'taxes_minor'),jsonb_build_object('source_key','opening:fee:legacy','description','Recorded hotel fees','category','fee:legacy','amount_minor',coalesce(opening->>'hotel_fees_minor','0')));
 END IF;
 lines:=lines||jsonb_build_array(jsonb_build_object('source_key','opening:ota','description','Recorded OTA fee','category','ota_fee','amount_minor',opening->>'fees_minor'));
 FOR item IN SELECT value FROM jsonb_array_elements(lines) LOOP
  SELECT coalesce(sum((entry->>'amount_minor')::numeric),0) INTO prior FROM irp_pms.effective_opening_itemizations a CROSS JOIN LATERAL jsonb_array_elements(a.lines) entry WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND a.reservation_id=p_reservation AND entry->>'source_key'=item->>'source_key';
  IF prior>(item->>'amount_minor')::numeric THEN RAISE EXCEPTION 'Opening reversal exceeds its original charge category';END IF;
  item:=item||jsonb_build_object('amount_minor',((item->>'amount_minor')::numeric-prior)::text);
  lines:=jsonb_set(lines,ARRAY[(SELECT (ordinality-1)::text FROM jsonb_array_elements(lines) WITH ORDINALITY WHERE value->>'source_key'=item->>'source_key')],item);
 END LOOP;
 FOR row IN SELECT e.id,e.reference,e.amount_minor-coalesce((SELECT sum(r.amount_minor) FROM irp_pms.folio_entries r WHERE r.tenant_id=e.tenant_id AND r.property_id=e.property_id AND r.reservation_id=e.reservation_id AND r.kind='charge_reversal' AND r.target_entry_id=e.id),0) AS amount_minor FROM irp_pms.folio_entries e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.reservation_id=p_reservation AND e.kind='charge' ORDER BY e.created_at,e.id LOOP
  lines:=lines||jsonb_build_array(jsonb_build_object('source_key','entry:'||row.id::text,'description',row.reference,'category','other_revenue','amount_minor',row.amount_minor::text));
 END LOOP;
 IF (SELECT count(*)<>count(DISTINCT value->>'source_key') FROM jsonb_array_elements(lines)) THEN RAISE EXCEPTION 'Duplicate invoice charge sources';END IF;
 SELECT coalesce(sum((value->>'amount_minor')::numeric),0) INTO net FROM jsonb_array_elements(lines);
 IF net<>(folio->'totals'->>'charges_minor')::numeric THEN RAISE EXCEPTION 'Invoice charge sources do not reconcile to folio';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(lines) LOOP
  SELECT coalesce(sum(l.amount_minor),0) INTO prior FROM irp_pms.invoice_lines l JOIN irp_pms.invoices i ON i.tenant_id=l.tenant_id AND i.property_id=l.property_id AND i.id=l.invoice_id WHERE i.tenant_id=p_tenant AND i.property_id=p_property AND i.reservation_id=p_reservation AND l.source_key=item->>'source_key';
  SELECT prior-coalesce(sum(c.amount_minor),0) INTO prior FROM irp_pms.invoice_credit_lines c JOIN irp_pms.invoice_lines l ON l.tenant_id=c.tenant_id AND l.property_id=c.property_id AND l.invoice_id=c.invoice_id AND l.line_number=c.invoice_line_number JOIN irp_pms.invoices i ON i.tenant_id=l.tenant_id AND i.property_id=l.property_id AND i.id=l.invoice_id WHERE i.tenant_id=p_tenant AND i.property_id=p_property AND i.reservation_id=p_reservation AND l.source_key=item->>'source_key';
  available:=(item->>'amount_minor')::numeric-prior;
  IF available<0 THEN RAISE EXCEPTION 'Invoiced charge was reduced; issue a reconciled credit note';END IF;
  item:=item||jsonb_build_object('invoiced_minor',prior::text,'available_minor',available::text);
  lines:=jsonb_set(lines,ARRAY[(SELECT (ordinality-1)::text FROM jsonb_array_elements(lines) WITH ORDINALITY WHERE value->>'source_key'=item->>'source_key')],item);
 END LOOP;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'reservation_id',p_reservation,'actor_id',auth.uid(),'currency','USD','lines',lines,'folio_snapshot',folio,'source_hash',encode(sha256(convert_to(jsonb_build_object('folio',folio,'lines',lines)::text,'UTF8')),'hex'));
END $$;

CREATE OR REPLACE FUNCTION public.irp_pms_pilot_opening_reversal_review(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE folio jsonb;opening jsonb;breakdown jsonb;lines jsonb:='[]';item jsonb;row record;tax_total numeric:=0;fee_total numeric:=0;net numeric;prior numeric;available numeric;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 folio:=public.irp_pms_pilot_folio(p_tenant,p_property,p_reservation);
 IF folio->>'available'<>'true' THEN RAISE EXCEPTION 'Reconcile unavailable folio charges before invoicing';END IF;
 IF folio->>'reservation_amounts_changed'='true' THEN RAISE EXCEPTION 'Reconcile changed reservation charges before invoicing';END IF;
 opening:=folio->'opening';breakdown:=opening->'charge_breakdown';
 lines:=jsonb_build_array(jsonb_build_object('source_key','opening:accommodation','description','Accommodation','category','accommodation','amount_minor',opening->>'accommodation_minor'));
 IF breakdown IS NOT NULL AND breakdown<>'null'::jsonb THEN
  FOR item IN SELECT value FROM jsonb_array_elements(breakdown->'taxes') LOOP
   tax_total:=tax_total+(item->>'amount_minor')::numeric;
   lines:=lines||jsonb_build_array(jsonb_build_object('source_key','opening:tax:'||(item->>'code'),'description',item->>'label','category','tax:'||(item->>'code'),'amount_minor',item->>'amount_minor'));
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(breakdown->'fees') LOOP
   fee_total:=fee_total+(item->>'amount_minor')::numeric;
   lines:=lines||jsonb_build_array(jsonb_build_object('source_key','opening:fee:'||(item->>'code'),'description',item->>'label','category','fee:'||(item->>'code'),'amount_minor',item->>'amount_minor'));
  END LOOP;
  IF tax_total<>(opening->>'taxes_minor')::numeric OR fee_total<>coalesce((opening->>'hotel_fees_minor')::numeric,0) THEN RAISE EXCEPTION 'Itemized invoice taxes and fees do not reconcile';END IF;
 ELSE
  lines:=lines||jsonb_build_array(jsonb_build_object('source_key','opening:tax:legacy','description','Recorded combined tax','category','tax:legacy','amount_minor',opening->>'taxes_minor'),jsonb_build_object('source_key','opening:fee:legacy','description','Recorded hotel fees','category','fee:legacy','amount_minor',coalesce(opening->>'hotel_fees_minor','0')));
 END IF;
 lines:=lines||jsonb_build_array(jsonb_build_object('source_key','opening:ota','description','Recorded OTA fee','category','ota_fee','amount_minor',opening->>'fees_minor'));
 FOR item IN SELECT value FROM jsonb_array_elements(lines) LOOP
  SELECT coalesce(sum((entry->>'amount_minor')::numeric),0) INTO prior FROM irp_pms.effective_opening_itemizations a CROSS JOIN LATERAL jsonb_array_elements(a.lines) entry WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND a.reservation_id=p_reservation AND entry->>'source_key'=item->>'source_key';
  IF prior>(item->>'amount_minor')::numeric THEN RAISE EXCEPTION 'Opening reversal exceeds its original charge category';END IF;
  item:=item||jsonb_build_object('original_minor',item->>'amount_minor','itemized_minor',prior::text,'available_minor',((item->>'amount_minor')::numeric-prior)::text);
  lines:=jsonb_set(lines,ARRAY[(SELECT (ordinality-1)::text FROM jsonb_array_elements(lines) WITH ORDINALITY WHERE value->>'source_key'=item->>'source_key')],item);
 END LOOP;
 IF (SELECT count(*)<>count(DISTINCT value->>'source_key') FROM jsonb_array_elements(lines)) THEN RAISE EXCEPTION 'Duplicate opening categories';END IF;
 IF (SELECT count(*) FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND kind='charge_reversal' AND target_entry_id IS NULL)>1000 THEN RAISE EXCEPTION 'Too many opening reversals for complete review';END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'reservation_id',p_reservation,'actor_id',auth.uid(),'currency','USD','complete',true,'lines',lines,'reversals',coalesce((SELECT jsonb_agg(jsonb_build_object('reversal_id',e.id,'amount_minor',e.amount_minor::text,'reference',e.reference,'created_at',e.created_at,'itemized',a.reversal_id IS NOT NULL,'itemized_lines',a.lines,'classification_revision',a.revision::text) ORDER BY e.created_at,e.id) FROM irp_pms.folio_entries e LEFT JOIN irp_pms.effective_opening_itemizations a ON a.tenant_id=e.tenant_id AND a.property_id=e.property_id AND a.reservation_id=e.reservation_id AND a.reversal_id=e.id WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.reservation_id=p_reservation AND e.kind='charge_reversal' AND e.target_entry_id IS NULL),'[]'::jsonb));
END $$;

-- Source: invoice-opening-reclassify-api-draft.sql
CREATE FUNCTION public.irp_pms_pilot_reclassify_opening_itemization(p_tenant uuid,p_property uuid,p_reservation uuid,p_reversal uuid,p_request uuid,p_expected_revision bigint,p_lines jsonb,p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.opening_itemization_revisions;current_item record;review jsonb;item jsonb;category jsonb;existing numeric;invoiced numeric;total numeric:=0;original_total numeric;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_expected_revision IS NULL OR p_expected_revision NOT BETWEEN 0 AND 999999999998 OR p_confirmed IS DISTINCT FROM true OR p_reason IS NULL OR length(p_reason) NOT BETWEEN 4 AND 500 OR p_reason<>trim(p_reason) OR p_reason~'[[:cntrl:]]' OR p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' THEN RAISE EXCEPTION 'Confirm valid category correction details';END IF;
 IF jsonb_array_length(p_lines) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Choose 1 to 100 categories';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO saved FROM irp_pms.opening_itemization_revisions WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;replayed:=FOUND;
 IF replayed THEN
  IF saved.actor_id IS DISTINCT FROM auth.uid() OR saved.reservation_id IS DISTINCT FROM p_reservation OR saved.reversal_id IS DISTINCT FROM p_reversal OR saved.revision<>p_expected_revision+1 OR saved.lines IS DISTINCT FROM p_lines OR saved.reason IS DISTINCT FROM p_reason THEN RAISE EXCEPTION 'Category correction request has different details';END IF;
 ELSE
  SELECT * INTO STRICT current_item FROM irp_pms.effective_opening_itemizations WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND reversal_id=p_reversal;
  IF current_item.revision<>p_expected_revision THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Category classification changed; review again';END IF;
  IF current_item.lines=p_lines THEN RAISE EXCEPTION 'Category correction must change the classification';END IF;
  review:=public.irp_pms_pilot_opening_reversal_review(p_tenant,p_property,p_reservation);
  SELECT sum((value->>'amount_minor')::numeric) INTO original_total FROM jsonb_array_elements(current_item.lines);
  IF (SELECT count(*)<>count(DISTINCT value->>'source_key') FROM jsonb_array_elements(p_lines)) THEN RAISE EXCEPTION 'Duplicate category';END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
   IF jsonb_typeof(item)<>'object' OR (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(item)key) IS DISTINCT FROM ARRAY['amount_minor','source_key'] OR jsonb_typeof(item->'source_key') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'amount_minor') IS DISTINCT FROM 'string' OR item->>'amount_minor'!~'^[1-9][0-9]{0,11}$' THEN RAISE EXCEPTION 'Invalid category amount';END IF;
   SELECT value INTO category FROM jsonb_array_elements(review->'lines') WHERE value->>'source_key'=item->>'source_key';
   IF NOT FOUND THEN RAISE EXCEPTION 'Unknown opening category';END IF;
   SELECT coalesce(sum((value->>'amount_minor')::numeric),0) INTO existing FROM jsonb_array_elements(current_item.lines) WHERE value->>'source_key'=item->>'source_key';
   IF (item->>'amount_minor')::numeric>(category->>'available_minor')::numeric+existing THEN RAISE EXCEPTION 'Category exceeds original charge capacity';END IF;
   SELECT coalesce(sum(l.amount_minor),0) INTO invoiced FROM irp_pms.invoice_lines l JOIN irp_pms.invoices i ON i.tenant_id=l.tenant_id AND i.property_id=l.property_id AND i.id=l.invoice_id WHERE i.tenant_id=p_tenant AND i.property_id=p_property AND i.reservation_id=p_reservation AND l.source_key=item->>'source_key';
   SELECT invoiced-coalesce(sum(c.amount_minor),0) INTO invoiced FROM irp_pms.invoice_credit_lines c JOIN irp_pms.invoice_lines l ON l.tenant_id=c.tenant_id AND l.property_id=c.property_id AND l.invoice_id=c.invoice_id AND l.line_number=c.invoice_line_number JOIN irp_pms.invoices i ON i.tenant_id=l.tenant_id AND i.property_id=l.property_id AND i.id=l.invoice_id WHERE i.tenant_id=p_tenant AND i.property_id=p_property AND i.reservation_id=p_reservation AND l.source_key=item->>'source_key';
   IF (category->>'available_minor')::numeric+existing-(item->>'amount_minor')::numeric<invoiced THEN RAISE EXCEPTION 'Invoiced charge was reduced; issue a reconciled credit note';END IF;
   total:=total+(item->>'amount_minor')::numeric;
  END LOOP;
  IF total<>original_total THEN RAISE EXCEPTION 'Category correction must preserve the reversal total';END IF;
  INSERT INTO irp_pms.opening_itemization_revisions(tenant_id,property_id,reservation_id,reversal_id,revision,previous_revision,request_id,actor_id,lines,reason) VALUES(p_tenant,p_property,p_reservation,p_reversal,p_expected_revision+1,CASE WHEN p_expected_revision>0 THEN p_expected_revision END,p_request,auth.uid(),p_lines,p_reason) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'opening_itemization_reclassified',p_reversal,jsonb_build_object('request_id',p_request,'revision',saved.revision));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'reservation_id',saved.reservation_id,'reversal_id',saved.reversal_id,'actor_id',saved.actor_id,'request_id',saved.request_id,'revision',saved.revision::text,'lines',saved.lines,'reason',saved.reason,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_reclassify_opening_itemization(uuid,uuid,uuid,uuid,uuid,bigint,jsonb,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_reclassify_opening_itemization(uuid,uuid,uuid,uuid,uuid,bigint,jsonb,text,boolean) TO authenticated;

-- Source: invoice-opening-reclassification-status-draft.sql
CREATE FUNCTION public.irp_pms_pilot_opening_reclassification_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.opening_itemization_revisions%ROWTYPE;receipt jsonb:=NULL;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Correction request is required';END IF;
 SELECT * INTO saved FROM irp_pms.opening_itemization_revisions WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 IF FOUND THEN
  receipt:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'reservation_id',saved.reservation_id,'reversal_id',saved.reversal_id,'actor_id',saved.actor_id,'request_id',saved.request_id,'revision',saved.revision::text,'lines',saved.lines,'reason',saved.reason,'replayed',true);
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'found',receipt IS NOT NULL,'result',receipt);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_opening_reclassification_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_opening_reclassification_status(uuid,uuid,uuid) TO authenticated;

COMMIT;

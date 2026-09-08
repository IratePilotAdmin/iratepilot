BEGIN;
CREATE FUNCTION public.irp_pms_pilot_invoice_aging_page(p_tenant uuid,p_property uuid,p_as_of date,p_offset integer DEFAULT 0,p_snapshot text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE business_date date;rows jsonb;totals jsonb;grand numeric;token text;page jsonb;total_rows integer;invalid boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT (clock_timestamp() AT TIME ZONE time_zone)::date INTO STRICT business_date FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_as_of IS NULL OR NOT isfinite(p_as_of) OR p_as_of>business_date THEN RAISE EXCEPTION 'Choose an invoice aging date no later than today';END IF;
 IF p_offset IS NULL OR p_offset<0 OR (p_offset>0 AND p_snapshot IS NULL) THEN RAISE EXCEPTION 'Valid aging page and snapshot required';END IF;
 WITH payments AS (
  SELECT invoice_id,sum(amount_minor) AS amount FROM irp_pms.invoice_payment_allocations
  WHERE tenant_id=p_tenant AND property_id=p_property AND effective_on<=p_as_of GROUP BY invoice_id
 ), reversals AS (
  SELECT a.invoice_id,sum(r.amount_minor) AS amount FROM irp_pms.invoice_allocation_reversals r
  JOIN irp_pms.invoice_payment_allocations a ON a.tenant_id=r.tenant_id AND a.property_id=r.property_id AND a.id=r.allocation_id
  WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND r.effective_on<=p_as_of GROUP BY a.invoice_id
 ), credits AS (
  SELECT invoice_id,sum(amount_minor) AS amount FROM irp_pms.invoice_credit_notes
  WHERE tenant_id=p_tenant AND property_id=p_property AND effective_on<=p_as_of GROUP BY invoice_id
 ), balances AS (
 SELECT i.*,coalesce(p.amount,0)-coalesce(r.amount,0) AS applied,coalesce(c.amount,0) AS credited,
 i.amount_minor-coalesce(p.amount,0)+coalesce(r.amount,0)-coalesce(c.amount,0) AS outstanding,
 greatest(0,p_as_of-i.due_on) AS overdue
 FROM irp_pms.invoices i LEFT JOIN payments p ON p.invoice_id=i.id LEFT JOIN reversals r ON r.invoice_id=i.id LEFT JOIN credits c ON c.invoice_id=i.id
 WHERE i.tenant_id=p_tenant AND i.property_id=p_property AND i.issued_on<=p_as_of
 ), categorized AS (
 SELECT *,CASE WHEN overdue=0 THEN 'not_due' WHEN overdue<=30 THEN 'days_1_30' WHEN overdue<=60 THEN 'days_31_60' WHEN overdue<=90 THEN 'days_61_90' ELSE 'days_91_plus' END AS bucket FROM balances
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('invoice_id',id,'number',number::text,'issued_on',issued_on,'due_on',due_on,'recipient',coalesce(billing_party->>'legal_name',billing_party->>'company_name'),'days_overdue',overdue,'bucket',bucket,'issued_minor',amount_minor::text,'allocated_minor',applied::text,'credited_minor',credited::text,'outstanding_minor',outstanding::text) ORDER BY due_on,number),'[]'::jsonb),
 jsonb_build_object('not_due',coalesce(sum(outstanding) FILTER(WHERE bucket='not_due'),0)::text,'days_1_30',coalesce(sum(outstanding) FILTER(WHERE bucket='days_1_30'),0)::text,'days_31_60',coalesce(sum(outstanding) FILTER(WHERE bucket='days_31_60'),0)::text,'days_61_90',coalesce(sum(outstanding) FILTER(WHERE bucket='days_61_90'),0)::text,'days_91_plus',coalesce(sum(outstanding) FILTER(WHERE bucket='days_91_plus'),0)::text),
 coalesce(sum(outstanding),0),coalesce(bool_or(outstanding<0 OR applied<0),false)
 INTO rows,totals,grand,invalid FROM categorized;
 IF invalid THEN RAISE EXCEPTION 'Invoice aging ledger does not reconcile';END IF;
 total_rows:=jsonb_array_length(rows);
 token:=encode(sha256(convert_to(jsonb_build_object('tenant',p_tenant,'property',p_property,'as_of',p_as_of,'rows',rows,'totals',totals)::text,'UTF8')),'hex');
 IF p_snapshot IS NOT NULL AND p_snapshot IS DISTINCT FROM token THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Invoice balances changed; restart aging report';END IF;
 IF p_offset>total_rows THEN RAISE EXCEPTION 'Aging page exceeds report size';END IF;
 SELECT coalesce(jsonb_agg(value ORDER BY ordinality),'[]'::jsonb) INTO page FROM jsonb_array_elements(rows) WITH ORDINALITY WHERE ordinality>p_offset AND ordinality<=p_offset+200;
 RETURN jsonb_build_object('schema_version',2,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'currency','USD','as_of',p_as_of,'generated_at',clock_timestamp(),'complete',p_offset+jsonb_array_length(page)=total_rows,'basis','issued_invoices_effective_allocations','rows',page,'totals',totals,'outstanding_minor',grand::text,'snapshot',token,'offset',p_offset,'total_rows',total_rows,'next_offset',CASE WHEN p_offset+jsonb_array_length(page)<total_rows THEN p_offset+jsonb_array_length(page) END);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_invoice_aging_page(uuid,uuid,date,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_invoice_aging_page(uuid,uuid,date,integer,text) TO authenticated;
COMMIT;

BEGIN;
DO $$
DECLARE definition text;needle text:='''reason'',c.reason,''review'',c.review)';replacement text;
BEGIN
 definition:=pg_get_functiondef('public.irp_pms_pilot_cashier_closing_report(uuid,uuid,date,date)'::regprocedure);
 IF strpos(definition,needle)=0 THEN RAISE EXCEPTION 'Unexpected cashier report definition';END IF;
 replacement:='''reason'',c.reason,''review'',c.review,''variance_review_outcome'',CASE WHEN member_role NOT IN(''owner'',''manager'') THEN NULL WHEN (c.review->>''variance_minor'')::numeric=0 THEN ''balanced'' ELSE coalesce((SELECT v.outcome FROM irp_pms.cashier_variance_reviews v WHERE v.tenant_id=c.tenant_id AND v.property_id=c.property_id AND v.session_id=c.session_id ORDER BY v.revision DESC LIMIT 1),''not_reviewed'') END)';
 EXECUTE replace(definition,needle,replacement);
END $$;
COMMIT;
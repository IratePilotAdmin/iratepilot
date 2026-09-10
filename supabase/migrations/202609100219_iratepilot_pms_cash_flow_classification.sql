BEGIN;
CREATE TABLE irp_pms.cash_flow_reviews(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL,
 configuration_id uuid NOT NULL,journal_id uuid NOT NULL,
 version bigint NOT NULL CHECK(version BETWEEN 1 AND 9007199254740991),
 allocations jsonb NOT NULL,reason text NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 journal_snapshot jsonb NOT NULL,command jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,id),UNIQUE(tenant_id,property_id,configuration_id,journal_id,version),
 FOREIGN KEY(tenant_id,property_id,configuration_id) REFERENCES irp_pms.cash_flow_configurations(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,journal_id) REFERENCES irp_pms.gl_journals(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.cash_flow_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.cash_flow_reviews FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cash_flow_review_immutable BEFORE UPDATE OR DELETE ON irp_pms.cash_flow_reviews FOR EACH ROW EXECUTE FUNCTION irp_pms.cash_flow_history_immutable();

CREATE FUNCTION public.irp_pms_pilot_save_cash_flow_review(p_tenant uuid,p_property uuid,p_request uuid,p_configuration uuid,p_journal uuid,p_expected_version bigint,p_allocations jsonb,p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE config irp_pms.cash_flow_configurations;prior irp_pms.cash_flow_reviews;current_version bigint;canonical jsonb;cmd jsonb;snapshot jsonb;
 item jsonb;allocated numeric;inflow numeric;outflow numeric;cash_debit numeric;cash_credit numeric;cash_lines bigint;total_lines bigint;balance numeric;
BEGIN
 IF irp_pms.pilot_require(p_tenant,p_property,true)<>'owner' THEN RAISE EXCEPTION 'Only an owner can approve cash-flow classifications' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR p_configuration IS NULL OR p_journal IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740990 OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Cash-flow review identity, version and confirmation required';END IF;
 IF p_allocations IS NULL OR jsonb_typeof(p_allocations)<>'array' THEN RAISE EXCEPTION 'Cash-flow allocations must be an array';END IF;
 IF jsonb_array_length(p_allocations)>100 THEN RAISE EXCEPTION 'Use at most 100 cash-flow allocation lines';END IF;
 IF p_reason IS NULL OR length(trim(p_reason)) NOT BETWEEN 4 AND 500 OR p_reason ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'Explain the cash-flow classification review';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_allocations) LOOP
  IF jsonb_typeof(item)<>'object' OR (item-'category'-'amount_minor')<>'{}'::jsonb OR jsonb_typeof(item->'category') IS DISTINCT FROM 'string' OR item->>'category' NOT IN ('operating','investing','financing') OR jsonb_typeof(item->'amount_minor') IS DISTINCT FROM 'string' OR item->>'amount_minor' !~ '^-?[1-9][0-9]{0,40}$' THEN RAISE EXCEPTION 'Use operating, investing or financing with nonzero integer minor-unit amounts';END IF;
 END LOOP;
 -- Preserve opposing flows even within the same category. Order is not request identity.
 SELECT coalesce(jsonb_agg(jsonb_build_object('category',category,'amount_minor',amount::text) ORDER BY category,direction),'[]'::jsonb) INTO canonical FROM (
  SELECT value->>'category' category,sign((value->>'amount_minor')::numeric) direction,sum((value->>'amount_minor')::numeric) amount FROM jsonb_array_elements(p_allocations) GROUP BY 1,2
 ) grouped;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 IF irp_pms.pilot_require(p_tenant,p_property,true)<>'owner' THEN RAISE EXCEPTION 'Only an owner can approve cash-flow classifications' USING ERRCODE='42501';END IF;
 cmd:=jsonb_build_object('configuration_id',p_configuration,'journal_id',p_journal,'expected_version',p_expected_version,'allocations',canonical,'reason',trim(p_reason));
 SELECT * INTO prior FROM irp_pms.cash_flow_reviews WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request;
 IF FOUND THEN
  IF prior.actor_id<>auth.uid() OR prior.command<>cmd THEN RAISE EXCEPTION 'Cash-flow review request identity already used';END IF;
  RETURN to_jsonb(prior)-'command'||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO config FROM irp_pms.cash_flow_configurations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_configuration;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cash configuration not found in this property';END IF;
 SELECT to_jsonb(j)-'command'-'creation_transaction'||jsonb_build_object('lines',(SELECT jsonb_agg(jsonb_build_object('line_no',l.line_no,'account_id',l.account_id,'side',l.side,'amount_minor',l.amount_minor::text) ORDER BY l.line_no) FROM irp_pms.gl_lines l WHERE (l.tenant_id,l.property_id,l.journal_id)=(j.tenant_id,j.property_id,j.id))) INTO snapshot
 FROM irp_pms.gl_journals j WHERE j.tenant_id=p_tenant AND j.property_id=p_property AND j.id=p_journal;
 IF NOT FOUND THEN RAISE EXCEPTION 'Journal not found in this property';END IF;
 SELECT count(*),count(*) FILTER(WHERE account_id=ANY(config.cash_account_ids)),
 coalesce(sum(CASE WHEN side='debit' THEN amount_minor::numeric ELSE -amount_minor::numeric END),0),
 coalesce(sum(amount_minor::numeric) FILTER(WHERE account_id=ANY(config.cash_account_ids) AND side='debit'),0),
 coalesce(sum(amount_minor::numeric) FILTER(WHERE account_id=ANY(config.cash_account_ids) AND side='credit'),0)
 INTO total_lines,cash_lines,balance,cash_debit,cash_credit FROM irp_pms.gl_lines WHERE tenant_id=p_tenant AND property_id=p_property AND journal_id=p_journal;
 IF total_lines<2 OR balance<>0 THEN RAISE EXCEPTION 'Journal does not balance';END IF;
 IF cash_lines=0 OR cash_lines=total_lines THEN RAISE EXCEPTION 'Noncash journals and internal cash transfers do not require classification';END IF;
 SELECT coalesce(sum((value->>'amount_minor')::numeric),0),coalesce(sum((value->>'amount_minor')::numeric) FILTER(WHERE (value->>'amount_minor')::numeric>0),0),coalesce(-sum((value->>'amount_minor')::numeric) FILTER(WHERE (value->>'amount_minor')::numeric<0),0) INTO allocated,inflow,outflow FROM jsonb_array_elements(canonical);
 -- An empty review explicitly reopens classification; it never means completed zero cash flow.
 IF canonical<>'[]'::jsonb AND (allocated<>cash_debit-cash_credit OR inflow>cash_debit OR outflow>cash_credit) THEN RAISE EXCEPTION 'Cash-flow allocations must reconcile without inflating gross cash flows';END IF;
 SELECT coalesce(max(version),0) INTO current_version FROM irp_pms.cash_flow_reviews WHERE tenant_id=p_tenant AND property_id=p_property AND configuration_id=p_configuration AND journal_id=p_journal;
 IF current_version<>p_expected_version THEN RAISE EXCEPTION 'Cash-flow classification changed; refresh and review' USING ERRCODE='PT409';END IF;
 INSERT INTO irp_pms.cash_flow_reviews(tenant_id,property_id,id,configuration_id,journal_id,version,allocations,reason,actor_id,journal_snapshot,command)
 VALUES(p_tenant,p_property,p_request,p_configuration,p_journal,current_version+1,canonical,trim(p_reason),auth.uid(),snapshot,cmd) RETURNING * INTO prior;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'cash_flow_review_saved',p_request,jsonb_build_object('configuration_id',p_configuration,'journal_id',p_journal,'version',prior.version,'reason',trim(p_reason),'reopened',canonical='[]'::jsonb));
 RETURN to_jsonb(prior)-'command'||jsonb_build_object('replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_save_cash_flow_review(uuid,uuid,uuid,uuid,uuid,bigint,jsonb,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_save_cash_flow_review(uuid,uuid,uuid,uuid,uuid,bigint,jsonb,text,boolean) TO authenticated;

CREATE FUNCTION public.irp_pms_pilot_cash_flow_review_history(p_tenant uuid,p_property uuid,p_configuration uuid,p_journal uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE history jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_configuration IS NULL OR p_journal IS NULL THEN RAISE EXCEPTION 'Configuration and journal required';END IF;
 PERFORM public.irp_pms_pilot_cash_flow_configuration(p_tenant,p_property,p_configuration);
 IF NOT EXISTS(SELECT 1 FROM irp_pms.gl_journals WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_journal) THEN RAISE EXCEPTION 'Journal not found in this property';END IF;
 IF (SELECT count(*) FROM irp_pms.cash_flow_reviews WHERE tenant_id=p_tenant AND property_id=p_property AND configuration_id=p_configuration AND journal_id=p_journal)>1000 THEN RAISE EXCEPTION 'Review history exceeds interactive limit; no partial history returned';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(r)-'command' ORDER BY version),'[]'::jsonb) INTO history FROM irp_pms.cash_flow_reviews r WHERE tenant_id=p_tenant AND property_id=p_property AND configuration_id=p_configuration AND journal_id=p_journal;
 RETURN jsonb_build_object('tenant_id',p_tenant,'property_id',p_property,'configuration_id',p_configuration,'journal_id',p_journal,'reviews',history,'rows_truncated',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cash_flow_review_history(uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cash_flow_review_history(uuid,uuid,uuid,uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.irp_pms_pilot_cash_flow_ledger(p_tenant uuid,p_property uuid,p_configuration uuid,p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE config jsonb;accounts uuid[];opening numeric;movement numeric;entries jsonb;n bigint;line_count bigint;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_configuration IS NULL OR p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end) OR p_end<=p_start OR p_end-p_start>366 THEN RAISE EXCEPTION 'Select a saved cash configuration and a range of 1 to 366 days';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 config:=public.irp_pms_pilot_cash_flow_configuration(p_tenant,p_property,p_configuration);
 SELECT array_agg(value::uuid) INTO accounts FROM jsonb_array_elements_text(config->'cash_account_ids');
 SELECT count(*) INTO n FROM irp_pms.gl_journals WHERE tenant_id=p_tenant AND property_id=p_property AND posting_date>=p_start AND posting_date<p_end;
 SELECT count(*) INTO line_count FROM irp_pms.gl_lines l JOIN irp_pms.gl_journals j ON (j.tenant_id,j.property_id,j.id)=(l.tenant_id,l.property_id,l.journal_id) WHERE j.tenant_id=p_tenant AND j.property_id=p_property AND j.posting_date>=p_start AND j.posting_date<p_end;
 IF n>10000 OR line_count>100000 THEN RAISE EXCEPTION 'Cash-flow range is too large; select a shorter range. No partial report was returned';END IF;
 SELECT coalesce(sum(CASE WHEN l.side='debit' THEN l.amount_minor::numeric ELSE -l.amount_minor::numeric END) FILTER(WHERE j.posting_date<p_start),0),
 coalesce(sum(CASE WHEN l.side='debit' THEN l.amount_minor::numeric ELSE -l.amount_minor::numeric END) FILTER(WHERE j.posting_date>=p_start),0)
 INTO opening,movement FROM irp_pms.gl_lines l JOIN irp_pms.gl_journals j ON (j.tenant_id,j.property_id,j.id)=(l.tenant_id,l.property_id,l.journal_id)
 WHERE j.tenant_id=p_tenant AND j.property_id=p_property AND j.posting_date<p_end AND l.account_id=ANY(accounts);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',j.id,'posting_date',j.posting_date,'description',j.description,'source_kind',j.source_kind,'source_id',j.source_id,'source_version',j.source_version::text,'currency',j.currency,'review',(SELECT to_jsonb(r)-'command'-'journal_snapshot' FROM irp_pms.cash_flow_reviews r WHERE r.tenant_id=j.tenant_id AND r.property_id=j.property_id AND r.configuration_id=p_configuration AND r.journal_id=j.id ORDER BY r.version DESC LIMIT 1),'allocations',coalesce((SELECT r.allocations FROM irp_pms.cash_flow_reviews r WHERE r.tenant_id=j.tenant_id AND r.property_id=j.property_id AND r.configuration_id=p_configuration AND r.journal_id=j.id ORDER BY r.version DESC LIMIT 1),'[]'::jsonb),'lines',(
 SELECT jsonb_agg(jsonb_build_object('line_no',l.line_no,'account_id',l.account_id,'side',l.side,'amount_minor',l.amount_minor::text) ORDER BY l.line_no) FROM irp_pms.gl_lines l WHERE l.tenant_id=j.tenant_id AND l.property_id=j.property_id AND l.journal_id=j.id
 )) ORDER BY j.posting_date,j.id),'[]'::jsonb) INTO entries FROM irp_pms.gl_journals j WHERE j.tenant_id=p_tenant AND j.property_id=p_property AND j.posting_date>=p_start AND j.posting_date<p_end;
 RETURN jsonb_build_object('tenant_id',p_tenant,'property_id',p_property,'start',p_start,'end',p_end,'end_exclusive',true,'currency','USD','configuration',config,'opening_minor',opening::text,'net_change_minor',movement::text,'closing_minor',(opening+movement)::text,'journal_count',n,'line_count',line_count,'journals',entries,'rows_truncated',false,'classification_available',true);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cash_flow_ledger(uuid,uuid,uuid,date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cash_flow_ledger(uuid,uuid,uuid,date,date) TO authenticated;

COMMIT;

-- iRatePilot accounting candidate 176: unpublished; install only after release verification.
BEGIN;
-- Source: schema.sql
-- Unreleased accounting foundation. No public posting API or grants yet.

CREATE TABLE irp_pms.gl_accounts (
 tenant_id uuid NOT NULL, property_id uuid NOT NULL, id uuid NOT NULL,
 code text NOT NULL CHECK(code ~ '^[A-Z0-9_-]{1,32}$'),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120),
 kind text NOT NULL CHECK(kind IN ('asset','liability','equity','income','expense')),
 active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(tenant_id,property_id,id), UNIQUE(tenant_id,property_id,code),
 FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
CREATE TABLE irp_pms.gl_periods (
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL,
 starts_on date NOT NULL,ends_before date NOT NULL,closed boolean NOT NULL DEFAULT false,
 PRIMARY KEY(tenant_id,property_id,id),
 CHECK(isfinite(starts_on) AND isfinite(ends_before) AND starts_on<ends_before),
 FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
CREATE TABLE irp_pms.gl_journals (
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL,request_id uuid NOT NULL,
 period_id uuid NOT NULL,posting_date date NOT NULL,currency text NOT NULL CHECK(currency='USD'),
 description text NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 500),
 source_kind text NOT NULL,source_id uuid NOT NULL,source_version bigint NOT NULL CHECK(source_version>0),
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 creation_transaction bigint NOT NULL DEFAULT txid_current(),
 command jsonb,
 reversal_of uuid GENERATED ALWAYS AS (CASE WHEN source_kind='journal_reversal' THEN source_id END) STORED,
 PRIMARY KEY(tenant_id,property_id,id),UNIQUE(tenant_id,property_id,request_id),
 UNIQUE(tenant_id,property_id,source_kind,source_id,source_version),
 FOREIGN KEY(tenant_id,property_id,reversal_of) REFERENCES irp_pms.gl_journals(tenant_id,property_id,id),
 CHECK(reversal_of IS NULL OR (reversal_of<>id AND source_version=1)),
 FOREIGN KEY(tenant_id,property_id,period_id) REFERENCES irp_pms.gl_periods(tenant_id,property_id,id)
);
CREATE TABLE irp_pms.gl_lines (
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,journal_id uuid NOT NULL,line_no integer NOT NULL CHECK(line_no BETWEEN 1 AND 1000),
 account_id uuid NOT NULL,side text NOT NULL CHECK(side IN ('debit','credit')),
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 999999999999999),
 PRIMARY KEY(tenant_id,property_id,journal_id,line_no),
 FOREIGN KEY(tenant_id,property_id,journal_id) REFERENCES irp_pms.gl_journals(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,account_id) REFERENCES irp_pms.gl_accounts(tenant_id,property_id,id)
);
CREATE FUNCTION irp_pms.gl_guard_period() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Accounting periods cannot be deleted';END IF;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
 IF TG_OP='UPDATE' THEN
  IF (NEW.tenant_id,NEW.property_id,NEW.id,NEW.starts_on,NEW.ends_before) IS DISTINCT FROM (OLD.tenant_id,OLD.property_id,OLD.id,OLD.starts_on,OLD.ends_before) THEN RAISE EXCEPTION 'Accounting period boundaries are immutable';END IF;
  IF OLD.closed AND NOT NEW.closed THEN RAISE EXCEPTION 'Closed accounting periods cannot be reopened';END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.gl_periods p WHERE p.tenant_id=NEW.tenant_id AND p.property_id=NEW.property_id AND p.id<>NEW.id AND p.starts_on<NEW.ends_before AND p.ends_before>NEW.starts_on) THEN RAISE EXCEPTION 'Accounting periods overlap';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER gl_period_guard BEFORE INSERT OR UPDATE OR DELETE ON irp_pms.gl_periods FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_guard_period();
CREATE FUNCTION irp_pms.gl_guard_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Accounts must be deactivated, not deleted';END IF;
 IF (NEW.tenant_id,NEW.property_id,NEW.id,NEW.code,NEW.kind) IS DISTINCT FROM (OLD.tenant_id,OLD.property_id,OLD.id,OLD.code,OLD.kind) THEN RAISE EXCEPTION 'Account identity and classification are immutable';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER gl_account_guard BEFORE UPDATE OR DELETE ON irp_pms.gl_accounts FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_guard_account();
CREATE FUNCTION irp_pms.gl_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Posted journal history is immutable'; END $$;
CREATE TRIGGER gl_journal_immutable BEFORE UPDATE OR DELETE ON irp_pms.gl_journals FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE TRIGGER gl_line_immutable BEFORE UPDATE OR DELETE ON irp_pms.gl_lines FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION irp_pms.gl_admit_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE period irp_pms.gl_periods;original_date date;
BEGIN
 SELECT * INTO STRICT period FROM irp_pms.gl_periods WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.period_id FOR SHARE;
 IF period.closed OR NEW.posting_date<period.starts_on OR NEW.posting_date>=period.ends_before OR NOT isfinite(NEW.posting_date) THEN RAISE EXCEPTION 'Posting period unavailable';END IF;
 IF NEW.source_kind='journal_reversal' THEN
  SELECT posting_date INTO STRICT original_date FROM irp_pms.gl_journals WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.source_id;
  IF NEW.posting_date<original_date THEN RAISE EXCEPTION 'Reversal cannot precede original posting';END IF;
 END IF;
 NEW.creation_transaction:=txid_current();NEW.created_at:=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER gl_journal_admission BEFORE INSERT ON irp_pms.gl_journals FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_admit_journal();
CREATE FUNCTION irp_pms.gl_admit_line() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE creation bigint;enabled boolean;
BEGIN
 SELECT creation_transaction INTO STRICT creation FROM irp_pms.gl_journals WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.journal_id;
 IF creation<>txid_current() THEN RAISE EXCEPTION 'Cannot append to posted journal';END IF;
 SELECT active INTO STRICT enabled FROM irp_pms.gl_accounts WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.account_id FOR SHARE;
 IF NOT enabled THEN RAISE EXCEPTION 'Account is inactive';END IF;RETURN NEW;
END $$;
CREATE TRIGGER gl_line_admission BEFORE INSERT ON irp_pms.gl_lines FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_admit_line();
-- Internal writer only. A public source-specific operation must authorize and
-- validate its source before calling; this function is never granted to clients.
CREATE FUNCTION irp_pms.gl_insert_journal(p_tenant uuid,p_property uuid,p_request uuid,p_actor uuid,p_command jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE prior irp_pms.gl_journals;entry jsonb;journal uuid:=gen_random_uuid();ordinal integer:=0;debits numeric:=0;credits numeric:=0;
BEGIN
 IF p_request IS NULL OR p_actor IS NULL OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid journal command';END IF;
 IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(p_command) key) IS DISTINCT FROM ARRAY['currency','description','lines','period_id','posting_date','source_id','source_kind','source_version']::text[] THEN RAISE EXCEPTION 'Invalid journal fields';END IF;
 IF p_command->>'currency' IS DISTINCT FROM 'USD' OR jsonb_typeof(p_command->'lines') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid journal currency or lines';END IF;
 IF jsonb_typeof(p_command->'description') IS DISTINCT FROM 'string' OR length(p_command->>'description') NOT BETWEEN 1 AND 500 OR p_command->>'description'<>trim(p_command->>'description') OR (p_command->>'description') ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'Invalid journal description';END IF;
 IF jsonb_typeof(p_command->'source_kind') IS DISTINCT FROM 'string' OR (p_command->>'source_kind') !~ '^[a-z][a-z0-9_]{0,79}$' THEN RAISE EXCEPTION 'Invalid journal source kind';END IF;
 IF jsonb_typeof(p_command->'source_version') IS DISTINCT FROM 'number' OR (p_command->>'source_version') !~ '^[1-9][0-9]{0,15}$' OR (p_command->>'source_version')::numeric>9007199254740991 THEN RAISE EXCEPTION 'Invalid journal source version';END IF;
 IF jsonb_typeof(p_command->'posting_date') IS DISTINCT FROM 'string' OR (p_command->>'posting_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR p_command->>'posting_date'<'1900-01-01' OR (p_command->>'posting_date')::date::text IS DISTINCT FROM p_command->>'posting_date' THEN RAISE EXCEPTION 'Invalid journal posting date';END IF;
 IF jsonb_typeof(p_command->'period_id') IS DISTINCT FROM 'string' OR jsonb_typeof(p_command->'source_id') IS DISTINCT FROM 'string' OR (p_command->>'period_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' OR (p_command->>'source_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Invalid journal source or period identity';END IF;
 IF jsonb_array_length(p_command->'lines') NOT BETWEEN 2 AND 1000 THEN RAISE EXCEPTION 'Invalid journal line count';END IF;
 FOR entry IN SELECT value FROM jsonb_array_elements(p_command->'lines') LOOP
  IF jsonb_typeof(entry) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid journal line';END IF;
  IF (SELECT array_agg(key ORDER BY key) FROM jsonb_object_keys(entry) key) IS DISTINCT FROM ARRAY['account_id','amount_minor','side']::text[] THEN RAISE EXCEPTION 'Invalid journal line fields';END IF;
  IF jsonb_typeof(entry->'account_id') IS DISTINCT FROM 'string' OR (entry->>'account_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Invalid journal account identity';END IF;
  IF jsonb_typeof(entry->'amount_minor') IS DISTINCT FROM 'string' OR (entry->>'amount_minor') !~ '^[1-9][0-9]{0,14}$' OR (entry->>'side') NOT IN ('debit','credit') OR entry->>'side' IS NULL THEN RAISE EXCEPTION 'Invalid journal amount or side';END IF;
  IF entry->>'side'='debit' THEN debits:=debits+(entry->>'amount_minor')::numeric;ELSE credits:=credits+(entry->>'amount_minor')::numeric;END IF;
 END LOOP;
 IF debits<>credits THEN RAISE EXCEPTION 'Journal does not balance';END IF;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown journal property';END IF;
 SELECT * INTO prior FROM irp_pms.gl_journals WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.created_by IS DISTINCT FROM p_actor OR prior.command IS DISTINCT FROM p_command THEN RAISE EXCEPTION 'Journal request already used';END IF;
  RETURN jsonb_build_object('journal_id',prior.id,'request_id',p_request,'replayed',true);
 END IF;
 INSERT INTO irp_pms.gl_journals(tenant_id,property_id,id,request_id,period_id,posting_date,currency,description,source_kind,source_id,source_version,created_by,command)
 VALUES(p_tenant,p_property,journal,p_request,(p_command->>'period_id')::uuid,(p_command->>'posting_date')::date,'USD',p_command->>'description',p_command->>'source_kind',(p_command->>'source_id')::uuid,(p_command->>'source_version')::bigint,p_actor,p_command);
 FOR entry IN SELECT value FROM jsonb_array_elements(p_command->'lines') LOOP
  ordinal:=ordinal+1;
  INSERT INTO irp_pms.gl_lines VALUES(p_tenant,p_property,journal,ordinal,(entry->>'account_id')::uuid,entry->>'side',(entry->>'amount_minor')::bigint);
 END LOOP;
 RETURN jsonb_build_object('journal_id',journal,'request_id',p_request,'replayed',false);
END $$;
CREATE FUNCTION irp_pms.gl_reverse_journal(p_tenant uuid,p_property uuid,p_request uuid,p_actor uuid,p_original uuid,p_period uuid,p_date date,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE original irp_pms.gl_journals;lines jsonb;
BEGIN
 SELECT * INTO STRICT original FROM irp_pms.gl_journals WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_original;
 IF p_date<original.posting_date THEN RAISE EXCEPTION 'Reversal cannot precede original posting';END IF;
 SELECT jsonb_agg(jsonb_build_object('account_id',account_id,'side',CASE WHEN side='debit' THEN 'credit' ELSE 'debit' END,'amount_minor',amount_minor::text) ORDER BY line_no)
 INTO lines FROM irp_pms.gl_lines WHERE tenant_id=p_tenant AND property_id=p_property AND journal_id=p_original;
 RETURN irp_pms.gl_insert_journal(p_tenant,p_property,p_request,p_actor,jsonb_build_object('currency','USD','description',p_reason,'period_id',p_period,'posting_date',p_date,'source_kind','journal_reversal','source_id',p_original,'source_version',1,'lines',lines));
END $$;
REVOKE ALL ON FUNCTION irp_pms.gl_reverse_journal(uuid,uuid,uuid,uuid,uuid,uuid,date,text) FROM PUBLIC;
CREATE FUNCTION irp_pms.gl_assert_balanced() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE journal uuid;line_count bigint;debits numeric;credits numeric;original uuid;
BEGIN
 IF TG_TABLE_NAME='gl_journals' THEN journal:=NEW.id;ELSE journal:=NEW.journal_id;END IF;
 SELECT count(*),coalesce(sum(amount_minor) FILTER(WHERE side='debit'),0),coalesce(sum(amount_minor) FILTER(WHERE side='credit'),0)
 INTO line_count,debits,credits FROM irp_pms.gl_lines WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND journal_id=journal;
 IF line_count<2 OR debits<>credits THEN RAISE EXCEPTION 'Journal must have balanced debit and credit lines';END IF;
 SELECT reversal_of INTO original FROM irp_pms.gl_journals WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=journal;
 IF original IS NOT NULL AND EXISTS(
  (SELECT line_no,account_id,side,amount_minor FROM irp_pms.gl_lines WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND journal_id=journal
   EXCEPT ALL SELECT line_no,account_id,CASE WHEN side='debit' THEN 'credit' ELSE 'debit' END,amount_minor FROM irp_pms.gl_lines WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND journal_id=original)
  UNION ALL
  (SELECT line_no,account_id,CASE WHEN side='debit' THEN 'credit' ELSE 'debit' END,amount_minor FROM irp_pms.gl_lines WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND journal_id=original
   EXCEPT ALL SELECT line_no,account_id,side,amount_minor FROM irp_pms.gl_lines WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND journal_id=journal)
 ) THEN RAISE EXCEPTION 'Reversal must exactly offset original lines';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER gl_header_balance AFTER INSERT ON irp_pms.gl_journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_assert_balanced();
CREATE CONSTRAINT TRIGGER gl_line_balance AFTER INSERT ON irp_pms.gl_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_assert_balanced();
CREATE FUNCTION irp_pms.gl_trial_balance(p_tenant uuid,p_property uuid,p_start date,p_end date)
RETURNS TABLE(account_id uuid,account_code text,account_kind text,opening_debit_minor text,opening_credit_minor text,period_debit_minor text,period_credit_minor text,closing_debit_minor text,closing_credit_minor text)
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
BEGIN
 IF p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end) OR p_start>=p_end THEN RAISE EXCEPTION 'Invalid trial balance dates';END IF;
 IF NOT EXISTS(SELECT 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property) THEN RAISE EXCEPTION 'Unknown trial balance property';END IF;
 RETURN QUERY WITH movement AS (
  SELECT l.account_id,j.posting_date,l.side,l.amount_minor FROM irp_pms.gl_lines l
  JOIN irp_pms.gl_journals j ON(j.tenant_id,j.property_id,j.id)=(l.tenant_id,l.property_id,l.journal_id)
  WHERE j.tenant_id=p_tenant AND j.property_id=p_property AND j.posting_date<p_end
 ), totals AS (
  SELECT a.id,a.code,a.kind,
   coalesce(sum(CASE WHEN m.side='debit' THEN m.amount_minor ELSE -m.amount_minor END) FILTER(WHERE m.posting_date<p_start),0) opening,
   coalesce(sum(m.amount_minor) FILTER(WHERE m.posting_date>=p_start AND m.side='debit'),0) debit,
   coalesce(sum(m.amount_minor) FILTER(WHERE m.posting_date>=p_start AND m.side='credit'),0) credit,
   coalesce(sum(CASE WHEN m.side='debit' THEN m.amount_minor ELSE -m.amount_minor END),0) closing
  FROM irp_pms.gl_accounts a LEFT JOIN movement m ON m.account_id=a.id
  WHERE a.tenant_id=p_tenant AND a.property_id=p_property GROUP BY a.id,a.code,a.kind
 ) SELECT id,code,kind,greatest(opening,0)::text,greatest(-opening,0)::text,debit::text,credit::text,greatest(closing,0)::text,greatest(-closing,0)::text FROM totals ORDER BY code,id;
END $$;
REVOKE ALL ON FUNCTION irp_pms.gl_trial_balance(uuid,uuid,date,date) FROM PUBLIC;
ALTER TABLE irp_pms.gl_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.gl_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.gl_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.gl_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.gl_accounts,irp_pms.gl_periods,irp_pms.gl_journals,irp_pms.gl_lines FROM PUBLIC;
REVOKE ALL ON FUNCTION irp_pms.gl_immutable(),irp_pms.gl_admit_journal(),irp_pms.gl_admit_line(),irp_pms.gl_assert_balanced(),irp_pms.gl_guard_period() FROM PUBLIC;
REVOKE ALL ON FUNCTION irp_pms.gl_insert_journal(uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION irp_pms.gl_guard_account() FROM PUBLIC;
CREATE TABLE irp_pms.gl_setup_retirements (
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('account','period','mappings')),actor_id uuid NOT NULL REFERENCES auth.users(id),command jsonb NOT NULL,retired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,kind,request_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.gl_setup_retirements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.gl_setup_retirements FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER gl_setup_retirement_immutable BEFORE UPDATE OR DELETE ON irp_pms.gl_setup_retirements FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();

-- Source: mappings.sql
-- Unreleased versioned accounting mappings. No client grants.

CREATE TABLE irp_pms.gl_mapping_sets(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL,version bigint NOT NULL CHECK(version BETWEEN 1 AND 9007199254740991),
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 creation_transaction bigint NOT NULL DEFAULT txid_current(),
 PRIMARY KEY(tenant_id,property_id,id),UNIQUE(tenant_id,property_id,version),
 FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
CREATE TABLE irp_pms.gl_mapping_lines(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,mapping_id uuid NOT NULL,component text NOT NULL,
 account_id uuid NOT NULL,
 CHECK(component IN('receivable','accommodation','ota_fee','other_revenue') OR component ~ '^(tax|fee):[a-z][a-z0-9_]{0,79}$'),
 PRIMARY KEY(tenant_id,property_id,mapping_id,component),
 FOREIGN KEY(tenant_id,property_id,mapping_id) REFERENCES irp_pms.gl_mapping_sets(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,account_id) REFERENCES irp_pms.gl_accounts(tenant_id,property_id,id)
);
CREATE TRIGGER gl_mapping_immutable BEFORE UPDATE OR DELETE ON irp_pms.gl_mapping_sets FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE TRIGGER gl_mapping_line_immutable BEFORE UPDATE OR DELETE ON irp_pms.gl_mapping_lines FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION irp_pms.gl_admit_mapping() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 NEW.creation_transaction:=txid_current();
 NEW.created_at:=clock_timestamp();
 RETURN NEW;
END $$;
CREATE TRIGGER gl_mapping_admission BEFORE INSERT ON irp_pms.gl_mapping_sets FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_admit_mapping();
REVOKE ALL ON FUNCTION irp_pms.gl_admit_mapping() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION irp_pms.gl_admit_mapping_line() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE transaction_id bigint;account irp_pms.gl_accounts;
BEGIN
 SELECT creation_transaction INTO STRICT transaction_id FROM irp_pms.gl_mapping_sets WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.mapping_id;
 IF transaction_id<>txid_current() THEN RAISE EXCEPTION 'Cannot append to saved mapping';END IF;
 SELECT * INTO STRICT account FROM irp_pms.gl_accounts WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.account_id FOR SHARE;
 IF NOT account.active THEN RAISE EXCEPTION 'Mapped account is inactive';END IF;
 IF (NEW.component='receivable' AND account.kind<>'asset') OR (NEW.component LIKE 'tax:%' AND account.kind<>'liability') OR (NEW.component<>'receivable' AND NEW.component NOT LIKE 'tax:%' AND account.kind NOT IN('income','liability')) THEN RAISE EXCEPTION 'Mapped account classification is incompatible';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER gl_mapping_line_admission BEFORE INSERT ON irp_pms.gl_mapping_lines FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_admit_mapping_line();
CREATE FUNCTION irp_pms.gl_require_receivable_mapping() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM irp_pms.gl_mapping_lines WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND mapping_id=NEW.id AND component='receivable') THEN RAISE EXCEPTION 'Receivable mapping required';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER gl_mapping_complete AFTER INSERT ON irp_pms.gl_mapping_sets DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_require_receivable_mapping();
ALTER TABLE irp_pms.gl_mapping_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.gl_mapping_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.gl_mapping_sets,irp_pms.gl_mapping_lines FROM PUBLIC;
REVOKE ALL ON FUNCTION irp_pms.gl_admit_mapping_line(),irp_pms.gl_require_receivable_mapping() FROM PUBLIC;
CREATE FUNCTION public.irp_pms_pilot_save_gl_mappings(p_tenant uuid,p_property uuid,p_request uuid,p_expected_version bigint,p_mappings jsonb,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE normalized jsonb;prior irp_pms.gl_mapping_sets;prior_lines jsonb;current_version bigint;item record;
BEGIN
 IF irp_pms.pilot_require(p_tenant,p_property,true)<>'owner' THEN RAISE EXCEPTION 'Only an owner can configure accounting mappings' USING ERRCODE='42501';END IF;
 IF p_request IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740990 OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Mapping identity, version and confirmation required';END IF;
 IF jsonb_typeof(p_mappings) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid accounting mappings';END IF;
 IF NOT(p_mappings?'receivable') OR (SELECT count(*) FROM jsonb_object_keys(p_mappings))>128 THEN RAISE EXCEPTION 'Receivable mapping required; maximum 128 categories';END IF;
 FOR item IN SELECT key,value FROM jsonb_each(p_mappings) LOOP
  IF jsonb_typeof(item.value) IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Mapped account must be an identity string';END IF;
 END LOOP;
 SELECT jsonb_object_agg(key,(value::uuid)::text) INTO normalized FROM jsonb_each_text(p_mappings);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 IF irp_pms.pilot_require(p_tenant,p_property,true)<>'owner' THEN RAISE EXCEPTION 'Only an owner can configure accounting mappings' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.gl_setup_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND kind='mappings') THEN RAISE EXCEPTION 'Setup request was retired; review the details again';END IF;
 SELECT * INTO prior FROM irp_pms.gl_mapping_sets WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request;
 IF FOUND THEN
  SELECT jsonb_object_agg(component,account_id::text) INTO prior_lines FROM irp_pms.gl_mapping_lines WHERE tenant_id=p_tenant AND property_id=p_property AND mapping_id=p_request;
  IF prior.created_by<>auth.uid() OR prior.version-1<>p_expected_version OR prior_lines IS DISTINCT FROM normalized THEN RAISE EXCEPTION 'Mapping request identity already used';END IF;
  RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'mapping_id',p_request,'version',prior.version,'replayed',true);
 END IF;
 SELECT coalesce(max(version),0) INTO current_version FROM irp_pms.gl_mapping_sets WHERE tenant_id=p_tenant AND property_id=p_property;
 IF current_version<>p_expected_version THEN RAISE EXCEPTION 'Accounting mappings changed; refresh before saving' USING ERRCODE='PT409';END IF;
 INSERT INTO irp_pms.gl_mapping_sets(tenant_id,property_id,id,version,created_by) VALUES(p_tenant,p_property,p_request,current_version+1,auth.uid());
 INSERT INTO irp_pms.gl_mapping_lines SELECT p_tenant,p_property,p_request,key,value::uuid FROM jsonb_each_text(normalized);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'gl_mappings_saved',p_request,jsonb_build_object('version',current_version+1));
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'mapping_id',p_request,'version',current_version+1,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_save_gl_mappings(uuid,uuid,uuid,bigint,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_save_gl_mappings(uuid,uuid,uuid,bigint,jsonb,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_gl_mapping_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_mapping_sets;present boolean;components jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Mapping request identity required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 SELECT * INTO saved FROM irp_pms.gl_mapping_sets WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request AND created_by=auth.uid();present:=FOUND;
 IF present THEN SELECT jsonb_object_agg(component,account_id::text) INTO components FROM irp_pms.gl_mapping_lines WHERE tenant_id=p_tenant AND property_id=p_property AND mapping_id=p_request;END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'found',present,'mapping_id',saved.id,'version',saved.version,'expected_version',saved.version-1,'components',components);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_gl_mapping_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_gl_mapping_status(uuid,uuid,uuid) TO authenticated;

-- Source: access.sql
-- Unreleased reporting API; apply only in the local full-schema test for now.

CREATE TABLE irp_pms.gl_configuration_requests (
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('account','period')),actor_id uuid NOT NULL REFERENCES auth.users(id),command jsonb NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.gl_configuration_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.gl_configuration_requests FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER gl_configuration_request_immutable BEFORE UPDATE OR DELETE ON irp_pms.gl_configuration_requests FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();

CREATE FUNCTION public.irp_pms_pilot_create_gl_period(p_tenant uuid,p_property uuid,p_request uuid,p_start date,p_end date,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE period irp_pms.gl_periods;replayed boolean:=false;saved irp_pms.gl_configuration_requests;command jsonb;result jsonb;
BEGIN
 IF irp_pms.pilot_require(p_tenant,p_property,true)<>'owner' THEN RAISE EXCEPTION 'Only an owner can configure accounting periods' USING ERRCODE='42501';END IF;
 IF p_confirmed IS DISTINCT FROM true OR p_request IS NULL THEN RAISE EXCEPTION 'Period identity and confirmation required';END IF;
 IF p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end) OR p_start>=p_end THEN RAISE EXCEPTION 'Invalid accounting period dates';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 IF irp_pms.pilot_require(p_tenant,p_property,true)<>'owner' THEN RAISE EXCEPTION 'Only an owner can configure accounting periods' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.gl_setup_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND kind='period') THEN RAISE EXCEPTION 'Setup request was retired; review the details again';END IF;
 command:=jsonb_build_object('start_date',p_start,'end_date_exclusive',p_end);
 SELECT * INTO saved FROM irp_pms.gl_configuration_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF (saved.kind,saved.actor_id,saved.command) IS DISTINCT FROM ('period',auth.uid(),command) THEN RAISE EXCEPTION 'Configuration request identity already used';END IF;
  RETURN saved.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO period FROM irp_pms.gl_periods WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request;
 IF FOUND THEN
  IF (period.starts_on,period.ends_before) IS DISTINCT FROM(p_start,p_end) THEN RAISE EXCEPTION 'Period request identity already used';END IF;
  replayed:=true;
 ELSE
  INSERT INTO irp_pms.gl_periods VALUES(p_tenant,p_property,p_request,p_start,p_end,false) RETURNING * INTO period;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'gl_period_created',p_request,jsonb_build_object('starts_on',p_start,'ends_before',p_end));
 END IF;
 IF replayed THEN RAISE EXCEPTION 'Configuration identity already used without a matching request';END IF;
 result:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'kind','period','period',to_jsonb(period),'replayed',false);
 INSERT INTO irp_pms.gl_configuration_requests(tenant_id,property_id,request_id,kind,actor_id,command,result) VALUES(p_tenant,p_property,p_request,'period',auth.uid(),command,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_create_gl_period(uuid,uuid,uuid,date,date,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_create_gl_period(uuid,uuid,uuid,date,date,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_create_gl_account(p_tenant uuid,p_property uuid,p_request uuid,p_code text,p_name text,p_kind text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account irp_pms.gl_accounts;replayed boolean:=false;saved irp_pms.gl_configuration_requests;command jsonb;result jsonb;
BEGIN
 IF irp_pms.pilot_require(p_tenant,p_property,true)<>'owner' THEN RAISE EXCEPTION 'Only an owner can configure accounts' USING ERRCODE='42501';END IF;
 IF p_confirmed IS DISTINCT FROM true OR p_request IS NULL THEN RAISE EXCEPTION 'Account identity and confirmation required';END IF;
 IF p_name IS NULL OR p_name<>trim(p_name) OR length(p_name) NOT BETWEEN 1 AND 120 OR p_name ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'Invalid account name';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 IF irp_pms.pilot_require(p_tenant,p_property,true)<>'owner' THEN RAISE EXCEPTION 'Only an owner can configure accounts' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.gl_setup_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND kind='account') THEN RAISE EXCEPTION 'Setup request was retired; review the details again';END IF;
 command:=jsonb_build_object('code',p_code,'name',p_name,'kind',p_kind);
 SELECT * INTO saved FROM irp_pms.gl_configuration_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF (saved.kind,saved.actor_id,saved.command) IS DISTINCT FROM ('account',auth.uid(),command) THEN RAISE EXCEPTION 'Configuration request identity already used';END IF;
  RETURN saved.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO account FROM irp_pms.gl_accounts WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request;
 IF FOUND THEN
  IF (account.code,account.name,account.kind) IS DISTINCT FROM(p_code,p_name,p_kind) THEN RAISE EXCEPTION 'Account request identity already used';END IF;
  replayed:=true;
 ELSE
  INSERT INTO irp_pms.gl_accounts(tenant_id,property_id,id,code,name,kind) VALUES(p_tenant,p_property,p_request,p_code,p_name,p_kind) RETURNING * INTO account;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'gl_account_created',p_request,jsonb_build_object('code',p_code,'kind',p_kind));
 END IF;
 IF replayed THEN RAISE EXCEPTION 'Configuration identity already used without a matching request';END IF;
 result:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'kind','account','account',to_jsonb(account),'replayed',false);
 INSERT INTO irp_pms.gl_configuration_requests(tenant_id,property_id,request_id,kind,actor_id,command,result) VALUES(p_tenant,p_property,p_request,'account',auth.uid(),command,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_create_gl_account(uuid,uuid,uuid,text,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_create_gl_account(uuid,uuid,uuid,text,text,text,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_post_manual_journal(p_tenant uuid,p_property uuid,p_request uuid,p_period uuid,p_date date,p_description text,p_lines jsonb,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Journal review confirmation required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 result:=irp_pms.gl_insert_journal(p_tenant,p_property,p_request,auth.uid(),jsonb_build_object('period_id',p_period,'posting_date',p_date,'currency','USD','description',p_description,'source_kind','manual_journal','source_id',p_request,'source_version',1,'lines',p_lines));
 IF NOT(result->>'replayed')::boolean THEN
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'manual_journal_posted',(result->>'journal_id')::uuid,jsonb_build_object('request_id',p_request,'posting_date',p_date));
 END IF;
 RETURN result||jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'action','post_manual_journal');
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_post_manual_journal(uuid,uuid,uuid,uuid,date,text,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_post_manual_journal(uuid,uuid,uuid,uuid,date,text,jsonb,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_manual_journal_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_journals;has_saved boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Journal request identity required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 SELECT * INTO saved FROM irp_pms.gl_journals WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND created_by=auth.uid() AND source_kind='manual_journal';
 has_saved:=FOUND;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'found',has_saved,'action','post_manual_journal','journal_id',CASE WHEN has_saved THEN saved.id END,'command',CASE WHEN has_saved THEN saved.command END);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_manual_journal_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_manual_journal_status(uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_trial_balance(p_tenant uuid,p_property uuid,p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE rows jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.account_code,b.account_id),'[]'::jsonb) INTO rows FROM irp_pms.gl_trial_balance(p_tenant,p_property,p_start,p_end) b;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'currency','USD','start_date',p_start,'end_date_exclusive',p_end,'accounts',rows,'account_count',jsonb_array_length(rows),'basis','recorded_general_ledger_journals');
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_trial_balance(uuid,uuid,date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_trial_balance(uuid,uuid,date,date) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_reverse_gl_journal(p_tenant uuid,p_property uuid,p_request uuid,p_original uuid,p_period uuid,p_date date,p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Reversal review confirmation required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 result:=irp_pms.gl_reverse_journal(p_tenant,p_property,p_request,auth.uid(),p_original,p_period,p_date,p_reason);
 IF NOT(result->>'replayed')::boolean THEN
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'gl_journal_reversed',(result->>'journal_id')::uuid,jsonb_build_object('request_id',p_request,'original_journal_id',p_original,'posting_date',p_date,'reason',p_reason));
 END IF;
 RETURN result||jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'action','reverse_gl_journal','original_journal_id',p_original);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_reverse_gl_journal(uuid,uuid,uuid,uuid,uuid,date,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_reverse_gl_journal(uuid,uuid,uuid,uuid,uuid,date,text,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_gl_reversal_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_journals;has_saved boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Reversal request identity required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 SELECT * INTO saved FROM irp_pms.gl_journals WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND created_by=auth.uid() AND source_kind='journal_reversal';
 has_saved:=FOUND;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,
 'found',has_saved,'action','reverse_gl_journal','journal_id',CASE WHEN has_saved THEN saved.id END,
 'original_journal_id',CASE WHEN has_saved THEN saved.reversal_of END,'command',CASE WHEN has_saved THEN saved.command END);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_gl_reversal_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_gl_reversal_status(uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_gl_setup(p_tenant uuid,p_property uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE accounts jsonb;periods jsonb;mapping jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT coalesce(jsonb_agg(jsonb_build_object('account_id',id,'code',code,'name',name,'kind',kind,'active',active) ORDER BY code,id),'[]'::jsonb)
 INTO accounts FROM irp_pms.gl_accounts WHERE tenant_id=p_tenant AND property_id=p_property;
 SELECT coalesce(jsonb_agg(jsonb_build_object('period_id',id,'start_date',starts_on,'end_date_exclusive',ends_before,'closed',closed) ORDER BY starts_on,id),'[]'::jsonb)
 INTO periods FROM irp_pms.gl_periods WHERE tenant_id=p_tenant AND property_id=p_property;
 SELECT jsonb_build_object('mapping_id',m.id,'version',m.version,'components',coalesce((SELECT jsonb_object_agg(l.component,l.account_id ORDER BY l.component) FROM irp_pms.gl_mapping_lines l WHERE l.tenant_id=m.tenant_id AND l.property_id=m.property_id AND l.mapping_id=m.id),'{}'::jsonb))
 INTO mapping FROM irp_pms.gl_mapping_sets m WHERE m.tenant_id=p_tenant AND m.property_id=p_property ORDER BY m.version DESC LIMIT 1;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'currency','USD','accounts',accounts,'periods',periods,'current_mapping',mapping);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_gl_setup(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_gl_setup(uuid,uuid) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_gl_journal_detail(p_tenant uuid,p_property uuid,p_journal uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE journal irp_pms.gl_journals;lines jsonb;debits numeric;credits numeric;reversal uuid;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_journal IS NULL THEN RAISE EXCEPTION 'Journal identity required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO journal FROM irp_pms.gl_journals WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_journal;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped journal';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('line_no',l.line_no,'account_id',l.account_id,'account_code',a.code,'current_account_name',a.name,'account_kind',a.kind,'side',l.side,'amount_minor',l.amount_minor::text) ORDER BY l.line_no),'[]'::jsonb),
 coalesce(sum(l.amount_minor) FILTER(WHERE l.side='debit'),0),coalesce(sum(l.amount_minor) FILTER(WHERE l.side='credit'),0)
 INTO lines,debits,credits FROM irp_pms.gl_lines l JOIN irp_pms.gl_accounts a ON(a.tenant_id,a.property_id,a.id)=(l.tenant_id,l.property_id,l.account_id)
 WHERE l.tenant_id=p_tenant AND l.property_id=p_property AND l.journal_id=p_journal;
 SELECT id INTO reversal FROM irp_pms.gl_journals WHERE tenant_id=p_tenant AND property_id=p_property AND reversal_of=p_journal;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'journal_id',journal.id,'request_id',journal.request_id,
 'posting_date',journal.posting_date,'period_id',journal.period_id,'currency',journal.currency,'description',journal.description,
 'source_kind',journal.source_kind,'source_id',journal.source_id,'source_version',journal.source_version,'created_at',journal.created_at,'created_by',journal.created_by,
 'reversal_of',journal.reversal_of,'direct_reversal_id',reversal,'lines',lines,'debit_total_minor',debits::text,'credit_total_minor',credits::text);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_gl_journal_detail(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_gl_journal_detail(uuid,uuid,uuid) TO authenticated;
CREATE INDEX gl_journal_browse ON irp_pms.gl_journals(tenant_id,property_id,posting_date,id);
CREATE FUNCTION public.irp_pms_pilot_gl_journals(p_tenant uuid,p_property uuid,p_start date,p_end date,p_limit integer DEFAULT 100,p_after_date date DEFAULT NULL,p_after_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE rows jsonb;more boolean;last_row jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end) OR p_end<=p_start OR p_end-p_start>366 THEN RAISE EXCEPTION 'Read 1 to 366 journal days';END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Journal page size must be 1 to 200';END IF;
 IF (p_after_date IS NULL)<>(p_after_id IS NULL) OR (p_after_date IS NOT NULL AND (NOT isfinite(p_after_date) OR p_after_date<p_start OR p_after_date>=p_end)) THEN RAISE EXCEPTION 'Invalid journal page cursor';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT coalesce(jsonb_agg(jsonb_build_object('journal_id',j.id,'posting_date',j.posting_date,'description',j.description,'source_kind',j.source_kind,'source_id',j.source_id,'reversal_of',j.reversal_of,'created_at',j.created_at) ORDER BY j.posting_date,j.id),'[]'::jsonb)
 INTO rows FROM (SELECT * FROM irp_pms.gl_journals WHERE tenant_id=p_tenant AND property_id=p_property AND posting_date>=p_start AND posting_date<p_end AND (p_after_date IS NULL OR (posting_date,id)>(p_after_date,p_after_id)) ORDER BY posting_date,id LIMIT p_limit+1) j;
 more:=jsonb_array_length(rows)>p_limit;
 IF more THEN rows:=rows-p_limit;END IF;
 last_row:=rows->(jsonb_array_length(rows)-1);
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'currency','USD','start_date',p_start,'end_date_exclusive',p_end,'journals',rows,'has_more',more,
 'next_cursor',CASE WHEN more THEN jsonb_build_object('posting_date',last_row->'posting_date','journal_id',last_row->'journal_id') END,'consistency','live_pages');
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_gl_journals(uuid,uuid,date,date,integer,date,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_gl_journals(uuid,uuid,date,date,integer,date,uuid) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_gl_export(p_tenant uuid,p_property uuid,p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE rows jsonb;debits numeric;credits numeric;line_count integer;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end) OR p_end<=p_start OR p_end-p_start>366 THEN RAISE EXCEPTION 'Read 1 to 366 journal days';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT count(*) INTO line_count FROM (SELECT 1 FROM irp_pms.gl_journals j JOIN irp_pms.gl_lines l ON(l.tenant_id,l.property_id,l.journal_id)=(j.tenant_id,j.property_id,j.id) WHERE j.tenant_id=p_tenant AND j.property_id=p_property AND j.posting_date>=p_start AND j.posting_date<p_end LIMIT 10001) limited;
 IF line_count>10000 THEN RAISE EXCEPTION 'Ledger export exceeds 10000 lines; narrow the date range';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('journal_id',j.id,'request_id',j.request_id,'posting_date',j.posting_date,'description',j.description,'source_kind',j.source_kind,'source_id',j.source_id,'source_version',j.source_version,'reversal_of',j.reversal_of,'line_no',l.line_no,'account_id',a.id,'account_code',a.code,'current_account_name',a.name,'account_kind',a.kind,'debit_minor',CASE WHEN l.side='debit' THEN l.amount_minor::text ELSE '0' END,'credit_minor',CASE WHEN l.side='credit' THEN l.amount_minor::text ELSE '0' END) ORDER BY j.posting_date,j.id,l.line_no),'[]'::jsonb),coalesce(sum(l.amount_minor) FILTER(WHERE l.side='debit'),0),coalesce(sum(l.amount_minor) FILTER(WHERE l.side='credit'),0)
 INTO rows,debits,credits FROM irp_pms.gl_journals j JOIN irp_pms.gl_lines l ON(l.tenant_id,l.property_id,l.journal_id)=(j.tenant_id,j.property_id,j.id) JOIN irp_pms.gl_accounts a ON(a.tenant_id,a.property_id,a.id)=(l.tenant_id,l.property_id,l.account_id)
 WHERE j.tenant_id=p_tenant AND j.property_id=p_property AND j.posting_date>=p_start AND j.posting_date<p_end;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'currency','USD','start_date',p_start,'end_date_exclusive',p_end,'basis','posted_journal_lines','lines',rows,'line_count',line_count,'debit_total_minor',debits::text,'credit_total_minor',credits::text,'rows_truncated',false);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_gl_export(uuid,uuid,date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_gl_export(uuid,uuid,date,date) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_gl_configuration_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_configuration_requests;present boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Configuration request identity required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 SELECT * INTO saved FROM irp_pms.gl_configuration_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();present:=FOUND;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'found',present,'kind',saved.kind,'command',saved.command,'result',saved.result);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_gl_configuration_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_gl_configuration_status(uuid,uuid,uuid) TO authenticated;


CREATE FUNCTION public.irp_pms_pilot_retire_gl_setup(p_tenant uuid,p_property uuid,p_request uuid,p_command jsonb,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
#variable_conflict use_variable
DECLARE saved irp_pms.gl_setup_retirements;kind text;replayed boolean:=false;keys text[];
BEGIN
 IF irp_pms.pilot_require(p_tenant,p_property,true)<>'owner' THEN RAISE EXCEPTION 'Only an owner can cancel setup requests' USING ERRCODE='42501';END IF;
 kind:=p_command->>'kind';
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true OR jsonb_typeof(p_command) IS DISTINCT FROM 'object' OR kind IS NULL OR kind NOT IN ('account','period','mappings') OR octet_length(p_command::text)>32768 THEN RAISE EXCEPTION 'Original setup command and confirmation required';END IF;
 SELECT array_agg(k ORDER BY k) INTO keys FROM jsonb_object_keys(p_command) k;
 IF keys IS DISTINCT FROM (CASE kind WHEN 'account' THEN ARRAY['accountKind','code','kind','name'] WHEN 'period' THEN ARRAY['end','kind','start'] ELSE ARRAY['components','expectedVersion','kind'] END) THEN RAISE EXCEPTION 'Invalid original setup command';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 IF irp_pms.pilot_require(p_tenant,p_property,true)<>'owner' THEN RAISE EXCEPTION 'Only an owner can cancel setup requests' USING ERRCODE='42501';END IF;
 IF (kind='mappings' AND EXISTS(SELECT 1 FROM irp_pms.gl_mapping_sets WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request)) OR (kind<>'mappings' AND EXISTS(SELECT 1 FROM irp_pms.gl_configuration_requests WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request)) THEN RAISE EXCEPTION 'Setup already saved; recover its result';END IF;
 SELECT * INTO saved FROM irp_pms.gl_setup_retirements r WHERE r.tenant_id=p_tenant AND r.property_id=p_property AND r.request_id=p_request AND r.kind=kind;
 IF FOUND THEN
  IF (saved.actor_id,saved.command) IS DISTINCT FROM (auth.uid(),p_command) THEN RAISE EXCEPTION 'Setup retirement identity already used';END IF;replayed:=true;
 ELSE
  INSERT INTO irp_pms.gl_setup_retirements(tenant_id,property_id,request_id,kind,actor_id,command) VALUES(p_tenant,p_property,p_request,kind,auth.uid(),p_command) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'gl_setup_request_retired',p_request,jsonb_build_object('kind',kind));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'command',saved.command,'retired',true,'retired_at',saved.retired_at,'replayed',replayed);
END $$;
CREATE FUNCTION public.irp_pms_pilot_gl_setup_retirement_status(p_tenant uuid,p_property uuid,p_request uuid,p_kind text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_setup_retirements;present boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 IF p_request IS NULL OR p_kind IS NULL OR p_kind NOT IN ('account','period','mappings') THEN RAISE EXCEPTION 'Setup request identity required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 SELECT * INTO saved FROM irp_pms.gl_setup_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND kind=p_kind AND actor_id=auth.uid();present:=FOUND;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'command',saved.command,'retired',present,'retired_at',saved.retired_at,'replayed',true);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_retire_gl_setup(uuid,uuid,uuid,jsonb,boolean),public.irp_pms_pilot_gl_setup_retirement_status(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_retire_gl_setup(uuid,uuid,uuid,jsonb,boolean),public.irp_pms_pilot_gl_setup_retirement_status(uuid,uuid,uuid,text) TO authenticated;

-- Source: source-components.sql
CREATE FUNCTION irp_pms.gl_service_components(p_entry irp_pms.service_day_entries) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE amounts bigint[];amount bigint;result jsonb:='{}';category text;items jsonb;item jsonb;expected bigint;allocated numeric;key text;
BEGIN
 amounts:=ARRAY[p_entry.accommodation_minor,p_entry.taxes_minor,p_entry.hotel_fees_minor,p_entry.ota_fees_minor,p_entry.other_revenue_minor,p_entry.total_minor];
 FOREACH amount IN ARRAY amounts LOOP
  IF amount IS NULL OR amount NOT BETWEEN 0 AND 999999999999 THEN RAISE EXCEPTION 'Invalid recorded service amount';END IF;
 END LOOP;
 IF p_entry.accommodation_minor+p_entry.taxes_minor+p_entry.hotel_fees_minor+p_entry.ota_fees_minor+p_entry.other_revenue_minor<>p_entry.total_minor THEN RAISE EXCEPTION 'Recorded service components do not reconcile';END IF;
 IF jsonb_typeof(p_entry.details) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid recorded service details';END IF;
 IF p_entry.accommodation_minor>0 THEN result:=result||jsonb_build_object('accommodation',p_entry.accommodation_minor::text);END IF;
 IF p_entry.ota_fees_minor>0 THEN result:=result||jsonb_build_object('ota_fee',p_entry.ota_fees_minor::text);END IF;
 IF p_entry.other_revenue_minor>0 THEN result:=result||jsonb_build_object('other_revenue',p_entry.other_revenue_minor::text);END IF;
 FOREACH category IN ARRAY ARRAY['tax','fee'] LOOP
  items:=coalesce(p_entry.details->CASE WHEN category='tax' THEN 'taxes' ELSE 'fees' END,'[]'::jsonb);
  expected:=CASE WHEN category='tax' THEN p_entry.taxes_minor ELSE p_entry.hotel_fees_minor END;allocated:=0;
  IF jsonb_typeof(items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid recorded itemization';END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
   IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR jsonb_typeof(item->'code') IS DISTINCT FROM 'string' OR (item->>'code') !~ '^[a-z][a-z0-9_]{0,79}$' OR item->>'code'='unallocated' THEN RAISE EXCEPTION 'Invalid recorded category';END IF;
   IF jsonb_typeof(item->'amount_minor') IS DISTINCT FROM 'number' OR (item->>'amount_minor') !~ '^(0|[1-9][0-9]{0,11})$' THEN RAISE EXCEPTION 'Invalid recorded item amount';END IF;
   amount:=(item->>'amount_minor')::bigint;allocated:=allocated+amount;key:=category||':'||(item->>'code');
   IF amount>0 THEN result:=jsonb_set(result,ARRAY[key],to_jsonb((coalesce((result->>key)::numeric,0)+amount)::text));END IF;
  END LOOP;
  IF allocated>expected THEN RAISE EXCEPTION 'Recorded itemization exceeds its total';END IF;
  IF allocated<expected THEN result:=result||jsonb_build_object(category||':unallocated',(expected-allocated)::text);END IF;
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION irp_pms.gl_service_components(irp_pms.service_day_entries) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION irp_pms.gl_prepare_service_entry(p_entry irp_pms.service_day_entries,p_mapping uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE components jsonb;mapping irp_pms.gl_mapping_sets;account irp_pms.gl_accounts;item record;lines jsonb:='[]';receivable uuid;
BEGIN
 IF p_entry.tenant_id IS NULL OR p_entry.property_id IS NULL OR p_entry.reservation_id IS NULL OR p_entry.service_date IS NULL OR NOT isfinite(p_entry.service_date) OR p_entry.source_version IS NULL OR p_entry.source_version<1 THEN RAISE EXCEPTION 'Invalid service source identity';END IF;
 components:=irp_pms.gl_service_components(p_entry);
 SELECT * INTO STRICT mapping FROM irp_pms.gl_mapping_sets WHERE tenant_id=p_entry.tenant_id AND property_id=p_entry.property_id AND id=p_mapping;
 SELECT a.* INTO account FROM irp_pms.gl_mapping_lines m JOIN irp_pms.gl_accounts a ON(a.tenant_id,a.property_id,a.id)=(m.tenant_id,m.property_id,m.account_id) WHERE m.tenant_id=p_entry.tenant_id AND m.property_id=p_entry.property_id AND m.mapping_id=p_mapping AND m.component='receivable';
 IF NOT FOUND OR NOT account.active OR account.kind<>'asset' THEN RAISE EXCEPTION 'Active receivable mapping required';END IF;
 receivable:=account.id;
 IF p_entry.total_minor>0 THEN lines:=jsonb_build_array(jsonb_build_object('component','receivable','account_id',account.id,'side','debit','amount_minor',p_entry.total_minor::text));END IF;
 FOR item IN SELECT key,value FROM jsonb_each_text(components) ORDER BY key LOOP
  SELECT a.* INTO account FROM irp_pms.gl_mapping_lines m JOIN irp_pms.gl_accounts a ON(a.tenant_id,a.property_id,a.id)=(m.tenant_id,m.property_id,m.account_id) WHERE m.tenant_id=p_entry.tenant_id AND m.property_id=p_entry.property_id AND m.mapping_id=p_mapping AND m.component=item.key;
  IF NOT FOUND OR NOT account.active THEN RAISE EXCEPTION 'Active account mapping required for %',item.key;END IF;
  IF account.id=receivable OR (item.key LIKE 'tax:%' AND account.kind<>'liability') OR(item.key NOT LIKE 'tax:%' AND account.kind NOT IN('income','liability')) THEN RAISE EXCEPTION 'Incompatible service account mapping';END IF;
  lines:=lines||jsonb_build_array(jsonb_build_object('component',item.key,'account_id',account.id,'side','credit','amount_minor',item.value));
 END LOOP;
 RETURN jsonb_build_object('tenant_id',p_entry.tenant_id,'property_id',p_entry.property_id,'reservation_id',p_entry.reservation_id,'service_date',p_entry.service_date,'source_version',p_entry.source_version,'mapping_id',p_mapping,'mapping_version',mapping.version,'currency','USD','total_minor',p_entry.total_minor::text,'zero_amount',p_entry.total_minor=0,'lines',lines);
END $$;
REVOKE ALL ON FUNCTION irp_pms.gl_prepare_service_entry(irp_pms.service_day_entries,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION irp_pms.gl_forward_components(p_entry irp_pms.service_forward_entries) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE result jsonb:='{}';taxes jsonb;item record;amount bigint;amounts bigint[]:=ARRAY[p_entry.accommodation_minor,p_entry.taxes_minor,p_entry.hotel_fees_minor,p_entry.ota_fees_minor,p_entry.other_revenue_minor,p_entry.total_minor];
BEGIN
 FOREACH amount IN ARRAY amounts LOOP
  IF amount IS NULL OR amount NOT BETWEEN -999999999999 AND 999999999999 THEN RAISE EXCEPTION 'Invalid recorded correction amount';END IF;
 END LOOP;
 IF p_entry.accommodation_minor+p_entry.taxes_minor+p_entry.hotel_fees_minor+p_entry.ota_fees_minor+p_entry.other_revenue_minor<>p_entry.total_minor THEN RAISE EXCEPTION 'Recorded correction components do not reconcile';END IF;
 taxes:=irp_pms.service_delta(p_entry.tax_buckets,true);
 IF irp_pms.service_vector_sum(taxes)<>p_entry.taxes_minor THEN RAISE EXCEPTION 'Recorded correction tax buckets do not reconcile';END IF;
 FOR item IN SELECT key,value FROM jsonb_each_text(jsonb_build_object('accommodation',p_entry.accommodation_minor,'fee:unallocated',p_entry.hotel_fees_minor,'ota_fee',p_entry.ota_fees_minor,'other_revenue',p_entry.other_revenue_minor)) LOOP
  IF item.value::bigint<>0 THEN result:=result||jsonb_build_object(item.key,item.value);END IF;
 END LOOP;
 FOR item IN SELECT key,value FROM jsonb_each_text(taxes) LOOP
  IF item.value::bigint<>0 THEN result:=result||jsonb_build_object('tax:'||item.key,item.value);END IF;
 END LOOP;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION irp_pms.gl_forward_components(irp_pms.service_forward_entries) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION irp_pms.gl_prepare_forward_entry(p_entry irp_pms.service_forward_entries,p_mapping uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE components jsonb;mapping irp_pms.gl_mapping_sets;account irp_pms.gl_accounts;item record;lines jsonb:='[]';receivable uuid;amount bigint;
BEGIN
 IF p_entry.tenant_id IS NULL OR p_entry.property_id IS NULL OR p_entry.reservation_id IS NULL OR p_entry.adjustment_id IS NULL OR p_entry.service_date IS NULL OR NOT isfinite(p_entry.service_date) THEN RAISE EXCEPTION 'Invalid correction source identity';END IF;
 components:=irp_pms.gl_forward_components(p_entry);
 SELECT * INTO STRICT mapping FROM irp_pms.gl_mapping_sets WHERE tenant_id=p_entry.tenant_id AND property_id=p_entry.property_id AND id=p_mapping;
 SELECT a.* INTO account FROM irp_pms.gl_mapping_lines m JOIN irp_pms.gl_accounts a ON(a.tenant_id,a.property_id,a.id)=(m.tenant_id,m.property_id,m.account_id) WHERE m.tenant_id=p_entry.tenant_id AND m.property_id=p_entry.property_id AND m.mapping_id=p_mapping AND m.component='receivable';
 IF NOT FOUND OR NOT account.active OR account.kind<>'asset' THEN RAISE EXCEPTION 'Active receivable mapping required';END IF;
 receivable:=account.id;
 IF p_entry.total_minor<>0 THEN lines:=jsonb_build_array(jsonb_build_object('component','receivable','account_id',receivable,'side',CASE WHEN p_entry.total_minor>0 THEN 'debit' ELSE 'credit' END,'amount_minor',abs(p_entry.total_minor)::text));END IF;
 FOR item IN SELECT key,value FROM jsonb_each_text(components) ORDER BY key LOOP
  SELECT a.* INTO account FROM irp_pms.gl_mapping_lines m JOIN irp_pms.gl_accounts a ON(a.tenant_id,a.property_id,a.id)=(m.tenant_id,m.property_id,m.account_id) WHERE m.tenant_id=p_entry.tenant_id AND m.property_id=p_entry.property_id AND m.mapping_id=p_mapping AND m.component=item.key;
  IF NOT FOUND OR NOT account.active THEN RAISE EXCEPTION 'Active account mapping required for %',item.key;END IF;
  IF account.id=receivable OR (item.key LIKE 'tax:%' AND account.kind<>'liability') OR(item.key NOT LIKE 'tax:%' AND account.kind NOT IN('income','liability')) THEN RAISE EXCEPTION 'Incompatible correction account mapping';END IF;
  amount:=item.value::bigint;
  lines:=lines||jsonb_build_array(jsonb_build_object('component',item.key,'account_id',account.id,'side',CASE WHEN amount>0 THEN 'credit' ELSE 'debit' END,'amount_minor',abs(amount)::text));
 END LOOP;
 RETURN jsonb_build_object('tenant_id',p_entry.tenant_id,'property_id',p_entry.property_id,'reservation_id',p_entry.reservation_id,'adjustment_id',p_entry.adjustment_id,'service_date',p_entry.service_date,'mapping_id',p_mapping,'mapping_version',mapping.version,'currency','USD','total_minor',p_entry.total_minor::text,'no_posting_lines',jsonb_array_length(lines)=0,'lines',lines);
END $$;
REVOKE ALL ON FUNCTION irp_pms.gl_prepare_forward_entry(irp_pms.service_forward_entries,uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Source: source-posting.sql
CREATE TABLE irp_pms.gl_posting_retirements (
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('service','forward')),actor_id uuid NOT NULL REFERENCES auth.users(id),command jsonb NOT NULL,retired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,kind,request_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.gl_posting_retirements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.gl_posting_retirements FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER gl_posting_retirement_immutable BEFORE UPDATE OR DELETE ON irp_pms.gl_posting_retirements FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();

CREATE TABLE irp_pms.gl_service_postings(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,
 service_date date NOT NULL,reservation_id uuid NOT NULL,mapping_id uuid NOT NULL,
 period_id uuid NOT NULL,posting_date date NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 journal_id uuid,source_snapshot jsonb NOT NULL,prepared jsonb NOT NULL,result jsonb NOT NULL,
 PRIMARY KEY(tenant_id,property_id,request_id),UNIQUE(tenant_id,property_id,service_date,reservation_id),
 FOREIGN KEY(tenant_id,property_id,service_date,reservation_id) REFERENCES irp_pms.service_day_entries(tenant_id,property_id,service_date,reservation_id),
 FOREIGN KEY(tenant_id,property_id,mapping_id) REFERENCES irp_pms.gl_mapping_sets(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,period_id) REFERENCES irp_pms.gl_periods(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,journal_id) REFERENCES irp_pms.gl_journals(tenant_id,property_id,id)
);
CREATE TRIGGER gl_service_posting_immutable BEFORE UPDATE OR DELETE ON irp_pms.gl_service_postings FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
ALTER TABLE irp_pms.gl_service_postings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.gl_service_postings FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.irp_pms_pilot_post_service_journal(p_tenant uuid,p_property uuid,p_request uuid,p_service_date date,p_reservation uuid,p_mapping uuid,p_period uuid,p_posting_date date,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior irp_pms.gl_service_postings;entry irp_pms.service_day_entries;period irp_pms.gl_periods;prepared jsonb;lines jsonb;journal_result jsonb;result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Service posting identity and confirmation required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.gl_posting_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND kind='service' AND request_id=p_request) THEN RAISE EXCEPTION 'Posting request was retired; review the source again';END IF;
 SELECT * INTO prior FROM irp_pms.gl_service_postings WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF (prior.service_date,prior.reservation_id,prior.mapping_id,prior.period_id,prior.posting_date,prior.actor_id) IS DISTINCT FROM(p_service_date,p_reservation,p_mapping,p_period,p_posting_date,auth.uid()) THEN RAISE EXCEPTION 'Service posting request identity already used';END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.gl_service_postings WHERE tenant_id=p_tenant AND property_id=p_property AND service_date=p_service_date AND reservation_id=p_reservation) THEN RAISE EXCEPTION 'Service source already posted';END IF;
 SELECT * INTO STRICT entry FROM irp_pms.service_day_entries WHERE tenant_id=p_tenant AND property_id=p_property AND service_date=p_service_date AND reservation_id=p_reservation;
 IF p_posting_date IS NULL OR p_posting_date<p_service_date THEN RAISE EXCEPTION 'Posting cannot precede service date';END IF;
 SELECT * INTO STRICT period FROM irp_pms.gl_periods WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_period FOR SHARE;
 IF period.closed OR p_posting_date<period.starts_on OR p_posting_date>=period.ends_before OR NOT isfinite(p_posting_date) THEN RAISE EXCEPTION 'Posting period unavailable';END IF;
 prepared:=irp_pms.gl_prepare_service_entry(entry,p_mapping);
 IF entry.total_minor>0 THEN
  SELECT jsonb_agg(value-'component' ORDER BY ordinal) INTO lines FROM jsonb_array_elements(prepared->'lines') WITH ORDINALITY x(value,ordinal);
  journal_result:=irp_pms.gl_insert_journal(p_tenant,p_property,p_request,auth.uid(),jsonb_build_object('period_id',p_period,'posting_date',p_posting_date,'currency','USD','description','Service-day posting '||p_service_date::text,'source_kind','service_day_entry','source_id',p_request,'source_version',1,'lines',lines));
 END IF;
 result:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'request_id',p_request,'service_date',p_service_date,'reservation_id',p_reservation,'mapping_id',p_mapping,'mapping_version',prepared->'mapping_version','posting_date',p_posting_date,'journal_id',journal_result->'journal_id','zero_amount',entry.total_minor=0,'replayed',false);
 INSERT INTO irp_pms.gl_service_postings VALUES(p_tenant,p_property,p_request,p_service_date,p_reservation,p_mapping,p_period,p_posting_date,auth.uid(),(journal_result->>'journal_id')::uuid,to_jsonb(entry),prepared,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'service_journal_posted',p_request,jsonb_build_object('service_date',p_service_date,'reservation_id',p_reservation,'journal_id',journal_result->'journal_id','zero_amount',entry.total_minor=0));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_post_service_journal(uuid,uuid,uuid,date,uuid,uuid,uuid,date,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_post_service_journal(uuid,uuid,uuid,date,uuid,uuid,uuid,date,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_service_journal_reconciliation(p_tenant uuid,p_property uuid,p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE rows jsonb; pending_count integer; posted_count integer; zero_count integer;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end) OR p_end<=p_start OR p_end-p_start>366 THEN RAISE EXCEPTION 'Invalid reconciliation date range; choose 1 to 366 days';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 IF (SELECT count(*) FROM (SELECT 1 FROM irp_pms.service_day_entries WHERE tenant_id=p_tenant AND property_id=p_property AND service_date>=p_start AND service_date<p_end LIMIT 10001) bounded)>10000 THEN RAISE EXCEPTION 'Reconciliation exceeds 10000 source entries; narrow the date range';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'service_date',e.service_date,'reservation_id',e.reservation_id,'source_total_minor',e.total_minor::text,
  'status',CASE WHEN p.request_id IS NULL THEN 'pending' WHEN p.journal_id IS NULL THEN 'processed_zero' ELSE 'posted' END,
  'request_id',p.request_id,'journal_id',p.journal_id,'mapping_id',p.mapping_id,
  'mapping_version',p.prepared->'mapping_version','posting_date',p.posting_date
 ) ORDER BY e.service_date,e.reservation_id),'[]'::jsonb),
 count(*) FILTER(WHERE p.request_id IS NULL)::integer,
 count(*) FILTER(WHERE p.journal_id IS NOT NULL)::integer,
 count(*) FILTER(WHERE p.request_id IS NOT NULL AND p.journal_id IS NULL)::integer
 INTO rows,pending_count,posted_count,zero_count
 FROM irp_pms.service_day_entries e LEFT JOIN irp_pms.gl_service_postings p
 ON p.tenant_id=e.tenant_id AND p.property_id=e.property_id AND p.service_date=e.service_date AND p.reservation_id=e.reservation_id
 WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.service_date>=p_start AND e.service_date<p_end;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,
 'currency','USD','start_date',p_start,'end_date_exclusive',p_end,'basis','saved_service_day_entries',
 'entries',rows,'entry_count',jsonb_array_length(rows),'pending_count',pending_count,'posted_count',posted_count,'processed_zero_count',zero_count);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_service_journal_reconciliation(uuid,uuid,date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_service_journal_reconciliation(uuid,uuid,date,date) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_service_journal_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_service_postings;has_saved boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Service posting request identity required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 SELECT * INTO saved FROM irp_pms.gl_service_postings WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 has_saved:=FOUND;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),
 'request_id',p_request,'found',has_saved,'action','post_service_journal',
 'result',CASE WHEN has_saved THEN saved.result END,
 'command',CASE WHEN has_saved THEN jsonb_build_object('service_date',saved.service_date,'reservation_id',saved.reservation_id,'mapping_id',saved.mapping_id,'period_id',saved.period_id,'posting_date',saved.posting_date) END);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_service_journal_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_service_journal_status(uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_preview_service_journal(p_tenant uuid,p_property uuid,p_service_date date,p_reservation uuid,p_mapping uuid,p_period uuid,p_posting_date date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE entry irp_pms.service_day_entries;period irp_pms.gl_periods;prepared jsonb;prior irp_pms.gl_service_postings;lines jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO STRICT entry FROM irp_pms.service_day_entries WHERE tenant_id=p_tenant AND property_id=p_property AND service_date=p_service_date AND reservation_id=p_reservation;
 SELECT * INTO STRICT period FROM irp_pms.gl_periods WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_period;
 IF p_posting_date IS NULL OR NOT isfinite(p_posting_date) OR p_posting_date<p_service_date THEN RAISE EXCEPTION 'Posting cannot precede service date';END IF;
 IF period.closed OR p_posting_date<period.starts_on OR p_posting_date>=period.ends_before THEN RAISE EXCEPTION 'Posting period unavailable';END IF;
 prepared:=irp_pms.gl_prepare_service_entry(entry,p_mapping);
 SELECT coalesce(jsonb_agg(l.value||jsonb_build_object('account_code',a.code,'current_account_name',a.name) ORDER BY l.ordinal),'[]'::jsonb) INTO lines
 FROM jsonb_array_elements(prepared->'lines') WITH ORDINALITY l(value,ordinal) JOIN irp_pms.gl_accounts a ON a.tenant_id=p_tenant AND a.property_id=p_property AND a.id=(l.value->>'account_id')::uuid;
 SELECT * INTO prior FROM irp_pms.gl_service_postings WHERE tenant_id=p_tenant AND property_id=p_property AND service_date=p_service_date AND reservation_id=p_reservation;
 RETURN prepared||jsonb_build_object('schema_version',1,'actor_id',auth.uid(),'lines',lines,'period_id',p_period,'posting_date',p_posting_date,'already_processed',prior.request_id IS NOT NULL,'existing_request_id',prior.request_id,'existing_journal_id',prior.journal_id);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_preview_service_journal(uuid,uuid,date,uuid,uuid,uuid,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_preview_service_journal(uuid,uuid,date,uuid,uuid,uuid,date) TO authenticated;

-- Source: forward-posting.sql
CREATE TABLE irp_pms.gl_forward_postings(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,
 adjustment_id uuid NOT NULL,mapping_id uuid NOT NULL,
 period_id uuid NOT NULL,posting_date date NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),
 journal_id uuid,source_snapshot jsonb NOT NULL,prepared jsonb NOT NULL,result jsonb NOT NULL,
 PRIMARY KEY(tenant_id,property_id,request_id),UNIQUE(tenant_id,property_id,adjustment_id),
 FOREIGN KEY(tenant_id,property_id,adjustment_id) REFERENCES irp_pms.service_forward_entries(tenant_id,property_id,adjustment_id),
 FOREIGN KEY(tenant_id,property_id,mapping_id) REFERENCES irp_pms.gl_mapping_sets(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,period_id) REFERENCES irp_pms.gl_periods(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,journal_id) REFERENCES irp_pms.gl_journals(tenant_id,property_id,id)
);
CREATE TRIGGER gl_forward_posting_immutable BEFORE UPDATE OR DELETE ON irp_pms.gl_forward_postings FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
ALTER TABLE irp_pms.gl_forward_postings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.gl_forward_postings FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.irp_pms_pilot_post_forward_journal(p_tenant uuid,p_property uuid,p_request uuid,p_adjustment uuid,p_mapping uuid,p_period uuid,p_posting_date date,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE prior irp_pms.gl_forward_postings;entry irp_pms.service_forward_entries;period irp_pms.gl_periods;prepared jsonb;lines jsonb;journal_result jsonb;result jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Correction posting identity and confirmation required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.gl_posting_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND kind='forward' AND request_id=p_request) THEN RAISE EXCEPTION 'Posting request was retired; review the source again';END IF;
 SELECT * INTO prior FROM irp_pms.gl_forward_postings WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF (prior.adjustment_id,prior.mapping_id,prior.period_id,prior.posting_date,prior.actor_id) IS DISTINCT FROM(p_adjustment,p_mapping,p_period,p_posting_date,auth.uid()) THEN RAISE EXCEPTION 'Correction posting request identity already used';END IF;
  RETURN prior.result||jsonb_build_object('replayed',true);
 END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.gl_forward_postings WHERE tenant_id=p_tenant AND property_id=p_property AND adjustment_id=p_adjustment) THEN RAISE EXCEPTION 'Correction source already posted';END IF;
 SELECT * INTO STRICT entry FROM irp_pms.service_forward_entries WHERE tenant_id=p_tenant AND property_id=p_property AND adjustment_id=p_adjustment;
 IF p_posting_date IS NULL OR p_posting_date<entry.service_date THEN RAISE EXCEPTION 'Posting cannot precede service date';END IF;
 SELECT * INTO STRICT period FROM irp_pms.gl_periods WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_period FOR SHARE;
 IF period.closed OR p_posting_date<period.starts_on OR p_posting_date>=period.ends_before OR NOT isfinite(p_posting_date) THEN RAISE EXCEPTION 'Posting period unavailable';END IF;
 prepared:=irp_pms.gl_prepare_forward_entry(entry,p_mapping);
 IF NOT(prepared->>'no_posting_lines')::boolean THEN
  SELECT jsonb_agg(value-'component' ORDER BY ordinal) INTO lines FROM jsonb_array_elements(prepared->'lines') WITH ORDINALITY x(value,ordinal);
  journal_result:=irp_pms.gl_insert_journal(p_tenant,p_property,p_request,auth.uid(),jsonb_build_object('period_id',p_period,'posting_date',p_posting_date,'currency','USD','description','Service correction '||entry.service_date::text,'source_kind','service_forward_entry','source_id',p_adjustment,'source_version',1,'lines',lines));
 END IF;
 result:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'request_id',p_request,'service_date',entry.service_date,'reservation_id',entry.reservation_id,'adjustment_id',p_adjustment,'mapping_id',p_mapping,'mapping_version',prepared->'mapping_version','posting_date',p_posting_date,'journal_id',journal_result->'journal_id','no_posting_lines',prepared->'no_posting_lines','replayed',false);
 INSERT INTO irp_pms.gl_forward_postings VALUES(p_tenant,p_property,p_request,p_adjustment,p_mapping,p_period,p_posting_date,auth.uid(),(journal_result->>'journal_id')::uuid,to_jsonb(entry),prepared,result);
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'forward_journal_posted',p_request,jsonb_build_object('service_date',entry.service_date,'reservation_id',entry.reservation_id,'adjustment_id',p_adjustment,'journal_id',journal_result->'journal_id','no_posting_lines',prepared->'no_posting_lines'));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_post_forward_journal(uuid,uuid,uuid,uuid,uuid,uuid,date,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_post_forward_journal(uuid,uuid,uuid,uuid,uuid,uuid,date,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_forward_journal_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_forward_postings;has_saved boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Correction posting request identity required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 SELECT * INTO saved FROM irp_pms.gl_forward_postings WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 has_saved:=FOUND;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),
 'request_id',p_request,'found',has_saved,'action','post_forward_journal',
 'result',CASE WHEN has_saved THEN saved.result END,
 'command',CASE WHEN has_saved THEN jsonb_build_object('adjustment_id',saved.adjustment_id,'mapping_id',saved.mapping_id,'period_id',saved.period_id,'posting_date',saved.posting_date) END);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_forward_journal_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_forward_journal_status(uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_forward_journal_reconciliation(p_tenant uuid,p_property uuid,p_start date,p_end date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE rows jsonb; pending_count integer; posted_count integer; empty_count integer;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_start IS NULL OR p_end IS NULL OR NOT isfinite(p_start) OR NOT isfinite(p_end) OR p_end<=p_start OR p_end-p_start>366 THEN RAISE EXCEPTION 'Invalid reconciliation date range; choose 1 to 366 days';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 IF (SELECT count(*) FROM (SELECT 1 FROM irp_pms.service_forward_entries WHERE tenant_id=p_tenant AND property_id=p_property AND service_date>=p_start AND service_date<p_end LIMIT 10001) bounded)>10000 THEN RAISE EXCEPTION 'Reconciliation exceeds 10000 source entries; narrow the date range';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'service_date',e.service_date,'reservation_id',e.reservation_id,'adjustment_id',e.adjustment_id,'source_total_minor',e.total_minor::text,
  'status',CASE WHEN p.request_id IS NULL THEN 'pending' WHEN p.journal_id IS NULL THEN 'processed_empty' ELSE 'posted' END,
  'request_id',p.request_id,'journal_id',p.journal_id,'mapping_id',p.mapping_id,
  'mapping_version',p.prepared->'mapping_version','posting_date',p.posting_date
 ) ORDER BY e.service_date,e.adjustment_id),'[]'::jsonb),
 count(*) FILTER(WHERE p.request_id IS NULL)::integer,
 count(*) FILTER(WHERE p.journal_id IS NOT NULL)::integer,
 count(*) FILTER(WHERE p.request_id IS NOT NULL AND p.journal_id IS NULL)::integer
 INTO rows,pending_count,posted_count,empty_count
 FROM irp_pms.service_forward_entries e LEFT JOIN irp_pms.gl_forward_postings p
 ON p.tenant_id=e.tenant_id AND p.property_id=e.property_id AND p.adjustment_id=e.adjustment_id
 WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.service_date>=p_start AND e.service_date<p_end;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,
 'currency','USD','start_date',p_start,'end_date_exclusive',p_end,'basis','saved_service_forward_entries',
 'entries',rows,'entry_count',jsonb_array_length(rows),'pending_count',pending_count,'posted_count',posted_count,'processed_empty_count',empty_count);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_forward_journal_reconciliation(uuid,uuid,date,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_forward_journal_reconciliation(uuid,uuid,date,date) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_preview_forward_journal(p_tenant uuid,p_property uuid,p_adjustment uuid,p_mapping uuid,p_period uuid,p_posting_date date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE entry irp_pms.service_forward_entries;period irp_pms.gl_periods;prepared jsonb;prior irp_pms.gl_forward_postings;lines jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO STRICT entry FROM irp_pms.service_forward_entries WHERE tenant_id=p_tenant AND property_id=p_property AND adjustment_id=p_adjustment;
 SELECT * INTO STRICT period FROM irp_pms.gl_periods WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_period;
 IF p_posting_date IS NULL OR NOT isfinite(p_posting_date) OR p_posting_date<entry.service_date THEN RAISE EXCEPTION 'Posting cannot precede service date';END IF;
 IF period.closed OR p_posting_date<period.starts_on OR p_posting_date>=period.ends_before THEN RAISE EXCEPTION 'Posting period unavailable';END IF;
 prepared:=irp_pms.gl_prepare_forward_entry(entry,p_mapping);
 SELECT coalesce(jsonb_agg(l.value||jsonb_build_object('account_code',a.code,'current_account_name',a.name) ORDER BY l.ordinal),'[]'::jsonb) INTO lines
 FROM jsonb_array_elements(prepared->'lines') WITH ORDINALITY l(value,ordinal) JOIN irp_pms.gl_accounts a ON a.tenant_id=p_tenant AND a.property_id=p_property AND a.id=(l.value->>'account_id')::uuid;
 SELECT * INTO prior FROM irp_pms.gl_forward_postings WHERE tenant_id=p_tenant AND property_id=p_property AND adjustment_id=p_adjustment;
 RETURN prepared||jsonb_build_object('schema_version',1,'actor_id',auth.uid(),'lines',lines,'period_id',p_period,'posting_date',p_posting_date,'already_processed',prior.request_id IS NOT NULL,'existing_request_id',prior.request_id,'existing_journal_id',prior.journal_id);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_preview_forward_journal(uuid,uuid,uuid,uuid,uuid,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_preview_forward_journal(uuid,uuid,uuid,uuid,uuid,date) TO authenticated;


CREATE FUNCTION public.irp_pms_pilot_retire_gl_posting(p_tenant uuid,p_property uuid,p_request uuid,p_kind text,p_command jsonb,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_posting_retirements;replayed boolean:=false;keys text[];
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_kind IS NULL OR p_kind NOT IN ('service','forward') OR p_confirmed IS DISTINCT FROM true OR p_command IS NULL OR jsonb_typeof(p_command)<>'object' THEN RAISE EXCEPTION 'Original posting command and confirmation required';END IF;
 SELECT array_agg(k ORDER BY k) INTO keys FROM jsonb_object_keys(p_command) k;
 IF keys IS DISTINCT FROM (CASE p_kind WHEN 'service' THEN ARRAY['mapping_id','period_id','posting_date','reservation_id','service_date'] ELSE ARRAY['adjustment_id','mapping_id','period_id','posting_date'] END) THEN RAISE EXCEPTION 'Invalid original posting command';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_command) x WHERE jsonb_typeof(x.value)<>'string') THEN RAISE EXCEPTION 'Original posting values must be strings';END IF;
 PERFORM (p_command->>'mapping_id')::uuid,(p_command->>'period_id')::uuid;
 IF p_kind='service' THEN PERFORM (p_command->>'reservation_id')::uuid;IF NOT isfinite((p_command->>'service_date')::date) THEN RAISE EXCEPTION 'Invalid service date';END IF;ELSE PERFORM (p_command->>'adjustment_id')::uuid;END IF;
 IF NOT isfinite((p_command->>'posting_date')::date) THEN RAISE EXCEPTION 'Invalid posting date';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF (p_kind='service' AND EXISTS(SELECT 1 FROM irp_pms.gl_service_postings WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request)) OR (p_kind='forward' AND EXISTS(SELECT 1 FROM irp_pms.gl_forward_postings WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request)) THEN RAISE EXCEPTION 'Posting already saved; recover its result';END IF;
 SELECT * INTO saved FROM irp_pms.gl_posting_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND kind=p_kind;
 IF FOUND THEN
  IF (saved.actor_id,saved.command) IS DISTINCT FROM (auth.uid(),p_command) THEN RAISE EXCEPTION 'Retirement request identity already used';END IF;replayed:=true;
 ELSE
  INSERT INTO irp_pms.gl_posting_retirements(tenant_id,property_id,request_id,kind,actor_id,command) VALUES(p_tenant,p_property,p_request,p_kind,auth.uid(),p_command) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'gl_posting_request_retired',p_request,jsonb_build_object('kind',p_kind,'command',p_command));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'request_id',p_request,'actor_id',auth.uid(),'kind',p_kind,'command',saved.command,'retired',true,'retired_at',saved.retired_at,'replayed',replayed);
END $$;
CREATE FUNCTION public.irp_pms_pilot_gl_posting_retirement_status(p_tenant uuid,p_property uuid,p_request uuid,p_kind text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_posting_retirements;present boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 IF p_request IS NULL OR p_kind IS NULL OR p_kind NOT IN ('service','forward') THEN RAISE EXCEPTION 'Posting request identity required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 SELECT * INTO saved FROM irp_pms.gl_posting_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND kind=p_kind AND actor_id=auth.uid();present:=FOUND;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'request_id',p_request,'actor_id',auth.uid(),'kind',p_kind,'retired',present,'command',saved.command,'retired_at',saved.retired_at,'replayed',true);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_retire_gl_posting(uuid,uuid,uuid,text,jsonb,boolean),public.irp_pms_pilot_gl_posting_retirement_status(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_retire_gl_posting(uuid,uuid,uuid,text,jsonb,boolean),public.irp_pms_pilot_gl_posting_retirement_status(uuid,uuid,uuid,text) TO authenticated;

-- Source: period-close.sql
CREATE TABLE irp_pms.gl_period_closures (
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,period_id uuid NOT NULL,
 actor_id uuid NOT NULL,review_token text NOT NULL,review jsonb NOT NULL,closed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),UNIQUE(tenant_id,property_id,period_id),
 FOREIGN KEY(tenant_id,property_id,period_id) REFERENCES irp_pms.gl_periods(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.gl_period_closures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.gl_period_closures FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER gl_period_closure_immutable BEFORE UPDATE OR DELETE ON irp_pms.gl_period_closures FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE TABLE irp_pms.gl_period_close_retirements (
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,period_id uuid NOT NULL,actor_id uuid NOT NULL,review_token text NOT NULL,retired_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id,period_id) REFERENCES irp_pms.gl_periods(tenant_id,property_id,id)
);
ALTER TABLE irp_pms.gl_period_close_retirements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.gl_period_close_retirements FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER gl_period_retirement_immutable BEFORE UPDATE OR DELETE ON irp_pms.gl_period_close_retirements FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION irp_pms.gl_period_review(p_tenant uuid,p_property uuid,p_period uuid) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE period irp_pms.gl_periods;review jsonb;debits numeric;credits numeric;journals bigint;fingerprint text;pending_service bigint;pending_forward bigint;
BEGIN
 SELECT * INTO period FROM irp_pms.gl_periods WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_period;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped accounting period';END IF;
 SELECT count(*),encode(sha256(convert_to(coalesce(string_agg(id::text,',' ORDER BY id),''),'UTF8')),'hex') INTO journals,fingerprint FROM irp_pms.gl_journals WHERE tenant_id=p_tenant AND property_id=p_property AND period_id=p_period;
 SELECT coalesce(sum(l.amount_minor) FILTER(WHERE l.side='debit'),0),coalesce(sum(l.amount_minor) FILTER(WHERE l.side='credit'),0) INTO debits,credits FROM irp_pms.gl_lines l JOIN irp_pms.gl_journals j ON (j.tenant_id,j.property_id,j.id)=(l.tenant_id,l.property_id,l.journal_id) WHERE j.tenant_id=p_tenant AND j.property_id=p_property AND j.period_id=p_period;
 SELECT count(*) INTO pending_service FROM irp_pms.service_day_entries e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.service_date>=period.starts_on AND e.service_date<period.ends_before AND NOT EXISTS(SELECT 1 FROM irp_pms.gl_service_postings s WHERE (s.tenant_id,s.property_id,s.service_date,s.reservation_id)=(e.tenant_id,e.property_id,e.service_date,e.reservation_id));
 SELECT count(*) INTO pending_forward FROM irp_pms.service_forward_entries e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.service_date>=period.starts_on AND e.service_date<period.ends_before AND NOT EXISTS(SELECT 1 FROM irp_pms.gl_forward_postings s WHERE (s.tenant_id,s.property_id,s.adjustment_id)=(e.tenant_id,e.property_id,e.adjustment_id));
 review:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'period_id',p_period,'start_date',period.starts_on,'end_date_exclusive',period.ends_before,'closed',period.closed,'currency','USD','journal_count',journals,'journal_fingerprint',fingerprint,'debit_minor',debits::text,'credit_minor',credits::text,'pending_service_count',pending_service,'pending_correction_count',pending_forward,'basis','recorded_journals_and_saved_service_sources');
 RETURN review||jsonb_build_object('review_token',encode(sha256(convert_to(review::text,'UTF8')),'hex'));
END $$;
REVOKE ALL ON FUNCTION irp_pms.gl_period_review(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.irp_pms_pilot_gl_period_review(p_tenant uuid,p_property uuid,p_period uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 RETURN irp_pms.gl_period_review(p_tenant,p_property,p_period);
END $$;
CREATE FUNCTION public.irp_pms_pilot_close_gl_period(p_tenant uuid,p_property uuid,p_request uuid,p_period uuid,p_review_token text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_period_closures;review jsonb;replayed boolean:=false;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_period IS NULL OR p_confirmed IS DISTINCT FROM true OR p_review_token IS NULL OR p_review_token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Period review and confirmation required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.gl_period_close_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Period close request was retired; start a fresh review';END IF;
 SELECT * INTO saved FROM irp_pms.gl_period_closures WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF (saved.period_id,saved.actor_id,saved.review_token) IS DISTINCT FROM (p_period,auth.uid(),p_review_token) THEN RAISE EXCEPTION 'Period close request identity already used';END IF;
  replayed:=true;
 ELSE
  review:=irp_pms.gl_period_review(p_tenant,p_property,p_period);
  IF (review->>'closed')::boolean THEN RAISE EXCEPTION 'Accounting period already closed';END IF;
  IF review->>'review_token'<>p_review_token THEN RAISE EXCEPTION 'Accounting period changed; review again' USING ERRCODE='PT409';END IF;
  IF (review->>'pending_service_count')::bigint<>0 OR (review->>'pending_correction_count')::bigint<>0 THEN RAISE EXCEPTION 'Post saved service sources before closing';END IF;
  IF review->>'debit_minor'<>review->>'credit_minor' THEN RAISE EXCEPTION 'Accounting period does not balance';END IF;
  UPDATE irp_pms.gl_periods SET closed=true WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_period;
  INSERT INTO irp_pms.gl_period_closures(tenant_id,property_id,request_id,period_id,actor_id,review_token,review) VALUES(p_tenant,p_property,p_request,p_period,auth.uid(),p_review_token,review) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'gl_period_closed',p_period,jsonb_build_object('request_id',p_request,'review_token',p_review_token));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'period_id',p_period,'review_token',p_review_token,'closed_at',saved.closed_at,'closed',true,'replayed',replayed);
END $$;
CREATE FUNCTION public.irp_pms_pilot_gl_period_close_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_period_closures;present boolean;retirement irp_pms.gl_period_close_retirements;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Request identity required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 SELECT * INTO saved FROM irp_pms.gl_period_closures WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();present:=FOUND;
 SELECT * INTO retirement FROM irp_pms.gl_period_close_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request AND actor_id=auth.uid();
 IF FOUND THEN
  RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'found',false,'retired',true,'period_id',retirement.period_id,'review_token',retirement.review_token,'retired_at',retirement.retired_at,'closed_at',null);
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'found',present,'period_id',saved.period_id,'review_token',saved.review_token,'closed_at',saved.closed_at);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_gl_period_review(uuid,uuid,uuid),public.irp_pms_pilot_close_gl_period(uuid,uuid,uuid,uuid,text,boolean),public.irp_pms_pilot_gl_period_close_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_gl_period_review(uuid,uuid,uuid),public.irp_pms_pilot_close_gl_period(uuid,uuid,uuid,uuid,text,boolean),public.irp_pms_pilot_gl_period_close_status(uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_retire_gl_period_close(p_tenant uuid,p_property uuid,p_request uuid,p_period uuid,p_review_token text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.gl_period_close_retirements;replayed boolean:=false;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_period IS NULL OR p_confirmed IS DISTINCT FROM true OR p_review_token IS NULL OR p_review_token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Retained review and retirement confirmation required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.gl_period_closures WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request) THEN RAISE EXCEPTION 'Period close already saved; recover its result';END IF;
 SELECT * INTO saved FROM irp_pms.gl_period_close_retirements WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF (saved.actor_id,saved.period_id,saved.review_token) IS DISTINCT FROM (auth.uid(),p_period,p_review_token) THEN RAISE EXCEPTION 'Retirement request identity already used';END IF;replayed:=true;
 ELSE
  INSERT INTO irp_pms.gl_period_close_retirements(tenant_id,property_id,request_id,period_id,actor_id,review_token) VALUES(p_tenant,p_property,p_request,p_period,auth.uid(),p_review_token) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'gl_period_close_retired',p_period,jsonb_build_object('request_id',p_request,'review_token',p_review_token));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'period_id',p_period,'review_token',p_review_token,'retired',true,'retired_at',saved.retired_at,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_retire_gl_period_close(uuid,uuid,uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_retire_gl_period_close(uuid,uuid,uuid,uuid,text,boolean) TO authenticated;
COMMIT;

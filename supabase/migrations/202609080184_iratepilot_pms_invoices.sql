BEGIN;
-- invoice-ledger-draft.sql
-- Invoice ledger foundation. Issuance and allocation RPCs must enforce source balances.
-- No direct application table access; no invoice issuance is enabled by this draft alone.

CREATE TABLE irp_pms.invoice_counters(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,next_number bigint NOT NULL DEFAULT 1 CHECK(next_number BETWEEN 1 AND 999999999999),next_credit_number bigint NOT NULL DEFAULT 1 CHECK(next_credit_number BETWEEN 1 AND 999999999999),
 PRIMARY KEY(tenant_id,property_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
CREATE TABLE irp_pms.invoices(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL,reservation_id uuid NOT NULL,
 number bigint NOT NULL CHECK(number BETWEEN 1 AND 999999999999),issued_on date NOT NULL,due_on date NOT NULL,
 currency text NOT NULL CHECK(currency='USD'),amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 999999999999),
 billing_party jsonb NOT NULL CHECK(jsonb_typeof(billing_party)='object'),issuer jsonb NOT NULL CHECK(jsonb_typeof(issuer)='object'),
 source_snapshot jsonb NOT NULL CHECK(jsonb_typeof(source_snapshot)='object'),
 request_hash text NOT NULL CHECK(request_hash~'^[0-9a-f]{64}$'),actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,id),UNIQUE(tenant_id,property_id,number),UNIQUE(tenant_id,property_id,reservation_id,id),
 FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.reservations(tenant_id,property_id,id),CHECK(due_on>=issued_on)
);
CREATE TABLE irp_pms.invoice_lines(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,invoice_id uuid NOT NULL,line_number integer NOT NULL CHECK(line_number BETWEEN 1 AND 10000),
 source_key text NOT NULL CHECK(length(source_key) BETWEEN 1 AND 200),description text NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 500),
 category text NOT NULL CHECK(length(category) BETWEEN 1 AND 100),amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 999999999999),
 PRIMARY KEY(tenant_id,property_id,invoice_id,line_number),UNIQUE(tenant_id,property_id,invoice_id,source_key),
 FOREIGN KEY(tenant_id,property_id,invoice_id) REFERENCES irp_pms.invoices(tenant_id,property_id,id)
);
CREATE TABLE irp_pms.invoice_payment_allocations(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL,invoice_id uuid NOT NULL,reservation_id uuid NOT NULL,entry_id uuid NOT NULL,
 effective_on date NOT NULL,amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 999999999999),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 4 AND 500),actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,id),
 FOREIGN KEY(tenant_id,property_id,reservation_id,invoice_id) REFERENCES irp_pms.invoices(tenant_id,property_id,reservation_id,id),
 FOREIGN KEY(tenant_id,property_id,reservation_id,entry_id) REFERENCES irp_pms.folio_entries(tenant_id,property_id,reservation_id,id)
);
CREATE TABLE irp_pms.invoice_allocation_reversals(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL,allocation_id uuid NOT NULL,effective_on date NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 999999999999),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 4 AND 500),
 actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,id),FOREIGN KEY(tenant_id,property_id,allocation_id) REFERENCES irp_pms.invoice_payment_allocations(tenant_id,property_id,id)
);
CREATE TABLE irp_pms.invoice_credit_notes(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,id uuid NOT NULL,invoice_id uuid NOT NULL,effective_on date NOT NULL,
 number bigint NOT NULL CHECK(number BETWEEN 1 AND 999999999999),amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 999999999999),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 4 AND 500),source_snapshot jsonb NOT NULL CHECK(jsonb_typeof(source_snapshot)='object'),
 actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,id),UNIQUE(tenant_id,property_id,number),UNIQUE(tenant_id,property_id,invoice_id,id),FOREIGN KEY(tenant_id,property_id,invoice_id) REFERENCES irp_pms.invoices(tenant_id,property_id,id)
);
CREATE TABLE irp_pms.invoice_credit_lines(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,credit_id uuid NOT NULL,invoice_id uuid NOT NULL,invoice_line_number integer NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 999999999999),PRIMARY KEY(tenant_id,property_id,credit_id,invoice_line_number),
 FOREIGN KEY(tenant_id,property_id,invoice_id,credit_id) REFERENCES irp_pms.invoice_credit_notes(tenant_id,property_id,invoice_id,id),
 FOREIGN KEY(tenant_id,property_id,invoice_id,invoice_line_number) REFERENCES irp_pms.invoice_lines(tenant_id,property_id,invoice_id,line_number)
);
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['invoice_counters','invoices','invoice_lines','invoice_payment_allocations','invoice_allocation_reversals','invoice_credit_notes','invoice_credit_lines'] LOOP
  EXECUTE format('ALTER TABLE irp_pms.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON irp_pms.%I FROM PUBLIC,anon,authenticated,service_role',t);
  IF t<>'invoice_counters' THEN EXECUTE format('CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.%I FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable()',t);END IF;
 END LOOP;
END $$;
CREATE FUNCTION irp_pms.invoice_lines_reconcile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid;expected bigint;actual numeric;
BEGIN
 IF TG_TABLE_NAME='invoices' THEN target:=NEW.id;ELSE target:=NEW.invoice_id;END IF;
 SELECT amount_minor INTO STRICT expected FROM irp_pms.invoices WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=target;
 SELECT coalesce(sum(amount_minor),0) INTO actual FROM irp_pms.invoice_lines WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND invoice_id=target;
 IF actual<>expected THEN RAISE EXCEPTION 'Invoice lines do not reconcile to the issued amount';END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION irp_pms.invoice_lines_reconcile() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER invoice_total_matches_lines AFTER INSERT ON irp_pms.invoices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.invoice_lines_reconcile();
CREATE CONSTRAINT TRIGGER invoice_line_matches_total AFTER INSERT ON irp_pms.invoice_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.invoice_lines_reconcile();
CREATE FUNCTION irp_pms.invoice_allocation_validate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE invoice irp_pms.invoices;payment irp_pms.folio_entries;allocated numeric;payment_available numeric;invoice_available numeric;
BEGIN
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
 SELECT * INTO STRICT invoice FROM irp_pms.invoices WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.invoice_id;
 SELECT * INTO STRICT payment FROM irp_pms.folio_entries WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND reservation_id=NEW.reservation_id AND id=NEW.entry_id;
 IF payment.kind<>'external_payment' THEN RAISE EXCEPTION 'Invoice allocation requires a payment receipt';END IF;
 IF NEW.effective_on<invoice.issued_on THEN RAISE EXCEPTION 'Allocation date precedes invoice issue';END IF;
 IF NEW.effective_on<(payment.created_at AT TIME ZONE (SELECT time_zone FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id))::date THEN RAISE EXCEPTION 'Allocation date precedes payment receipt';END IF;
 SELECT invoice.amount_minor-coalesce((SELECT sum(a.amount_minor) FROM irp_pms.invoice_payment_allocations a WHERE a.tenant_id=NEW.tenant_id AND a.property_id=NEW.property_id AND a.invoice_id=NEW.invoice_id),0)
 +coalesce((SELECT sum(r.amount_minor) FROM irp_pms.invoice_allocation_reversals r JOIN irp_pms.invoice_payment_allocations a ON a.tenant_id=r.tenant_id AND a.property_id=r.property_id AND a.id=r.allocation_id WHERE a.tenant_id=NEW.tenant_id AND a.property_id=NEW.property_id AND a.invoice_id=NEW.invoice_id),0)
 -coalesce((SELECT sum(c.amount_minor) FROM irp_pms.invoice_credit_notes c WHERE c.tenant_id=NEW.tenant_id AND c.property_id=NEW.property_id AND c.invoice_id=NEW.invoice_id),0) INTO invoice_available;
 SELECT coalesce(sum(a.amount_minor),0)-coalesce((SELECT sum(r.amount_minor) FROM irp_pms.invoice_allocation_reversals r JOIN irp_pms.invoice_payment_allocations p ON p.tenant_id=r.tenant_id AND p.property_id=r.property_id AND p.id=r.allocation_id WHERE p.tenant_id=NEW.tenant_id AND p.property_id=NEW.property_id AND p.entry_id=NEW.entry_id),0) INTO allocated FROM irp_pms.invoice_payment_allocations a WHERE a.tenant_id=NEW.tenant_id AND a.property_id=NEW.property_id AND a.entry_id=NEW.entry_id;
 SELECT payment.amount_minor-coalesce(sum(e.amount_minor),0) INTO payment_available FROM irp_pms.folio_entries e WHERE e.tenant_id=NEW.tenant_id AND e.property_id=NEW.property_id AND e.reservation_id=NEW.reservation_id AND e.target_entry_id=NEW.entry_id AND e.kind IN('external_refund','payment_correction');
 IF NEW.amount_minor>invoice_available OR NEW.amount_minor>payment_available-allocated THEN RAISE EXCEPTION 'Invoice allocation exceeds available invoice or payment balance';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.invoice_allocation_validate() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER invoice_allocation_valid BEFORE INSERT ON irp_pms.invoice_payment_allocations FOR EACH ROW EXECUTE FUNCTION irp_pms.invoice_allocation_validate();
CREATE FUNCTION irp_pms.invoice_reduction_validate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE allocation irp_pms.invoice_payment_allocations;invoice irp_pms.invoices;remaining numeric;
BEGIN
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
 IF TG_TABLE_NAME='invoice_allocation_reversals' THEN
  SELECT * INTO STRICT allocation FROM irp_pms.invoice_payment_allocations WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.allocation_id;
  IF NEW.effective_on<allocation.effective_on THEN RAISE EXCEPTION 'Reversal date precedes payment allocation';END IF;
  SELECT allocation.amount_minor-coalesce(sum(r.amount_minor),0) INTO remaining FROM irp_pms.invoice_allocation_reversals r WHERE r.tenant_id=NEW.tenant_id AND r.property_id=NEW.property_id AND r.allocation_id=NEW.allocation_id;
  IF NEW.amount_minor>remaining THEN RAISE EXCEPTION 'Reversal exceeds remaining payment allocation';END IF;
 ELSE
  SELECT * INTO STRICT invoice FROM irp_pms.invoices WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.invoice_id;
  IF NEW.effective_on<invoice.issued_on THEN RAISE EXCEPTION 'Credit date precedes invoice issue';END IF;
  SELECT invoice.amount_minor-coalesce((SELECT sum(a.amount_minor) FROM irp_pms.invoice_payment_allocations a WHERE a.tenant_id=NEW.tenant_id AND a.property_id=NEW.property_id AND a.invoice_id=NEW.invoice_id),0)
  +coalesce((SELECT sum(r.amount_minor) FROM irp_pms.invoice_allocation_reversals r JOIN irp_pms.invoice_payment_allocations a ON a.tenant_id=r.tenant_id AND a.property_id=r.property_id AND a.id=r.allocation_id WHERE a.tenant_id=NEW.tenant_id AND a.property_id=NEW.property_id AND a.invoice_id=NEW.invoice_id),0)
  -coalesce((SELECT sum(c.amount_minor) FROM irp_pms.invoice_credit_notes c WHERE c.tenant_id=NEW.tenant_id AND c.property_id=NEW.property_id AND c.invoice_id=NEW.invoice_id),0) INTO remaining;
  IF NEW.amount_minor>remaining THEN RAISE EXCEPTION 'Credit exceeds unallocated invoice balance; reverse payment allocations first';END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.invoice_reduction_validate() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER invoice_reversal_valid BEFORE INSERT ON irp_pms.invoice_allocation_reversals FOR EACH ROW EXECUTE FUNCTION irp_pms.invoice_reduction_validate();
CREATE TRIGGER invoice_credit_valid BEFORE INSERT ON irp_pms.invoice_credit_notes FOR EACH ROW EXECUTE FUNCTION irp_pms.invoice_reduction_validate();
CREATE FUNCTION irp_pms.invoice_history_reconcile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid;issued bigint;source_payment uuid;source_amount bigint;
BEGIN
 IF TG_TABLE_NAME='invoice_allocation_reversals' THEN
  SELECT invoice_id INTO STRICT target FROM irp_pms.invoice_payment_allocations WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.allocation_id;
 ELSE target:=NEW.invoice_id;END IF;
 SELECT amount_minor INTO STRICT issued FROM irp_pms.invoices WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=target;
 IF EXISTS(
  WITH events AS (
   SELECT effective_on,amount_minor::numeric AS delta FROM irp_pms.invoice_payment_allocations WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND invoice_id=target
   UNION ALL SELECT effective_on,amount_minor::numeric FROM irp_pms.invoice_credit_notes WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND invoice_id=target
   UNION ALL SELECT r.effective_on,-r.amount_minor::numeric FROM irp_pms.invoice_allocation_reversals r JOIN irp_pms.invoice_payment_allocations a ON a.tenant_id=r.tenant_id AND a.property_id=r.property_id AND a.id=r.allocation_id WHERE a.tenant_id=NEW.tenant_id AND a.property_id=NEW.property_id AND a.invoice_id=target
  ), daily AS (SELECT effective_on,sum(delta) AS delta FROM events GROUP BY effective_on), history AS (SELECT sum(delta) OVER(ORDER BY effective_on) AS applied FROM daily)
  SELECT 1 FROM history WHERE applied<0 OR applied>issued
 ) THEN RAISE EXCEPTION 'Invoice historical allocations do not reconcile';END IF;
 IF TG_TABLE_NAME<>'invoice_credit_notes' THEN
  IF TG_TABLE_NAME='invoice_allocation_reversals' THEN SELECT entry_id INTO STRICT source_payment FROM irp_pms.invoice_payment_allocations WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=NEW.allocation_id;
  ELSE source_payment:=NEW.entry_id;END IF;
  SELECT amount_minor INTO STRICT source_amount FROM irp_pms.folio_entries WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=source_payment;
  IF EXISTS(
   WITH events AS (
    SELECT effective_on,amount_minor::numeric AS delta FROM irp_pms.invoice_payment_allocations WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND entry_id=source_payment
    UNION ALL SELECT r.effective_on,-r.amount_minor::numeric FROM irp_pms.invoice_allocation_reversals r JOIN irp_pms.invoice_payment_allocations a ON a.tenant_id=r.tenant_id AND a.property_id=r.property_id AND a.id=r.allocation_id WHERE a.tenant_id=NEW.tenant_id AND a.property_id=NEW.property_id AND a.entry_id=source_payment
    UNION ALL SELECT (e.created_at AT TIME ZONE p.time_zone)::date,e.amount_minor::numeric FROM irp_pms.folio_entries e JOIN irp_pms.properties p ON p.tenant_id=e.tenant_id AND p.id=e.property_id WHERE e.tenant_id=NEW.tenant_id AND e.property_id=NEW.property_id AND e.target_entry_id=source_payment AND e.kind IN('external_refund','payment_correction')
   ), daily AS (SELECT effective_on,sum(delta) AS delta FROM events GROUP BY effective_on), history AS (SELECT sum(delta) OVER(ORDER BY effective_on) AS applied FROM daily)
   SELECT 1 FROM history WHERE applied<0 OR applied>source_amount
  ) THEN RAISE EXCEPTION 'Payment historical allocations exceed the receipt';END IF;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION irp_pms.invoice_history_reconcile() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER invoice_allocation_history AFTER INSERT ON irp_pms.invoice_payment_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.invoice_history_reconcile();
CREATE CONSTRAINT TRIGGER invoice_reversal_history AFTER INSERT ON irp_pms.invoice_allocation_reversals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.invoice_history_reconcile();
CREATE CONSTRAINT TRIGGER invoice_credit_history AFTER INSERT ON irp_pms.invoice_credit_notes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.invoice_history_reconcile();
CREATE FUNCTION irp_pms.invoice_payment_reduction_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE original bigint;reductions numeric;allocated numeric;effective_date date;zone text;
BEGIN
 IF NEW.kind NOT IN('external_refund','payment_correction') OR NEW.target_entry_id IS NULL THEN RETURN NEW;END IF;
 SELECT time_zone INTO STRICT zone FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
 effective_date:=(NEW.created_at AT TIME ZONE zone)::date;
 SELECT amount_minor INTO STRICT original FROM irp_pms.folio_entries WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND reservation_id=NEW.reservation_id AND id=NEW.target_entry_id;
 SELECT coalesce(sum(amount_minor),0) INTO reductions FROM irp_pms.folio_entries WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND reservation_id=NEW.reservation_id AND target_entry_id=NEW.target_entry_id AND kind IN('external_refund','payment_correction');
 SELECT coalesce(sum(a.amount_minor),0)-coalesce((SELECT sum(r.amount_minor) FROM irp_pms.invoice_allocation_reversals r JOIN irp_pms.invoice_payment_allocations p ON p.tenant_id=r.tenant_id AND p.property_id=r.property_id AND p.id=r.allocation_id WHERE p.tenant_id=NEW.tenant_id AND p.property_id=NEW.property_id AND p.entry_id=NEW.target_entry_id AND r.effective_on<=effective_date),0) INTO allocated FROM irp_pms.invoice_payment_allocations a WHERE a.tenant_id=NEW.tenant_id AND a.property_id=NEW.property_id AND a.entry_id=NEW.target_entry_id;
 IF original-reductions-NEW.amount_minor<allocated THEN RAISE EXCEPTION 'Reverse invoice payment allocations before reducing this receipt';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.invoice_payment_reduction_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER invoice_payment_reduction_protected BEFORE INSERT ON irp_pms.folio_entries FOR EACH ROW EXECUTE FUNCTION irp_pms.invoice_payment_reduction_guard();
CREATE FUNCTION irp_pms.invoice_credit_lines_reconcile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid;expected bigint;actual numeric;
BEGIN
 IF TG_TABLE_NAME='invoice_credit_notes' THEN target:=NEW.id;ELSE target:=NEW.credit_id;END IF;
 SELECT amount_minor INTO STRICT expected FROM irp_pms.invoice_credit_notes WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND id=target;
 SELECT coalesce(sum(amount_minor),0) INTO actual FROM irp_pms.invoice_credit_lines WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND credit_id=target;
 IF actual<>expected THEN RAISE EXCEPTION 'Credit note lines do not reconcile';END IF;
 IF EXISTS(SELECT 1 FROM irp_pms.invoice_credit_lines c JOIN irp_pms.invoice_lines l ON l.tenant_id=c.tenant_id AND l.property_id=c.property_id AND l.invoice_id=c.invoice_id AND l.line_number=c.invoice_line_number WHERE c.tenant_id=NEW.tenant_id AND c.property_id=NEW.property_id AND c.invoice_id=NEW.invoice_id GROUP BY c.invoice_line_number,l.amount_minor HAVING sum(c.amount_minor)>l.amount_minor) THEN RAISE EXCEPTION 'Credit exceeds original invoice line';END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION irp_pms.invoice_credit_lines_reconcile() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER credit_total_matches_lines AFTER INSERT ON irp_pms.invoice_credit_notes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.invoice_credit_lines_reconcile();
CREATE CONSTRAINT TRIGGER credit_line_matches_total AFTER INSERT ON irp_pms.invoice_credit_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION irp_pms.invoice_credit_lines_reconcile();

-- invoice-opening-adjustments-draft.sql
CREATE TABLE irp_pms.invoice_opening_adjustments(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,reservation_id uuid NOT NULL,reversal_id uuid NOT NULL,
 request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),lines jsonb NOT NULL CHECK(jsonb_typeof(lines)='array'),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 4 AND 500),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,reservation_id,reversal_id),UNIQUE(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id,reservation_id,reversal_id) REFERENCES irp_pms.folio_entries(tenant_id,property_id,reservation_id,id)
);
ALTER TABLE irp_pms.invoice_opening_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.invoice_opening_adjustments FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER invoice_opening_adjustment_immutable BEFORE UPDATE OR DELETE ON irp_pms.invoice_opening_adjustments FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION public.irp_pms_pilot_itemize_opening_reversal(p_tenant uuid,p_property uuid,p_reservation uuid,p_reversal uuid,p_request uuid,p_lines jsonb,p_reason text,p_confirmed boolean) RETURNS jsonb
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
   SELECT coalesce(sum((entry->>'amount_minor')::numeric),0) INTO used FROM irp_pms.invoice_opening_adjustments a CROSS JOIN LATERAL jsonb_array_elements(a.lines) entry WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND a.reservation_id=p_reservation AND entry->>'source_key'=category;
   IF base IS NULL OR used+(item->>'amount_minor')::numeric>base THEN RAISE EXCEPTION 'Opening reversal exceeds original category';END IF;
   total:=total+(item->>'amount_minor')::numeric;
  END LOOP;
  IF total<>reversal.amount_minor THEN RAISE EXCEPTION 'Itemization must equal the opening reversal';END IF;
  INSERT INTO irp_pms.invoice_opening_adjustments VALUES(p_tenant,p_property,p_reservation,p_reversal,p_request,auth.uid(),p_lines,p_reason,clock_timestamp()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'invoice_opening_reversal_itemized',p_reservation,jsonb_build_object('reversal_id',p_reversal,'request_id',p_request));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'reservation_id',p_reservation,'reversal_id',p_reversal,'lines',saved.lines,'reason',saved.reason,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_itemize_opening_reversal(uuid,uuid,uuid,uuid,uuid,jsonb,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_itemize_opening_reversal(uuid,uuid,uuid,uuid,uuid,jsonb,text,boolean) TO authenticated;

-- invoice-sources-draft.sql
CREATE FUNCTION public.irp_pms_pilot_invoice_sources(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
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
 IF EXISTS(SELECT 1 FROM irp_pms.folio_entries e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.reservation_id=p_reservation AND e.kind='charge_reversal' AND e.target_entry_id IS NULL AND NOT EXISTS(SELECT 1 FROM irp_pms.invoice_opening_adjustments a WHERE a.tenant_id=e.tenant_id AND a.property_id=e.property_id AND a.reservation_id=e.reservation_id AND a.reversal_id=e.id)) THEN RAISE EXCEPTION 'Opening charge reversals require itemized invoice reconciliation';END IF;
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
  SELECT coalesce(sum((entry->>'amount_minor')::numeric),0) INTO prior FROM irp_pms.invoice_opening_adjustments a CROSS JOIN LATERAL jsonb_array_elements(a.lines) entry WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND a.reservation_id=p_reservation AND entry->>'source_key'=item->>'source_key';
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
REVOKE ALL ON FUNCTION public.irp_pms_pilot_invoice_sources(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_invoice_sources(uuid,uuid,uuid) TO authenticated;

-- invoice-issue-api-draft.sql
CREATE FUNCTION public.irp_pms_pilot_issue_invoice(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_source_hash text,p_due_on date,p_billing_party jsonb,p_issuer jsonb,p_lines jsonb,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.invoices;res irp_pms.reservations;source jsonb;item jsonb;matched jsonb;bill jsonb;issuer jsonb;request_hash text;business_date date;total numeric:=0;line_index integer:=0;invoice_number bigint;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_reservation IS NULL OR p_due_on IS NULL OR p_source_hash IS NULL OR p_source_hash!~'^[0-9a-f]{64}$' OR p_confirmed IS DISTINCT FROM true OR p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Confirm invoice details and selected charge sources';END IF;
 bill:=irp_pms.normalize_guest_data(p_billing_party,'billing');issuer:=irp_pms.normalize_guest_data(p_issuer,'billing');
 IF coalesce(bill->>'legal_name',bill->>'company_name') IS NULL OR coalesce(issuer->>'legal_name',issuer->>'company_name') IS NULL THEN RAISE EXCEPTION 'Invoice recipient and issuer names are required';END IF;
 request_hash:=encode(sha256(convert_to(jsonb_build_object('reservation',p_reservation,'source_hash',p_source_hash,'due_on',p_due_on,'billing',bill,'issuer',issuer,'lines',p_lines)::text,'UTF8')),'hex');
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT (clock_timestamp() AT TIME ZONE time_zone)::date INTO STRICT business_date FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO saved FROM irp_pms.invoices WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request;replayed:=FOUND;
 IF replayed THEN
  IF saved.actor_id IS DISTINCT FROM auth.uid() OR saved.request_hash IS DISTINCT FROM request_hash THEN RAISE EXCEPTION 'Invoice request has different details';END IF;
 ELSE
  IF p_due_on<business_date THEN RAISE EXCEPTION 'New invoice due date precedes issue date';END IF;
  source:=public.irp_pms_pilot_invoice_sources(p_tenant,p_property,p_reservation);
  IF source->>'source_hash'<>p_source_hash THEN RAISE EXCEPTION 'Invoice sources changed; review current charges';END IF;
  IF (SELECT count(*)<>count(DISTINCT value->>'source_key') FROM jsonb_array_elements(p_lines)) THEN RAISE EXCEPTION 'Duplicate selected invoice source';END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
   IF jsonb_typeof(item)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(item))<>2 OR jsonb_typeof(item->'source_key') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'amount_minor') IS DISTINCT FROM 'string' OR item->>'amount_minor'!~'^[1-9][0-9]{0,11}$' THEN RAISE EXCEPTION 'Invalid selected invoice line';END IF;
   SELECT value INTO matched FROM jsonb_array_elements(source->'lines') WHERE value->>'source_key'=item->>'source_key';
   IF matched IS NULL OR (item->>'amount_minor')::numeric>(matched->>'available_minor')::numeric THEN RAISE EXCEPTION 'Selected invoice amount exceeds charge availability';END IF;
   total:=total+(item->>'amount_minor')::numeric;
  END LOOP;
  IF total NOT BETWEEN 1 AND 999999999999 THEN RAISE EXCEPTION 'Invoice total exceeds supported range';END IF;
  SELECT * INTO STRICT res FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation;
  IF NOT EXISTS(SELECT 1 FROM irp_pms.folio_openings WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation) THEN
   INSERT INTO irp_pms.folio_openings(tenant_id,property_id,reservation_id,accommodation_minor,taxes_minor,fees_minor,hotel_fees_minor,charge_breakdown,total_minor,reservation_source,source_version,opened_by) VALUES(p_tenant,p_property,p_reservation,res.accommodation_minor,res.taxes_minor,res.ota_fees_minor,res.hotel_fees_minor,res.charge_breakdown,res.guest_total_minor,res.source,res.source_version,auth.uid());
  END IF;
  INSERT INTO irp_pms.invoice_counters(tenant_id,property_id) VALUES(p_tenant,p_property) ON CONFLICT DO NOTHING;
  UPDATE irp_pms.invoice_counters SET next_number=next_number+1 WHERE tenant_id=p_tenant AND property_id=p_property RETURNING next_number-1 INTO invoice_number;
  INSERT INTO irp_pms.invoices(tenant_id,property_id,id,reservation_id,number,issued_on,due_on,currency,amount_minor,billing_party,issuer,source_snapshot,request_hash,actor_id) VALUES(p_tenant,p_property,p_request,p_reservation,invoice_number,business_date,p_due_on,'USD',total::bigint,bill,issuer,source,request_hash,auth.uid()) RETURNING * INTO saved;
  FOR item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
   line_index:=line_index+1;SELECT value INTO STRICT matched FROM jsonb_array_elements(source->'lines') WHERE value->>'source_key'=item->>'source_key';
   INSERT INTO irp_pms.invoice_lines VALUES(p_tenant,p_property,p_request,line_index,item->>'source_key',matched->>'description',matched->>'category',(item->>'amount_minor')::bigint);
  END LOOP;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'invoice_issued',p_request,jsonb_build_object('reservation_id',p_reservation,'number',invoice_number,'amount_minor',total::text));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'invoice_id',saved.id,'reservation_id',saved.reservation_id,'number',saved.number::text,'issued_on',saved.issued_on,'due_on',saved.due_on,'amount_minor',saved.amount_minor::text,'currency','USD','created_at',saved.created_at,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_issue_invoice(uuid,uuid,uuid,uuid,text,date,jsonb,jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_issue_invoice(uuid,uuid,uuid,uuid,text,date,jsonb,jsonb,jsonb,boolean) TO authenticated;

-- invoice-document-draft.sql
CREATE FUNCTION public.irp_pms_pilot_invoice_document(p_tenant uuid,p_property uuid,p_invoice uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE document irp_pms.invoices;lines jsonb;allocated numeric;credits numeric;business_date date;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT (clock_timestamp() AT TIME ZONE time_zone)::date INTO STRICT business_date FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO STRICT document FROM irp_pms.invoices WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_invoice;
 SELECT coalesce(jsonb_agg(jsonb_build_object('line_number',line_number,'description',description,'category',category,'amount_minor',amount_minor::text) ORDER BY line_number),'[]'::jsonb) INTO lines FROM irp_pms.invoice_lines WHERE tenant_id=p_tenant AND property_id=p_property AND invoice_id=p_invoice;
 SELECT coalesce(sum(a.amount_minor),0)-coalesce((SELECT sum(r.amount_minor) FROM irp_pms.invoice_allocation_reversals r JOIN irp_pms.invoice_payment_allocations a ON a.tenant_id=r.tenant_id AND a.property_id=r.property_id AND a.id=r.allocation_id WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND a.invoice_id=p_invoice AND r.effective_on<=business_date),0) INTO allocated FROM irp_pms.invoice_payment_allocations a WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND a.invoice_id=p_invoice AND a.effective_on<=business_date;
 SELECT coalesce(sum(amount_minor),0) INTO credits FROM irp_pms.invoice_credit_notes WHERE tenant_id=p_tenant AND property_id=p_property AND invoice_id=p_invoice AND effective_on<=business_date;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'invoice_id',p_invoice,'reservation_id',document.reservation_id,'number',document.number::text,'issued_on',document.issued_on,'due_on',document.due_on,'currency',document.currency,'issued_minor',document.amount_minor::text,'billing_party',document.billing_party,'issuer',document.issuer,'lines',lines,'created_at',document.created_at,'balance_as_of',business_date,'allocated_minor',allocated::text,'credited_minor',credits::text,'outstanding_minor',(document.amount_minor-allocated-credits)::text,'semantics',jsonb_build_object('issued_document','immutable','balance','current_effective_ledger','processor_settlement_verified',false,'internal_source_snapshot_included',false));
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_invoice_document(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_invoice_document(uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_reservation_invoices(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE rows jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF NOT EXISTS(SELECT 1 FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation) THEN RAISE EXCEPTION 'Unknown scoped reservation';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('invoice_id',id,'number',number::text,'issued_on',issued_on,'due_on',due_on,'issued_minor',amount_minor::text) ORDER BY number),'[]') INTO rows FROM irp_pms.invoices WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 IF jsonb_array_length(rows)>1000 THEN RAISE EXCEPTION 'Invoice list exceeds supported limit';END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'reservation_id',p_reservation,'actor_id',auth.uid(),'currency','USD','complete',true,'invoices',rows);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_reservation_invoices(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_reservation_invoices(uuid,uuid,uuid) TO authenticated;

-- invoice-allocation-api-draft.sql
CREATE FUNCTION public.irp_pms_pilot_allocate_invoice_payment(p_tenant uuid,p_property uuid,p_request uuid,p_invoice uuid,p_entry uuid,p_effective_on date,p_amount_minor bigint,p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.invoice_payment_allocations;document irp_pms.invoices;replayed boolean;business_date date;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_invoice IS NULL OR p_entry IS NULL OR p_effective_on IS NULL OR p_amount_minor IS NULL OR p_amount_minor NOT BETWEEN 1 AND 999999999999 OR p_reason IS NULL OR p_reason<>trim(p_reason) OR length(p_reason) NOT BETWEEN 4 AND 500 OR p_reason~'[[:cntrl:]]' OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm a valid invoice payment allocation';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT (clock_timestamp() AT TIME ZONE time_zone)::date INTO STRICT business_date FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO saved FROM irp_pms.invoice_payment_allocations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request;
 replayed:=FOUND;
 IF replayed THEN
  IF saved.actor_id IS DISTINCT FROM auth.uid() OR saved.invoice_id IS DISTINCT FROM p_invoice OR saved.entry_id IS DISTINCT FROM p_entry OR saved.effective_on IS DISTINCT FROM p_effective_on OR saved.amount_minor IS DISTINCT FROM p_amount_minor OR saved.reason IS DISTINCT FROM p_reason THEN RAISE EXCEPTION 'Invoice allocation request has different details';END IF;
 ELSE
  IF p_effective_on>business_date THEN RAISE EXCEPTION 'Invoice allocation cannot be future dated';END IF;
  SELECT * INTO STRICT document FROM irp_pms.invoices WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_invoice;
  INSERT INTO irp_pms.invoice_payment_allocations(tenant_id,property_id,id,invoice_id,reservation_id,entry_id,effective_on,amount_minor,reason,actor_id) VALUES(p_tenant,p_property,p_request,p_invoice,document.reservation_id,p_entry,p_effective_on,p_amount_minor,p_reason,auth.uid()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'invoice_payment_allocated',p_invoice,jsonb_build_object('allocation_id',p_request,'entry_id',p_entry,'amount_minor',p_amount_minor::text));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'invoice_id',saved.invoice_id,'entry_id',saved.entry_id,'effective_on',saved.effective_on,'amount_minor',saved.amount_minor::text,'reason',saved.reason,'created_at',saved.created_at,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_allocate_invoice_payment(uuid,uuid,uuid,uuid,uuid,date,bigint,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_allocate_invoice_payment(uuid,uuid,uuid,uuid,uuid,date,bigint,text,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_reverse_invoice_allocation(p_tenant uuid,p_property uuid,p_request uuid,p_allocation uuid,p_effective_on date,p_amount_minor bigint,p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.invoice_allocation_reversals;original irp_pms.invoice_payment_allocations;replayed boolean;business_date date;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_allocation IS NULL OR p_effective_on IS NULL OR p_amount_minor IS NULL OR p_amount_minor NOT BETWEEN 1 AND 999999999999 OR p_reason IS NULL OR p_reason<>trim(p_reason) OR length(p_reason) NOT BETWEEN 4 AND 500 OR p_reason~'[[:cntrl:]]' OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm a valid invoice allocation reversal';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT (clock_timestamp() AT TIME ZONE time_zone)::date INTO STRICT business_date FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO saved FROM irp_pms.invoice_allocation_reversals WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request;
 replayed:=FOUND;
 IF replayed THEN
  IF saved.actor_id IS DISTINCT FROM auth.uid() OR saved.allocation_id IS DISTINCT FROM p_allocation OR saved.effective_on IS DISTINCT FROM p_effective_on OR saved.amount_minor IS DISTINCT FROM p_amount_minor OR saved.reason IS DISTINCT FROM p_reason THEN RAISE EXCEPTION 'Invoice reversal request has different details';END IF;
 ELSE
  IF p_effective_on>business_date THEN RAISE EXCEPTION 'Invoice reversal cannot be future dated';END IF;
  SELECT * INTO STRICT original FROM irp_pms.invoice_payment_allocations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_allocation;
  INSERT INTO irp_pms.invoice_allocation_reversals(tenant_id,property_id,id,allocation_id,effective_on,amount_minor,reason,actor_id) VALUES(p_tenant,p_property,p_request,p_allocation,p_effective_on,p_amount_minor,p_reason,auth.uid()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'invoice_allocation_reversed',original.invoice_id,jsonb_build_object('reversal_id',p_request,'allocation_id',p_allocation,'amount_minor',p_amount_minor::text));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'allocation_id',saved.allocation_id,'effective_on',saved.effective_on,'amount_minor',saved.amount_minor::text,'reason',saved.reason,'created_at',saved.created_at,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_reverse_invoice_allocation(uuid,uuid,uuid,uuid,date,bigint,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_reverse_invoice_allocation(uuid,uuid,uuid,uuid,date,bigint,text,boolean) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_invoice_allocation_status(p_tenant uuid,p_property uuid,p_request uuid,p_kind text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE allocation irp_pms.invoice_payment_allocations;reversal irp_pms.invoice_allocation_reversals;receipt jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_request IS NULL OR p_kind IS NULL OR p_kind NOT IN('allocation','reversal') THEN RAISE EXCEPTION 'Invoice request identity and kind required';END IF;
 IF p_kind='allocation' THEN
  SELECT * INTO allocation FROM irp_pms.invoice_payment_allocations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request AND actor_id=auth.uid();
  IF FOUND THEN receipt:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'invoice_id',allocation.invoice_id,'entry_id',allocation.entry_id,'effective_on',allocation.effective_on,'amount_minor',allocation.amount_minor::text,'reason',allocation.reason,'created_at',allocation.created_at,'replayed',true);END IF;
 ELSE
  SELECT * INTO reversal FROM irp_pms.invoice_allocation_reversals WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request AND actor_id=auth.uid();
  IF FOUND THEN receipt:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'allocation_id',reversal.allocation_id,'effective_on',reversal.effective_on,'amount_minor',reversal.amount_minor::text,'reason',reversal.reason,'created_at',reversal.created_at,'replayed',true);END IF;
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'kind',p_kind,'found',receipt IS NOT NULL,'result',receipt);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_invoice_allocation_status(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_invoice_allocation_status(uuid,uuid,uuid,text) TO authenticated;

-- invoice-credit-api-draft.sql
CREATE FUNCTION public.irp_pms_pilot_issue_invoice_credit(p_tenant uuid,p_property uuid,p_invoice uuid,p_request uuid,p_effective_on date,p_lines jsonb,p_reason text,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.invoice_credit_notes;item jsonb;original irp_pms.invoice_lines;total numeric:=0;credited numeric;number bigint;request_hash text;business_date date;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_invoice IS NULL OR p_effective_on IS NULL OR p_reason IS NULL OR p_reason<>trim(p_reason) OR length(p_reason) NOT BETWEEN 4 AND 500 OR p_reason~'[[:cntrl:]]' OR p_confirmed IS DISTINCT FROM true OR p_lines IS NULL OR jsonb_typeof(p_lines)<>'array' OR jsonb_array_length(p_lines) NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Confirm itemized invoice credit';END IF;
 request_hash:=encode(sha256(convert_to(jsonb_build_object('invoice',p_invoice,'effective_on',p_effective_on,'lines',p_lines,'reason',p_reason)::text,'UTF8')),'hex');
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT (clock_timestamp() AT TIME ZONE time_zone)::date INTO STRICT business_date FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO saved FROM irp_pms.invoice_credit_notes WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request;replayed:=FOUND;
 IF replayed THEN
  IF saved.actor_id IS DISTINCT FROM auth.uid() OR saved.source_snapshot->>'request_hash' IS DISTINCT FROM request_hash THEN RAISE EXCEPTION 'Credit request has different details';END IF;
 ELSE
  IF p_effective_on>business_date THEN RAISE EXCEPTION 'Credit cannot be future dated';END IF;
  IF (SELECT count(*)<>count(DISTINCT value->>'line_number') FROM jsonb_array_elements(p_lines)) THEN RAISE EXCEPTION 'Duplicate credit line';END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
   IF jsonb_typeof(item)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(item))<>2 OR item->>'line_number'!~'^[1-9][0-9]{0,4}$' OR jsonb_typeof(item->'amount_minor') IS DISTINCT FROM 'string' OR item->>'amount_minor'!~'^[1-9][0-9]{0,11}$' THEN RAISE EXCEPTION 'Invalid credit line';END IF;
   SELECT * INTO STRICT original FROM irp_pms.invoice_lines WHERE tenant_id=p_tenant AND property_id=p_property AND invoice_id=p_invoice AND line_number=(item->>'line_number')::integer;
   SELECT coalesce(sum(amount_minor),0) INTO credited FROM irp_pms.invoice_credit_lines WHERE tenant_id=p_tenant AND property_id=p_property AND invoice_id=p_invoice AND invoice_line_number=original.line_number;
   IF credited+(item->>'amount_minor')::numeric>original.amount_minor THEN RAISE EXCEPTION 'Credit exceeds original invoice line';END IF;
   total:=total+(item->>'amount_minor')::numeric;
  END LOOP;
  IF total NOT BETWEEN 1 AND 999999999999 THEN RAISE EXCEPTION 'Credit total exceeds supported range';END IF;
  INSERT INTO irp_pms.invoice_counters(tenant_id,property_id) VALUES(p_tenant,p_property) ON CONFLICT DO NOTHING;
  UPDATE irp_pms.invoice_counters SET next_credit_number=next_credit_number+1 WHERE tenant_id=p_tenant AND property_id=p_property RETURNING next_credit_number-1 INTO number;
  INSERT INTO irp_pms.invoice_credit_notes(tenant_id,property_id,id,invoice_id,effective_on,number,amount_minor,reason,source_snapshot,actor_id) VALUES(p_tenant,p_property,p_request,p_invoice,p_effective_on,number,total::bigint,p_reason,jsonb_build_object('request_hash',request_hash,'lines',p_lines),auth.uid()) RETURNING * INTO saved;
  FOR item IN SELECT value FROM jsonb_array_elements(p_lines) LOOP INSERT INTO irp_pms.invoice_credit_lines VALUES(p_tenant,p_property,p_request,p_invoice,(item->>'line_number')::integer,(item->>'amount_minor')::bigint);END LOOP;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'invoice_credit_issued',p_invoice,jsonb_build_object('credit_id',p_request,'number',number,'amount_minor',total::text));
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'credit_id',saved.id,'invoice_id',saved.invoice_id,'number',saved.number::text,'effective_on',saved.effective_on,'amount_minor',saved.amount_minor::text,'reason',saved.reason,'created_at',saved.created_at,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_issue_invoice_credit(uuid,uuid,uuid,uuid,date,jsonb,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_issue_invoice_credit(uuid,uuid,uuid,uuid,date,jsonb,text,boolean) TO authenticated;

-- invoice-aging-draft.sql
CREATE FUNCTION public.irp_pms_pilot_invoice_aging(p_tenant uuid,p_property uuid,p_as_of date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE business_date date;row record;allocated numeric;credited numeric;outstanding numeric;days integer;bucket text;rows jsonb:='[]';totals jsonb:='{"not_due":"0","days_1_30":"0","days_31_60":"0","days_61_90":"0","days_91_plus":"0"}';grand numeric:=0;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 SELECT (clock_timestamp() AT TIME ZONE time_zone)::date INTO STRICT business_date FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_as_of IS NULL OR p_as_of>business_date THEN RAISE EXCEPTION 'Choose an invoice aging date no later than today';END IF;
 IF (SELECT count(*) FROM irp_pms.invoices WHERE tenant_id=p_tenant AND property_id=p_property AND issued_on<=p_as_of)>1000 THEN RAISE EXCEPTION 'Invoice aging exceeds supported report limit';END IF;
 FOR row IN SELECT * FROM irp_pms.invoices WHERE tenant_id=p_tenant AND property_id=p_property AND issued_on<=p_as_of ORDER BY due_on,number LOOP
  SELECT coalesce(sum(a.amount_minor),0)-coalesce((SELECT sum(r.amount_minor) FROM irp_pms.invoice_allocation_reversals r JOIN irp_pms.invoice_payment_allocations a ON a.tenant_id=r.tenant_id AND a.property_id=r.property_id AND a.id=r.allocation_id WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND a.invoice_id=row.id AND r.effective_on<=p_as_of),0) INTO allocated FROM irp_pms.invoice_payment_allocations a WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND a.invoice_id=row.id AND a.effective_on<=p_as_of;
  SELECT coalesce(sum(amount_minor),0) INTO credited FROM irp_pms.invoice_credit_notes WHERE tenant_id=p_tenant AND property_id=p_property AND invoice_id=row.id AND effective_on<=p_as_of;
  outstanding:=row.amount_minor-allocated-credited;
  IF outstanding<0 OR allocated<0 THEN RAISE EXCEPTION 'Invoice aging ledger does not reconcile';END IF;
  days:=greatest(0,p_as_of-row.due_on);bucket:=CASE WHEN days=0 THEN 'not_due' WHEN days<=30 THEN 'days_1_30' WHEN days<=60 THEN 'days_31_60' WHEN days<=90 THEN 'days_61_90' ELSE 'days_91_plus' END;
  totals:=jsonb_set(totals,ARRAY[bucket],to_jsonb(((totals->>bucket)::numeric+outstanding)::text));grand:=grand+outstanding;
  rows:=rows||jsonb_build_array(jsonb_build_object('invoice_id',row.id,'number',row.number::text,'issued_on',row.issued_on,'due_on',row.due_on,'recipient',coalesce(row.billing_party->>'legal_name',row.billing_party->>'company_name'),'days_overdue',days,'bucket',bucket,'issued_minor',row.amount_minor::text,'allocated_minor',allocated::text,'credited_minor',credited::text,'outstanding_minor',outstanding::text));
 END LOOP;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'currency','USD','as_of',p_as_of,'generated_at',clock_timestamp(),'complete',true,'basis','issued_invoices_effective_allocations','rows',rows,'totals',totals,'outstanding_minor',grand::text);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_invoice_aging(uuid,uuid,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_invoice_aging(uuid,uuid,date) TO authenticated;

-- invoice-status-draft.sql
CREATE FUNCTION public.irp_pms_pilot_invoice_issue_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.invoices%ROWTYPE;receipt jsonb:=NULL;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Invoice request is required';END IF;
 SELECT * INTO saved FROM irp_pms.invoices WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request AND actor_id=auth.uid();
 IF FOUND THEN
  receipt:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'invoice_id',saved.id,'reservation_id',saved.reservation_id,'number',saved.number::text,'issued_on',saved.issued_on,'due_on',saved.due_on,'amount_minor',saved.amount_minor::text,'currency','USD','created_at',saved.created_at,'replayed',true);
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'found',receipt IS NOT NULL,'result',receipt);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_invoice_issue_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_invoice_issue_status(uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_invoice_credit_status(p_tenant uuid,p_property uuid,p_request uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.invoice_credit_notes%ROWTYPE;receipt jsonb:=NULL;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,false);
 IF p_request IS NULL THEN RAISE EXCEPTION 'Credit request is required';END IF;
 SELECT * INTO saved FROM irp_pms.invoice_credit_notes WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request AND actor_id=auth.uid();
 IF FOUND THEN
  receipt:=jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'credit_id',saved.id,'invoice_id',saved.invoice_id,'number',saved.number::text,'effective_on',saved.effective_on,'amount_minor',saved.amount_minor::text,'reason',saved.reason,'created_at',saved.created_at,'replayed',true);
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'found',receipt IS NOT NULL,'result',receipt);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_invoice_credit_status(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_invoice_credit_status(uuid,uuid,uuid) TO authenticated;

-- invoice-credit-document-draft.sql
CREATE FUNCTION public.irp_pms_pilot_invoice_credit_document(p_tenant uuid,p_property uuid,p_credit uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE credit irp_pms.invoice_credit_notes%ROWTYPE;invoice irp_pms.invoices%ROWTYPE;lines jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 SELECT * INTO STRICT credit FROM irp_pms.invoice_credit_notes WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_credit;
 SELECT * INTO STRICT invoice FROM irp_pms.invoices WHERE tenant_id=p_tenant AND property_id=p_property AND id=credit.invoice_id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('invoice_line_number',c.invoice_line_number,'description',l.description,'category',l.category,'amount_minor',c.amount_minor::text) ORDER BY c.invoice_line_number),'[]'::jsonb) INTO lines
 FROM irp_pms.invoice_credit_lines c JOIN irp_pms.invoice_lines l ON l.tenant_id=c.tenant_id AND l.property_id=c.property_id AND l.invoice_id=c.invoice_id AND l.line_number=c.invoice_line_number
 WHERE c.tenant_id=p_tenant AND c.property_id=p_property AND c.credit_id=p_credit;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'credit_id',credit.id,'invoice_id',invoice.id,'reservation_id',invoice.reservation_id,'number',credit.number::text,'invoice_number',invoice.number::text,'effective_on',credit.effective_on,'currency',invoice.currency,'amount_minor',credit.amount_minor::text,'issuer',invoice.issuer,'billing_party',invoice.billing_party,'lines',lines,'created_at',credit.created_at,'semantics',jsonb_build_object('issued_document','immutable','internal_source_snapshot_included',false,'internal_reason_included',false));
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_invoice_credit_document(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_invoice_credit_document(uuid,uuid,uuid) TO authenticated;
CREATE FUNCTION public.irp_pms_pilot_invoice_credits(p_tenant uuid,p_property uuid,p_invoice uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE rows jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF NOT EXISTS(SELECT 1 FROM irp_pms.invoices WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_invoice) THEN RAISE EXCEPTION 'Unknown scoped invoice';END IF;
 IF (SELECT count(*) FROM irp_pms.invoice_credit_notes WHERE tenant_id=p_tenant AND property_id=p_property AND invoice_id=p_invoice)>1000 THEN RAISE EXCEPTION 'Credit list exceeds supported limit';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('credit_id',id,'number',number::text,'effective_on',effective_on,'amount_minor',amount_minor::text) ORDER BY number),'[]'::jsonb) INTO rows FROM irp_pms.invoice_credit_notes WHERE tenant_id=p_tenant AND property_id=p_property AND invoice_id=p_invoice;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'invoice_id',p_invoice,'currency','USD','complete',true,'credits',rows);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_invoice_credits(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_invoice_credits(uuid,uuid,uuid) TO authenticated;

-- invoice-cancel-draft.sql
CREATE TABLE irp_pms.invoice_request_cancellations(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.invoice_request_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.invoice_request_cancellations FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.invoice_request_cancellations FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION irp_pms.invoice_cancel_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM irp_pms.invoice_request_cancellations WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND request_id=NEW.id) THEN RAISE EXCEPTION 'Invoice request was cancelled; review charges with a new request';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.invoice_cancel_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cancelled_request BEFORE INSERT ON irp_pms.invoices FOR EACH ROW EXECUTE FUNCTION irp_pms.invoice_cancel_guard();
CREATE FUNCTION public.irp_pms_pilot_cancel_invoice_request(p_tenant uuid,p_property uuid,p_request uuid,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.invoice_request_cancellations%ROWTYPE;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm cancellation of the unrecorded invoice request';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.invoices WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request) THEN RAISE EXCEPTION 'Invoice already issued; recover the saved invoice';END IF;
 SELECT * INTO saved FROM irp_pms.invoice_request_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;replayed:=FOUND;
 IF replayed THEN IF saved.actor_id<>auth.uid() THEN RAISE EXCEPTION 'Invoice cancellation belongs to another actor';END IF;
 ELSE
  INSERT INTO irp_pms.invoice_request_cancellations VALUES(p_tenant,p_property,p_request,auth.uid(),clock_timestamp()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'invoice_request_cancelled',p_request,'{}');
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'cancelled',true,'created_at',saved.created_at,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cancel_invoice_request(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cancel_invoice_request(uuid,uuid,uuid,boolean) TO authenticated;

-- invoice-payment-options-draft.sql
CREATE FUNCTION public.irp_pms_pilot_invoice_payment_options(p_tenant uuid,p_property uuid,p_invoice uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE invoice irp_pms.invoices%ROWTYPE;payment record;rows jsonb:='[]';allocated numeric;reduced numeric;available numeric;document jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 SELECT * INTO STRICT invoice FROM irp_pms.invoices WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_invoice;
 document:=public.irp_pms_pilot_invoice_document(p_tenant,p_property,p_invoice);
 IF (SELECT count(*) FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=invoice.reservation_id AND kind='external_payment')>1000 THEN RAISE EXCEPTION 'Payment option list exceeds supported limit';END IF;
 FOR payment IN SELECT * FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=invoice.reservation_id AND kind='external_payment' ORDER BY created_at,id LOOP
  SELECT coalesce(sum(a.amount_minor),0)-coalesce((SELECT sum(r.amount_minor) FROM irp_pms.invoice_allocation_reversals r JOIN irp_pms.invoice_payment_allocations a ON a.tenant_id=r.tenant_id AND a.property_id=r.property_id AND a.id=r.allocation_id WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND a.entry_id=payment.id),0) INTO allocated FROM irp_pms.invoice_payment_allocations a WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND a.entry_id=payment.id;
  SELECT coalesce(sum(amount_minor),0) INTO reduced FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=invoice.reservation_id AND target_entry_id=payment.id AND kind IN('external_refund','payment_correction');
  available:=payment.amount_minor-reduced-allocated;
  IF available<0 THEN RAISE EXCEPTION 'Payment allocations do not reconcile';END IF;
  rows:=rows||jsonb_build_array(jsonb_build_object('entry_id',payment.id,'reference',payment.reference,'created_at',payment.created_at,'received_minor',payment.amount_minor::text,'refunded_or_corrected_minor',reduced::text,'allocated_minor',allocated::text,'available_minor',available::text));
 END LOOP;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'invoice_id',p_invoice,'reservation_id',invoice.reservation_id,'currency','USD','complete',true,'invoice_outstanding_minor',document->>'outstanding_minor','payments',rows);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_invoice_payment_options(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_invoice_payment_options(uuid,uuid,uuid) TO authenticated;

-- invoice-allocation-list-draft.sql
CREATE FUNCTION public.irp_pms_pilot_invoice_allocations(p_tenant uuid,p_property uuid,p_invoice uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE rows jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF NOT EXISTS(SELECT 1 FROM irp_pms.invoices WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_invoice) THEN RAISE EXCEPTION 'Unknown scoped invoice';END IF;
 IF (SELECT count(*) FROM irp_pms.invoice_payment_allocations WHERE tenant_id=p_tenant AND property_id=p_property AND invoice_id=p_invoice)>1000 THEN RAISE EXCEPTION 'Invoice allocation history exceeds supported limit';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('allocation_id',a.id,'entry_id',a.entry_id,'reference',e.reference,'effective_on',a.effective_on,'amount_minor',a.amount_minor::text,'reversed_minor',coalesce(r.total,0)::text,'reversible_minor',(a.amount_minor-coalesce(r.total,0))::text,'reason',a.reason,'created_at',a.created_at) ORDER BY a.created_at,a.id),'[]'::jsonb) INTO rows
 FROM irp_pms.invoice_payment_allocations a
 JOIN irp_pms.folio_entries e ON e.tenant_id=a.tenant_id AND e.property_id=a.property_id AND e.id=a.entry_id
 LEFT JOIN LATERAL (SELECT sum(amount_minor) AS total FROM irp_pms.invoice_allocation_reversals WHERE tenant_id=a.tenant_id AND property_id=a.property_id AND allocation_id=a.id) r ON true
 WHERE a.tenant_id=p_tenant AND a.property_id=p_property AND a.invoice_id=p_invoice;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'invoice_id',p_invoice,'currency','USD','complete',true,'allocations',rows);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_invoice_allocations(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_invoice_allocations(uuid,uuid,uuid) TO authenticated;

-- invoice-allocation-cancel-draft.sql
CREATE TABLE irp_pms.invoice_allocation_cancellations(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.invoice_allocation_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.invoice_allocation_cancellations FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.invoice_allocation_cancellations FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION irp_pms.invoice_allocation_cancel_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM irp_pms.invoice_allocation_cancellations WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND request_id=NEW.id) THEN RAISE EXCEPTION 'Allocation request was cancelled; review payments with a new request';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.invoice_allocation_cancel_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cancelled_request BEFORE INSERT ON irp_pms.invoice_payment_allocations FOR EACH ROW EXECUTE FUNCTION irp_pms.invoice_allocation_cancel_guard();
CREATE FUNCTION public.irp_pms_pilot_cancel_invoice_allocation_request(p_tenant uuid,p_property uuid,p_request uuid,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.invoice_allocation_cancellations%ROWTYPE;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm cancellation of the unrecorded allocation request';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.invoice_payment_allocations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request) THEN RAISE EXCEPTION 'Allocation already recorded; recover the saved allocation';END IF;
 SELECT * INTO saved FROM irp_pms.invoice_allocation_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;replayed:=FOUND;
 IF replayed THEN IF saved.actor_id<>auth.uid() THEN RAISE EXCEPTION 'Allocation cancellation belongs to another actor';END IF;
 ELSE
  INSERT INTO irp_pms.invoice_allocation_cancellations VALUES(p_tenant,p_property,p_request,auth.uid(),clock_timestamp()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'invoice_allocation_request_cancelled',p_request,'{}');
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'cancelled',true,'created_at',saved.created_at,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cancel_invoice_allocation_request(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cancel_invoice_allocation_request(uuid,uuid,uuid,boolean) TO authenticated;

-- invoice-reversal-cancel-draft.sql
CREATE TABLE irp_pms.invoice_reversal_cancellations(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.invoice_reversal_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.invoice_reversal_cancellations FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.invoice_reversal_cancellations FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION irp_pms.invoice_reversal_cancel_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM irp_pms.invoice_reversal_cancellations WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND request_id=NEW.id) THEN RAISE EXCEPTION 'Reversal request was cancelled; review payments with a new request';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.invoice_reversal_cancel_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cancelled_request BEFORE INSERT ON irp_pms.invoice_allocation_reversals FOR EACH ROW EXECUTE FUNCTION irp_pms.invoice_reversal_cancel_guard();
CREATE FUNCTION public.irp_pms_pilot_cancel_invoice_reversal_request(p_tenant uuid,p_property uuid,p_request uuid,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.invoice_reversal_cancellations%ROWTYPE;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm cancellation of the unrecorded reversal request';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.invoice_allocation_reversals WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request) THEN RAISE EXCEPTION 'Reversal already recorded; recover the saved reversal';END IF;
 SELECT * INTO saved FROM irp_pms.invoice_reversal_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;replayed:=FOUND;
 IF replayed THEN IF saved.actor_id<>auth.uid() THEN RAISE EXCEPTION 'Reversal cancellation belongs to another actor';END IF;
 ELSE
  INSERT INTO irp_pms.invoice_reversal_cancellations VALUES(p_tenant,p_property,p_request,auth.uid(),clock_timestamp()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'invoice_reversal_request_cancelled',p_request,'{}');
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'cancelled',true,'created_at',saved.created_at,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cancel_invoice_reversal_request(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cancel_invoice_reversal_request(uuid,uuid,uuid,boolean) TO authenticated;

-- invoice-credit-options-draft.sql
CREATE FUNCTION public.irp_pms_pilot_invoice_credit_options(p_tenant uuid,p_property uuid,p_invoice uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE document jsonb;lines jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 document:=public.irp_pms_pilot_invoice_document(p_tenant,p_property,p_invoice);
 SELECT coalesce(jsonb_agg(jsonb_build_object('line_number',l.line_number,'description',l.description,'category',l.category,'issued_minor',l.amount_minor::text,'credited_minor',coalesce(c.amount,0)::text,'available_minor',(l.amount_minor-coalesce(c.amount,0))::text) ORDER BY l.line_number),'[]'::jsonb) INTO lines
 FROM irp_pms.invoice_lines l LEFT JOIN LATERAL(SELECT sum(amount_minor) AS amount FROM irp_pms.invoice_credit_lines WHERE tenant_id=l.tenant_id AND property_id=l.property_id AND invoice_id=l.invoice_id AND invoice_line_number=l.line_number)c ON true
 WHERE l.tenant_id=p_tenant AND l.property_id=p_property AND l.invoice_id=p_invoice;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'invoice_id',p_invoice,'currency','USD','complete',true,'invoice_outstanding_minor',document->>'outstanding_minor','lines',lines);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_invoice_credit_options(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_invoice_credit_options(uuid,uuid,uuid) TO authenticated;

-- invoice-credit-cancel-draft.sql
CREATE TABLE irp_pms.invoice_credit_cancellations(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,request_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,request_id),FOREIGN KEY(tenant_id,property_id) REFERENCES irp_pms.properties(tenant_id,id)
);
ALTER TABLE irp_pms.invoice_credit_cancellations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.invoice_credit_cancellations FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON irp_pms.invoice_credit_cancellations FOR EACH ROW EXECUTE FUNCTION irp_pms.gl_immutable();
CREATE FUNCTION irp_pms.invoice_credit_cancel_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=NEW.tenant_id AND id=NEW.property_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM irp_pms.invoice_credit_cancellations WHERE tenant_id=NEW.tenant_id AND property_id=NEW.property_id AND request_id=NEW.id) THEN RAISE EXCEPTION 'Credit request was cancelled; review invoice credits with a new request';END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION irp_pms.invoice_credit_cancel_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER cancelled_request BEFORE INSERT ON irp_pms.invoice_credit_notes FOR EACH ROW EXECUTE FUNCTION irp_pms.invoice_credit_cancel_guard();
CREATE FUNCTION public.irp_pms_pilot_cancel_invoice_credit_request(p_tenant uuid,p_property uuid,p_request uuid,p_confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE saved irp_pms.invoice_credit_cancellations%ROWTYPE;replayed boolean;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm cancellation of the unrecorded credit request';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF EXISTS(SELECT 1 FROM irp_pms.invoice_credit_notes WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_request) THEN RAISE EXCEPTION 'Credit already recorded; recover the saved credit';END IF;
 SELECT * INTO saved FROM irp_pms.invoice_credit_cancellations WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;replayed:=FOUND;
 IF replayed THEN IF saved.actor_id<>auth.uid() THEN RAISE EXCEPTION 'Credit cancellation belongs to another actor';END IF;
 ELSE
  INSERT INTO irp_pms.invoice_credit_cancellations VALUES(p_tenant,p_property,p_request,auth.uid(),clock_timestamp()) RETURNING * INTO saved;
  INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'invoice_credit_request_cancelled',p_request,'{}');
 END IF;
 RETURN jsonb_build_object('schema_version',1,'tenant_id',p_tenant,'property_id',p_property,'actor_id',auth.uid(),'request_id',p_request,'cancelled',true,'created_at',saved.created_at,'replayed',replayed);
END $$;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_cancel_invoice_credit_request(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_cancel_invoice_credit_request(uuid,uuid,uuid,boolean) TO authenticated;
COMMIT;

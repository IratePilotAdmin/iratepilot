BEGIN;
-- A record of charges and externally reported money movements. These RPCs do
-- not contact a processor, capture a payment, or verify a provider settlement.
CREATE TABLE irp_pms.folio_openings(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,reservation_id uuid NOT NULL,
 accommodation_minor bigint NOT NULL CHECK(accommodation_minor BETWEEN 0 AND 999999999999),
 taxes_minor bigint NOT NULL CHECK(taxes_minor BETWEEN 0 AND 999999999999),
 fees_minor bigint NOT NULL CHECK(fees_minor BETWEEN 0 AND 999999999999),
 total_minor bigint NOT NULL CHECK(total_minor BETWEEN 0 AND 999999999999),currency text NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
 reservation_source text NOT NULL,source_version bigint NOT NULL,opened_by uuid NOT NULL REFERENCES auth.users(id),opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,reservation_id),FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.reservations(tenant_id,property_id,id),
 CHECK(accommodation_minor+taxes_minor+fees_minor=total_minor)
);
CREATE TABLE irp_pms.folio_entries(
 tenant_id uuid NOT NULL,property_id uuid NOT NULL,reservation_id uuid NOT NULL,id uuid NOT NULL DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN('charge','charge_reversal','external_payment','external_refund','payment_correction')),
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 999999999999),currency text NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
 reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 4 AND 200 AND reference=trim(reference)),reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 4 AND 500),
 target_entry_id uuid,actor_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,property_id,reservation_id,id),UNIQUE(tenant_id,property_id,request_id),
 FOREIGN KEY(tenant_id,property_id,reservation_id) REFERENCES irp_pms.folio_openings(tenant_id,property_id,reservation_id),
 FOREIGN KEY(tenant_id,property_id,reservation_id,target_entry_id) REFERENCES irp_pms.folio_entries(tenant_id,property_id,reservation_id,id),
 CHECK((kind IN('charge','external_payment') AND target_entry_id IS NULL) OR kind='charge_reversal' OR (kind IN('external_refund','payment_correction') AND target_entry_id IS NOT NULL))
);
CREATE INDEX folio_entry_target ON irp_pms.folio_entries(tenant_id,property_id,reservation_id,target_entry_id,kind);
CREATE UNIQUE INDEX folio_external_transaction_reference ON irp_pms.folio_entries(tenant_id,property_id,reservation_id,kind,reference) WHERE kind IN('external_payment','external_refund');
ALTER TABLE irp_pms.folio_openings ENABLE ROW LEVEL SECURITY;
ALTER TABLE irp_pms.folio_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON irp_pms.folio_openings,irp_pms.folio_entries FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON irp_pms.folio_openings,irp_pms.folio_entries TO service_role;

CREATE FUNCTION public.irp_pms_pilot_folio(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE res irp_pms.reservations; opening irp_pms.folio_openings; frozen boolean; additional bigint; reversed bigint; payments bigint; refunds bigint; corrections bigint; entries jsonb;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 -- A shared property lock makes the opening, current reservation and entry
 -- aggregates one consistent view while operating/financial writers serialize.
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 SELECT * INTO res FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped reservation'; END IF;
 SELECT * INTO opening FROM irp_pms.folio_openings WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 frozen:=FOUND;
 IF NOT frozen THEN
  IF res.guest_total_minor IS NULL OR res.accommodation_minor IS NULL OR res.taxes_minor IS NULL OR res.ota_fees_minor IS NULL THEN
   RETURN jsonb_build_object('reservation_id',p_reservation,'available',false,'reason','reservation_charges_unavailable','currency','USD','entries','[]'::jsonb,'payment_recording','external_only');
  END IF;
  opening.accommodation_minor:=res.accommodation_minor;opening.taxes_minor:=res.taxes_minor;opening.fees_minor:=res.ota_fees_minor;opening.total_minor:=res.guest_total_minor;
 END IF;
 SELECT coalesce(sum(amount_minor) FILTER(WHERE kind='charge'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='charge_reversal'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='external_payment'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='external_refund'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='payment_correction'),0),
 coalesce(jsonb_agg(jsonb_build_object('id',id,'request_id',request_id,'kind',kind,'amount_minor',amount_minor,'currency',currency,'reference',reference,'reason',reason,'target_entry_id',target_entry_id,'actor_id',actor_id,'created_at',created_at) ORDER BY created_at,id),'[]'::jsonb)
 INTO additional,reversed,payments,refunds,corrections,entries FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 RETURN jsonb_build_object('reservation_id',p_reservation,'available',true,'currency','USD','payment_recording','external_only','opening_mode',CASE WHEN frozen THEN 'frozen' ELSE 'reservation_preview' END,
 'reservation_amounts_changed',frozen AND (opening.accommodation_minor IS DISTINCT FROM res.accommodation_minor OR opening.taxes_minor IS DISTINCT FROM res.taxes_minor OR opening.fees_minor IS DISTINCT FROM res.ota_fees_minor OR opening.total_minor IS DISTINCT FROM res.guest_total_minor),
 'opening',jsonb_build_object('accommodation_minor',opening.accommodation_minor,'taxes_minor',opening.taxes_minor,'fees_minor',opening.fees_minor,'total_minor',opening.total_minor,'opened_at',opening.opened_at),
 'totals',jsonb_build_object('additional_minor',additional,'reversed_minor',reversed,'charges_minor',opening.total_minor+additional-reversed,'external_payments_minor',payments,'external_refunds_minor',refunds,'corrected_payments_minor',corrections,'paid_minor',payments-refunds-corrections,'balance_minor',opening.total_minor+additional-reversed-payments+refunds+corrections),
 'entries',entries);
END $$;

CREATE FUNCTION public.irp_pms_pilot_post_folio(p_tenant uuid,p_property uuid,p_reservation uuid,p_request uuid,p_kind text,p_amount_minor bigint,p_reference text,p_reason text,p_target uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE res irp_pms.reservations; opening irp_pms.folio_openings; prior irp_pms.folio_entries; target irp_pms.folio_entries; entry irp_pms.folio_entries;
 reference_value text:=trim(p_reference);reason_value text:=trim(p_reason);additional bigint;reversed bigint;payments bigint;refunds bigint;corrections bigint;against_target bigint;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property,true);
 IF p_request IS NULL OR p_reservation IS NULL OR p_kind IS NULL OR p_kind NOT IN('charge','charge_reversal','external_payment','external_refund','payment_correction') OR p_amount_minor IS NULL OR p_amount_minor NOT BETWEEN 1 AND 999999999999 OR reference_value IS NULL OR length(reference_value) NOT BETWEEN 4 AND 200 OR reason_value IS NULL OR length(reason_value) NOT BETWEEN 4 AND 500 THEN RAISE EXCEPTION 'Valid entry kind, positive USD minor units, request, reference and reason are required'; END IF;
 IF (p_kind IN('charge','external_payment') AND p_target IS NOT NULL) OR (p_kind IN('external_refund','payment_correction') AND p_target IS NULL) THEN RAISE EXCEPTION 'Invalid entry target'; END IF;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR UPDATE;
 SELECT * INTO prior FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND request_id=p_request;
 IF FOUND THEN
  IF prior.reservation_id IS DISTINCT FROM p_reservation OR prior.actor_id IS DISTINCT FROM auth.uid() OR prior.kind IS DISTINCT FROM p_kind OR prior.amount_minor IS DISTINCT FROM p_amount_minor OR prior.reference IS DISTINCT FROM reference_value OR prior.reason IS DISTINCT FROM reason_value OR prior.target_entry_id IS DISTINCT FROM p_target THEN RAISE EXCEPTION 'Folio request identity already used'; END IF;
  RETURN jsonb_build_object('entry_id',prior.id,'request_id',prior.request_id,'kind',prior.kind,'amount_minor',prior.amount_minor,'reference',prior.reference,'reason',prior.reason,'target_entry_id',prior.target_entry_id,'created_at',prior.created_at,'payment_recording','external_only','replayed',true);
 END IF;
 IF p_kind IN('external_payment','external_refund') AND EXISTS(SELECT 1 FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND kind=p_kind AND reference=reference_value) THEN RAISE EXCEPTION 'This external transaction reference is already recorded for this reservation and entry kind'; END IF;
 SELECT * INTO res FROM irp_pms.reservations WHERE tenant_id=p_tenant AND property_id=p_property AND id=p_reservation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped reservation'; END IF;
 SELECT * INTO opening FROM irp_pms.folio_openings WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 IF NOT FOUND THEN
  IF res.guest_total_minor IS NULL OR res.accommodation_minor IS NULL OR res.taxes_minor IS NULL OR res.ota_fees_minor IS NULL THEN RAISE EXCEPTION 'Reservation charge data is unavailable'; END IF;
  INSERT INTO irp_pms.folio_openings(tenant_id,property_id,reservation_id,accommodation_minor,taxes_minor,fees_minor,total_minor,reservation_source,source_version,opened_by)
  VALUES(p_tenant,p_property,p_reservation,res.accommodation_minor,res.taxes_minor,res.ota_fees_minor,res.guest_total_minor,res.source,res.source_version,auth.uid()) RETURNING * INTO opening;
 END IF;
 SELECT coalesce(sum(amount_minor) FILTER(WHERE kind='charge'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='charge_reversal'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='external_payment'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='external_refund'),0),coalesce(sum(amount_minor) FILTER(WHERE kind='payment_correction'),0)
 INTO additional,reversed,payments,refunds,corrections FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation;
 IF p_target IS NOT NULL THEN
  SELECT * INTO target FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND id=p_target;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown scoped folio target'; END IF;
 END IF;
 IF p_kind='charge' THEN
  IF additional+p_amount_minor>999999999999 OR opening.total_minor+additional-reversed+p_amount_minor>999999999999 THEN RAISE EXCEPTION 'Charge total exceeds supported range'; END IF;
 ELSIF p_kind='charge_reversal' THEN
  IF p_target IS NOT NULL AND target.kind<>'charge' THEN RAISE EXCEPTION 'A reversal must target an added charge or the opening charges'; END IF;
  SELECT coalesce(sum(amount_minor),0) INTO against_target FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND kind='charge_reversal' AND target_entry_id IS NOT DISTINCT FROM p_target;
  IF against_target+p_amount_minor>(CASE WHEN p_target IS NULL THEN opening.total_minor ELSE target.amount_minor END) OR reversed+p_amount_minor>999999999999 THEN RAISE EXCEPTION 'Reversal exceeds unreversed target charges'; END IF;
 ELSIF p_kind='external_payment' THEN
  IF payments+p_amount_minor>999999999999 THEN RAISE EXCEPTION 'Recorded payments exceed supported range'; END IF;
 ELSE
  IF target.kind<>'external_payment' THEN RAISE EXCEPTION 'A refund or correction must target an externally recorded payment'; END IF;
  SELECT coalesce(sum(amount_minor),0) INTO against_target FROM irp_pms.folio_entries WHERE tenant_id=p_tenant AND property_id=p_property AND reservation_id=p_reservation AND kind IN('external_refund','payment_correction') AND target_entry_id=p_target;
  IF against_target+p_amount_minor>target.amount_minor OR p_amount_minor>payments-refunds-corrections OR (p_kind='external_refund' AND refunds+p_amount_minor>999999999999) OR (p_kind='payment_correction' AND corrections+p_amount_minor>999999999999) THEN RAISE EXCEPTION 'Refund or payment correction exceeds unrefunded or uncorrected externally recorded payments'; END IF;
 END IF;
 INSERT INTO irp_pms.folio_entries(tenant_id,property_id,reservation_id,request_id,kind,amount_minor,reference,reason,target_entry_id,actor_id)
 VALUES(p_tenant,p_property,p_reservation,p_request,p_kind,p_amount_minor,reference_value,reason_value,p_target,auth.uid()) RETURNING * INTO entry;
 INSERT INTO irp_pms.activity(tenant_id,property_id,actor_id,action,target_id,details) VALUES(p_tenant,p_property,auth.uid(),'folio_entry_recorded',p_reservation,jsonb_build_object('entry_id',entry.id,'kind',p_kind,'amount_minor',p_amount_minor,'payment_recording','external_only'));
 RETURN jsonb_build_object('entry_id',entry.id,'request_id',entry.request_id,'kind',entry.kind,'amount_minor',entry.amount_minor,'reference',entry.reference,'reason',entry.reason,'target_entry_id',entry.target_entry_id,'created_at',entry.created_at,'payment_recording','external_only','replayed',false);
END $$;

REVOKE ALL ON FUNCTION public.irp_pms_pilot_folio(uuid,uuid,uuid),public.irp_pms_pilot_post_folio(uuid,uuid,uuid,uuid,text,bigint,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_folio(uuid,uuid,uuid),public.irp_pms_pilot_post_folio(uuid,uuid,uuid,uuid,text,bigint,text,text,uuid) TO authenticated;
COMMIT;

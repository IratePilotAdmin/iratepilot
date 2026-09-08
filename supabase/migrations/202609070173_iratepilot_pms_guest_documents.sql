BEGIN;
-- Pure scoped document projection. No storage, issuance, folio/deposit opening,
-- monetary movement, source mutation or new access to underlying tables.
CREATE FUNCTION irp_pms.guest_document_number(p_value jsonb,p_min bigint DEFAULT 0,p_max bigint DEFAULT 999999999999,p_nullable boolean DEFAULT false) RETURNS bigint
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE n numeric;
BEGIN
 IF p_nullable AND (p_value IS NULL OR p_value='null'::jsonb) THEN RETURN NULL;END IF;
 IF p_value IS NULL OR jsonb_typeof(p_value) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Guest document requires exact integer evidence';END IF;
 n:=(p_value#>>'{}')::numeric;
 IF n IS DISTINCT FROM trunc(n) OR n<p_min OR n>p_max THEN RAISE EXCEPTION 'Guest document integer evidence is outside its supported range';END IF;
 RETURN n::bigint;
END $$;
CREATE FUNCTION irp_pms.guest_document_label(p_value text,p_max integer,p_nullable boolean DEFAULT false,p_normalize boolean DEFAULT false) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
BEGIN
 IF p_value IS NULL AND p_nullable THEN RETURN NULL;END IF;
 IF p_value IS NULL OR length(p_value) NOT BETWEEN 1 AND p_max THEN RAISE EXCEPTION 'Guest document label is missing or outside its supported range';END IF;
 IF p_value~'[[:cntrl:]]' THEN
  IF p_normalize THEN RETURN regexp_replace(p_value,'[[:cntrl:]]',' ','g');END IF;
  RAISE EXCEPTION 'Guest document label contains prohibited controls';
 END IF;
 RETURN p_value;
END $$;
CREATE FUNCTION irp_pms.guest_document_itemization(p_value jsonb,p_expected jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $$
DECLARE mode text;arrival date;departure date;basis_arrival date;basis_departure date;item jsonb;tax jsonb;fee jsonb;code text;label text;seen text[];taxes jsonb:='[]';fees jsonb:='[]';amount bigint;unit bigint;quantity bigint;tax_sum numeric:=0;fee_sum numeric:=0;tax_base numeric;amounts jsonb:='{}';key text;retained boolean;output jsonb;
BEGIN
 IF p_value IS NULL OR p_value='null'::jsonb THEN RETURN NULL;END IF;
 IF jsonb_typeof(p_value) IS DISTINCT FROM 'object' OR octet_length(p_value::text)>32768 OR
  EXISTS(SELECT 1 FROM jsonb_object_keys(p_value) k WHERE k NOT IN('version','mode','currency','arrival','departure','accommodation_minor','taxes_minor','hotel_fees_minor','ota_fees_minor','total_minor','taxes','fees','fees_retained','requires_reconciliation','fee_basis_arrival','fee_basis_departure','property_fees_version','operating_model_version')) OR
  irp_pms.guest_document_number(p_value->'version',1,1) IS DISTINCT FROM 1 OR p_value->>'currency' IS DISTINCT FROM 'USD'
 THEN RAISE EXCEPTION 'Guest document pricing shape is not supported';END IF;
 -- Known166 quote-version metadata is validated but is not a guest line.
 IF p_value ? 'property_fees_version' THEN PERFORM irp_pms.guest_document_number(p_value->'property_fees_version',1,9007199254740991);END IF;
 IF p_value ? 'operating_model_version' THEN PERFORM irp_pms.guest_document_number(p_value->'operating_model_version',1,9007199254740991);END IF;
 mode:=p_value->>'mode';
 IF mode IS NULL OR mode NOT IN('legacy','configured','adjusted') OR jsonb_typeof(p_value->'arrival') IS DISTINCT FROM 'string' OR jsonb_typeof(p_value->'departure') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Guest document pricing context is incomplete';END IF;
 arrival:=(p_value->>'arrival')::date;departure:=(p_value->>'departure')::date;
 IF NOT isfinite(arrival) OR NOT isfinite(departure) OR departure-arrival NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Guest document pricing dates are invalid';END IF;
 FOREACH key IN ARRAY ARRAY['accommodation_minor','taxes_minor','hotel_fees_minor','ota_fees_minor','total_minor'] LOOP
  amount:=irp_pms.guest_document_number(p_value->key);
  IF p_expected->key IS NOT NULL AND p_expected->key<>'null'::jsonb AND irp_pms.guest_document_number(p_expected->key) IS DISTINCT FROM amount THEN RAISE EXCEPTION 'Guest document pricing components disagree';END IF;
  amounts:=amounts||jsonb_build_object(key,amount);
 END LOOP;
 IF (amounts->>'accommodation_minor')::numeric+(amounts->>'taxes_minor')::numeric+(amounts->>'hotel_fees_minor')::numeric+(amounts->>'ota_fees_minor')::numeric IS DISTINCT FROM (amounts->>'total_minor')::numeric THEN RAISE EXCEPTION 'Guest document pricing total does not reconcile';END IF;
 IF mode='adjusted' THEN
  IF p_value->'fees_retained' IS DISTINCT FROM 'true'::jsonb OR p_value->'requires_reconciliation' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(p_value->'fee_basis_arrival') IS DISTINCT FROM 'string' OR jsonb_typeof(p_value->'fee_basis_departure') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Adjusted guest document pricing needs original fee context';END IF;
  basis_arrival:=(p_value->>'fee_basis_arrival')::date;basis_departure:=(p_value->>'fee_basis_departure')::date;
  IF NOT isfinite(basis_arrival) OR NOT isfinite(basis_departure) OR basis_departure-basis_arrival NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Original guest document fee dates are invalid';END IF;
 ELSE
  IF (p_value ? 'fees_retained' AND p_value->'fees_retained' IS DISTINCT FROM 'false'::jsonb) OR (p_value ? 'requires_reconciliation' AND p_value->'requires_reconciliation' IS DISTINCT FROM 'false'::jsonb) OR (p_value ? 'fee_basis_arrival' AND p_value->'fee_basis_arrival' IS DISTINCT FROM 'null'::jsonb) OR (p_value ? 'fee_basis_departure' AND p_value->'fee_basis_departure' IS DISTINCT FROM 'null'::jsonb) THEN RAISE EXCEPTION 'Unexpected retained pricing context';END IF;
 END IF;
 IF jsonb_typeof(p_value->'taxes') IS DISTINCT FROM 'array' OR jsonb_typeof(p_value->'fees') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Guest document pricing lines are incomplete';END IF;
 IF jsonb_array_length(p_value->'taxes')>4 OR jsonb_array_length(p_value->'fees')>3 OR (mode='adjusted' AND jsonb_array_length(p_value->'taxes')<>1) THEN RAISE EXCEPTION 'Guest document pricing line limit exceeded';END IF;
 seen:=ARRAY[]::text[];
 FOR fee IN SELECT x FROM jsonb_array_elements(p_value->'fees') x LOOP
  IF jsonb_typeof(fee) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(fee) k WHERE k NOT IN('code','label','basis','unit_amount_minor','quantity','amount_minor','taxes','retained')) THEN RAISE EXCEPTION 'Guest document fee shape is invalid';END IF;
  code:=fee->>'code';label:=CASE code WHEN 'resort' THEN 'Resort fee' WHEN 'technology' THEN 'Technology fee' WHEN 'cleaning' THEN 'Cleaning fee' END;
  IF label IS NULL OR fee->>'label' IS DISTINCT FROM label OR code=ANY(seen) OR fee->>'basis' IS NULL OR fee->>'basis' NOT IN('per_night','per_stay') OR (code='cleaning' AND fee->>'basis'<>'per_stay') THEN RAISE EXCEPTION 'Guest document fee identity is invalid';END IF;
  seen:=array_append(seen,code);unit:=irp_pms.guest_document_number(fee->'unit_amount_minor');quantity:=irp_pms.guest_document_number(fee->'quantity',1,30);amount:=irp_pms.guest_document_number(fee->'amount_minor');
  IF unit::numeric*quantity IS DISTINCT FROM amount::numeric OR quantity IS DISTINCT FROM (CASE WHEN fee->>'basis'='per_stay' THEN 1 WHEN mode='adjusted' THEN basis_departure-basis_arrival ELSE departure-arrival END)::bigint THEN RAISE EXCEPTION 'Guest document fee quantity does not reconcile';END IF;
  IF jsonb_typeof(fee->'taxes') IS DISTINCT FROM 'array' OR jsonb_array_length(fee->'taxes')>4 OR EXISTS(SELECT 1 FROM jsonb_array_elements(fee->'taxes') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR x#>>'{}' NOT IN('legacy','city','state','lodging')) OR (SELECT count(DISTINCT x) FROM jsonb_array_elements(fee->'taxes') x) IS DISTINCT FROM jsonb_array_length(fee->'taxes')::bigint OR (code='cleaning' AND fee->'taxes' ? 'legacy') THEN RAISE EXCEPTION 'Guest document fee tax references are invalid';END IF;
  retained:=mode='adjusted';
  IF (retained AND fee->'retained' IS DISTINCT FROM 'true'::jsonb) OR (NOT retained AND fee ? 'retained' AND fee->'retained' IS DISTINCT FROM 'false'::jsonb) THEN RAISE EXCEPTION 'Guest document retained fee state is invalid';END IF;
  fees:=fees||jsonb_build_array(jsonb_build_object('code',code,'label',label,'basis',fee->>'basis','unit_amount_minor',unit,'quantity',quantity,'amount_minor',amount,'taxes',fee->'taxes','retained',retained));fee_sum:=fee_sum+amount;
 END LOOP;
 seen:=ARRAY[]::text[];
 FOR tax IN SELECT x FROM jsonb_array_elements(p_value->'taxes') x LOOP
  IF jsonb_typeof(tax) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(tax))<>5 OR NOT(tax ?& ARRAY['code','label','basis_points','taxable_base_minor','amount_minor']) THEN RAISE EXCEPTION 'Guest document tax shape is invalid';END IF;
  code:=tax->>'code';label:=CASE code WHEN 'legacy' THEN 'Existing combined tax' WHEN 'city' THEN 'City tax' WHEN 'state' THEN 'State tax' WHEN 'lodging' THEN 'Lodging tax' WHEN 'adjusted_total' THEN 'Adjusted tax total' END;
  IF label IS NULL OR tax->>'label' IS DISTINCT FROM label OR code=ANY(seen) OR (mode='adjusted') IS DISTINCT FROM (code='adjusted_total') THEN RAISE EXCEPTION 'Guest document tax identity is invalid';END IF;
  seen:=array_append(seen,code);amount:=irp_pms.guest_document_number(tax->'amount_minor');
  IF mode='adjusted' THEN
   IF tax->'basis_points' IS DISTINCT FROM 'null'::jsonb OR tax->'taxable_base_minor' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'Adjusted tax must not invent a rate or base';END IF;
  ELSE
   PERFORM irp_pms.guest_document_number(tax->'basis_points',0,10000);
   tax_base:=irp_pms.guest_document_number(tax->'taxable_base_minor');
   IF tax_base IS DISTINCT FROM (amounts->>'accommodation_minor')::numeric+coalesce((SELECT sum((f->>'amount_minor')::numeric) FROM jsonb_array_elements(fees) f WHERE f->'taxes' ? code),0) THEN RAISE EXCEPTION 'Guest document tax base disagrees with its recorded fee selections';END IF;
  END IF;
  taxes:=taxes||jsonb_build_array(jsonb_build_object('code',code,'label',label,'basis_points',tax->'basis_points','taxable_base_minor',tax->'taxable_base_minor','amount_minor',amount));tax_sum:=tax_sum+amount;
 END LOOP;
 IF tax_sum IS DISTINCT FROM (amounts->>'taxes_minor')::numeric OR fee_sum IS DISTINCT FROM (amounts->>'hotel_fees_minor')::numeric THEN RAISE EXCEPTION 'Guest document tax and fee lines do not reconcile';END IF;
 output:=jsonb_build_object('schema_version',1,'mode',mode,'currency','USD','arrival',arrival,'departure',departure,'taxes',taxes,'fees',fees,'fees_retained',mode='adjusted','requires_reconciliation',mode='adjusted','fee_basis_arrival',basis_arrival,'fee_basis_departure',basis_departure)||amounts;
 RETURN output;
END $$;

CREATE FUNCTION irp_pms.guest_document_projection(p_capture jsonb,p_actor uuid,p_role text,p_generated timestamptz) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path=pg_catalog AS $$
DECLARE prop jsonb:=p_capture->'property';res jsonb:=p_capture->'reservation';party jsonb:=p_capture->'party';source_opening jsonb:=p_capture->'opening';book jsonb:=p_capture->'deposit_book';raw_entries jsonb:=p_capture->'entries';deposit_events jsonb:=p_capture->'deposit_events';
 component text;components jsonb:='{}';opening_components jsonb:='{}';current_item jsonb;opening_item jsonb;opening jsonb;contact jsonb;billing jsonb;stay_guest jsonb;account jsonb;deposit jsonb;reservation jsonb;output jsonb;entries jsonb:='[]';entry jsonb;target jsonb;event jsonb;amount bigint;value bigint;kind text;label text;source_key text;safe_name text;safe_reference text;recorded boolean;known boolean:=true;frozen boolean;available boolean;changed boolean:=false;opening_warning boolean:=false;current_warning boolean:=false;
 additional numeric:=0;reversed numeric:=0;payments numeric:=0;refunds numeric:=0;corrections numeric:=0;charges numeric;paid numeric;balance numeric;charge_effect bigint;payment_effect bigint;target_sum numeric;totals jsonb;deposit_received numeric:=0;deposit_refunded numeric:=0;deposit_reduced numeric:=0;deposit_held numeric;entry_count integer;deposit_count integer;room_type jsonb;room jsonb;arrival date;departure date;source_version bigint;party_version bigint;profile_version bigint;copied_version bigint;book_version bigint;
BEGIN
 IF p_capture IS NULL OR prop IS NULL OR res IS NULL OR prop='null'::jsonb OR res='null'::jsonb OR p_actor IS NULL OR p_role NOT IN('owner','manager','staff') OR p_role IS NULL OR NOT isfinite(p_generated) THEN RAISE EXCEPTION 'Guest document snapshot context is incomplete';END IF;
 IF prop->>'currency' IS DISTINCT FROM 'USD' OR prop->>'operating_model' IS NULL OR prop->>'operating_model' NOT IN('hotel','whole_home') OR res->>'status' IS NULL OR res->>'status' NOT IN('Confirmed','Cancelled','In house','Checked out') THEN RAISE EXCEPTION 'Guest document source context is not supported';END IF;
 PERFORM irp_pms.guest_document_label(prop->>'name',200);PERFORM irp_pms.guest_document_label(prop->>'time_zone',200);
 source_version:=irp_pms.guest_document_number(res->'source_version',1,9007199254740991);
 safe_name:=irp_pms.guest_document_label(res->>'guest_name',200,true,true);safe_reference:=irp_pms.guest_document_label(res->>'source_booking_id',128,false,true);
 PERFORM irp_pms.guest_document_label(res->>'source',100);
 arrival:=(res->>'arrival')::date;departure:=(res->>'departure')::date;
 IF (arrival IS NOT NULL AND NOT isfinite(arrival)) OR (departure IS NOT NULL AND NOT isfinite(departure)) OR (arrival IS NOT NULL AND departure IS NOT NULL AND departure-arrival NOT BETWEEN 1 AND 30) THEN RAISE EXCEPTION 'Guest document stay dates are invalid';END IF;
 PERFORM irp_pms.guest_document_number(res->'guests',1,2147483647,true);
 IF (res->>'checked_in_at' IS NOT NULL AND NOT isfinite((res->>'checked_in_at')::timestamptz)) OR (res->>'checked_out_at' IS NOT NULL AND NOT isfinite((res->>'checked_out_at')::timestamptz)) THEN RAISE EXCEPTION 'Guest document actual stay times are invalid';END IF;
 FOREACH component IN ARRAY ARRAY['accommodation_minor','taxes_minor','hotel_fees_minor','ota_fees_minor','total_minor'] LOOP
  source_key:=CASE WHEN component='total_minor' THEN 'guest_total_minor' ELSE component END;
  value:=irp_pms.guest_document_number(res->source_key,0,999999999999,true);known:=known AND value IS NOT NULL;components:=components||jsonb_build_object(component,value);
 END LOOP;
 IF known AND (components->>'accommodation_minor')::numeric+(components->>'taxes_minor')::numeric+(components->>'hotel_fees_minor')::numeric+(components->>'ota_fees_minor')::numeric IS DISTINCT FROM (components->>'total_minor')::numeric THEN RAISE EXCEPTION 'Current guest document charges do not reconcile';END IF;
 current_item:=irp_pms.guest_document_itemization(res->'charge_breakdown',components);
 IF current_item IS NOT NULL AND ((arrival IS NOT NULL AND current_item->>'arrival' IS DISTINCT FROM arrival::text) OR (departure IS NOT NULL AND current_item->>'departure' IS DISTINCT FROM departure::text)) THEN RAISE EXCEPTION 'Current guest document pricing dates disagree';END IF;
 current_warning:=coalesce((current_item->>'requires_reconciliation')::boolean,false);
 IF p_capture->'room_type' IS NOT NULL AND p_capture->'room_type'<>'null'::jsonb THEN
  room_type:=jsonb_build_object('id',p_capture->'room_type'->>'id','name',irp_pms.guest_document_label(p_capture->'room_type'->>'name',200));
 END IF;
 IF p_capture->'room' IS NOT NULL AND p_capture->'room'<>'null'::jsonb THEN
  room:=jsonb_build_object('id',p_capture->'room'->>'id','label',irp_pms.guest_document_label(p_capture->'room'->>'label',40),'current_occupancy',res->>'status'='In house');
 END IF;
 IF (res->>'room_type_id' IS NOT NULL AND room_type IS NULL) OR (res->>'physical_room_id' IS NOT NULL AND room IS NULL) THEN RAISE EXCEPTION 'Guest document room scope is incomplete';END IF;
 reservation:=jsonb_build_object('id',res->>'id','source',res->>'source','source_booking_id',safe_reference,'source_version',source_version,'status',res->>'status','cancellation_kind',CASE WHEN res->>'cancellation_disposition'='no_show' THEN 'no_show' END,'booked_name',safe_name,'arrival',arrival,'departure',departure,'nights',departure-arrival,'guests',res->'guests','room_type',room_type,'recorded_room',room,'checked_in_at',res->'checked_in_at','checked_out_at',res->'checked_out_at','current_charges',components||jsonb_build_object('known',known,'itemization',current_item),'text_normalized',safe_name IS DISTINCT FROM res->>'guest_name' OR safe_reference IS DISTINCT FROM res->>'source_booking_id');
 recorded:=party IS NOT NULL AND party<>'null'::jsonb;
 IF recorded THEN
  party_version:=irp_pms.guest_document_number(party->'version',1,9007199254740991);
  contact:=irp_pms.normalize_guest_data(party->'contact','contact');billing:=irp_pms.normalize_guest_data(party->'billing_party','billing');
  IF contact IS DISTINCT FROM party->'contact' OR billing IS DISTINCT FROM party->'billing_party' OR party->>'updated_at' IS NULL OR NOT isfinite((party->>'updated_at')::timestamptz) THEN RAISE EXCEPTION 'Saved guest document parties are not canonical';END IF;
  copied_version:=irp_pms.guest_document_number(party->'guest_profile_version',1,9007199254740991,true);profile_version:=irp_pms.guest_document_number(p_capture->'linked_profile_version',1,9007199254740991,true);
  IF (party->>'guest_id' IS NULL AND (copied_version IS NOT NULL OR profile_version IS NOT NULL)) OR (party->>'guest_id' IS NOT NULL AND (copied_version IS NULL OR profile_version IS NULL)) THEN RAISE EXCEPTION 'Guest document linked profile context is incomplete';END IF;
 ELSE party_version:=0;
 END IF;
 stay_guest:=jsonb_build_object('recorded',recorded,'version',party_version,'contact',contact,'billing_party',billing,'guest_id',CASE WHEN recorded THEN party->>'guest_id' END,'copied_profile_version',copied_version,'linked_profile_current_version',profile_version,'linked_profile_changed',recorded AND party->>'guest_id' IS NOT NULL AND copied_version IS DISTINCT FROM profile_version,'updated_at',CASE WHEN recorded THEN party->'updated_at' END);
 IF jsonb_typeof(raw_entries) IS DISTINCT FROM 'array' OR jsonb_typeof(deposit_events) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Guest document event capture is incomplete';END IF;
 entry_count:=jsonb_array_length(raw_entries);deposit_count:=jsonb_array_length(deposit_events);
 IF entry_count>1000 OR deposit_count>1000 THEN RAISE EXCEPTION 'Guest document exceeds its complete 1000-entry history limit';END IF;
 frozen:=source_opening IS NOT NULL AND source_opening<>'null'::jsonb;available:=frozen OR known;
 IF NOT frozen AND entry_count<>0 THEN RAISE EXCEPTION 'Guest document entries have no frozen opening';END IF;
 IF available THEN
  IF frozen THEN
   FOREACH component IN ARRAY ARRAY['accommodation_minor','taxes_minor','hotel_fees_minor','ota_fees_minor','total_minor'] LOOP
    source_key:=CASE WHEN component='ota_fees_minor' THEN 'fees_minor' ELSE component END;
    value:=irp_pms.guest_document_number(source_opening->source_key);opening_components:=opening_components||jsonb_build_object(component,value);
    changed:=changed OR value IS DISTINCT FROM (components->>component)::bigint;
   END LOOP;
   IF source_opening->>'currency' IS DISTINCT FROM 'USD' OR source_opening->>'opened_at' IS NULL OR NOT isfinite((source_opening->>'opened_at')::timestamptz) THEN RAISE EXCEPTION 'Guest document opening context is incomplete';END IF;
   PERFORM irp_pms.guest_document_number(source_opening->'source_version',1,9007199254740991);PERFORM irp_pms.guest_document_label(source_opening->>'reservation_source',100);
   opening_item:=irp_pms.guest_document_itemization(source_opening->'charge_breakdown',opening_components);changed:=changed OR source_opening->'charge_breakdown' IS DISTINCT FROM res->'charge_breakdown';
  ELSE opening_components:=components;opening_item:=current_item;
  END IF;
  IF (opening_components->>'accommodation_minor')::numeric+(opening_components->>'taxes_minor')::numeric+(opening_components->>'hotel_fees_minor')::numeric+(opening_components->>'ota_fees_minor')::numeric IS DISTINCT FROM (opening_components->>'total_minor')::numeric THEN RAISE EXCEPTION 'Guest document opening does not reconcile';END IF;
  opening:=opening_components||jsonb_build_object('itemization',opening_item,'source',CASE WHEN frozen THEN source_opening->>'reservation_source' ELSE res->>'source' END,'source_version',CASE WHEN frozen THEN (source_opening->>'source_version')::bigint ELSE source_version END,'opened_at',CASE WHEN frozen THEN source_opening->'opened_at' END);
  opening_warning:=coalesce((opening_item->>'requires_reconciliation')::boolean,false);
 END IF;
 IF (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(raw_entries) x) IS DISTINCT FROM entry_count::bigint THEN RAISE EXCEPTION 'Guest document contains duplicate or missing entry identities';END IF;
 FOR entry IN SELECT x FROM jsonb_array_elements(raw_entries) x LOOP
  PERFORM (entry->>'id')::uuid;amount:=irp_pms.guest_document_number(entry->'amount_minor',1);kind:=entry->>'kind';
  IF entry->>'currency' IS DISTINCT FROM 'USD' OR entry->>'created_at' IS NULL OR NOT isfinite((entry->>'created_at')::timestamptz) THEN RAISE EXCEPTION 'Guest document entry context is invalid';END IF;
  label:=CASE kind WHEN 'charge' THEN 'Additional charge' WHEN 'charge_reversal' THEN 'Charge reversal' WHEN 'external_payment' THEN 'External payment recorded' WHEN 'external_refund' THEN 'External refund recorded' WHEN 'payment_correction' THEN 'Payment record correction' END;
  IF label IS NULL OR (kind IN('charge','external_payment') AND entry->>'target_entry_id' IS NOT NULL) OR (kind IN('external_refund','payment_correction') AND entry->>'target_entry_id' IS NULL) THEN RAISE EXCEPTION 'Guest document entry kind or target is invalid';END IF;
  IF entry->>'target_entry_id' IS NOT NULL THEN
   SELECT x INTO target FROM jsonb_array_elements(raw_entries) x WHERE x->>'id'=entry->>'target_entry_id';
   IF target IS NULL OR target->>'kind' IS DISTINCT FROM (CASE WHEN kind='charge_reversal' THEN 'charge' ELSE 'external_payment' END) THEN RAISE EXCEPTION 'Guest document target is not a same-account source entry';END IF;
  END IF;
  charge_effect:=CASE kind WHEN 'charge' THEN amount WHEN 'charge_reversal' THEN -amount ELSE 0 END;payment_effect:=CASE kind WHEN 'external_payment' THEN amount WHEN 'external_refund' THEN -amount WHEN 'payment_correction' THEN -amount ELSE 0 END;
  additional:=additional+CASE WHEN kind='charge' THEN amount ELSE 0 END;reversed:=reversed+CASE WHEN kind='charge_reversal' THEN amount ELSE 0 END;payments:=payments+CASE WHEN kind='external_payment' THEN amount ELSE 0 END;refunds:=refunds+CASE WHEN kind='external_refund' THEN amount ELSE 0 END;corrections:=corrections+CASE WHEN kind='payment_correction' THEN amount ELSE 0 END;
  entries:=entries||jsonb_build_array(jsonb_build_object('id',entry->>'id','kind',kind,'label',label,'amount_minor',amount,'currency','USD','target_entry_id',entry->>'target_entry_id','recorded_at',entry->'created_at','charge_effect_minor',charge_effect,'payment_effect_minor',payment_effect,'balance_effect_minor',charge_effect-payment_effect));
 END LOOP;
 IF available THEN
  SELECT coalesce(sum((x->>'amount_minor')::numeric),0) INTO target_sum FROM jsonb_array_elements(raw_entries) x WHERE x->>'kind'='charge_reversal' AND x->>'target_entry_id' IS NULL;
  IF target_sum>(opening->>'total_minor')::numeric THEN RAISE EXCEPTION 'Guest document opening reversals exceed original charges';END IF;
  FOR target IN SELECT x FROM jsonb_array_elements(raw_entries) x WHERE x->>'kind' IN('charge','external_payment') LOOP
   SELECT coalesce(sum((x->>'amount_minor')::numeric),0) INTO target_sum FROM jsonb_array_elements(raw_entries) x WHERE x->>'target_entry_id'=target->>'id';
   IF target_sum>(target->>'amount_minor')::numeric THEN RAISE EXCEPTION 'Guest document linked adjustments exceed their source';END IF;
  END LOOP;
  charges:=(opening->>'total_minor')::numeric+additional-reversed;paid:=payments-refunds-corrections;balance:=charges-paid;
  IF least(charges,paid)<0 OR greatest(additional,reversed,payments,refunds,corrections,charges)>999999999999 OR abs(balance)>9007199254740991 THEN RAISE EXCEPTION 'Guest document ledger totals are outside their supported range';END IF;
  totals:=jsonb_build_object('additional_minor',additional::bigint,'reversed_minor',reversed::bigint,'charges_minor',charges::bigint,'external_payments_minor',payments::bigint,'external_refunds_minor',refunds::bigint,'corrected_payments_minor',corrections::bigint,'paid_minor',paid::bigint,'balance_minor',balance::bigint);
 END IF;
 account:=jsonb_build_object('available',available,'unavailable_reason',CASE WHEN NOT available THEN 'reservation_charges_unavailable' END,'opening_mode',CASE WHEN frozen THEN 'frozen' WHEN known THEN 'reservation_preview' END,'opening',opening,'totals',totals,'entries',entries,'reservation_amounts_changed',changed,'opening_pricing_reconciliation_required',opening_warning,'current_pricing_reconciliation_required',current_warning,'pricing_reconciliation_required',changed OR opening_warning OR current_warning,'itemization_available',opening_item IS NOT NULL,'adjustments_itemized',false,'payment_recording','external_only');
 IF book IS NOT NULL AND book<>'null'::jsonb THEN
  book_version:=irp_pms.guest_document_number(book->'version',1,1000);
  IF book->>'currency' IS DISTINCT FROM 'USD' OR book_version IS DISTINCT FROM deposit_count::bigint OR book->>'creation_operating_model' IS NULL OR book->>'creation_operating_model' NOT IN('hotel','whole_home') OR book->>'updated_at' IS NULL OR NOT isfinite((book->>'updated_at')::timestamptz) THEN RAISE EXCEPTION 'Guest document deposit context is incomplete';END IF;
  PERFORM irp_pms.guest_document_label(book->>'recording_time_zone',200);
  FOR event IN SELECT x FROM jsonb_array_elements(deposit_events) x LOOP
   amount:=irp_pms.guest_document_number(event->'amount_minor',1);kind:=event->>'kind';
   IF kind IS NULL OR kind NOT IN('external_receipt','external_refund','receipt_reduction') OR event->>'currency' IS DISTINCT FROM 'USD' THEN RAISE EXCEPTION 'Guest document deposit event is invalid';END IF;
   deposit_received:=deposit_received+CASE WHEN kind='external_receipt' THEN amount ELSE 0 END;deposit_refunded:=deposit_refunded+CASE WHEN kind='external_refund' THEN amount ELSE 0 END;deposit_reduced:=deposit_reduced+CASE WHEN kind='receipt_reduction' THEN amount ELSE 0 END;
  END LOOP;
  deposit_held:=deposit_received-deposit_refunded-deposit_reduced;
  IF deposit_held<0 OR greatest(deposit_received,deposit_refunded,deposit_reduced)>999999999999 OR irp_pms.guest_document_number(book->'received_minor') IS DISTINCT FROM deposit_received OR irp_pms.guest_document_number(book->'refunded_minor') IS DISTINCT FROM deposit_refunded OR irp_pms.guest_document_number(book->'reduced_minor') IS DISTINCT FROM deposit_reduced OR irp_pms.guest_document_number(book->'held_minor') IS DISTINCT FROM deposit_held THEN RAISE EXCEPTION 'Guest document deposit totals do not reconcile';END IF;
  deposit:=jsonb_build_object('recorded',true,'book_id',book->>'id','version',book_version,'recording_time_zone',book->>'recording_time_zone','creation_operating_model',book->>'creation_operating_model','updated_at',book->'updated_at','event_count',deposit_count,'totals',jsonb_build_object('received_minor',deposit_received::bigint,'refunded_minor',deposit_refunded::bigint,'reduced_minor',deposit_reduced::bigint,'held_minor',deposit_held::bigint),'financial_review_required',deposit_held>0 AND res->>'status' IN('Checked out','Cancelled'));
 ELSE
  IF deposit_count<>0 THEN RAISE EXCEPTION 'Guest document deposit events lack a book';END IF;
  deposit:=jsonb_build_object('recorded',false,'book_id',NULL,'version',0,'recording_time_zone',NULL,'creation_operating_model',NULL,'updated_at',NULL,'event_count',0,'totals',NULL,'financial_review_required',false);
 END IF;
 deposit:=deposit||jsonb_build_object('currency','USD','recording_mode','external_only','purpose','refundable_security','applied_to_account',false);
 output:=jsonb_build_object('schema_version',1,'tenant_id',prop->>'tenant_id','property_id',prop->>'id','reservation_id',res->>'id','actor_id',p_actor,'role',p_role,'generated_at',p_generated,'property_business_date',(p_generated AT TIME ZONE (prop->>'time_zone'))::date,'property',jsonb_build_object('id',prop->>'id','name',prop->>'name','currency','USD','time_zone',prop->>'time_zone','operating_model',prop->>'operating_model'),'reservation',reservation,'stay_guest',stay_guest,'account',account,'security_deposit',deposit,'completeness',jsonb_build_object('complete',true,'rows_truncated',false,'folio_entry_count',entry_count,'deposit_event_count',deposit_count,'account_amounts_available',available),'semantics',jsonb_build_object('document_mode','current_read_only_summary','invoice_issued',false,'signature_recorded',false,'consent_recorded',false,'payment_moved',false,'settlement_verified',false,'folio_opened',false,'deposit_book_created',false,'financial_records_changed',false,'internal_notes_included',false));
 IF octet_length(output::text)>2097152 THEN RAISE EXCEPTION 'Guest document response exceeds its complete output size limit';END IF;
 RETURN output;
END $$;
CREATE FUNCTION public.irp_pms_pilot_guest_documents(p_tenant uuid,p_property uuid,p_reservation uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE member_role text;captured jsonb;generated timestamptz;
BEGIN
 PERFORM irp_pms.pilot_require(p_tenant,p_property);
 IF p_reservation IS NULL THEN RAISE EXCEPTION 'A scoped reservation is required';END IF;
 PERFORM 1 FROM irp_pms.tenants WHERE id=p_tenant FOR SHARE;
 PERFORM 1 FROM irp_pms.properties WHERE tenant_id=p_tenant AND id=p_property FOR SHARE;
 member_role:=irp_pms.pilot_require(p_tenant,p_property);
 generated:=clock_timestamp();
 -- DOCUMENT173_CAPTURE_BEGIN: one persistent relational statement snapshot.
 WITH doc_folio_rows AS MATERIALIZED(
  SELECT e.* FROM irp_pms.folio_entries e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.reservation_id=p_reservation ORDER BY e.created_at,e.id LIMIT 1001
 ),doc_deposit_rows AS MATERIALIZED(
  SELECT e.* FROM irp_pms.security_deposit_events e WHERE e.tenant_id=p_tenant AND e.property_id=p_property AND e.reservation_id=p_reservation ORDER BY e.to_version LIMIT 1001
 )
 SELECT jsonb_build_object('property',to_jsonb(p),'reservation',to_jsonb(r),'party',to_jsonb(g),'linked_profile_version',gp.version,'room_type',to_jsonb(rt),'room',to_jsonb(room),'opening',to_jsonb(f),'deposit_book',to_jsonb(b),'entries',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.created_at,e.id) FROM doc_folio_rows e),'[]'::jsonb),'deposit_events',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.to_version) FROM doc_deposit_rows e),'[]'::jsonb))
 INTO captured
 FROM irp_pms.properties p
 JOIN irp_pms.reservations r ON r.tenant_id=p.tenant_id AND r.property_id=p.id AND r.id=p_reservation
 LEFT JOIN irp_pms.reservation_parties g ON g.tenant_id=r.tenant_id AND g.property_id=r.property_id AND g.reservation_id=r.id
 LEFT JOIN irp_pms.guest_profiles gp ON gp.tenant_id=g.tenant_id AND gp.property_id=g.property_id AND gp.id=g.guest_id
 LEFT JOIN irp_pms.room_types rt ON rt.tenant_id=r.tenant_id AND rt.property_id=r.property_id AND rt.id=r.room_type_id
 LEFT JOIN irp_pms.rooms room ON room.tenant_id=r.tenant_id AND room.property_id=r.property_id AND room.id=r.physical_room_id
 LEFT JOIN irp_pms.folio_openings f ON f.tenant_id=r.tenant_id AND f.property_id=r.property_id AND f.reservation_id=r.id
 LEFT JOIN irp_pms.security_deposit_books b ON b.tenant_id=r.tenant_id AND b.property_id=r.property_id AND b.reservation_id=r.id
 WHERE p.tenant_id=p_tenant AND p.id=p_property;
 -- DOCUMENT173_CAPTURE_END: projection below reads captured values only.
 IF captured IS NULL THEN RAISE EXCEPTION 'Unknown scoped reservation';END IF;
 RETURN irp_pms.guest_document_projection(captured,auth.uid(),member_role,generated);
END $$;
REVOKE ALL ON FUNCTION irp_pms.guest_document_number(jsonb,bigint,bigint,boolean),irp_pms.guest_document_label(text,integer,boolean,boolean),irp_pms.guest_document_itemization(jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION irp_pms.guest_document_projection(jsonb,uuid,text,timestamp with time zone) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.irp_pms_pilot_guest_documents(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.irp_pms_pilot_guest_documents(uuid,uuid,uuid) TO authenticated;
COMMIT;

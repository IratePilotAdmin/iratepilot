begin;

-- Gate 116 stores a consumer-safe projection and an encrypted provider-reference
-- mapping only. It does not reserve public-shopping budget, dispatch Duffel,
-- expose a public route, decrypt a provider reference, create an order, or touch
-- Stripe. One composite RPC atomically records a complete source disposition
-- set and terminalizes the existing 101 shopping attempt.
do $migration$
begin
  if to_regclass('public.flight_consumer_live_public_shopping_admissions') is null
    or to_regclass('public.flight_consumer_live_duffel_shopping_attempts') is null
    or to_regclass('public.flight_consumer_live_duffel_offer_sources') is null
    or to_regprocedure(
      'public.reserve_flight_consumer_live_public_shopping_admission_v1(text,text,text,text,text,text)'
    ) is null
    or to_regprocedure(
      'public.complete_flight_consumer_live_duffel_shopping_attempt_v1(uuid,integer,text,integer,text,integer,integer)'
    ) is null
    or to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception
      'Flight Consumer Live public-offer projection requires reviewed 101, 105, and 115 prerequisites';
  end if;
end;
$migration$;

create function public.canonical_flight_consumer_public_offer_json_v1(p_value jsonb)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog
as $canonical_flight_consumer_public_offer_json_v1$
declare
  v_result text;
begin
  case jsonb_typeof(p_value)
    when 'object' then
      select '{' || coalesce(string_agg(to_jsonb(key)::text || ':'
        || public.canonical_flight_consumer_public_offer_json_v1(value), ','
        order by key), '') || '}' into v_result
        from jsonb_each(p_value);
    when 'array' then
      select '[' || coalesce(string_agg(
        public.canonical_flight_consumer_public_offer_json_v1(value), ','
        order by ordinal), '') || ']' into v_result
        from jsonb_array_elements(p_value) with ordinality as item(value, ordinal);
    else v_result := p_value::text;
  end case;
  return v_result;
end;
$canonical_flight_consumer_public_offer_json_v1$;

create table public.flight_consumer_live_public_offer_projection_batches (
  id uuid primary key,
  admission_id uuid not null unique
    references public.flight_consumer_live_public_shopping_admissions(id)
    on delete restrict,
  admission_receipt_sha256 text not null
    check (admission_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  execution_scope_sha256 text not null
    check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  policy_sha256 text not null check (policy_sha256 ~ '^[0-9a-f]{64}$'),
  admission_policy_sha256 text not null
    check (admission_policy_sha256 ~ '^[0-9a-f]{64}$'),
  cohort_sha256 text not null check (cohort_sha256 ~ '^[0-9a-f]{64}$'),
  subject_sha256 text not null check (subject_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_sha256 text not null
    check (idempotency_sha256 ~ '^[0-9a-f]{64}$'),
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  source_shopping_attempt_id uuid not null unique
    references public.flight_consumer_live_duffel_shopping_attempts(id)
    on delete restrict,
  source_shopping_execution_scope_sha256 text not null
    check (source_shopping_execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  source_request_body_sha256 text not null
    check (source_request_body_sha256 ~ '^[0-9a-f]{64}$'),
  source_response_sha256 text not null
    check (source_response_sha256 ~ '^[0-9a-f]{64}$'),
  search_payload_sha256 text not null
    check (search_payload_sha256 ~ '^[0-9a-f]{64}$'),
  projected_payload_sha256 text not null
    check (projected_payload_sha256 ~ '^[0-9a-f]{64}$'),
  refused_payload_sha256 text not null
    check (refused_payload_sha256 ~ '^[0-9a-f]{64}$'),
  terminal_response_bytes integer not null
    check (terminal_response_bytes between 1 and 4194304),
  projection_batch_sha256 text not null unique
    check (projection_batch_sha256 ~ '^[0-9a-f]{64}$'),
  projection_receipt_sha256 text not null unique
    check (projection_receipt_sha256 ~ '^[0-9a-f]{64}$'),
  source_offer_count integer not null check (source_offer_count between 0 and 1000),
  projected_offer_count integer not null check (projected_offer_count between 0 and 25),
  refused_offer_count integer not null check (refused_offer_count between 0 and 1000),
  observed_at timestamptz not null,
  provider_dispatch_authorized boolean not null default false
    check (not provider_dispatch_authorized),
  consumer_exposure_authorized boolean not null default false
    check (not consumer_exposure_authorized),
  order_authorized boolean not null default false check (not order_authorized),
  stripe_dispatch_authorized boolean not null default false
    check (not stripe_dispatch_authorized),
  booking_authorized boolean not null default false check (not booking_authorized),
  payment_authorized boolean not null default false check (not payment_authorized),
  settlement_authorized boolean not null default false
    check (not settlement_authorized),
  ticketing_authorized boolean not null default false
    check (not ticketing_authorized),
  servicing_authorized boolean not null default false
    check (not servicing_authorized),
  capture_authorized boolean not null default false
    check (not capture_authorized),
  refund_authorized boolean not null default false
    check (not refund_authorized),
  consumer_release_enabled boolean not null default false
    check (not consumer_release_enabled),
  blind_retry_authorized boolean not null default false
    check (not blind_retry_authorized),
  created_at timestamptz not null default clock_timestamp(),
  check (source_offer_count = projected_offer_count + refused_offer_count),
  check (execution_scope_sha256 <> source_shopping_execution_scope_sha256)
);

create table public.flight_consumer_live_public_offer_projection_dispositions (
  batch_id uuid not null
    references public.flight_consumer_live_public_offer_projection_batches(id)
    on delete restrict,
  source_id uuid not null unique
    references public.flight_consumer_live_duffel_offer_sources(id)
    on delete restrict,
  source_offer_evidence_sha256 text not null
    check (source_offer_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  offer_id_sha256 text not null check (offer_id_sha256 ~ '^[0-9a-f]{64}$'),
  disposition text not null check (disposition in ('projected', 'refused')),
  refusal_code text check (refusal_code is null or refusal_code in (
    'capacity_truncated',
    'identity_document_required',
    'too_close_to_expiry',
    'unsupported_contract',
    'unsupported_currency',
    'unsupported_payment_profile'
  )),
  created_at timestamptz not null default clock_timestamp(),
  primary key (batch_id, source_id),
  check (
    (disposition = 'projected' and refusal_code is null)
    or (disposition = 'refused' and refusal_code is not null)
  )
);

create table public.flight_consumer_live_public_offer_projections (
  id uuid primary key,
  batch_id uuid not null
    references public.flight_consumer_live_public_offer_projection_batches(id)
    on delete restrict,
  source_id uuid not null unique
    references public.flight_consumer_live_duffel_offer_sources(id)
    on delete restrict,
  source_offer_evidence_sha256 text not null
    check (source_offer_evidence_sha256 ~ '^[0-9a-f]{64}$'),
  offer_id_sha256 text not null check (offer_id_sha256 ~ '^[0-9a-f]{64}$'),
  projection_sha256 text not null unique
    check (projection_sha256 ~ '^[0-9a-f]{64}$'),
  display_rank integer not null check (display_rank between 1 and 25),
  provider_code text not null default 'duffel' check (provider_code = 'duffel'),
  owner_name text not null check (
    char_length(owner_name) between 2 and 120
    and owner_name = btrim(owner_name)
    and owner_name !~ '[[:cntrl:]]'
  ),
  owner_iata_code text check (
    owner_iata_code is null or owner_iata_code ~ '^[A-Z0-9]{2,3}$'
  ),
  currency text not null default 'USD' check (currency = 'USD'),
  base_amount_minor bigint not null check (base_amount_minor between 0 and 99999999),
  tax_amount_minor bigint not null check (tax_amount_minor between 0 and 99999999),
  total_amount_minor bigint not null check (total_amount_minor between 1 and 99999999),
  passenger_identity_documents_required boolean not null default false
    check (not passenger_identity_documents_required),
  requires_instant_payment boolean not null default true
    check (requires_instant_payment),
  offer_expires_at timestamptz not null,
  presentation_expires_at timestamptz not null,
  changeable boolean not null,
  refundable boolean not null,
  change_penalty_amount_minor bigint check (
    change_penalty_amount_minor is null or change_penalty_amount_minor >= 0
  ),
  refund_penalty_amount_minor bigint check (
    refund_penalty_amount_minor is null or refund_penalty_amount_minor >= 0
  ),
  terms_summary_sha256 text not null
    check (terms_summary_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  unique (batch_id, display_rank),
  check (total_amount_minor = base_amount_minor + tax_amount_minor),
  check (presentation_expires_at <= offer_expires_at),
  check (presentation_expires_at <= created_at + interval '10 minutes'),
  check (offer_expires_at > created_at + interval '2 minutes'),
  check (changeable is true or change_penalty_amount_minor is null),
  check (refundable is true or refund_penalty_amount_minor is null)
);

create index flight_consumer_live_public_offer_projection_expiry_idx
  on public.flight_consumer_live_public_offer_projections (
    presentation_expires_at, display_rank
  );

create table public.flight_consumer_live_public_offer_segments (
  projection_id uuid not null
    references public.flight_consumer_live_public_offer_projections(id)
    on delete restrict,
  segment_sequence integer not null check (segment_sequence between 1 and 4),
  slice_sequence integer not null check (slice_sequence between 1 and 2),
  journey_direction text not null check (
    (slice_sequence = 1 and journey_direction = 'outbound')
    or (slice_sequence = 2 and journey_direction = 'return')
  ),
  origin_iata text not null check (origin_iata ~ '^[A-Z]{3}$'),
  destination_iata text not null check (destination_iata ~ '^[A-Z]{3}$'),
  departing_at_local text not null check (
    departing_at_local ~ '^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d$'
  ),
  arriving_at_local text not null check (
    arriving_at_local ~ '^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:[0-5]\d$'
  ),
  origin_time_zone text not null check (
    char_length(origin_time_zone) between 1 and 64
    and origin_time_zone ~ '^[A-Za-z0-9_+./-]+$'
  ),
  destination_time_zone text not null check (
    char_length(destination_time_zone) between 1 and 64
    and destination_time_zone ~ '^[A-Za-z0-9_+./-]+$'
  ),
  marketing_carrier_name text not null check (
    char_length(marketing_carrier_name) between 2 and 120
    and marketing_carrier_name = btrim(marketing_carrier_name)
  ),
  marketing_carrier_iata_code text not null
    check (marketing_carrier_iata_code ~ '^[A-Z0-9]{2,3}$'),
  operating_carrier_name text not null check (
    char_length(operating_carrier_name) between 2 and 120
    and operating_carrier_name = btrim(operating_carrier_name)
  ),
  operating_carrier_iata_code text not null
    check (operating_carrier_iata_code ~ '^[A-Z0-9]{2,3}$'),
  marketing_flight_number text not null
    check (marketing_flight_number ~ '^[A-Z0-9]{1,4}$'),
  duration_minutes integer not null check (duration_minutes between 1 and 2160),
  cabin text not null check (
    cabin in ('economy', 'premium_economy', 'business', 'first')
  ),
  created_at timestamptz not null default clock_timestamp(),
  primary key (projection_id, segment_sequence),
  check (origin_iata <> destination_iata)
);

create table public.flight_consumer_live_public_offer_reference_vaults (
  projection_id uuid primary key
    references public.flight_consumer_live_public_offer_projections(id)
    on delete restrict,
  offer_id_sha256 text not null unique check (offer_id_sha256 ~ '^[0-9a-f]{64}$'),
  provider_offer_reference_ciphertext text not null check (
    char_length(provider_offer_reference_ciphertext) <= 4096
    and char_length(split_part(provider_offer_reference_ciphertext, ':', 3))
      between 16 and 4073
    and provider_offer_reference_ciphertext
      ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
  ),
  key_version text not null check (
    key_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
  ),
  aad_sha256 text not null check (aad_sha256 ~ '^[0-9a-f]{64}$'),
  ciphertext_sha256 text not null unique check (ciphertext_sha256 ~ '^[0-9a-f]{64}$'),
  record_hmac_sha256 text not null unique check (record_hmac_sha256 ~ '^[0-9a-f]{64}$'),
  retention_expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  check (retention_expires_at = created_at + interval '7 days'),
  check (offer_id_sha256 <> aad_sha256),
  check (offer_id_sha256 <> ciphertext_sha256),
  check (offer_id_sha256 <> record_hmac_sha256),
  check (aad_sha256 <> ciphertext_sha256),
  check (aad_sha256 <> record_hmac_sha256),
  check (ciphertext_sha256 <> record_hmac_sha256)
);

do $security$
declare
  v_table text;
begin
  foreach v_table in array array[
    'flight_consumer_live_public_offer_projection_batches',
    'flight_consumer_live_public_offer_projection_dispositions',
    'flight_consumer_live_public_offer_projections',
    'flight_consumer_live_public_offer_segments',
    'flight_consumer_live_public_offer_reference_vaults'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
    execute format(
      'revoke all on table public.%I from public, anon, authenticated, service_role',
      v_table
    );
  end loop;
end;
$security$;

create function public.refuse_flight_consumer_live_public_offer_projection_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $refuse_flight_consumer_live_public_offer_projection_mutation_v1$
begin
  raise exception 'Flight Consumer Live public-offer projection evidence is append-only';
end;
$refuse_flight_consumer_live_public_offer_projection_mutation_v1$;

do $triggers$
declare
  v_table text;
begin
  foreach v_table in array array[
    'flight_consumer_live_public_offer_projection_batches',
    'flight_consumer_live_public_offer_projection_dispositions',
    'flight_consumer_live_public_offer_projections',
    'flight_consumer_live_public_offer_segments',
    'flight_consumer_live_public_offer_reference_vaults'
  ] loop
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function public.refuse_flight_consumer_live_public_offer_projection_mutation_v1()',
      v_table || '_immutable',
      v_table
    );
  end loop;
end;
$triggers$;

create function public.get_flight_consumer_live_public_offer_projection_batch_v1(
  p_admission_id uuid,
  p_admission_receipt_sha256 text,
  p_subject_sha256 text,
  p_request_sha256 text,
  p_projection_batch_sha256 text
)
returns table (
  batch_id uuid,
  projection_batch_sha256 text,
  projection_receipt_sha256 text,
  projected_offer_count integer,
  refused_offer_count integer,
  observed_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $get_flight_consumer_live_public_offer_projection_batch_v1$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live public-offer projection is service-role only';
  end if;
  if p_admission_id is null
    or p_admission_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_subject_sha256 !~ '^[0-9a-f]{64}$'
    or p_request_sha256 !~ '^[0-9a-f]{64}$'
    or p_projection_batch_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight Consumer Live public-offer projection inspection is invalid';
  end if;
  return query
  select batch.id, batch.projection_batch_sha256,
         batch.projection_receipt_sha256, batch.projected_offer_count,
         batch.refused_offer_count, batch.observed_at
    from public.flight_consumer_live_public_offer_projection_batches as batch
   where batch.admission_id = p_admission_id
     and batch.admission_receipt_sha256 = p_admission_receipt_sha256
     and batch.subject_sha256 = p_subject_sha256
     and batch.request_sha256 = p_request_sha256
     and batch.projection_batch_sha256 = p_projection_batch_sha256;
end;
$get_flight_consumer_live_public_offer_projection_batch_v1$;

create function public.complete_flight_consumer_live_public_offer_projection_batch_v1(
  p_admission_id uuid,
  p_admission_receipt_sha256 text,
  p_execution_scope_sha256 text,
  p_policy_sha256 text,
  p_admission_policy_sha256 text,
  p_cohort_sha256 text,
  p_subject_sha256 text,
  p_idempotency_sha256 text,
  p_request_sha256 text,
  p_search jsonb,
  p_source_shopping_attempt_id uuid,
  p_source_shopping_execution_scope_sha256 text,
  p_source_response_sha256 text,
  p_source_request_body_sha256 text,
  p_projection_batch_sha256 text,
  p_observed_at timestamptz,
  p_terminal_response_bytes integer,
  p_projected_offers jsonb,
  p_refused_sources jsonb
)
returns table (
  decision text,
  batch_id uuid,
  projection_batch_sha256 text,
  projection_receipt_sha256 text,
  projected_offer_count integer,
  refused_offer_count integer,
  provider_dispatch_authorized boolean,
  consumer_exposure_authorized boolean,
  order_authorized boolean,
  stripe_dispatch_authorized boolean,
  booking_authorized boolean,
  payment_authorized boolean,
  settlement_authorized boolean,
  ticketing_authorized boolean,
  servicing_authorized boolean,
  capture_authorized boolean,
  refund_authorized boolean,
  consumer_release_enabled boolean,
  blind_retry_authorized boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $complete_flight_consumer_live_public_offer_projection_batch_v1$
declare
  v_admission public.flight_consumer_live_public_shopping_admissions;
  v_attempt public.flight_consumer_live_duffel_shopping_attempts;
  v_existing public.flight_consumer_live_public_offer_projection_batches;
  v_batch_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_source_count integer;
  v_projected_count integer;
  v_refused_count integer;
  v_search_keys text[];
  v_adults integer;
  v_origin text;
  v_destination text;
  v_departure_date text;
  v_return_date text;
  v_cabin text;
  v_search_json text;
  v_public_request_json text;
  v_duffel_body_json text;
  v_expected_public_request_sha256 text;
  v_expected_source_body_sha256 text;
  v_search_payload_sha256 text;
  v_projected_payload_sha256 text;
  v_refused_payload_sha256 text;
  v_expected_projection_batch_sha256 text;
  v_projected_identity jsonb;
  v_refused_identity jsonb;
  v_receipt_sha256 text;
  v_item jsonb;
  v_projection jsonb;
  v_reference jsonb;
  v_source public.flight_consumer_live_duffel_offer_sources;
  v_local_offer_id uuid;
  v_projection_sha256 text;
  v_expected_projection_sha256 text;
  v_expected_terms_sha256 text;
  v_offer_expires_at timestamptz;
  v_presentation_expires_at timestamptz;
  v_key_version text;
  v_expected_aad_sha256 text;
  v_expected_ciphertext_sha256 text;
  v_segment jsonb;
  v_segment_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live public-offer projection is service-role only';
  end if;
  if p_admission_id is null
    or p_source_shopping_attempt_id is null
    or p_admission_receipt_sha256 is null
    or p_execution_scope_sha256 is null
    or p_policy_sha256 is null
    or p_admission_policy_sha256 is null
    or p_cohort_sha256 is null
    or p_subject_sha256 is null
    or p_idempotency_sha256 is null
    or p_request_sha256 is null
    or p_source_shopping_execution_scope_sha256 is null
    or p_source_response_sha256 is null
    or p_source_request_body_sha256 is null
    or p_projection_batch_sha256 is null
    or p_admission_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_policy_sha256 !~ '^[0-9a-f]{64}$'
    or p_admission_policy_sha256 !~ '^[0-9a-f]{64}$'
    or p_cohort_sha256 !~ '^[0-9a-f]{64}$'
    or p_subject_sha256 !~ '^[0-9a-f]{64}$'
    or p_idempotency_sha256 !~ '^[0-9a-f]{64}$'
    or p_request_sha256 !~ '^[0-9a-f]{64}$'
    or p_source_shopping_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_source_response_sha256 !~ '^[0-9a-f]{64}$'
    or p_source_request_body_sha256 !~ '^[0-9a-f]{64}$'
    or p_projection_batch_sha256 !~ '^[0-9a-f]{64}$'
    or p_execution_scope_sha256 = p_source_shopping_execution_scope_sha256
    or jsonb_typeof(p_search) is distinct from 'object'
    or jsonb_typeof(p_projected_offers) is distinct from 'array'
    or jsonb_typeof(p_refused_sources) is distinct from 'array'
    or jsonb_array_length(p_projected_offers) > 25
    or jsonb_array_length(p_refused_sources) > 1000
    or p_observed_at is null
    or p_observed_at is distinct from date_trunc('milliseconds', p_observed_at)
    or p_terminal_response_bytes is null
    or p_observed_at > v_now + interval '5 seconds'
    or p_terminal_response_bytes not between 1 and 4194304 then
    raise exception 'Flight Consumer Live public-offer projection envelope is invalid';
  end if;

  select array_agg(key order by key) into v_search_keys
    from jsonb_object_keys(p_search) as key;
  if v_search_keys is distinct from array[
      'adults', 'cabin', 'departureDate', 'destination', 'origin', 'returnDate'
    ]::text[]
    or jsonb_typeof(p_search -> 'adults') is distinct from 'number'
    or jsonb_typeof(p_search -> 'cabin') is distinct from 'string'
    or jsonb_typeof(p_search -> 'departureDate') is distinct from 'string'
    or jsonb_typeof(p_search -> 'destination') is distinct from 'string'
    or jsonb_typeof(p_search -> 'origin') is distinct from 'string'
    or jsonb_typeof(p_search -> 'returnDate') not in ('string', 'null') then
    raise exception 'Flight Consumer Live public-offer projection search is invalid';
  end if;
  begin
    v_adults := (p_search ->> 'adults')::integer;
  exception when others then
    raise exception 'Flight Consumer Live public-offer projection search is invalid';
  end;
  v_cabin := p_search ->> 'cabin';
  v_departure_date := p_search ->> 'departureDate';
  v_destination := p_search ->> 'destination';
  v_origin := p_search ->> 'origin';
  v_return_date := p_search ->> 'returnDate';
  if v_adults not between 1 and 4
    or v_cabin not in ('economy', 'premium_economy', 'business', 'first')
    or v_origin !~ '^[A-Z]{3}$'
    or v_destination !~ '^[A-Z]{3}$'
    or v_origin = v_destination
    or v_departure_date !~ '^\d{4}-\d{2}-\d{2}$'
    or (v_return_date is not null and (
      v_return_date !~ '^\d{4}-\d{2}-\d{2}$'
      or v_return_date <= v_departure_date
    )) then
    raise exception 'Flight Consumer Live public-offer projection search is invalid';
  end if;

  v_search_json := '{"adults":' || v_adults::text
    || ',"cabin":"' || v_cabin
    || '","departureDate":"' || v_departure_date
    || '","destination":"' || v_destination
    || '","origin":"' || v_origin
    || '","returnDate":' || case when v_return_date is null then 'null'
      else '"' || v_return_date || '"' end || '}';
  v_public_request_json := '{"admissionPolicySha256":"'
    || p_admission_policy_sha256 || '","cohortSha256":"'
    || p_cohort_sha256 || '","executionScopeSha256":"'
    || p_execution_scope_sha256 || '","policySha256":"'
    || p_policy_sha256 || '","search":' || v_search_json
    || ',"subjectSha256":"' || p_subject_sha256
    || '","version":"flight-consumer-production-public-shopping-admission-request-v1"}';
  v_expected_public_request_sha256 := encode(extensions.digest(
    convert_to(v_public_request_json, 'UTF8'), 'sha256'
  ), 'hex');
  if v_expected_public_request_sha256 <> p_request_sha256 then
    raise exception 'Flight Consumer Live public-offer admission request binding is invalid';
  end if;

  v_duffel_body_json := '{"data":{"cabin_class":"' || v_cabin
    || '","passengers":[' || array_to_string(
      array_fill('{"type":"adult"}'::text, array[v_adults]), ','
    ) || '],"slices":[{"departure_date":"' || v_departure_date
    || '","destination":"' || v_destination || '","origin":"'
    || v_origin || '"}' || case when v_return_date is null then '' else
      ',{"departure_date":"' || v_return_date || '","destination":"'
      || v_origin || '","origin":"' || v_destination || '"}' end
    || ']}}';
  v_expected_source_body_sha256 := encode(extensions.digest(
    convert_to(v_duffel_body_json, 'UTF8'), 'sha256'
  ), 'hex');
  if v_expected_source_body_sha256 <> p_source_request_body_sha256 then
    raise exception 'Flight Consumer Live public-offer Duffel body binding is invalid';
  end if;

  v_search_payload_sha256 := encode(extensions.digest(
    convert_to(p_search::text, 'UTF8'), 'sha256'
  ), 'hex');
  v_projected_payload_sha256 := encode(extensions.digest(
    convert_to(p_projected_offers::text, 'UTF8'), 'sha256'
  ), 'hex');
  v_refused_payload_sha256 := encode(extensions.digest(
    convert_to(p_refused_sources::text, 'UTF8'), 'sha256'
  ), 'hex');

  select * into v_admission
    from public.flight_consumer_live_public_shopping_admissions as admission
   where admission.id = p_admission_id
   for share;
  if not found
    or v_admission.admission_receipt_sha256 is distinct from p_admission_receipt_sha256
    or v_admission.execution_scope_sha256 is distinct from p_execution_scope_sha256
    or v_admission.policy_sha256 is distinct from p_policy_sha256
    or v_admission.admission_policy_sha256 is distinct from p_admission_policy_sha256
    or v_admission.cohort_sha256 is distinct from p_cohort_sha256
    or v_admission.subject_sha256 is distinct from p_subject_sha256
    or v_admission.idempotency_sha256 is distinct from p_idempotency_sha256
    or v_admission.request_sha256 is distinct from p_request_sha256
    or v_admission.admission_state is distinct from 'admitted'
    or not v_admission.budget_claimed
    or v_admission.provider_dispatch_authorized
    or v_admission.consumer_exposure_authorized
    or v_admission.order_authorized
    or v_admission.stripe_dispatch_authorized
    or v_admission.booking_authorized
    or v_admission.payment_authorized
    or v_admission.settlement_authorized
    or v_admission.ticketing_authorized
    or v_admission.servicing_authorized
    or v_admission.capture_authorized
    or v_admission.refund_authorized
    or v_admission.consumer_release_enabled
    or v_admission.blind_retry_authorized then
    raise exception 'Flight Consumer Live public-offer admission binding is invalid';
  end if;

  -- Serialize one admission before replay inspection so concurrent identical
  -- callers converge on the same immutable receipt rather than racing 101.
  perform pg_advisory_xact_lock(hashtextextended(p_admission_id::text, 116));

  select * into v_existing
    from public.flight_consumer_live_public_offer_projection_batches as batch
   where batch.admission_id = p_admission_id;
  if found then
    if v_existing.admission_receipt_sha256 is distinct from p_admission_receipt_sha256
      or v_existing.subject_sha256 is distinct from p_subject_sha256
      or v_existing.request_sha256 is distinct from p_request_sha256
      or v_existing.source_shopping_attempt_id is distinct from p_source_shopping_attempt_id
      or v_existing.source_shopping_execution_scope_sha256 is distinct from
        p_source_shopping_execution_scope_sha256
      or v_existing.source_request_body_sha256 is distinct from p_source_request_body_sha256
      or v_existing.source_response_sha256 is distinct from p_source_response_sha256
      or v_existing.projection_batch_sha256 is distinct from p_projection_batch_sha256
      or v_existing.search_payload_sha256 is distinct from v_search_payload_sha256
      or v_existing.projected_payload_sha256 is distinct from v_projected_payload_sha256
      or v_existing.refused_payload_sha256 is distinct from v_refused_payload_sha256
      or v_existing.terminal_response_bytes is distinct from p_terminal_response_bytes
      or v_existing.observed_at is distinct from p_observed_at then
      raise exception 'Flight Consumer Live public-offer projection replay collision';
    end if;
    return query select 'replay'::text, v_existing.id,
      v_existing.projection_batch_sha256,
      v_existing.projection_receipt_sha256,
      v_existing.projected_offer_count, v_existing.refused_offer_count,
      false, false, false, false, false, false, false, false, false,
      false, false, false, false;
    return;
  end if;

  select * into v_attempt
    from public.flight_consumer_live_duffel_shopping_attempts as attempt
   where attempt.id = p_source_shopping_attempt_id
     and attempt.execution_scope_sha256 = p_source_shopping_execution_scope_sha256
   for update;
  if not found
    or v_attempt.operation <> 'create_offer_request'
    or v_attempt.attempt_state <> 'dispatching'
    or v_attempt.attempt_revision <> 1
    or v_attempt.request_body_sha256 <> p_source_request_body_sha256
    or v_attempt.dispatch_started_at is null
    or p_observed_at < v_attempt.dispatch_started_at then
    raise exception 'Flight Consumer Live public-offer shopping source is invalid';
  end if;

  -- Refresh trusted time after both blocking row locks. A queued caller may not
  -- consume stale admission or offer time merely because it entered earlier.
  v_now := clock_timestamp();
  if v_admission.claim_expires_at is null
    or v_admission.claim_expires_at <= v_now
    or p_observed_at > v_now + interval '5 seconds' then
    raise exception 'Flight Consumer Live public-offer admission claim has expired';
  end if;

  select count(*)::integer into v_source_count
    from public.flight_consumer_live_duffel_offer_sources as source
   where source.source_shopping_attempt_id = p_source_shopping_attempt_id
     and source.source_shopping_execution_scope_sha256 =
       p_source_shopping_execution_scope_sha256
     and source.source_response_sha256 = p_source_response_sha256;
  if exists (
    select 1 from public.flight_consumer_live_duffel_offer_sources as source
     where source.source_shopping_attempt_id = p_source_shopping_attempt_id
       and (
         source.source_shopping_execution_scope_sha256 is distinct from
           p_source_shopping_execution_scope_sha256
         or source.source_response_sha256 is distinct from
           p_source_response_sha256
       )
  ) then
    raise exception 'Flight Consumer Live public-offer response binding is invalid';
  end if;
  v_projected_count := jsonb_array_length(p_projected_offers);
  v_refused_count := jsonb_array_length(p_refused_sources);
  if v_source_count <> v_projected_count + v_refused_count then
    raise exception 'Flight Consumer Live public-offer source accounting is incomplete';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'sourceId', item ->> 'sourceId',
      'sourceOfferEvidenceSha256', item ->> 'sourceOfferEvidenceSha256',
      'offerIdSha256', item ->> 'offerIdSha256',
      'projectionSha256', item ->> 'projectionSha256'
    ) order by item ->> 'offerIdSha256'), '[]'::jsonb)
    into v_projected_identity
    from jsonb_array_elements(p_projected_offers) as item;
  select coalesce(jsonb_agg(item order by item ->> 'offerIdSha256'), '[]'::jsonb)
    into v_refused_identity
    from jsonb_array_elements(p_refused_sources) as item;
  v_expected_projection_batch_sha256 := encode(extensions.digest(convert_to(
    public.canonical_flight_consumer_public_offer_json_v1(jsonb_build_object(
      'version', 'flight-consumer-production-public-offer-projection-batch-v1',
      'admissionId', p_admission_id::text,
      'admissionReceiptSha256', p_admission_receipt_sha256,
      'sourceShoppingAttemptId', p_source_shopping_attempt_id::text,
      'sourceShoppingExecutionScopeSha256',
        p_source_shopping_execution_scope_sha256,
      'sourceResponseSha256', p_source_response_sha256,
      'sourceRequestBodySha256', p_source_request_body_sha256,
      'projected', v_projected_identity,
      'refused', v_refused_identity,
      'observedAt', to_char(
        p_observed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      )
    )), 'UTF8'), 'sha256'), 'hex');
  if p_projection_batch_sha256 is distinct from
      v_expected_projection_batch_sha256 then
    raise exception 'Flight Consumer Live public-offer batch digest is invalid';
  end if;

  v_receipt_sha256 := encode(extensions.digest(
    convert_to(
      'iratepilot:flight-consumer-production:public-offer-projection-receipt:v1',
      'UTF8'
    ) || decode('00', 'hex') || convert_to(
      v_batch_id::text || ':' || p_admission_id::text || ':'
      || p_admission_receipt_sha256 || ':' || p_request_sha256 || ':'
      || p_source_shopping_attempt_id::text || ':'
      || p_source_request_body_sha256 || ':' || p_source_response_sha256 || ':'
      || p_projection_batch_sha256 || ':' || v_source_count::text || ':'
      || v_projected_count::text || ':' || v_refused_count::text || ':'
      || v_search_payload_sha256 || ':' || v_projected_payload_sha256 || ':'
      || v_refused_payload_sha256 || ':' || p_terminal_response_bytes::text || ':'
      || to_char(p_observed_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'UTF8'
    ), 'sha256'
  ), 'hex');

  insert into public.flight_consumer_live_public_offer_projection_batches (
    id, admission_id, admission_receipt_sha256, execution_scope_sha256,
    policy_sha256, admission_policy_sha256, cohort_sha256, subject_sha256,
    idempotency_sha256, request_sha256, source_shopping_attempt_id,
    source_shopping_execution_scope_sha256, source_request_body_sha256,
    source_response_sha256, search_payload_sha256, projected_payload_sha256,
    refused_payload_sha256, terminal_response_bytes, projection_batch_sha256,
    projection_receipt_sha256, source_offer_count, projected_offer_count,
    refused_offer_count, observed_at, created_at
  ) values (
    v_batch_id, p_admission_id, p_admission_receipt_sha256,
    p_execution_scope_sha256, p_policy_sha256, p_admission_policy_sha256,
    p_cohort_sha256, p_subject_sha256, p_idempotency_sha256,
    p_request_sha256, p_source_shopping_attempt_id,
    p_source_shopping_execution_scope_sha256, p_source_request_body_sha256,
    p_source_response_sha256, v_search_payload_sha256,
    v_projected_payload_sha256, v_refused_payload_sha256,
    p_terminal_response_bytes, p_projection_batch_sha256, v_receipt_sha256,
    v_source_count, v_projected_count, v_refused_count, p_observed_at, v_now
  );

  for v_item in select value from jsonb_array_elements(p_projected_offers)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or (select array_agg(key order by key) from jsonb_object_keys(v_item) as key)
        is distinct from array[
          'encryptedReference', 'offerIdSha256', 'projection',
          'projectionSha256', 'sourceId', 'sourceOfferEvidenceSha256'
        ]::text[] then
      raise exception 'Flight Consumer Live public-offer projected item is invalid';
    end if;
    v_projection := v_item -> 'projection';
    v_reference := v_item -> 'encryptedReference';
    if jsonb_typeof(v_projection) <> 'object'
      or jsonb_typeof(v_reference) <> 'object'
      or (select array_agg(key order by key) from jsonb_object_keys(v_projection) as key)
        is distinct from array[
          'displayRank', 'localOfferId', 'offerExpiresAt', 'owner',
          'passengerIdentityDocumentsRequired', 'presentationExpiresAt',
          'price', 'providerCode', 'requiresInstantPayment', 'segments', 'terms'
        ]::text[]
      or (select array_agg(key order by key) from jsonb_object_keys(v_reference) as key)
        is distinct from array[
          'aadSha256', 'ciphertext', 'ciphertextSha256', 'keyVersion',
          'plaintextReferenceSha256', 'recordHmacSha256', 'version'
        ]::text[]
      or jsonb_typeof(v_item -> 'sourceId') is distinct from 'string'
      or jsonb_typeof(v_item -> 'sourceOfferEvidenceSha256') is distinct from 'string'
      or jsonb_typeof(v_item -> 'offerIdSha256') is distinct from 'string'
      or jsonb_typeof(v_item -> 'projectionSha256') is distinct from 'string'
      or jsonb_typeof(v_reference -> 'version') is distinct from 'string'
      or jsonb_typeof(v_reference -> 'ciphertext') is distinct from 'string'
      or jsonb_typeof(v_reference -> 'keyVersion') is distinct from 'string'
      or jsonb_typeof(v_reference -> 'aadSha256') is distinct from 'string'
      or jsonb_typeof(v_reference -> 'ciphertextSha256') is distinct from 'string'
      or jsonb_typeof(v_reference -> 'plaintextReferenceSha256') is distinct from 'string'
      or jsonb_typeof(v_reference -> 'recordHmacSha256') is distinct from 'string'
      or jsonb_typeof(v_projection -> 'owner') is distinct from 'object'
      or (select array_agg(key order by key)
            from jsonb_object_keys(v_projection -> 'owner') as key)
        is distinct from array['iataCode', 'name']::text[]
      or jsonb_typeof(v_projection -> 'price') is distinct from 'object'
      or (select array_agg(key order by key)
            from jsonb_object_keys(v_projection -> 'price') as key)
        is distinct from array[
          'baseAmountMinor', 'currency', 'taxAmountMinor', 'totalAmountMinor'
        ]::text[]
      or jsonb_typeof(v_projection -> 'terms') is distinct from 'object'
      or (select array_agg(key order by key)
            from jsonb_object_keys(v_projection -> 'terms') as key)
        is distinct from array[
          'changePenaltyAmountMinor', 'changeable', 'refundPenaltyAmountMinor',
          'refundable', 'termsSummarySha256'
        ]::text[]
      or jsonb_typeof(v_projection -> 'localOfferId') is distinct from 'string'
      or jsonb_typeof(v_projection -> 'displayRank') is distinct from 'number'
      or (v_projection ->> 'displayRank') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(v_projection -> 'providerCode') is distinct from 'string'
      or jsonb_typeof(v_projection -> 'offerExpiresAt') is distinct from 'string'
      or jsonb_typeof(v_projection -> 'presentationExpiresAt') is distinct from 'string'
      or jsonb_typeof(v_projection #> '{owner,name}') is distinct from 'string'
      or jsonb_typeof(v_projection #> '{owner,iataCode}') not in ('string', 'null')
      or (jsonb_typeof(v_projection #> '{owner,iataCode}') = 'string'
          and (v_projection #>> '{owner,iataCode}') !~ '^[A-Z0-9]{2,3}$')
      or jsonb_typeof(v_projection #> '{price,currency}') is distinct from 'string'
      or v_projection #>> '{price,currency}' is distinct from 'USD'
      or jsonb_typeof(v_projection #> '{price,baseAmountMinor}') is distinct from 'number'
      or (v_projection #>> '{price,baseAmountMinor}') !~ '^(0|[1-9][0-9]*)$'
      or jsonb_typeof(v_projection #> '{price,taxAmountMinor}') is distinct from 'number'
      or (v_projection #>> '{price,taxAmountMinor}') !~ '^(0|[1-9][0-9]*)$'
      or jsonb_typeof(v_projection #> '{price,totalAmountMinor}') is distinct from 'number'
      or (v_projection #>> '{price,totalAmountMinor}') !~ '^[1-9][0-9]*$'
      or jsonb_typeof(v_projection #> '{terms,termsSummarySha256}') is distinct from 'string'
      or jsonb_typeof(v_projection #> '{terms,changePenaltyAmountMinor}')
        not in ('number', 'null')
      or (jsonb_typeof(v_projection #> '{terms,changePenaltyAmountMinor}') = 'number'
          and (v_projection #>> '{terms,changePenaltyAmountMinor}')
            !~ '^(0|[1-9][0-9]*)$')
      or jsonb_typeof(v_projection #> '{terms,refundPenaltyAmountMinor}')
        not in ('number', 'null')
      or (jsonb_typeof(v_projection #> '{terms,refundPenaltyAmountMinor}') = 'number'
          and (v_projection #>> '{terms,refundPenaltyAmountMinor}')
            !~ '^(0|[1-9][0-9]*)$') then
      raise exception 'Flight Consumer Live public-offer projected item is invalid';
    end if;
    begin
      v_source.id := (v_item ->> 'sourceId')::uuid;
      v_local_offer_id := (v_projection ->> 'localOfferId')::uuid;
      v_offer_expires_at := (v_projection ->> 'offerExpiresAt')::timestamptz;
      v_presentation_expires_at :=
        (v_projection ->> 'presentationExpiresAt')::timestamptz;
    exception when others then
      raise exception 'Flight Consumer Live public-offer projected identity is invalid';
    end;
    v_projection_sha256 := v_item ->> 'projectionSha256';
    v_expected_projection_sha256 := encode(extensions.digest(convert_to(
      public.canonical_flight_consumer_public_offer_json_v1(jsonb_build_object(
        'version', 'flight-consumer-production-public-offer-projection-v1',
        'admissionId', p_admission_id::text,
        'sourceId', v_item ->> 'sourceId',
        'sourceOfferEvidenceSha256', v_item ->> 'sourceOfferEvidenceSha256',
        'offerIdSha256', v_item ->> 'offerIdSha256',
        'projection', v_projection
      )), 'UTF8'), 'sha256'), 'hex');
    v_expected_terms_sha256 := encode(extensions.digest(convert_to(
      public.canonical_flight_consumer_public_offer_json_v1(jsonb_build_object(
        'version', 'flight-consumer-production-public-offer-terms-v1',
        'owner', jsonb_build_object(
          'name', v_projection #>> '{owner,name}',
          'iataCode', v_projection #> '{owner,iataCode}'
        ),
        'change', jsonb_build_object(
          'allowed', v_projection #> '{terms,changeable}',
          'penaltyAmountMinor', v_projection #> '{terms,changePenaltyAmountMinor}'
        ),
        'refund', jsonb_build_object(
          'allowed', v_projection #> '{terms,refundable}',
          'penaltyAmountMinor', v_projection #> '{terms,refundPenaltyAmountMinor}'
        )
      )), 'UTF8'), 'sha256'), 'hex');
    select * into v_source
      from public.flight_consumer_live_duffel_offer_sources as source
     where source.id = v_source.id
       and source.source_shopping_attempt_id = p_source_shopping_attempt_id
       and source.source_shopping_execution_scope_sha256 =
         p_source_shopping_execution_scope_sha256
       and source.source_response_sha256 = p_source_response_sha256
       and source.source_offer_evidence_sha256 =
         v_item ->> 'sourceOfferEvidenceSha256'
       and source.offer_id_sha256 = v_item ->> 'offerIdSha256'
       and source.expires_at = v_offer_expires_at
     for share;
    if not found
      or v_projection_sha256 <> v_expected_projection_sha256
      or v_projection #>> '{terms,termsSummarySha256}' <> v_expected_terms_sha256
      or v_presentation_expires_at > v_offer_expires_at
      or v_presentation_expires_at > v_now + interval '10 minutes'
      or v_offer_expires_at <= v_now + interval '2 minutes'
      or v_projection ->> 'providerCode' is distinct from 'duffel'
      or jsonb_typeof(v_projection -> 'passengerIdentityDocumentsRequired')
        is distinct from 'boolean'
      or (v_projection ->> 'passengerIdentityDocumentsRequired')::boolean
        is distinct from false
      or jsonb_typeof(v_projection -> 'requiresInstantPayment')
        is distinct from 'boolean'
      or (v_projection ->> 'requiresInstantPayment')::boolean
        is distinct from true
      or jsonb_typeof(v_projection #> '{terms,changeable}')
        is distinct from 'boolean'
      or jsonb_typeof(v_projection #> '{terms,refundable}')
        is distinct from 'boolean'
      or jsonb_typeof(v_projection -> 'owner') <> 'object'
      or jsonb_typeof(v_projection -> 'price') <> 'object'
      or jsonb_typeof(v_projection -> 'terms') <> 'object'
      or jsonb_typeof(v_projection -> 'segments') <> 'array'
      or jsonb_array_length(v_projection -> 'segments') not between 1 and 4 then
      raise exception 'Flight Consumer Live public-offer source projection binding is invalid';
    end if;

    v_key_version := v_reference ->> 'keyVersion';
    v_expected_aad_sha256 := encode(extensions.digest(
      convert_to(
        'iratepilot:flight-consumer-production:duffel-offer-reference-aad:v1',
        'UTF8'
      ) || decode('00', 'hex') || convert_to(
        p_admission_receipt_sha256 || ':' || p_subject_sha256 || ':'
        || p_request_sha256 || ':' || v_local_offer_id::text || ':'
        || v_source.id::text || ':' || v_source.source_offer_evidence_sha256
        || ':' || v_projection_sha256 || ':'
        || to_char(v_offer_expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
        || ':' || v_key_version,
        'UTF8'
      ), 'sha256'
    ), 'hex');
    v_expected_ciphertext_sha256 := encode(extensions.digest(
      convert_to(
        'iratepilot:flight-consumer-production:duffel-offer-reference-ciphertext:v1',
        'UTF8'
      ) || decode('00', 'hex')
        || convert_to(v_reference ->> 'ciphertext', 'UTF8'),
      'sha256'
    ), 'hex');
    if v_reference ->> 'version'
        is distinct from 'flight-consumer-live-duffel-offer-reference-encryption-v1'
      or v_reference ->> 'plaintextReferenceSha256'
        is distinct from v_source.offer_id_sha256
      or v_reference ->> 'ciphertext'
        !~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]+$'
      or char_length(v_reference ->> 'ciphertext') > 4096
      or char_length(split_part(v_reference ->> 'ciphertext', ':', 3))
        not between 16 and 4073
      or v_key_version !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$'
      or v_reference ->> 'aadSha256' is distinct from v_expected_aad_sha256
      or v_reference ->> 'ciphertextSha256' is distinct from v_expected_ciphertext_sha256
      or v_reference ->> 'recordHmacSha256' !~ '^[0-9a-f]{64}$' then
      raise exception 'Flight Consumer Live public-offer encrypted mapping is invalid';
    end if;

    insert into public.flight_consumer_live_public_offer_projection_dispositions (
      batch_id, source_id, source_offer_evidence_sha256, offer_id_sha256,
      disposition, refusal_code, created_at
    ) values (
      v_batch_id, v_source.id, v_source.source_offer_evidence_sha256,
      v_source.offer_id_sha256, 'projected', null, v_now
    );
    insert into public.flight_consumer_live_public_offer_projections (
      id, batch_id, source_id, source_offer_evidence_sha256, offer_id_sha256,
      projection_sha256, display_rank, owner_name, owner_iata_code,
      provider_code, currency, base_amount_minor, tax_amount_minor,
      total_amount_minor, passenger_identity_documents_required,
      requires_instant_payment,
      offer_expires_at, presentation_expires_at, changeable, refundable,
      change_penalty_amount_minor, refund_penalty_amount_minor,
      terms_summary_sha256, created_at
    ) values (
      v_local_offer_id, v_batch_id, v_source.id,
      v_source.source_offer_evidence_sha256, v_source.offer_id_sha256,
      v_projection_sha256, (v_projection ->> 'displayRank')::integer,
      v_projection #>> '{owner,name}', v_projection #>> '{owner,iataCode}',
      v_projection ->> 'providerCode', v_projection #>> '{price,currency}',
      (v_projection #>> '{price,baseAmountMinor}')::bigint,
      (v_projection #>> '{price,taxAmountMinor}')::bigint,
      (v_projection #>> '{price,totalAmountMinor}')::bigint,
      (v_projection ->> 'passengerIdentityDocumentsRequired')::boolean,
      (v_projection ->> 'requiresInstantPayment')::boolean,
      v_offer_expires_at, v_presentation_expires_at,
      (v_projection #>> '{terms,changeable}')::boolean,
      (v_projection #>> '{terms,refundable}')::boolean,
      (v_projection #>> '{terms,changePenaltyAmountMinor}')::bigint,
      (v_projection #>> '{terms,refundPenaltyAmountMinor}')::bigint,
      v_projection #>> '{terms,termsSummarySha256}', v_now
    );
    insert into public.flight_consumer_live_public_offer_reference_vaults (
      projection_id, offer_id_sha256, provider_offer_reference_ciphertext,
      key_version, aad_sha256, ciphertext_sha256, record_hmac_sha256,
      retention_expires_at, created_at
    ) values (
      v_local_offer_id, v_source.offer_id_sha256, v_reference ->> 'ciphertext',
      v_key_version, v_reference ->> 'aadSha256',
      v_reference ->> 'ciphertextSha256',
      v_reference ->> 'recordHmacSha256', v_now + interval '7 days', v_now
    );
    v_segment_count := 0;
    for v_segment in select value
      from jsonb_array_elements(v_projection -> 'segments')
    loop
      v_segment_count := v_segment_count + 1;
      if jsonb_typeof(v_segment) is distinct from 'object'
        or (select array_agg(key order by key)
              from jsonb_object_keys(v_segment) as key) is distinct from array[
            'arrivingAtLocal', 'cabin', 'departingAtLocal',
            'destinationIata', 'destinationTimeZone', 'durationMinutes',
            'journeyDirection', 'marketingCarrierIataCode',
            'marketingCarrierName', 'marketingFlightNumber',
            'operatingCarrierIataCode', 'operatingCarrierName', 'originIata',
            'originTimeZone', 'segmentSequence', 'sliceSequence'
          ]::text[]
        or jsonb_typeof(v_segment -> 'segmentSequence') is distinct from 'number'
        or (v_segment ->> 'segmentSequence') !~ '^[1-9][0-9]*$'
        or jsonb_typeof(v_segment -> 'sliceSequence') is distinct from 'number'
        or (v_segment ->> 'sliceSequence') !~ '^[1-9][0-9]*$'
        or jsonb_typeof(v_segment -> 'durationMinutes') is distinct from 'number'
        or (v_segment ->> 'durationMinutes') !~ '^[1-9][0-9]*$'
        or exists (
          select 1 from unnest(array[
            'journeyDirection', 'originIata', 'destinationIata',
            'departingAtLocal', 'arrivingAtLocal', 'originTimeZone',
            'destinationTimeZone', 'marketingCarrierName',
            'marketingCarrierIataCode', 'operatingCarrierName',
            'operatingCarrierIataCode', 'marketingFlightNumber', 'cabin'
          ]) as required_key
          where jsonb_typeof(v_segment -> required_key) is distinct from 'string'
        )
        or v_segment ->> 'cabin' <> v_cabin then
        raise exception 'Flight Consumer Live public-offer segment is invalid';
      end if;
      insert into public.flight_consumer_live_public_offer_segments (
        projection_id, segment_sequence, slice_sequence, journey_direction,
        origin_iata, destination_iata, departing_at_local, arriving_at_local,
        origin_time_zone, destination_time_zone, marketing_carrier_name,
        marketing_carrier_iata_code, operating_carrier_name,
        operating_carrier_iata_code, marketing_flight_number,
        duration_minutes, cabin, created_at
      ) values (
        v_local_offer_id, (v_segment ->> 'segmentSequence')::integer,
        (v_segment ->> 'sliceSequence')::integer,
        v_segment ->> 'journeyDirection', v_segment ->> 'originIata',
        v_segment ->> 'destinationIata', v_segment ->> 'departingAtLocal',
        v_segment ->> 'arrivingAtLocal', v_segment ->> 'originTimeZone',
        v_segment ->> 'destinationTimeZone',
        v_segment ->> 'marketingCarrierName',
        v_segment ->> 'marketingCarrierIataCode',
        v_segment ->> 'operatingCarrierName',
        v_segment ->> 'operatingCarrierIataCode',
        v_segment ->> 'marketingFlightNumber',
        (v_segment ->> 'durationMinutes')::integer,
        v_segment ->> 'cabin', v_now
      );
    end loop;
    if v_segment_count <> jsonb_array_length(v_projection -> 'segments') then
      raise exception 'Flight Consumer Live public-offer segment accounting is invalid';
    end if;
    if exists (
      select 1
        from (
          select segment_sequence, origin_iata, destination_iata,
                 lag(destination_iata) over (order by segment_sequence) as previous_destination
            from public.flight_consumer_live_public_offer_segments
           where projection_id = v_local_offer_id
        ) as ordered_segment
       where segment_sequence < 1
          or (segment_sequence > 1
              and previous_destination is distinct from origin_iata)
    ) or (select min(segment_sequence)
            from public.flight_consumer_live_public_offer_segments
           where projection_id = v_local_offer_id) <> 1
      or (select max(segment_sequence)
            from public.flight_consumer_live_public_offer_segments
           where projection_id = v_local_offer_id) <> v_segment_count
      or (select origin_iata
            from public.flight_consumer_live_public_offer_segments
           where projection_id = v_local_offer_id order by segment_sequence limit 1)
           <> v_origin
      or (select destination_iata
            from public.flight_consumer_live_public_offer_segments
           where projection_id = v_local_offer_id order by segment_sequence desc limit 1)
           <> (case when v_return_date is null then v_destination else v_origin end)
      or (select array_agg(distinct slice_sequence order by slice_sequence)
            from public.flight_consumer_live_public_offer_segments
           where projection_id = v_local_offer_id)
           is distinct from (case when v_return_date is null
             then array[1]::integer[] else array[1, 2]::integer[] end)
      or exists (
        select 1 from (
          select slice_sequence,
                 lag(slice_sequence) over (order by segment_sequence) as prior_slice
            from public.flight_consumer_live_public_offer_segments
           where projection_id = v_local_offer_id
        ) as ordered_slice
        where prior_slice is not null and slice_sequence < prior_slice
      )
      or (select origin_iata
            from public.flight_consumer_live_public_offer_segments
           where projection_id = v_local_offer_id and slice_sequence = 1
           order by segment_sequence limit 1) <> v_origin
      or (select destination_iata
            from public.flight_consumer_live_public_offer_segments
           where projection_id = v_local_offer_id and slice_sequence = 1
           order by segment_sequence desc limit 1) <> v_destination
      or (select left(departing_at_local, 10)
            from public.flight_consumer_live_public_offer_segments
           where projection_id = v_local_offer_id and slice_sequence = 1
           order by segment_sequence limit 1) <> v_departure_date
      or (v_return_date is not null and (
        (select origin_iata
           from public.flight_consumer_live_public_offer_segments
          where projection_id = v_local_offer_id and slice_sequence = 2
          order by segment_sequence limit 1) <> v_destination
        or (select destination_iata
              from public.flight_consumer_live_public_offer_segments
             where projection_id = v_local_offer_id and slice_sequence = 2
             order by segment_sequence desc limit 1) <> v_origin
        or (select left(departing_at_local, 10)
              from public.flight_consumer_live_public_offer_segments
             where projection_id = v_local_offer_id and slice_sequence = 2
             order by segment_sequence limit 1) <> v_return_date
      )) then
      raise exception 'Flight Consumer Live public-offer route continuity is invalid';
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_refused_sources)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or (select array_agg(key order by key) from jsonb_object_keys(v_item) as key)
        is distinct from array[
          'offerIdSha256', 'refusalCode', 'sourceId',
          'sourceOfferEvidenceSha256'
        ]::text[]
      or jsonb_typeof(v_item -> 'sourceId') is distinct from 'string'
      or jsonb_typeof(v_item -> 'sourceOfferEvidenceSha256') is distinct from 'string'
      or jsonb_typeof(v_item -> 'offerIdSha256') is distinct from 'string'
      or jsonb_typeof(v_item -> 'refusalCode') is distinct from 'string' then
      raise exception 'Flight Consumer Live public-offer refusal item is invalid';
    end if;
    begin
      v_source.id := (v_item ->> 'sourceId')::uuid;
    exception when others then
      raise exception 'Flight Consumer Live public-offer refusal identity is invalid';
    end;
    select * into v_source
      from public.flight_consumer_live_duffel_offer_sources as source
     where source.id = v_source.id
       and source.source_shopping_attempt_id = p_source_shopping_attempt_id
       and source.source_shopping_execution_scope_sha256 =
         p_source_shopping_execution_scope_sha256
       and source.source_response_sha256 = p_source_response_sha256
       and source.source_offer_evidence_sha256 =
         v_item ->> 'sourceOfferEvidenceSha256'
       and source.offer_id_sha256 = v_item ->> 'offerIdSha256'
     for share;
    if not found or v_item ->> 'refusalCode' not in (
      'capacity_truncated', 'identity_document_required',
      'too_close_to_expiry', 'unsupported_contract',
      'unsupported_currency', 'unsupported_payment_profile'
    ) then
      raise exception 'Flight Consumer Live public-offer refusal binding is invalid';
    end if;
    insert into public.flight_consumer_live_public_offer_projection_dispositions (
      batch_id, source_id, source_offer_evidence_sha256, offer_id_sha256,
      disposition, refusal_code, created_at
    ) values (
      v_batch_id, v_source.id, v_source.source_offer_evidence_sha256,
      v_source.offer_id_sha256, 'refused', v_item ->> 'refusalCode', v_now
    );
  end loop;

  if (select count(*)
        from public.flight_consumer_live_public_offer_projection_dispositions
          as disposition
       where disposition.batch_id = v_batch_id) <> v_source_count
    or exists (
      select 1 from public.flight_consumer_live_duffel_offer_sources as source
       where source.source_shopping_attempt_id = p_source_shopping_attempt_id
         and source.source_shopping_execution_scope_sha256 =
           p_source_shopping_execution_scope_sha256
         and source.source_response_sha256 = p_source_response_sha256
         and not exists (
           select 1
             from public.flight_consumer_live_public_offer_projection_dispositions as disposition
            where disposition.batch_id = v_batch_id
              and disposition.source_id = source.id
         )
    ) then
    raise exception 'Flight Consumer Live public-offer source accounting is incomplete';
  end if;

  perform public.complete_flight_consumer_live_duffel_shopping_attempt_v1(
    p_source_shopping_attempt_id, 1, 'succeeded', 200,
    p_source_response_sha256, p_terminal_response_bytes, v_source_count
  );

  return query select 'created'::text, v_batch_id, p_projection_batch_sha256,
    v_receipt_sha256, v_projected_count, v_refused_count,
    false, false, false, false, false, false, false, false, false,
    false, false, false, false;
end;
$complete_flight_consumer_live_public_offer_projection_batch_v1$;

create function public.list_flight_consumer_live_duffel_pending_offer_sources_v1(
  p_source_shopping_attempt_id uuid,
  p_source_shopping_execution_scope_sha256 text,
  p_source_response_sha256 text
)
returns table (
  source_id uuid,
  offer_id_sha256 text,
  source_offer_evidence_sha256 text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $list_flight_consumer_live_duffel_pending_offer_sources_v1$
declare
  v_attempt public.flight_consumer_live_duffel_shopping_attempts;
  v_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    or p_source_shopping_attempt_id is null
    or p_source_shopping_execution_scope_sha256 is null
    or p_source_response_sha256 is null
    or p_source_shopping_execution_scope_sha256 !~ '^[0-9a-f]{64}$'
    or p_source_response_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight Consumer Live pending offer-source inspection is invalid';
  end if;
  select * into v_attempt
    from public.flight_consumer_live_duffel_shopping_attempts as attempt
   where attempt.id = p_source_shopping_attempt_id
     and attempt.execution_scope_sha256 = p_source_shopping_execution_scope_sha256
   for share;
  if not found or v_attempt.operation <> 'create_offer_request'
    or v_attempt.attempt_state <> 'dispatching' or v_attempt.attempt_revision <> 1 then
    raise exception 'Flight Consumer Live pending offer-source attempt is invalid';
  end if;
  select count(*)::integer into v_count
    from public.flight_consumer_live_duffel_offer_sources as source
   where source.source_shopping_attempt_id = p_source_shopping_attempt_id
     and source.source_shopping_execution_scope_sha256 =
       p_source_shopping_execution_scope_sha256
     and source.source_response_sha256 = p_source_response_sha256;
  if exists (
    select 1 from public.flight_consumer_live_duffel_offer_sources as source
     where source.source_shopping_attempt_id = p_source_shopping_attempt_id
       and (
         source.source_shopping_execution_scope_sha256 is distinct from
           p_source_shopping_execution_scope_sha256
         or source.source_response_sha256 is distinct from
           p_source_response_sha256
       )
  ) or v_count > 1000 then
    raise exception 'Flight Consumer Live pending offer-source set is invalid';
  end if;
  return query
  select source.id, source.offer_id_sha256,
         source.source_offer_evidence_sha256, source.expires_at
    from public.flight_consumer_live_duffel_offer_sources as source
   where source.source_shopping_attempt_id = p_source_shopping_attempt_id
     and source.source_shopping_execution_scope_sha256 =
       p_source_shopping_execution_scope_sha256
     and source.source_response_sha256 = p_source_response_sha256
   order by source.offer_id_sha256;
end;
$list_flight_consumer_live_duffel_pending_offer_sources_v1$;

create function public.read_flight_consumer_live_public_offer_projection_batch_v1(
  p_admission_id uuid,
  p_admission_receipt_sha256 text,
  p_subject_sha256 text,
  p_request_sha256 text
)
returns table (
  local_offer_id uuid,
  display_rank integer,
  owner_name text,
  owner_iata_code text,
  currency text,
  base_amount_minor bigint,
  tax_amount_minor bigint,
  total_amount_minor bigint,
  offer_expires_at timestamptz,
  presentation_expires_at timestamptz,
  changeable boolean,
  refundable boolean,
  change_penalty_amount_minor bigint,
  refund_penalty_amount_minor bigint,
  segment_sequence integer,
  slice_sequence integer,
  journey_direction text,
  origin_iata text,
  destination_iata text,
  departing_at_local text,
  arriving_at_local text,
  origin_time_zone text,
  destination_time_zone text,
  marketing_carrier_name text,
  marketing_carrier_iata_code text,
  operating_carrier_name text,
  operating_carrier_iata_code text,
  marketing_flight_number text,
  duration_minutes integer,
  cabin text
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $read_flight_consumer_live_public_offer_projection_batch_v1$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Flight Consumer Live public-offer projection is service-role only';
  end if;
  if p_admission_id is null
    or p_admission_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_subject_sha256 !~ '^[0-9a-f]{64}$'
    or p_request_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Flight Consumer Live public-offer projection read is invalid';
  end if;
  return query
  select projection.id, projection.display_rank, projection.owner_name,
         projection.owner_iata_code, projection.currency,
         projection.base_amount_minor, projection.tax_amount_minor,
         projection.total_amount_minor, projection.offer_expires_at,
         projection.presentation_expires_at, projection.changeable,
         projection.refundable, projection.change_penalty_amount_minor,
         projection.refund_penalty_amount_minor, segment.segment_sequence,
         segment.slice_sequence, segment.journey_direction,
         segment.origin_iata, segment.destination_iata,
         segment.departing_at_local, segment.arriving_at_local,
         segment.origin_time_zone, segment.destination_time_zone,
         segment.marketing_carrier_name, segment.marketing_carrier_iata_code,
         segment.operating_carrier_name, segment.operating_carrier_iata_code,
         segment.marketing_flight_number, segment.duration_minutes,
         segment.cabin
    from public.flight_consumer_live_public_offer_projection_batches as batch
    join public.flight_consumer_live_duffel_shopping_attempts as attempt
      on attempt.id = batch.source_shopping_attempt_id
     and attempt.attempt_state = 'succeeded'
     and attempt.attempt_revision = 2
     and attempt.terminal_response_sha256 = batch.source_response_sha256
    join public.flight_consumer_live_public_offer_projections as projection
      on projection.batch_id = batch.id
    join public.flight_consumer_live_public_offer_segments as segment
      on segment.projection_id = projection.id
   where batch.admission_id = p_admission_id
     and batch.admission_receipt_sha256 = p_admission_receipt_sha256
     and batch.subject_sha256 = p_subject_sha256
     and batch.request_sha256 = p_request_sha256
     and projection.presentation_expires_at > clock_timestamp() + interval '2 minutes'
     and projection.offer_expires_at > clock_timestamp() + interval '2 minutes'
   order by projection.display_rank, segment.segment_sequence;
end;
$read_flight_consumer_live_public_offer_projection_batch_v1$;

alter function public.refuse_flight_consumer_live_public_offer_projection_mutation_v1()
  owner to postgres;
alter function public.canonical_flight_consumer_public_offer_json_v1(jsonb)
  owner to postgres;
alter function public.get_flight_consumer_live_public_offer_projection_batch_v1(
  uuid, text, text, text, text
) owner to postgres;
alter function public.complete_flight_consumer_live_public_offer_projection_batch_v1(
  uuid, text, text, text, text, text, text, text, text, jsonb, uuid, text,
  text, text, text, timestamptz, integer, jsonb, jsonb
) owner to postgres;
alter function public.list_flight_consumer_live_duffel_pending_offer_sources_v1(
  uuid, text, text
) owner to postgres;
alter function public.read_flight_consumer_live_public_offer_projection_batch_v1(
  uuid, text, text, text
) owner to postgres;

revoke all on function public.refuse_flight_consumer_live_public_offer_projection_mutation_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.canonical_flight_consumer_public_offer_json_v1(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.get_flight_consumer_live_public_offer_projection_batch_v1(
  uuid, text, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.complete_flight_consumer_live_public_offer_projection_batch_v1(
  uuid, text, text, text, text, text, text, text, text, jsonb, uuid, text,
  text, text, text, timestamptz, integer, jsonb, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.list_flight_consumer_live_duffel_pending_offer_sources_v1(
  uuid, text, text
) from public, anon, authenticated, service_role;
revoke all on function public.read_flight_consumer_live_public_offer_projection_batch_v1(
  uuid, text, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.get_flight_consumer_live_public_offer_projection_batch_v1(
  uuid, text, text, text, text
) to service_role;
grant execute on function public.complete_flight_consumer_live_public_offer_projection_batch_v1(
  uuid, text, text, text, text, text, text, text, text, jsonb, uuid, text,
  text, text, text, timestamptz, integer, jsonb, jsonb
) to service_role;
grant execute on function public.list_flight_consumer_live_duffel_pending_offer_sources_v1(
  uuid, text, text
) to service_role;
grant execute on function public.read_flight_consumer_live_public_offer_projection_batch_v1(
  uuid, text, text, text
) to service_role;

comment on table public.flight_consumer_live_public_offer_reference_vaults is
  'Encrypted Duffel offer-reference mapping only. No decrypt, dispatch, order, payment, ticket, servicing, or public exposure authority.';
comment on function public.list_flight_consumer_live_duffel_pending_offer_sources_v1(
  uuid, text, text
) is
  'Lists the complete digest-only Gate 105 source set for one exact still-dispatching Gate 101 response; never returns provider references.';
comment on function public.complete_flight_consumer_live_public_offer_projection_batch_v1(
  uuid, text, text, text, text, text, text, text, text, jsonb, uuid, text,
  text, text, text, timestamptz, integer, jsonb, jsonb
) is
  'Atomically accounts for every 105 source, stores a safe projection plus encrypted mapping, and completes 101. It performs no provider or payment request.';
comment on function public.read_flight_consumer_live_public_offer_projection_batch_v1(
  uuid, text, text, text
) is
  'Service-role-only subject-bound safe projection read. It never returns provider references, ciphertext, source identities, or authority.';

commit;

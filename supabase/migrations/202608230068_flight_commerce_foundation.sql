begin;

-- Flight commerce records intentionally persist only operational identifiers,
-- cryptographic digests, encrypted provider references, and sanitized itinerary evidence.
-- Raw passenger PII, identity documents, payment-card data, credentials, provider
-- payloads, and arbitrary JSON belong outside these relations.

do $flight_digest_prerequisite$
begin
  if to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'Flight commerce requires the reviewed extensions.digest(bytea,text) SHA-256 prerequisite';
  end if;
end;
$flight_digest_prerequisite$;

create table public.flight_runtime_controls (
  control_key text primary key check (control_key = 'global'),
  execution_kill_switch_engaged boolean not null default true,
  synthetic_execution_enabled boolean not null default false,
  provider_sandbox_traffic_enabled boolean not null default false,
  provider_live_traffic_enabled boolean not null default false,
  shopping_enabled boolean not null default false,
  order_enabled boolean not null default false,
  payment_enabled boolean not null default false,
  ticketing_enabled boolean not null default false,
  servicing_enabled boolean not null default false,
  provider_events_enabled boolean not null default false,
  production_release_enabled boolean not null default false,
  bound_environment text check (
    bound_environment is null or bound_environment in ('local', 'test', 'preview', 'production')
  ),
  bound_project_ref text check (
    bound_project_ref is null or bound_project_ref ~ '^[A-Za-z0-9_-]{3,64}$'
  ),
  bound_database_name text check (
    bound_database_name is null or bound_database_name ~ '^[A-Za-z0-9_-]{1,63}$'
  ),
  bound_session_user text check (
    bound_session_user is null or bound_session_user ~ '^[A-Za-z_][A-Za-z0-9_-]{0,62}$'
  ),
  bound_provider_code text check (
    bound_provider_code is null or bound_provider_code ~ '^[a-z][a-z0-9_]{1,31}$'
  ),
  bound_provider_account_sha256 text check (
    bound_provider_account_sha256 is null
    or bound_provider_account_sha256 ~ '^[0-9a-f]{64}$'
  ),
  bound_point_of_sale text check (
    bound_point_of_sale is null or bound_point_of_sale ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
  ),
  bound_content_scope_sha256 text check (
    bound_content_scope_sha256 is null
    or bound_content_scope_sha256 ~ '^[0-9a-f]{64}$'
  ),
  bound_adapter_version_sha256 text check (
    bound_adapter_version_sha256 is null
    or bound_adapter_version_sha256 ~ '^[0-9a-f]{64}$'
  ),
  bound_payment_processor_code text check (
    bound_payment_processor_code is null
    or bound_payment_processor_code ~ '^[a-z][a-z0-9_]{1,31}$'
  ),
  bound_payment_account_sha256 text check (
    bound_payment_account_sha256 is null
    or bound_payment_account_sha256 ~ '^[0-9a-f]{64}$'
  ),
  bound_payment_environment text check (
    bound_payment_environment is null or bound_payment_environment in ('test', 'live')
  ),
  bound_payment_source_sha256 text check (
    bound_payment_source_sha256 is null
    or bound_payment_source_sha256 ~ '^[0-9a-f]{64}$'
  ),
  bound_payment_adapter_version_sha256 text check (
    bound_payment_adapter_version_sha256 is null
    or bound_payment_adapter_version_sha256 ~ '^[0-9a-f]{64}$'
  ),
  bound_execution_scope_sha256 text check (
    bound_execution_scope_sha256 is null
    or bound_execution_scope_sha256 ~ '^[0-9a-f]{64}$'
  ),
  activation_evidence_sha256 text check (
    activation_evidence_sha256 is null
    or activation_evidence_sha256 ~ '^[0-9a-f]{64}$'
  ),
  updated_by uuid references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  constraint flight_runtime_controls_dependency_check check (
    (synthetic_execution_enabled::integer
      + provider_sandbox_traffic_enabled::integer
      + provider_live_traffic_enabled::integer) <= 1
    and
    (not provider_live_traffic_enabled or production_release_enabled)
    and (not production_release_enabled or bound_environment = 'production')
    and (not synthetic_execution_enabled or bound_environment in ('local', 'test'))
    and (not provider_sandbox_traffic_enabled or bound_environment in ('test', 'preview'))
    and (not shopping_enabled or (
      synthetic_execution_enabled or provider_sandbox_traffic_enabled or provider_live_traffic_enabled
    ))
    and (not order_enabled or shopping_enabled)
    and (not order_enabled or provider_sandbox_traffic_enabled or provider_live_traffic_enabled)
    and (not payment_enabled or order_enabled)
    and (not ticketing_enabled or (order_enabled and payment_enabled))
    and (not servicing_enabled or ticketing_enabled)
    and (not provider_events_enabled or shopping_enabled)
    and (
      not (provider_sandbox_traffic_enabled or provider_live_traffic_enabled)
      or (
        bound_provider_code is not null
        and bound_provider_account_sha256 is not null
        and bound_point_of_sale is not null
        and bound_content_scope_sha256 is not null
        and bound_adapter_version_sha256 is not null
      )
    )
    and (
      not payment_enabled
      or (
        bound_payment_processor_code is not null
        and bound_payment_account_sha256 is not null
        and bound_payment_environment is not null
        and bound_payment_source_sha256 is not null
        and bound_payment_adapter_version_sha256 is not null
        and (
          (provider_sandbox_traffic_enabled and bound_payment_environment = 'test')
          or (provider_live_traffic_enabled and bound_payment_environment = 'live')
        )
      )
    )
    and (
      not (
        not execution_kill_switch_engaged
        or synthetic_execution_enabled
        or provider_sandbox_traffic_enabled
        or provider_live_traffic_enabled
        or shopping_enabled
        or order_enabled
        or payment_enabled
        or ticketing_enabled
        or servicing_enabled
        or provider_events_enabled
        or production_release_enabled
      )
      or (
        activation_evidence_sha256 is not null
        and bound_environment is not null
        and bound_project_ref is not null
        and bound_database_name is not null
        and bound_session_user is not null
        and bound_execution_scope_sha256 is not null
        and updated_by is not null
      )
    )
  )
);

insert into public.flight_runtime_controls (control_key)
values ('global');

create table public.flight_runtime_control_receipts (
  id uuid primary key default gen_random_uuid(),
  control_key text not null check (control_key = 'global'),
  changed_by uuid not null references public.profiles(id) on delete restrict,
  changed_at timestamptz not null,
  previous_activation_evidence_sha256 text check (
    previous_activation_evidence_sha256 is null
    or previous_activation_evidence_sha256 ~ '^[0-9a-f]{64}$'
  ),
  activation_evidence_sha256 text not null check (
    activation_evidence_sha256 ~ '^[0-9a-f]{64}$'
  ),
  execution_kill_switch_engaged boolean not null,
  synthetic_execution_enabled boolean not null,
  provider_sandbox_traffic_enabled boolean not null,
  provider_live_traffic_enabled boolean not null,
  shopping_enabled boolean not null,
  order_enabled boolean not null,
  payment_enabled boolean not null,
  ticketing_enabled boolean not null,
  servicing_enabled boolean not null,
  provider_events_enabled boolean not null,
  production_release_enabled boolean not null,
  bound_environment text,
  bound_project_ref text,
  bound_database_name text,
  bound_session_user text,
  bound_provider_code text,
  bound_provider_account_sha256 text,
  bound_point_of_sale text,
  bound_content_scope_sha256 text,
  bound_adapter_version_sha256 text,
  bound_payment_processor_code text,
  bound_payment_account_sha256 text,
  bound_payment_environment text,
  bound_payment_source_sha256 text,
  bound_payment_adapter_version_sha256 text,
  bound_execution_scope_sha256 text,
  unique (control_key, activation_evidence_sha256)
);

create table public.flight_searches (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  request_fingerprint_sha256 text not null check (request_fingerprint_sha256 ~ '^[0-9a-f]{64}$'),
  execution_mode text not null default 'synthetic'
    check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  journey_type text not null check (journey_type in ('one_way', 'round_trip')),
  origin_iata text not null check (origin_iata ~ '^[A-Z]{3}$'),
  destination_iata text not null check (destination_iata ~ '^[A-Z]{3}$'),
  departure_date date not null,
  return_date date,
  cabin text not null check (cabin in ('economy', 'premium_economy', 'business', 'first')),
  adult_count smallint not null check (adult_count between 1 and 9),
  child_count smallint not null default 0 check (child_count between 0 and 8),
  infant_in_seat_count smallint not null default 0 check (infant_in_seat_count between 0 and 8),
  infant_on_lap_count smallint not null default 0 check (infant_on_lap_count between 0 and 8),
  status text not null default 'created'
    check (status in ('created', 'searching', 'complete', 'failed', 'expired')),
  provider_request_sha256 text check (
    provider_request_sha256 is null or provider_request_sha256 ~ '^[0-9a-f]{64}$'
  ),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, customer_id),
  check (origin_iata <> destination_iata),
  check (
    (journey_type = 'one_way' and return_date is null)
    or (journey_type = 'round_trip' and return_date > departure_date)
  ),
  check (
    adult_count + child_count + infant_in_seat_count + infant_on_lap_count between 1 and 9
  ),
  check (infant_on_lap_count <= adult_count),
  check (expires_at > created_at)
);

create index flight_searches_customer_created_idx
  on public.flight_searches (customer_id, created_at desc);
create unique index flight_searches_active_fingerprint_uidx
  on public.flight_searches (
    execution_scope_sha256, execution_mode, customer_id, request_fingerprint_sha256
  )
  where status in ('created', 'searching');
create index flight_searches_status_expires_idx
  on public.flight_searches (status, expires_at);

create table public.flight_offers (
  id uuid primary key default gen_random_uuid(),
  search_id uuid not null references public.flight_searches(id) on delete restrict,
  provider_code text not null check (provider_code ~ '^[a-z][a-z0-9_]{1,31}$'),
  execution_mode text not null default 'synthetic'
    check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  provider_offer_ref_ciphertext text,
  provider_offer_ref_sha256 text not null check (provider_offer_ref_sha256 ~ '^[0-9a-f]{64}$'),
  provider_payload_sha256 text not null check (provider_payload_sha256 ~ '^[0-9a-f]{64}$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  base_fare_cents bigint not null check (base_fare_cents >= 0),
  tax_cents bigint not null check (tax_cents >= 0),
  fee_cents bigint not null default 0 check (fee_cents >= 0),
  total_cents bigint not null check (total_cents >= 0),
  validating_carrier text not null check (validating_carrier ~ '^[A-Z0-9]{2,3}$'),
  segment_count smallint not null check (segment_count between 1 and 16),
  itinerary_sha256 text not null check (itinerary_sha256 ~ '^[0-9a-f]{64}$'),
  fare_rules_sha256 text not null check (fare_rules_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'offered'
    check (status in ('offered', 'expired', 'replaced')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (execution_scope_sha256, execution_mode, provider_code, provider_offer_ref_sha256),
  unique (id, search_id),
  check (total_cents = base_fare_cents + tax_cents + fee_cents),
  check (execution_mode <> 'synthetic' or provider_code = 'synthetic'),
  check (
    (execution_mode = 'synthetic' and provider_offer_ref_ciphertext is null)
    or (
      execution_mode in ('test', 'live')
      and provider_offer_ref_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,8176}$'
    )
  ),
  check (expires_at > created_at)
);

create index flight_offers_search_status_idx
  on public.flight_offers (search_id, status, total_cents);
create index flight_offers_expiry_idx
  on public.flight_offers (expires_at) where status = 'offered';

create table public.flight_offer_segments (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.flight_offers(id) on delete restrict,
  execution_mode text not null check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  segment_sequence smallint not null check (segment_sequence between 1 and 16),
  journey_direction text not null check (journey_direction in ('outbound', 'return')),
  origin_iata text not null check (origin_iata ~ '^[A-Z]{3}$'),
  destination_iata text not null check (destination_iata ~ '^[A-Z]{3}$'),
  marketing_carrier text not null check (marketing_carrier ~ '^[A-Z0-9]{2,3}$'),
  operating_carrier text not null check (operating_carrier ~ '^[A-Z0-9]{2,3}$'),
  marketing_flight_number text not null check (marketing_flight_number ~ '^[0-9]{1,4}[A-Z]?$'),
  departure_at timestamptz not null,
  arrival_at timestamptz not null,
  departure_local_date date not null,
  arrival_local_date date not null,
  cabin text not null check (cabin in ('economy', 'premium_economy', 'business', 'first')),
  booking_class text check (booking_class is null or booking_class ~ '^[A-Z0-9]{1,2}$'),
  duration_minutes integer not null check (duration_minutes between 1 and 2160),
  aircraft_code text check (aircraft_code is null or aircraft_code ~ '^[A-Z0-9]{2,4}$'),
  created_at timestamptz not null default now(),
  unique (offer_id, segment_sequence),
  check (origin_iata <> destination_iata),
  check (arrival_at > departure_at),
  check (date_trunc('minute', departure_at) = departure_at),
  check (date_trunc('minute', arrival_at) = arrival_at),
  check (arrival_at = departure_at + duration_minutes * interval '1 minute'),
  check (arrival_local_date >= departure_local_date),
  check (
    departure_local_date between
      (departure_at at time zone 'UTC')::date - 1
      and (departure_at at time zone 'UTC')::date + 1
  ),
  check (
    arrival_local_date between
      (arrival_at at time zone 'UTC')::date - 1
      and (arrival_at at time zone 'UTC')::date + 1
  )
);

create index flight_offer_segments_offer_sequence_idx
  on public.flight_offer_segments (offer_id, segment_sequence);

create table public.flight_offer_fare_terms (
  offer_id uuid primary key references public.flight_offers(id) on delete restrict,
  execution_mode text not null check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  refundable boolean not null,
  changeable boolean not null,
  change_fee_cents bigint check (change_fee_cents is null or change_fee_cents >= 0),
  cancellation_fee_cents bigint check (
    cancellation_fee_cents is null or cancellation_fee_cents >= 0
  ),
  checked_bag_pieces smallint not null default 0 check (checked_bag_pieces between 0 and 9),
  carry_on_pieces smallint not null default 0 check (carry_on_pieces between 0 and 9),
  checked_bag_weight_kg numeric(5,2) check (
    checked_bag_weight_kg is null or checked_bag_weight_kg between 0 and 99.99
  ),
  terms_summary_sha256 text not null check (terms_summary_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  check (changeable or change_fee_cents is null),
  check (refundable or cancellation_fee_cents is null)
);

create table public.flight_reprice_receipts (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.flight_offers(id) on delete restrict,
  execution_mode text not null default 'synthetic'
    check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  response_sha256 text not null check (response_sha256 ~ '^[0-9a-f]{64}$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  original_total_cents bigint not null check (original_total_cents >= 0),
  repriced_total_cents bigint check (repriced_total_cents is null or repriced_total_cents >= 0),
  status text not null check (status in ('confirmed', 'price_changed', 'unavailable', 'failed')),
  customer_accepted_at timestamptz,
  customer_accepted_by uuid references public.profiles(id) on delete restrict,
  customer_acceptance_sha256 text check (
    customer_acceptance_sha256 is null or customer_acceptance_sha256 ~ '^[0-9a-f]{64}$'
  ),
  customer_acceptance_version smallint check (
    customer_acceptance_version is null or customer_acceptance_version = 1
  ),
  customer_accepted_currency text check (
    customer_accepted_currency is null or customer_accepted_currency ~ '^[A-Z]{3}$'
  ),
  customer_accepted_total_cents bigint check (
    customer_accepted_total_cents is null or customer_accepted_total_cents >= 0
  ),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (offer_id, request_sha256),
  unique (id, offer_id),
  check (
    (status = 'confirmed' and repriced_total_cents is not null
      and repriced_total_cents = original_total_cents and customer_accepted_at is null)
    or (
      status = 'price_changed'
      and repriced_total_cents is not null
      and repriced_total_cents <> original_total_cents
    )
    or (status in ('unavailable', 'failed') and repriced_total_cents is null and customer_accepted_at is null)
  ),
  check (
    (customer_accepted_at is null and customer_accepted_by is null
      and customer_acceptance_sha256 is null and customer_acceptance_version is null
      and customer_accepted_currency is null
      and customer_accepted_total_cents is null)
    or (customer_accepted_at is not null and customer_accepted_by is not null
      and customer_acceptance_sha256 is not null and customer_acceptance_version = 1
      and customer_accepted_currency = currency
      and customer_accepted_total_cents = repriced_total_cents)
  ),
  check (customer_accepted_at is null or customer_accepted_at >= created_at),
  check (customer_accepted_at is null or customer_accepted_at < expires_at),
  check (expires_at > created_at)
);

create index flight_reprice_receipts_offer_created_idx
  on public.flight_reprice_receipts (offer_id, created_at desc);

create table public.flight_orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  search_id uuid not null,
  offer_id uuid not null,
  reprice_receipt_id uuid not null,
  confirmation_code text not null check (confirmation_code ~ '^FLT-[A-Z0-9]{12}$'),
  execution_mode text not null default 'synthetic'
    check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  provider_code text not null check (provider_code ~ '^[a-z][a-z0-9_]{1,31}$'),
  provider_order_ref_ciphertext text,
  provider_order_ref_sha256 text check (
    provider_order_ref_sha256 is null or provider_order_ref_sha256 ~ '^[0-9a-f]{64}$'
  ),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  total_cents bigint not null check (total_cents >= 0),
  status text not null default 'pending_payment' check (status in (
    'pending_payment', 'payment_authorized', 'order_creating', 'booked',
    'ticketing_pending', 'ticketed', 'servicing', 'cancellation_pending',
    'cancelled', 'refund_pending', 'refunded', 'failed', 'requires_review'
  )),
  provider_created_at timestamptz,
  ticketing_deadline_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, customer_id),
  unique (execution_scope_sha256, execution_mode, confirmation_code),
  unique (execution_scope_sha256, execution_mode, provider_code, provider_order_ref_sha256),
  foreign key (search_id, customer_id)
    references public.flight_searches(id, customer_id) on delete restrict,
  foreign key (offer_id, search_id)
    references public.flight_offers(id, search_id) on delete restrict,
  foreign key (reprice_receipt_id, offer_id)
    references public.flight_reprice_receipts(id, offer_id) on delete restrict,
  check (execution_mode <> 'synthetic' or provider_code = 'synthetic'),
  check (
    (provider_order_ref_ciphertext is null and provider_order_ref_sha256 is null)
    or (
      execution_mode <> 'synthetic'
      and provider_order_ref_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,8176}$'
      and provider_order_ref_sha256 is not null
    )
  ),
  check (
    (provider_order_ref_ciphertext is null and provider_created_at is null
      and ticketing_deadline_at is null)
    or (provider_order_ref_ciphertext is not null and provider_created_at is not null
      and ticketing_deadline_at > provider_created_at)
  ),
  check (
    status not in (
      'booked', 'ticketing_pending', 'ticketed', 'servicing',
      'cancellation_pending', 'refund_pending', 'refunded'
    )
    or provider_order_ref_ciphertext is not null
  )
);

create index flight_orders_customer_created_idx
  on public.flight_orders (customer_id, created_at desc);
create index flight_orders_status_updated_idx
  on public.flight_orders (status, updated_at desc);

create table public.flight_passenger_refs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.flight_orders(id) on delete restrict,
  execution_mode text not null default 'synthetic'
    check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  traveler_sequence smallint not null check (traveler_sequence between 1 and 9),
  traveler_type text not null check (
    traveler_type in ('adult', 'child', 'infant_in_seat', 'infant_on_lap')
  ),
  secure_pii_record_ref text not null check (
    secure_pii_record_ref ~ '^fp_[A-Za-z0-9_-]{16,200}$'
  ),
  pii_record_sha256 text not null check (pii_record_sha256 ~ '^[0-9a-f]{64}$'),
  provider_passenger_ref_ciphertext text,
  provider_passenger_ref_sha256 text check (
    provider_passenger_ref_sha256 is null or provider_passenger_ref_sha256 ~ '^[0-9a-f]{64}$'
  ),
  retention_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (order_id, traveler_sequence),
  unique (id, order_id),
  unique (execution_scope_sha256, execution_mode, secure_pii_record_ref),
  unique (execution_scope_sha256, execution_mode, provider_passenger_ref_sha256),
  check (
    (provider_passenger_ref_ciphertext is null and provider_passenger_ref_sha256 is null)
    or (
      provider_passenger_ref_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$'
      and provider_passenger_ref_sha256 is not null
    )
  ),
  check (retention_expires_at > created_at)
);

create table public.flight_ticket_documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.flight_orders(id) on delete restrict,
  passenger_ref_id uuid not null,
  execution_mode text not null default 'synthetic'
    check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  document_type text not null check (document_type in ('electronic_ticket', 'emd')),
  document_ref_ciphertext text,
  document_ref_sha256 text check (
    document_ref_sha256 is null or document_ref_sha256 ~ '^[0-9a-f]{64}$'
  ),
  issuing_carrier text not null check (issuing_carrier ~ '^[A-Z0-9]{2,3}$'),
  status text not null default 'pending'
    check (status in ('pending', 'issued', 'voided', 'refunded', 'failed')),
  issued_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (passenger_ref_id, order_id)
    references public.flight_passenger_refs(id, order_id) on delete restrict,
  unique (execution_scope_sha256, execution_mode, document_ref_sha256),
  check (
    (status in ('pending', 'failed')
      and document_ref_ciphertext is null and document_ref_sha256 is null)
    or (
      status in ('issued', 'voided', 'refunded')
      and document_ref_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$'
      and document_ref_sha256 is not null
    )
  ),
  check (
    (status in ('pending', 'failed') and issued_at is null and voided_at is null)
    or (status = 'issued' and issued_at is not null and voided_at is null)
    or (status = 'voided' and issued_at is not null and voided_at is not null)
    or (status = 'refunded' and issued_at is not null)
  ),
  check (voided_at is null or (issued_at is not null and voided_at >= issued_at))
);

create index flight_ticket_documents_order_status_idx
  on public.flight_ticket_documents (order_id, status);
create unique index flight_ticket_documents_one_active_eticket_uidx
  on public.flight_ticket_documents (order_id, passenger_ref_id)
  where document_type = 'electronic_ticket' and status in ('pending', 'issued');

create table public.flight_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.flight_orders(id) on delete restrict,
  execution_mode text not null default 'synthetic'
    check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  processor_code text not null check (processor_code ~ '^[a-z][a-z0-9_]{1,31}$'),
  processor_reference_ciphertext text not null
    check (processor_reference_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$'),
  processor_reference_sha256 text not null
    check (processor_reference_sha256 ~ '^[0-9a-f]{64}$'),
  idempotency_key_sha256 text not null
    check (idempotency_key_sha256 ~ '^[0-9a-f]{64}$'),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  authorized_cents bigint not null default 0 check (authorized_cents >= 0),
  captured_cents bigint not null default 0 check (captured_cents >= 0),
  refunded_cents bigint not null default 0 check (refunded_cents >= 0),
  status text not null check (status in (
    'requires_payment_method', 'requires_action', 'authorized', 'captured',
    'refund_pending', 'partially_refunded', 'refunded', 'cancelled', 'failed', 'ambiguous'
  )),
  authorized_at timestamptz,
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (execution_mode <> 'synthetic' or processor_code = 'synthetic'),
  unique (execution_scope_sha256, execution_mode, processor_code, processor_reference_sha256),
  unique (execution_scope_sha256, execution_mode, idempotency_key_sha256),
  check (captured_cents <= authorized_cents),
  check (refunded_cents <= captured_cents),
  check ((authorized_cents > 0) = (authorized_at is not null)),
  check ((captured_cents > 0) = (captured_at is not null)),
  check (authorized_at is null or authorized_at >= created_at),
  check (captured_at is null or (authorized_at is not null and captured_at >= authorized_at)),
  check (
    status not in ('authorized', 'captured', 'refund_pending', 'partially_refunded', 'refunded')
    or authorized_cents > 0
  ),
  check (status <> 'authorized' or (captured_cents = 0 and refunded_cents = 0)),
  check (status <> 'captured' or (captured_cents = authorized_cents and refunded_cents = 0)),
  check (status <> 'cancelled' or (captured_cents = 0 and refunded_cents = 0)),
  check (
    status <> 'failed'
    or (authorized_cents = 0 and captured_cents = 0 and refunded_cents = 0)
  ),
  check (
    status <> 'refund_pending'
    or (captured_cents = authorized_cents and refunded_cents < captured_cents)
  ),
  check (
    status <> 'partially_refunded'
    or (captured_cents = authorized_cents and refunded_cents between 1 and captured_cents - 1)
  ),
  check (status <> 'refunded' or (captured_cents = authorized_cents and refunded_cents = captured_cents))
);

create index flight_payments_order_status_idx
  on public.flight_payments (order_id, status, updated_at desc);
-- Failed attempts may be retried with a new processor identity. Cancelled means
-- an authorization was deliberately voided and the order/payment path is terminal.
create unique index flight_payments_one_nonfailed_attempt_uidx
  on public.flight_payments (order_id)
  where status <> 'failed';

create table public.flight_service_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.flight_orders(id) on delete restrict,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  execution_mode text not null default 'synthetic'
    check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  request_type text not null check (request_type in (
    'cancel', 'change', 'refund', 'schedule_change', 'name_correction', 'document_reissue'
  )),
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  secure_request_ref text check (
    secure_request_ref is null or secure_request_ref ~ '^fs_[A-Za-z0-9_-]{16,200}$'
  ),
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'requested' check (status in (
    'requested', 'quoted', 'accepted', 'processing', 'completed', 'declined',
    'failed', 'requires_review'
  )),
  provider_case_ref_ciphertext text,
  provider_case_ref_sha256 text check (
    provider_case_ref_sha256 is null or provider_case_ref_sha256 ~ '^[0-9a-f]{64}$'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, request_sha256),
  check (
    (provider_case_ref_ciphertext is null and provider_case_ref_sha256 is null)
    or (
      provider_case_ref_ciphertext ~ '^enc:v[1-9][0-9]*:[A-Za-z0-9_-]{16,4080}$'
      and provider_case_ref_sha256 is not null
    )
  )
);

create index flight_service_requests_order_status_idx
  on public.flight_service_requests (order_id, status, created_at desc);

create table public.flight_provider_events (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null check (provider_code ~ '^[a-z][a-z0-9_]{1,31}$'),
  execution_mode text not null default 'synthetic'
    check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  provider_event_id_sha256 text not null check (provider_event_id_sha256 ~ '^[0-9a-f]{64}$'),
  event_type text not null check (event_type in (
    'order_created', 'order_updated', 'ticket_issued', 'ticket_voided',
    'schedule_changed', 'service_updated', 'unknown'
  )),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  signature_verified boolean not null default false,
  order_id uuid references public.flight_orders(id) on delete restrict,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'verified', 'processed', 'duplicate', 'blocked', 'failed')),
  occurred_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (execution_scope_sha256, execution_mode, provider_code, provider_event_id_sha256),
  check (execution_mode <> 'synthetic' or provider_code = 'synthetic'),
  check (
    processing_status not in ('verified', 'processed') or signature_verified
  ),
  check ((processing_status = 'processed') = (processed_at is not null)),
  check (processed_at is null or processed_at >= received_at)
);

create index flight_provider_events_processing_idx
  on public.flight_provider_events (processing_status, received_at);
create index flight_provider_events_order_idx
  on public.flight_provider_events (order_id, occurred_at desc) where order_id is not null;

create table public.flight_idempotency_records (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('search', 'reprice', 'order', 'payment', 'ticket', 'service', 'webhook')),
  execution_mode text not null default 'synthetic'
    check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  key_sha256 text not null check (key_sha256 ~ '^[0-9a-f]{64}$'),
  request_sha256 text not null check (request_sha256 ~ '^[0-9a-f]{64}$'),
  response_sha256 text check (response_sha256 is null or response_sha256 ~ '^[0-9a-f]{64}$'),
  resource_type text check (
    resource_type is null or resource_type in (
      'flight_search', 'flight_offer', 'flight_reprice_receipt', 'flight_order',
      'flight_payment', 'flight_ticket_document', 'flight_service_request', 'flight_provider_event'
    )
  ),
  resource_id uuid,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'succeeded', 'failed', 'ambiguous')),
  locked_until timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (execution_scope_sha256, execution_mode, scope, key_sha256),
  check ((resource_type is null) = (resource_id is null)),
  check (
    (status = 'in_progress' and response_sha256 is null and resource_id is null)
    or (status = 'succeeded' and response_sha256 is not null and resource_id is not null)
    or (status in ('failed', 'ambiguous') and response_sha256 is not null)
  ),
  check (locked_until > created_at)
);

create index flight_idempotency_records_lock_idx
  on public.flight_idempotency_records (status, locked_until);

create table public.flight_reconciliation_cases (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.flight_orders(id) on delete restrict,
  provider_code text not null check (provider_code ~ '^[a-z][a-z0-9_]{1,31}$'),
  execution_mode text not null default 'synthetic'
    check (execution_mode in ('synthetic', 'test', 'live')),
  execution_scope_sha256 text not null check (execution_scope_sha256 ~ '^[0-9a-f]{64}$'),
  case_type text not null check (case_type in (
    'ambiguous_order', 'payment_order_mismatch', 'ticket_mismatch',
    'provider_event_gap', 'refund_mismatch', 'servicing_mismatch'
  )),
  subject_type text not null check (subject_type in (
    'flight_order', 'flight_payment', 'flight_ticket_document',
    'flight_service_request', 'flight_provider_event'
  )),
  subject_id uuid not null,
  source_status text not null check (source_status ~ '^[a-z][a-z0-9_]{1,63}$'),
  source_revision_at timestamptz not null,
  expected_state_sha256 text not null check (expected_state_sha256 ~ '^[0-9a-f]{64}$'),
  observed_state_sha256 text not null check (observed_state_sha256 ~ '^[0-9a-f]{64}$'),
  target_status text not null check (target_status ~ '^[a-z][a-z0-9_]{1,63}$'),
  target_authorized_cents bigint check (
    target_authorized_cents is null or target_authorized_cents >= 0
  ),
  target_captured_cents bigint check (
    target_captured_cents is null or target_captured_cents >= 0
  ),
  target_refunded_cents bigint check (
    target_refunded_cents is null or target_refunded_cents >= 0
  ),
  target_state_sha256 text not null check (target_state_sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'open'
    check (status in ('open', 'investigating', 'blocked', 'resolved')),
  resolution_code text check (
    resolution_code is null or resolution_code in (
      'local_state_corrected', 'provider_state_confirmed', 'payment_reversed',
      'ticket_reissued', 'duplicate_suppressed', 'manual_followup_required'
    )
  ),
  resolution_evidence_sha256 text check (
    resolution_evidence_sha256 is null or resolution_evidence_sha256 ~ '^[0-9a-f]{64}$'
  ),
  resolved_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  check (
    (subject_type = 'flight_payment'
      and target_authorized_cents is not null
      and target_captured_cents is not null
      and target_refunded_cents is not null)
    or (subject_type <> 'flight_payment'
      and target_authorized_cents is null
      and target_captured_cents is null
      and target_refunded_cents is null)
  ),
  check (
    (status = 'resolved' and resolution_code is not null and resolution_evidence_sha256 is not null
      and resolved_by is not null and resolved_at is not null)
    or (status <> 'resolved' and resolution_code is null and resolution_evidence_sha256 is null
      and resolved_by is null and resolved_at is null)
  )
);

create index flight_reconciliation_cases_status_idx
  on public.flight_reconciliation_cases (status, created_at);
create index flight_reconciliation_cases_order_idx
  on public.flight_reconciliation_cases (order_id, created_at desc) where order_id is not null;

create or replace function public.protect_flight_runtime_controls()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_binding_changed boolean;
begin
  if new.control_key is distinct from old.control_key then
    raise exception 'Flight runtime control identity is immutable';
  end if;
  if new.updated_by is null or not exists (
    select 1 from public.profiles
     where id = new.updated_by
       and role = 'admin'
  ) then
    raise exception 'A platform administrator must authorize flight runtime control changes';
  end if;
  if auth.uid() is null or new.updated_by <> auth.uid() then
    raise exception 'Flight runtime control actor must match the authenticated administrator';
  end if;
  if new.activation_evidence_sha256 is null
    or new.activation_evidence_sha256 is not distinct from old.activation_evidence_sha256 then
    raise exception 'Fresh flight activation evidence is required for every runtime control change';
  end if;
  v_binding_changed :=
    new.bound_environment is distinct from old.bound_environment
    or new.bound_project_ref is distinct from old.bound_project_ref
    or new.bound_database_name is distinct from old.bound_database_name
    or new.bound_session_user is distinct from old.bound_session_user
    or new.bound_provider_code is distinct from old.bound_provider_code
    or new.bound_provider_account_sha256 is distinct from old.bound_provider_account_sha256
    or new.bound_point_of_sale is distinct from old.bound_point_of_sale
    or new.bound_content_scope_sha256 is distinct from old.bound_content_scope_sha256
    or new.bound_adapter_version_sha256 is distinct from old.bound_adapter_version_sha256
    or new.bound_payment_processor_code is distinct from old.bound_payment_processor_code
    or new.bound_payment_account_sha256 is distinct from old.bound_payment_account_sha256
    or new.bound_payment_environment is distinct from old.bound_payment_environment
    or new.bound_payment_source_sha256 is distinct from old.bound_payment_source_sha256
    or new.bound_payment_adapter_version_sha256
      is distinct from old.bound_payment_adapter_version_sha256;
  if v_binding_changed
    = (new.bound_execution_scope_sha256 is not distinct from old.bound_execution_scope_sha256) then
    raise exception 'Flight execution scope must change if and only if a bound identity changes';
  end if;
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$$;

create or replace function public.record_flight_runtime_control_receipt()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.flight_runtime_control_receipts (
    control_key, changed_by, changed_at, previous_activation_evidence_sha256,
    activation_evidence_sha256, execution_kill_switch_engaged,
    synthetic_execution_enabled, provider_sandbox_traffic_enabled,
    provider_live_traffic_enabled, shopping_enabled, order_enabled,
    payment_enabled, ticketing_enabled, servicing_enabled,
    provider_events_enabled, production_release_enabled, bound_environment,
    bound_project_ref, bound_database_name, bound_session_user,
    bound_provider_code, bound_provider_account_sha256, bound_point_of_sale,
    bound_content_scope_sha256, bound_adapter_version_sha256,
    bound_payment_processor_code, bound_payment_account_sha256,
    bound_payment_environment, bound_payment_source_sha256,
    bound_payment_adapter_version_sha256, bound_execution_scope_sha256
  ) values (
    new.control_key, new.updated_by, new.updated_at, old.activation_evidence_sha256,
    new.activation_evidence_sha256, new.execution_kill_switch_engaged,
    new.synthetic_execution_enabled, new.provider_sandbox_traffic_enabled,
    new.provider_live_traffic_enabled, new.shopping_enabled, new.order_enabled,
    new.payment_enabled, new.ticketing_enabled, new.servicing_enabled,
    new.provider_events_enabled, new.production_release_enabled, new.bound_environment,
    new.bound_project_ref, new.bound_database_name, new.bound_session_user,
    new.bound_provider_code, new.bound_provider_account_sha256, new.bound_point_of_sale,
    new.bound_content_scope_sha256, new.bound_adapter_version_sha256,
    new.bound_payment_processor_code, new.bound_payment_account_sha256,
    new.bound_payment_environment, new.bound_payment_source_sha256,
    new.bound_payment_adapter_version_sha256, new.bound_execution_scope_sha256
  );
  return new;
end;
$$;

create trigger flight_runtime_controls_authority_guard
before update on public.flight_runtime_controls
for each row execute function public.protect_flight_runtime_controls();

create trigger flight_runtime_controls_receipt_guard
after update on public.flight_runtime_controls
for each row execute function public.record_flight_runtime_control_receipt();

create or replace function public.flight_runtime_capability_enabled(
  p_execution_mode text,
  p_capability text,
  p_provider_code text default null,
  p_processor_code text default null,
  p_execution_scope_sha256 text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_control public.flight_runtime_controls;
  v_session_environment text := current_setting('app.flight_environment', true);
  v_session_project_ref text := current_setting('app.flight_project_ref', true);
  v_session_authorized text := current_setting('app.flight_execution_authorized', true);
  v_session_evidence text := current_setting('app.flight_activation_evidence_sha256', true);
begin
  if p_capability not in ('shopping', 'order', 'payment', 'ticketing', 'servicing', 'provider_event') then
    return false;
  end if;
  if p_execution_mode not in ('synthetic', 'test', 'live') then
    return false;
  end if;

  select * into v_control
    from public.flight_runtime_controls
   where control_key = 'global';
  if not found
    or v_control.execution_kill_switch_engaged
    or v_control.activation_evidence_sha256 is null
    or v_control.bound_environment is null
    or v_control.bound_project_ref is null
    or v_control.bound_database_name is null
    or v_control.bound_session_user is null
    or v_control.bound_execution_scope_sha256 is null
    or p_execution_scope_sha256 is distinct from v_control.bound_execution_scope_sha256
    or v_control.updated_by is null
    or not exists (
      select 1 from public.profiles
       where id = v_control.updated_by
         and role = 'admin'
    )
    or not exists (
      select 1 from public.flight_runtime_control_receipts as receipt
       where receipt.control_key = v_control.control_key
         and receipt.changed_by = v_control.updated_by
         and receipt.changed_at = v_control.updated_at
         and receipt.activation_evidence_sha256 = v_control.activation_evidence_sha256
         and receipt.execution_kill_switch_engaged
           = v_control.execution_kill_switch_engaged
         and receipt.synthetic_execution_enabled = v_control.synthetic_execution_enabled
         and receipt.provider_sandbox_traffic_enabled
           = v_control.provider_sandbox_traffic_enabled
         and receipt.provider_live_traffic_enabled = v_control.provider_live_traffic_enabled
         and receipt.shopping_enabled = v_control.shopping_enabled
         and receipt.order_enabled = v_control.order_enabled
         and receipt.payment_enabled = v_control.payment_enabled
         and receipt.ticketing_enabled = v_control.ticketing_enabled
         and receipt.servicing_enabled = v_control.servicing_enabled
         and receipt.provider_events_enabled = v_control.provider_events_enabled
         and receipt.production_release_enabled = v_control.production_release_enabled
         and receipt.bound_environment is not distinct from v_control.bound_environment
         and receipt.bound_project_ref is not distinct from v_control.bound_project_ref
         and receipt.bound_database_name is not distinct from v_control.bound_database_name
         and receipt.bound_session_user is not distinct from v_control.bound_session_user
         and receipt.bound_provider_code is not distinct from v_control.bound_provider_code
         and receipt.bound_provider_account_sha256
           is not distinct from v_control.bound_provider_account_sha256
         and receipt.bound_point_of_sale is not distinct from v_control.bound_point_of_sale
         and receipt.bound_content_scope_sha256
           is not distinct from v_control.bound_content_scope_sha256
         and receipt.bound_adapter_version_sha256
           is not distinct from v_control.bound_adapter_version_sha256
         and receipt.bound_payment_processor_code
           is not distinct from v_control.bound_payment_processor_code
         and receipt.bound_payment_account_sha256
           is not distinct from v_control.bound_payment_account_sha256
         and receipt.bound_payment_environment
           is not distinct from v_control.bound_payment_environment
         and receipt.bound_payment_source_sha256
           is not distinct from v_control.bound_payment_source_sha256
         and receipt.bound_payment_adapter_version_sha256
           is not distinct from v_control.bound_payment_adapter_version_sha256
         and receipt.bound_execution_scope_sha256
           is not distinct from v_control.bound_execution_scope_sha256
    )
    or v_session_authorized is distinct from 'true'
    or v_session_environment is distinct from v_control.bound_environment
    or v_session_project_ref is distinct from v_control.bound_project_ref
    or v_session_evidence is distinct from v_control.activation_evidence_sha256
    or current_database()::text is distinct from v_control.bound_database_name
    or session_user::text is distinct from v_control.bound_session_user then
    return false;
  end if;
  if p_execution_mode = 'synthetic' and not v_control.synthetic_execution_enabled then
    return false;
  end if;
  -- Synthetic fixtures are shopping-only. Orders, payments, tickets, and
  -- servicing require a bound sandbox or live provider execution identity.
  if p_execution_mode = 'synthetic' and p_capability <> 'shopping' then
    return false;
  end if;
  if p_execution_mode = 'synthetic'
    and p_provider_code is not null
    and p_provider_code <> 'synthetic' then
    return false;
  end if;
  if p_execution_mode = 'test'
    and not v_control.provider_sandbox_traffic_enabled then
    return false;
  end if;
  if p_execution_mode = 'live'
    and not (v_control.provider_live_traffic_enabled and v_control.production_release_enabled) then
    return false;
  end if;
  if p_execution_mode in ('test', 'live')
    and (
      v_control.bound_provider_code is null
      or v_control.bound_provider_account_sha256 is null
      or v_control.bound_point_of_sale is null
      or v_control.bound_content_scope_sha256 is null
      or v_control.bound_adapter_version_sha256 is null
      or (p_provider_code is not null and p_provider_code <> v_control.bound_provider_code)
    ) then
    return false;
  end if;
  if p_capability = 'payment'
    and (
      v_control.bound_payment_processor_code is null
      or v_control.bound_payment_account_sha256 is null
      or v_control.bound_payment_environment is distinct from p_execution_mode
      or v_control.bound_payment_source_sha256 is null
      or v_control.bound_payment_adapter_version_sha256 is null
      or (p_processor_code is not null
        and p_processor_code <> v_control.bound_payment_processor_code)
    ) then
    return false;
  end if;

  return case p_capability
    when 'shopping' then v_control.shopping_enabled
    when 'order' then v_control.order_enabled
    when 'payment' then v_control.payment_enabled
    when 'ticketing' then v_control.ticketing_enabled
    when 'servicing' then v_control.servicing_enabled
    when 'provider_event' then v_control.provider_events_enabled
    else false
  end;
end;
$$;

create or replace function public.enforce_flight_runtime_capability()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_execution_mode text := to_jsonb(new) ->> 'execution_mode';
  v_provider_code text := to_jsonb(new) ->> 'provider_code';
  v_processor_code text := to_jsonb(new) ->> 'processor_code';
  v_execution_scope_sha256 text := to_jsonb(new) ->> 'execution_scope_sha256';
begin
  if not public.flight_runtime_capability_enabled(
    v_execution_mode,
    tg_argv[0],
    v_provider_code,
    v_processor_code,
    v_execution_scope_sha256
  ) then
    raise exception 'Flight % capability is disabled for % execution', tg_argv[0], v_execution_mode;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_flight_order_runtime_capability()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_capability text;
begin
  v_capability := case new.status
    when 'pending_payment' then 'order'
    when 'payment_authorized' then 'payment'
    when 'order_creating' then 'order'
    when 'booked' then 'order'
    when 'ticketing_pending' then 'ticketing'
    when 'ticketed' then 'ticketing'
    when 'servicing' then 'servicing'
    when 'cancellation_pending' then 'servicing'
    when 'refund_pending' then 'servicing'
    when 'refunded' then 'servicing'
    when 'cancelled' then case
      when tg_op = 'UPDATE' and old.status = 'pending_payment' then 'order'
      when tg_op = 'UPDATE' and old.status = 'payment_authorized' then 'payment'
      else 'servicing'
    end
    when 'failed' then case
      when tg_op = 'UPDATE' and old.status in ('ticketing_pending', 'ticketed') then 'ticketing'
      when tg_op = 'UPDATE' and old.status = 'servicing' then 'servicing'
      else 'order'
    end
    when 'requires_review' then case
      when tg_op = 'UPDATE' and old.status in ('ticketing_pending', 'ticketed') then 'ticketing'
      when tg_op = 'UPDATE' and old.status = 'payment_authorized' then 'payment'
      when tg_op = 'UPDATE' and old.status in (
        'servicing', 'cancellation_pending', 'cancelled', 'refund_pending'
      ) then 'servicing'
      else 'order'
    end
    else null
  end;
  if v_capability is null
    or not public.flight_runtime_capability_enabled(
      new.execution_mode,
      v_capability,
      new.provider_code,
      null,
      new.execution_scope_sha256
    ) then
    raise exception 'Flight % capability is disabled for % order status %',
      coalesce(v_capability, 'unknown'), new.execution_mode, new.status;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_flight_evidence_runtime_capability()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_capability text;
  v_provider_code text;
begin
  if tg_table_name = 'flight_idempotency_records' then
    v_capability := case new.scope
      when 'search' then 'shopping'
      when 'reprice' then 'shopping'
      when 'order' then 'order'
      when 'payment' then 'payment'
      when 'ticket' then 'ticketing'
      when 'service' then 'servicing'
      when 'webhook' then 'provider_event'
      else null
    end;
  elsif tg_table_name = 'flight_reconciliation_cases' then
    v_provider_code := new.provider_code;
    v_capability := case new.case_type
      when 'ambiguous_order' then 'order'
      when 'payment_order_mismatch' then 'payment'
      when 'ticket_mismatch' then 'ticketing'
      when 'provider_event_gap' then 'provider_event'
      when 'refund_mismatch' then 'servicing'
      when 'servicing_mismatch' then 'servicing'
      else null
    end;
  end if;
  if v_capability is null
    or not public.flight_runtime_capability_enabled(
      new.execution_mode,
      v_capability,
      v_provider_code,
      null,
      new.execution_scope_sha256
    ) then
    raise exception 'Flight evidence capability is disabled for % execution', new.execution_mode;
  end if;
  return new;
end;
$$;

create or replace function public.lock_flight_order_parent()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order_id uuid := (to_jsonb(new) ->> 'order_id')::uuid;
begin
  if v_order_id is null then
    return new;
  end if;
  perform 1
    from public.flight_orders
   where id = v_order_id
   for update;
  if not found then
    raise exception 'Flight child mutation requires its locked parent order';
  end if;
  return new;
end;
$$;

create or replace function public.validate_flight_idempotency_resource()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_execution_mode text;
  v_execution_scope_sha256 text;
begin
  if new.resource_type is null and new.resource_id is null then
    return new;
  end if;
  if new.resource_type is distinct from (case new.scope
    when 'search' then 'flight_search'
    when 'reprice' then 'flight_reprice_receipt'
    when 'order' then 'flight_order'
    when 'payment' then 'flight_payment'
    when 'ticket' then 'flight_ticket_document'
    when 'service' then 'flight_service_request'
    when 'webhook' then 'flight_provider_event'
    else null
  end) then
    raise exception 'Flight idempotency scope does not match its resource type';
  end if;
  v_execution_mode := case new.resource_type
    when 'flight_search' then (select execution_mode from public.flight_searches where id = new.resource_id)
    when 'flight_offer' then (select execution_mode from public.flight_offers where id = new.resource_id)
    when 'flight_reprice_receipt' then (
      select execution_mode from public.flight_reprice_receipts where id = new.resource_id
    )
    when 'flight_order' then (select execution_mode from public.flight_orders where id = new.resource_id)
    when 'flight_payment' then (select execution_mode from public.flight_payments where id = new.resource_id)
    when 'flight_ticket_document' then (
      select execution_mode from public.flight_ticket_documents where id = new.resource_id
    )
    when 'flight_service_request' then (
      select execution_mode from public.flight_service_requests where id = new.resource_id
    )
    when 'flight_provider_event' then (
      select execution_mode from public.flight_provider_events where id = new.resource_id
    )
    else null
  end;
  v_execution_scope_sha256 := case new.resource_type
    when 'flight_search' then (
      select execution_scope_sha256 from public.flight_searches where id = new.resource_id
    )
    when 'flight_offer' then (
      select execution_scope_sha256 from public.flight_offers where id = new.resource_id
    )
    when 'flight_reprice_receipt' then (
      select execution_scope_sha256
        from public.flight_reprice_receipts where id = new.resource_id
    )
    when 'flight_order' then (
      select execution_scope_sha256 from public.flight_orders where id = new.resource_id
    )
    when 'flight_payment' then (
      select execution_scope_sha256 from public.flight_payments where id = new.resource_id
    )
    when 'flight_ticket_document' then (
      select execution_scope_sha256
        from public.flight_ticket_documents where id = new.resource_id
    )
    when 'flight_service_request' then (
      select execution_scope_sha256
        from public.flight_service_requests where id = new.resource_id
    )
    when 'flight_provider_event' then (
      select execution_scope_sha256
        from public.flight_provider_events where id = new.resource_id
    )
    else null
  end;
  if v_execution_mode is null
    or v_execution_mode <> new.execution_mode
    or v_execution_scope_sha256 <> new.execution_scope_sha256 then
    raise exception 'Flight idempotency resource does not match its execution scope';
  end if;
  return new;
end;
$$;

create or replace function public.validate_flight_order_chain()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_search public.flight_searches;
  v_offer public.flight_offers;
  v_receipt public.flight_reprice_receipts;
  v_segment_count bigint;
  v_first_sequence smallint;
  v_last_sequence smallint;
  v_first_origin text;
  v_last_destination text;
  v_outbound_count bigint;
  v_return_count bigint;
  v_outbound_first_sequence smallint;
  v_outbound_last_sequence smallint;
  v_return_first_sequence smallint;
  v_return_last_sequence smallint;
  v_outbound_first_origin text;
  v_outbound_last_destination text;
  v_return_first_origin text;
  v_return_last_destination text;
  v_outbound_departure_local_date date;
  v_return_departure_local_date date;
  v_outbound_departure_at timestamptz;
begin
  -- The parent order row serializes order-scoped mutations. Order creation also
  -- locks its immutable evidence chain in a fixed search -> offer -> reprice order.
  select * into v_search
    from public.flight_searches where id = new.search_id
    for share;
  select * into v_offer
    from public.flight_offers where id = new.offer_id
    for share;
  select * into v_receipt
    from public.flight_reprice_receipts where id = new.reprice_receipt_id
    for share;

  if v_search.id is null or v_offer.id is null or v_receipt.id is null then
    raise exception 'Complete flight search, offer, and reprice evidence is required';
  end if;
  if tg_op = 'UPDATE'
    and old.provider_order_ref_sha256 is not null
    and (
      new.provider_order_ref_sha256 is distinct from old.provider_order_ref_sha256
      or new.provider_order_ref_ciphertext is distinct from old.provider_order_ref_ciphertext
      or new.provider_created_at is distinct from old.provider_created_at
    ) then
    raise exception 'Flight provider order identity is immutable after binding';
  end if;
  if v_search.customer_id <> new.customer_id
    or v_offer.search_id <> new.search_id
    or v_receipt.offer_id <> new.offer_id then
    raise exception 'Flight order evidence chain does not match';
  end if;
  if v_search.execution_mode <> new.execution_mode
    or v_offer.execution_mode <> new.execution_mode
    or v_receipt.execution_mode <> new.execution_mode
    or v_search.execution_scope_sha256 <> new.execution_scope_sha256
    or v_offer.execution_scope_sha256 <> new.execution_scope_sha256
    or v_receipt.execution_scope_sha256 <> new.execution_scope_sha256 then
    raise exception 'Flight order execution scope does not match its evidence';
  end if;
  if v_offer.provider_code <> new.provider_code then
    raise exception 'Flight order provider does not match its offer';
  end if;
  if (tg_op = 'INSERT' or new.status in ('pending_payment', 'payment_authorized', 'order_creating'))
    and (
      v_offer.status <> 'offered'
      or v_offer.expires_at <= clock_timestamp()
      or v_receipt.expires_at <= clock_timestamp()
    ) then
    raise exception 'Flight offer or reprice evidence is expired';
  end if;
  if v_receipt.status = 'price_changed'
    and (
      v_receipt.customer_accepted_at is null
      or v_receipt.customer_accepted_by is null
      or v_receipt.customer_acceptance_sha256 is null
      or v_receipt.customer_acceptance_version <> 1
      or v_receipt.customer_accepted_currency <> new.currency
      or v_receipt.customer_accepted_total_cents <> new.total_cents
      or v_receipt.customer_accepted_by <> new.customer_id
    ) then
    raise exception 'Actor-bound customer acceptance is required for a changed flight price';
  end if;
  if v_receipt.status not in ('confirmed', 'price_changed') then
    raise exception 'A successful flight reprice receipt is required';
  end if;
  if v_receipt.currency <> new.currency or v_receipt.repriced_total_cents <> new.total_cents then
    raise exception 'Flight order total does not match the latest reprice receipt';
  end if;
  select
    count(*), min(segment_sequence), max(segment_sequence),
    (array_agg(origin_iata order by segment_sequence))[1],
    (array_agg(destination_iata order by segment_sequence desc))[1]
    into v_segment_count, v_first_sequence, v_last_sequence,
      v_first_origin, v_last_destination
    from public.flight_offer_segments
   where offer_id = new.offer_id
     and execution_mode = new.execution_mode
     and execution_scope_sha256 = new.execution_scope_sha256;
  if v_segment_count <> v_offer.segment_count
    or v_first_sequence <> 1
    or v_last_sequence <> v_offer.segment_count
    or v_first_origin <> v_search.origin_iata
    or (
      v_search.journey_type = 'one_way'
      and v_last_destination <> v_search.destination_iata
    )
    or (
      v_search.journey_type = 'round_trip'
      and (
        v_last_destination <> v_search.origin_iata
        or not exists (
          select 1 from public.flight_offer_segments
           where offer_id = new.offer_id
             and execution_mode = new.execution_mode
             and execution_scope_sha256 = new.execution_scope_sha256
             and destination_iata = v_search.destination_iata
        )
      )
    )
    or exists (
      select 1
        from public.flight_offer_segments as prior
        left join public.flight_offer_segments as following
          on following.offer_id = prior.offer_id
         and following.execution_mode = prior.execution_mode
         and following.execution_scope_sha256 = prior.execution_scope_sha256
         and following.segment_sequence = prior.segment_sequence + 1
       where prior.offer_id = new.offer_id
         and prior.execution_mode = new.execution_mode
         and prior.execution_scope_sha256 = new.execution_scope_sha256
         and prior.segment_sequence < v_offer.segment_count
         and (
           following.id is null
           or following.origin_iata <> prior.destination_iata
           or following.departure_at < prior.arrival_at
         )
    )
    or not exists (
      select 1 from public.flight_offer_fare_terms
       where offer_id = new.offer_id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
    ) then
    raise exception 'Complete normalized flight itinerary and fare evidence is required';
  end if;
  if exists (
    select 1 from public.flight_offer_segments
     where offer_id = new.offer_id
       and execution_mode = new.execution_mode
       and execution_scope_sha256 = new.execution_scope_sha256
       and cabin <> v_search.cabin
  ) then
    raise exception 'Flight itinerary cabin does not match the requested cabin';
  end if;
  select
    count(*) filter (where journey_direction = 'outbound'),
    count(*) filter (where journey_direction = 'return'),
    min(segment_sequence) filter (where journey_direction = 'outbound'),
    max(segment_sequence) filter (where journey_direction = 'outbound'),
    min(segment_sequence) filter (where journey_direction = 'return'),
    max(segment_sequence) filter (where journey_direction = 'return')
    into v_outbound_count, v_return_count,
      v_outbound_first_sequence, v_outbound_last_sequence,
      v_return_first_sequence, v_return_last_sequence
    from public.flight_offer_segments
   where offer_id = new.offer_id
     and execution_mode = new.execution_mode
     and execution_scope_sha256 = new.execution_scope_sha256;
  select origin_iata, departure_local_date, departure_at
    into v_outbound_first_origin, v_outbound_departure_local_date, v_outbound_departure_at
    from public.flight_offer_segments
   where offer_id = new.offer_id
     and execution_mode = new.execution_mode
     and execution_scope_sha256 = new.execution_scope_sha256
     and journey_direction = 'outbound'
   order by segment_sequence
   limit 1;
  select destination_iata into v_outbound_last_destination
    from public.flight_offer_segments
   where offer_id = new.offer_id
     and execution_mode = new.execution_mode
     and execution_scope_sha256 = new.execution_scope_sha256
     and journey_direction = 'outbound'
   order by segment_sequence desc
   limit 1;
  select origin_iata, departure_local_date
    into v_return_first_origin, v_return_departure_local_date
    from public.flight_offer_segments
   where offer_id = new.offer_id
     and execution_mode = new.execution_mode
     and execution_scope_sha256 = new.execution_scope_sha256
     and journey_direction = 'return'
   order by segment_sequence
   limit 1;
  select destination_iata into v_return_last_destination
    from public.flight_offer_segments
   where offer_id = new.offer_id
     and execution_mode = new.execution_mode
     and execution_scope_sha256 = new.execution_scope_sha256
     and journey_direction = 'return'
   order by segment_sequence desc
   limit 1;
  if v_outbound_count < 1
    or v_outbound_first_sequence <> 1
    or v_outbound_first_origin <> v_search.origin_iata
    or v_outbound_last_destination <> v_search.destination_iata
    or v_outbound_departure_local_date <> v_search.departure_date
    or v_outbound_departure_at <= clock_timestamp() + interval '30 minutes' then
    raise exception 'Flight outbound itinerary does not match the requested route and date';
  end if;
  if v_search.journey_type = 'one_way' and (
    v_return_count <> 0 or v_outbound_count <> v_segment_count
  ) then
    raise exception 'One-way flight itinerary cannot contain return segments';
  end if;
  if v_search.journey_type = 'round_trip' and (
    v_return_count < 1
    or v_outbound_count + v_return_count <> v_segment_count
    or v_outbound_last_sequence >= v_return_first_sequence
    or v_return_first_origin <> v_search.destination_iata
    or v_return_last_destination <> v_search.origin_iata
    or v_return_departure_local_date <> v_search.return_date
    or v_return_last_sequence <> v_segment_count
  ) then
    raise exception 'Flight return itinerary does not match the requested route and date';
  end if;
  if new.provider_order_ref_sha256 is not null and (
    new.ticketing_deadline_at is null
    or new.ticketing_deadline_at <= new.provider_created_at
    or new.ticketing_deadline_at >= v_outbound_departure_at
  ) then
    raise exception 'Flight ticketing deadline must follow provider creation and precede departure';
  end if;
  return new;
end;
$$;

create or replace function public.validate_flight_offer_snapshot()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_offer public.flight_offers;
  v_new jsonb := to_jsonb(new);
begin
  select * into v_offer
    from public.flight_offers
   where id = new.offer_id;
  if not found
    or v_offer.execution_mode <> new.execution_mode
    or v_offer.execution_scope_sha256 <> new.execution_scope_sha256 then
    raise exception 'Flight offer snapshot execution mode does not match its offer';
  end if;
  if not public.flight_runtime_capability_enabled(
    new.execution_mode,
    'shopping',
    v_offer.provider_code,
    null,
    new.execution_scope_sha256
  ) then
    raise exception 'Flight offer snapshot provider is not the bound runtime provider';
  end if;
  if v_offer.status <> 'offered' or v_offer.expires_at <= clock_timestamp() then
    raise exception 'Flight offer snapshot can only be captured for an active offer';
  end if;
  if tg_table_name = 'flight_offer_segments'
    and (v_new ->> 'segment_sequence')::smallint > v_offer.segment_count then
    raise exception 'Flight segment sequence exceeds the offer segment count';
  end if;
  if tg_table_name = 'flight_offer_segments' and (
    exists (
      select 1 from public.flight_offer_segments
       where offer_id = (v_new ->> 'offer_id')::uuid
         and segment_sequence = (v_new ->> 'segment_sequence')::smallint - 1
         and arrival_at > (v_new ->> 'departure_at')::timestamptz
    )
    or exists (
      select 1 from public.flight_offer_segments
       where offer_id = (v_new ->> 'offer_id')::uuid
         and segment_sequence = (v_new ->> 'segment_sequence')::smallint + 1
         and departure_at < (v_new ->> 'arrival_at')::timestamptz
    )
  ) then
    raise exception 'Flight offer segments overlap or are out of chronological order';
  end if;
  return new;
end;
$$;

create or replace function public.validate_flight_offer_chain()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_search public.flight_searches;
begin
  select * into v_search from public.flight_searches where id = new.search_id;
  if not found then
    raise exception 'Flight offer search evidence is required';
  end if;
  if v_search.execution_mode <> new.execution_mode
    or v_search.execution_scope_sha256 <> new.execution_scope_sha256 then
    raise exception 'Flight offer execution scope does not match its search';
  end if;
  if v_search.status not in ('searching', 'complete')
    or v_search.expires_at <= clock_timestamp() then
    raise exception 'Flight offer search evidence is not active';
  end if;
  if new.expires_at > v_search.expires_at then
    raise exception 'Flight offer cannot outlive its search';
  end if;
  return new;
end;
$$;

create or replace function public.validate_flight_reprice_chain()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_offer public.flight_offers;
begin
  select * into v_offer from public.flight_offers where id = new.offer_id;
  if not found then
    raise exception 'Flight reprice offer evidence is required';
  end if;
  if v_offer.execution_mode <> new.execution_mode
    or v_offer.execution_scope_sha256 <> new.execution_scope_sha256
    or v_offer.currency <> new.currency
    or v_offer.total_cents <> new.original_total_cents then
    raise exception 'Flight reprice evidence does not match its offer';
  end if;
  if v_offer.status <> 'offered' or v_offer.expires_at <= clock_timestamp() then
    raise exception 'Flight offer is not active for repricing';
  end if;
  if new.expires_at > v_offer.expires_at then
    raise exception 'Flight reprice evidence cannot outlive its offer';
  end if;
  return new;
end;
$$;

create or replace function public.validate_flight_order_child_mode()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.flight_orders;
  v_new jsonb := to_jsonb(new);
  v_child_status text := v_new ->> 'status';
begin
  if tg_table_name = 'flight_reconciliation_cases'
    and (to_jsonb(new) ->> 'status') = 'resolved'
    and (
      auth.uid() is null
      or (to_jsonb(new) ->> 'resolved_by')::uuid <> auth.uid()
      or not exists (
        select 1 from public.profiles
         where id = (to_jsonb(new) ->> 'resolved_by')::uuid
           and role = 'admin'
      )
    ) then
    raise exception 'Flight reconciliation resolution requires its authenticated administrator';
  end if;
  if tg_table_name = 'flight_reconciliation_cases' and not (
    ((v_new ->> 'subject_type') = 'flight_order' and exists (
      select 1 from public.flight_orders as subject
       where subject.id = (v_new ->> 'subject_id')::uuid
         and subject.id = new.order_id
         and subject.provider_code = (v_new ->> 'provider_code')
         and subject.execution_mode = new.execution_mode
         and subject.execution_scope_sha256 = new.execution_scope_sha256
         and subject.status = (v_new ->> 'source_status')
         and subject.updated_at = (v_new ->> 'source_revision_at')::timestamptz
    ))
    or ((v_new ->> 'subject_type') = 'flight_payment' and exists (
      select 1
        from public.flight_payments as subject
        join public.flight_orders as subject_order on subject_order.id = subject.order_id
       where subject.id = (v_new ->> 'subject_id')::uuid
         and subject.order_id = new.order_id
         and subject_order.provider_code = (v_new ->> 'provider_code')
         and subject.execution_mode = new.execution_mode
         and subject.execution_scope_sha256 = new.execution_scope_sha256
         and subject.status = (v_new ->> 'source_status')
         and subject.updated_at = (v_new ->> 'source_revision_at')::timestamptz
    ))
    or ((v_new ->> 'subject_type') = 'flight_ticket_document' and exists (
      select 1
        from public.flight_ticket_documents as subject
        join public.flight_orders as subject_order on subject_order.id = subject.order_id
       where subject.id = (v_new ->> 'subject_id')::uuid
         and subject.order_id = new.order_id
         and subject_order.provider_code = (v_new ->> 'provider_code')
         and subject.execution_mode = new.execution_mode
         and subject.execution_scope_sha256 = new.execution_scope_sha256
         and subject.status = (v_new ->> 'source_status')
         and subject.updated_at = (v_new ->> 'source_revision_at')::timestamptz
    ))
    or ((v_new ->> 'subject_type') = 'flight_service_request' and exists (
      select 1
        from public.flight_service_requests as subject
        join public.flight_orders as subject_order on subject_order.id = subject.order_id
       where subject.id = (v_new ->> 'subject_id')::uuid
         and subject.order_id = new.order_id
         and subject_order.provider_code = (v_new ->> 'provider_code')
         and subject.execution_mode = new.execution_mode
         and subject.execution_scope_sha256 = new.execution_scope_sha256
         and subject.status = (v_new ->> 'source_status')
         and subject.updated_at = (v_new ->> 'source_revision_at')::timestamptz
    ))
    or ((v_new ->> 'subject_type') = 'flight_provider_event' and exists (
      select 1 from public.flight_provider_events as subject
       where subject.id = (v_new ->> 'subject_id')::uuid
         and subject.order_id is not distinct from new.order_id
         and subject.provider_code = (v_new ->> 'provider_code')
         and subject.execution_mode = new.execution_mode
         and subject.execution_scope_sha256 = new.execution_scope_sha256
         and subject.processing_status = (v_new ->> 'source_status')
         and coalesce(subject.processed_at, subject.received_at)
           = (v_new ->> 'source_revision_at')::timestamptz
    ))
  ) then
    raise exception 'Flight reconciliation subject, source state, or revision does not match';
  end if;
  if new.order_id is null then
    return new;
  end if;
  select * into v_order
    from public.flight_orders
   where id = new.order_id
   for update;
  if not found
    or v_order.execution_mode <> new.execution_mode
    or v_order.execution_scope_sha256 <> new.execution_scope_sha256 then
    raise exception 'Flight child record execution scope does not match its order';
  end if;
  if tg_table_name = 'flight_payments'
    and (
      (to_jsonb(new) ->> 'currency') <> v_order.currency
      or (to_jsonb(new) ->> 'authorized_cents')::bigint not in (0, v_order.total_cents)
    ) then
    raise exception 'Flight payment amount or currency does not match its order';
  end if;
  if tg_table_name = 'flight_payments' and not (
    (v_child_status in ('requires_payment_method', 'requires_action')
      and v_order.status = 'pending_payment')
    or (v_child_status = 'authorized' and v_order.status in (
      'pending_payment', 'payment_authorized', 'order_creating', 'booked', 'requires_review'
    ))
    or (v_child_status = 'captured' and v_order.status in (
      'payment_authorized', 'order_creating', 'booked',
      'ticketing_pending', 'ticketed', 'servicing',
      'cancellation_pending', 'cancelled', 'requires_review'
    ))
    or (v_child_status in ('refund_pending', 'partially_refunded', 'refunded')
      and v_order.status in ('cancelled', 'refund_pending', 'refunded', 'requires_review'))
    or (v_child_status = 'cancelled'
      and v_order.status in ('pending_payment', 'payment_authorized', 'cancelled', 'requires_review'))
    or (v_child_status = 'failed'
      and v_order.status in ('pending_payment', 'payment_authorized', 'failed', 'requires_review'))
    or (v_child_status = 'ambiguous' and v_order.status = 'requires_review')
  ) then
    raise exception 'Flight payment lifecycle is incompatible with its parent order state';
  end if;
  if tg_table_name = 'flight_payments'
    and v_order.status in ('ticketing_pending', 'ticketed')
    and not (
      (to_jsonb(new) ->> 'status') = 'captured'
      and (to_jsonb(new) ->> 'captured_cents')::bigint = v_order.total_cents
      and (to_jsonb(new) ->> 'refunded_cents')::bigint = 0
    ) then
    raise exception 'Captured payment evidence cannot drift while an order is ticketing or ticketed';
  end if;
  if tg_table_name = 'flight_payments'
    and v_order.status = 'refund_pending'
    and not (
      (to_jsonb(new) ->> 'status') in ('refund_pending', 'partially_refunded', 'refunded')
      and (to_jsonb(new) ->> 'captured_cents')::bigint = v_order.total_cents
    ) then
    raise exception 'Refund-in-progress evidence cannot drift while the order is refund pending';
  end if;
  if tg_table_name = 'flight_payments'
    and v_order.status = 'refunded'
    and not (
      (to_jsonb(new) ->> 'status') = 'refunded'
      and (to_jsonb(new) ->> 'captured_cents')::bigint = v_order.total_cents
      and (to_jsonb(new) ->> 'refunded_cents')::bigint = v_order.total_cents
    ) then
    raise exception 'Refund evidence cannot drift after the order is refunded';
  end if;
  if tg_table_name in ('flight_provider_events', 'flight_reconciliation_cases')
    and (to_jsonb(new) ->> 'provider_code') <> v_order.provider_code then
    raise exception 'Flight provider evidence does not match its order';
  end if;
  if tg_table_name = 'flight_service_requests'
    and (to_jsonb(new) ->> 'requested_by')::uuid <> v_order.customer_id
    and not exists (
      select 1 from public.profiles
       where id = (to_jsonb(new) ->> 'requested_by')::uuid
         and role = 'admin'
    ) then
    raise exception 'Flight service requester is not authorized for the order';
  end if;
  if tg_table_name = 'flight_service_requests'
    and v_order.status = 'servicing'
    and (to_jsonb(new) ->> 'status') not in ('accepted', 'processing', 'completed') then
    raise exception 'Service evidence cannot drift while the order is servicing';
  end if;
  if tg_table_name = 'flight_ticket_documents'
    and (to_jsonb(new) ->> 'issuing_carrier') is distinct from (
      select offer.validating_carrier
        from public.flight_offers as offer
       where offer.id = v_order.offer_id
         and offer.execution_mode = v_order.execution_mode
         and offer.execution_scope_sha256 = v_order.execution_scope_sha256
    ) then
    raise exception 'Flight ticket issuing carrier does not match the order validating carrier';
  end if;
  if tg_table_name = 'flight_ticket_documents'
    and not (
      (v_child_status = 'pending' and v_order.status in ('ticketing_pending', 'servicing'))
      or (v_child_status = 'issued' and v_order.status in (
        'ticketing_pending', 'ticketed', 'servicing',
        'cancellation_pending', 'cancelled', 'requires_review'
      ))
      or (v_child_status in ('voided', 'refunded') and v_order.status in (
        'servicing', 'cancellation_pending', 'cancelled',
        'refund_pending', 'refunded', 'requires_review'
      ))
      or (v_child_status = 'failed'
        and v_order.status in ('ticketing_pending', 'servicing', 'requires_review'))
    ) then
    raise exception 'Flight ticket lifecycle is incompatible with its parent order state';
  end if;
  if tg_table_name = 'flight_ticket_documents'
    and v_order.status = 'ticketed'
    and (to_jsonb(new) ->> 'document_type') = 'electronic_ticket'
    and (to_jsonb(new) ->> 'status') <> 'issued' then
    raise exception 'Issued ticket evidence cannot drift while the order is ticketed';
  end if;
  if tg_table_name = 'flight_ticket_documents'
    and v_order.status = 'refunded'
    and (to_jsonb(new) ->> 'status') not in ('voided', 'refunded') then
    raise exception 'Ticket refund evidence cannot drift after the order is refunded';
  end if;
  if tg_table_name = 'flight_passenger_refs'
    and tg_op = 'UPDATE'
    and v_order.status in ('ticketing_pending', 'ticketed') then
    raise exception 'Passenger references cannot drift while an order is ticketing or ticketed';
  end if;
  return new;
end;
$$;

create or replace function public.validate_flight_order_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_expected_adults bigint;
  v_expected_children bigint;
  v_expected_infants_in_seat bigint;
  v_expected_infants_on_lap bigint;
  v_actual_adults bigint;
  v_actual_children bigint;
  v_actual_infants_in_seat bigint;
  v_actual_infants_on_lap bigint;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending_payment' then
      raise exception 'New flight orders must start pending payment';
    end if;
    if new.provider_order_ref_ciphertext is not null
      or new.provider_order_ref_sha256 is not null
      or new.provider_created_at is not null
      or new.ticketing_deadline_at is not null then
      raise exception 'New flight orders cannot contain pre-bound provider evidence';
    end if;
    return new;
  end if;
  if new.status = old.status then
    return new;
  end if;
  if not (
    (old.status = 'pending_payment' and new.status in ('payment_authorized', 'cancelled', 'failed', 'requires_review'))
    or (old.status = 'payment_authorized'
      and new.status in ('order_creating', 'cancelled', 'requires_review'))
    or (old.status = 'order_creating' and new.status in ('booked', 'requires_review'))
    or (old.status = 'booked'
      and new.status in ('ticketing_pending', 'servicing', 'cancellation_pending', 'requires_review'))
    or (old.status = 'ticketing_pending' and new.status in ('ticketed', 'requires_review'))
    or (old.status = 'ticketed'
      and new.status in ('servicing', 'cancellation_pending', 'requires_review'))
    or (old.status = 'servicing'
      and new.status in ('ticketed', 'cancellation_pending', 'requires_review'))
    or (old.status = 'cancellation_pending' and new.status in ('cancelled', 'requires_review'))
    or (old.status = 'cancelled' and new.status = 'refund_pending')
    or (old.status = 'refund_pending' and new.status in ('refunded', 'requires_review'))
    or (old.status = 'requires_review' and new.status in (
      'pending_payment', 'payment_authorized', 'order_creating',
      'ticketing_pending', 'ticketed', 'servicing', 'cancellation_pending',
      'cancelled', 'refund_pending', 'refunded', 'failed'
    ))
  ) then
    raise exception 'Invalid flight order status transition from % to %', old.status, new.status;
  end if;

  -- A review exit may never rewind a provider-bound or serviced order into a
  -- state from which a second provider order could be created. These target
  -- invariants apply independently of the reconciliation case classification.
  if new.status in ('pending_payment', 'payment_authorized', 'order_creating')
    and (
      new.provider_order_ref_ciphertext is not null
      or new.provider_order_ref_sha256 is not null
      or new.provider_created_at is not null
      or new.ticketing_deadline_at is not null
      or exists (
        select 1 from public.flight_ticket_documents
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
      )
      or exists (
        select 1 from public.flight_service_requests
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
      )
    ) then
    raise exception 'Early flight order states require zero provider-order, ticket, and service liability';
  end if;

  if new.status = 'pending_payment'
    and exists (
      select 1 from public.flight_payments
       where order_id = new.id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
         and (
           authorized_cents <> 0
           or captured_cents <> 0
           or refunded_cents <> 0
           or status not in (
             'requires_payment_method', 'requires_action', 'cancelled', 'failed'
           )
         )
    ) then
    raise exception 'Pending flight orders require exact zero monetary liability';
  end if;

  if old.status = 'requires_review'
    and new.status <> old.status
    and not exists (
      select 1
        from public.flight_reconciliation_cases as reconciliation
        join public.profiles as resolver on resolver.id = reconciliation.resolved_by
       where reconciliation.order_id = new.id
         and reconciliation.execution_mode = new.execution_mode
         and reconciliation.execution_scope_sha256 = new.execution_scope_sha256
         and reconciliation.provider_code = new.provider_code
         and reconciliation.status = 'resolved'
         and reconciliation.resolution_evidence_sha256 is not null
         and reconciliation.resolved_at >= old.updated_at
         and resolver.role = 'admin'
         and reconciliation.subject_type = 'flight_order'
         and reconciliation.subject_id = new.id
         and reconciliation.source_status = old.status
         and reconciliation.source_revision_at = old.updated_at
         and reconciliation.target_status = new.status
         and reconciliation.target_state_sha256 = encode(
           extensions.digest(
             convert_to(jsonb_build_object(
               'domain', 'iratepilot.flight.reconciliation.target.v1',
               'subject_type', 'flight_order',
               'subject_id', new.id::text,
               'target_status', new.status,
               'execution_mode', new.execution_mode,
               'execution_scope_sha256', new.execution_scope_sha256
             )::text, 'UTF8'),
             'sha256'
           ),
           'hex'
         )
         and (
           (new.status in ('pending_payment', 'order_creating', 'failed')
             and reconciliation.case_type = 'ambiguous_order')
           or (new.status = 'payment_authorized'
             and reconciliation.case_type = 'payment_order_mismatch')
           or (new.status in ('ticketing_pending', 'ticketed')
             and reconciliation.case_type = 'ticket_mismatch')
           or (new.status in ('refund_pending', 'refunded')
             and reconciliation.case_type = 'refund_mismatch')
           or (new.status in ('servicing', 'cancellation_pending')
             and reconciliation.case_type = 'servicing_mismatch')
           or (new.status = 'cancelled' and (
             (new.provider_order_ref_sha256 is null
               and reconciliation.case_type in ('payment_order_mismatch', 'ambiguous_order'))
             or (new.provider_order_ref_sha256 is not null
               and reconciliation.case_type = 'servicing_mismatch')
           ))
         )
    ) then
    raise exception 'Resolved administrator-attributed reconciliation evidence is required';
  end if;

  if new.status = 'failed' and (
    exists (
      select 1 from public.flight_payments
       where order_id = new.id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
         and (
           captured_cents <> refunded_cents
           or status not in ('failed', 'cancelled', 'refunded')
           or (status = 'failed' and authorized_cents > 0)
         )
    )
    or (
      new.provider_order_ref_sha256 is not null
      and not exists (
        select 1 from public.flight_service_requests
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and request_type = 'cancel'
           and status = 'completed'
      )
    )
    or exists (
      select 1 from public.flight_ticket_documents
       where order_id = new.id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
         and status not in ('voided', 'refunded', 'failed')
    )
  ) then
    raise exception 'Flight orders can fail only with exact zero-liability evidence';
  end if;

  if new.status in ('payment_authorized', 'order_creating', 'booked')
    and not exists (
      select 1 from public.flight_payments
       where order_id = new.id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
         and currency = new.currency
         and authorized_cents = new.total_cents
         and status in ('authorized', 'captured')
    ) then
    raise exception 'Exact authorized flight payment evidence is required';
  end if;

  if new.status in ('ticketing_pending', 'ticketed')
    and (
      new.ticketing_deadline_at is null
      or new.ticketing_deadline_at <= clock_timestamp()
    ) then
    raise exception 'Flight order ticketing deadline has expired';
  end if;

  if new.status in ('ticketing_pending', 'ticketed')
    and not exists (
      select 1 from public.flight_payments
       where order_id = new.id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
         and currency = new.currency
         and authorized_cents = new.total_cents
         and captured_cents = new.total_cents
         and refunded_cents = 0
         and status = 'captured'
    ) then
    raise exception 'Exact captured flight payment evidence is required before ticketing';
  end if;

  if new.status in ('ticketing_pending', 'ticketed') then
    select adult_count, child_count, infant_in_seat_count, infant_on_lap_count
      into v_expected_adults, v_expected_children,
        v_expected_infants_in_seat, v_expected_infants_on_lap
      from public.flight_searches
     where id = new.search_id;
    select
      count(*) filter (where traveler_type = 'adult'),
      count(*) filter (where traveler_type = 'child'),
      count(*) filter (where traveler_type = 'infant_in_seat'),
      count(*) filter (where traveler_type = 'infant_on_lap')
      into v_actual_adults, v_actual_children,
        v_actual_infants_in_seat, v_actual_infants_on_lap
      from public.flight_passenger_refs
     where order_id = new.id
       and execution_mode = new.execution_mode
       and execution_scope_sha256 = new.execution_scope_sha256;
    if v_actual_adults is distinct from v_expected_adults
      or v_actual_children is distinct from v_expected_children
      or v_actual_infants_in_seat is distinct from v_expected_infants_in_seat
      or v_actual_infants_on_lap is distinct from v_expected_infants_on_lap then
      raise exception 'Exact passenger-reference evidence is required before ticketing';
    end if;
  end if;

  if new.status = 'ticketed'
    and exists (
      select 1 from public.flight_passenger_refs as passenger
       where passenger.order_id = new.id
         and passenger.execution_mode = new.execution_mode
         and passenger.execution_scope_sha256 = new.execution_scope_sha256
         and (
           select count(*) from public.flight_ticket_documents as document
            where document.order_id = new.id
               and document.passenger_ref_id = passenger.id
               and document.execution_mode = new.execution_mode
               and document.execution_scope_sha256 = new.execution_scope_sha256
               and document.document_type = 'electronic_ticket'
              and document.status = 'issued'
         ) <> 1
    ) then
    raise exception 'Exactly one issued ticket document is required for every passenger';
  end if;

  if new.status = 'servicing'
    and not exists (
      select 1 from public.flight_service_requests
       where order_id = new.id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
         and status in ('accepted', 'processing')
    ) then
    raise exception 'Accepted flight service evidence is required';
  end if;

  if new.status = 'cancellation_pending'
    and not exists (
      select 1 from public.flight_service_requests
       where order_id = new.id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
         and request_type = 'cancel'
         and status in ('accepted', 'processing', 'completed')
    ) then
    raise exception 'Accepted flight cancellation evidence is required';
  end if;

  if new.status = 'cancelled'
    and old.status = 'pending_payment'
    and (
      new.provider_order_ref_sha256 is not null
      or exists (
        select 1 from public.flight_payments
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and (
             authorized_cents <> 0
             or captured_cents <> 0
             or refunded_cents <> 0
             or status not in ('failed', 'cancelled')
           )
      )
      or exists (
        select 1 from public.flight_ticket_documents
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and status not in ('voided', 'refunded', 'failed')
      )
    ) then
    raise exception 'Pending flight orders can cancel only with exact zero-liability evidence';
  end if;

  if new.status = 'cancelled'
    and old.status <> 'pending_payment'
    and (
      not exists (
        select 1 from public.flight_payments
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and currency = new.currency
           and authorized_cents = new.total_cents
           and (
             (status = 'cancelled' and captured_cents = 0 and refunded_cents = 0)
             or (
               status in ('captured', 'refund_pending', 'partially_refunded', 'refunded')
               and captured_cents = new.total_cents
             )
           )
      )
      or exists (
        select 1 from public.flight_ticket_documents
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and status not in ('voided', 'refunded', 'failed')
      )
    ) then
    raise exception 'Exact cancelled or captured payment and inactive-ticket evidence is required';
  end if;

  if new.status = 'refund_pending'
    and (
      not exists (
        select 1 from public.flight_payments
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and currency = new.currency
           and authorized_cents = new.total_cents
           and captured_cents = new.total_cents
           and status in ('refund_pending', 'partially_refunded', 'refunded')
      )
      or not exists (
        select 1 from public.flight_service_requests
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and request_type in ('cancel', 'refund')
           and status in ('accepted', 'processing', 'completed')
      )
      or exists (
        select 1 from public.flight_ticket_documents
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and status not in ('voided', 'refunded', 'failed')
      )
    ) then
    raise exception 'Exact in-progress refund, service, and inactive-ticket evidence is required';
  end if;

  if new.status = 'cancelled' and new.provider_order_ref_sha256 is not null
    and not exists (
      select 1 from public.flight_service_requests
       where order_id = new.id
         and execution_mode = new.execution_mode
         and execution_scope_sha256 = new.execution_scope_sha256
         and request_type = 'cancel'
         and status = 'completed'
    ) then
    raise exception 'Completed provider cancellation evidence is required';
  end if;

  if new.status = 'refunded'
    and (
      not exists (
        select 1 from public.flight_payments
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and currency = new.currency
           and captured_cents = new.total_cents
           and refunded_cents = new.total_cents
           and status = 'refunded'
      )
      or not exists (
        select 1 from public.flight_service_requests
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and request_type in ('cancel', 'refund')
           and status = 'completed'
      )
      or exists (
        select 1 from public.flight_ticket_documents
         where order_id = new.id
           and execution_mode = new.execution_mode
           and execution_scope_sha256 = new.execution_scope_sha256
           and status not in ('voided', 'refunded', 'failed')
      )
    ) then
    raise exception 'Exact completed refund, service, and ticket evidence is required';
  end if;
  return new;
end;
$$;

create or replace function public.protect_flight_reprice_evidence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_customer_id uuid;
begin
  if tg_op = 'INSERT' then
    if new.customer_accepted_at is not null
      or new.customer_accepted_by is not null
      or new.customer_acceptance_sha256 is not null
      or new.customer_acceptance_version is not null
      or new.customer_accepted_currency is not null
      or new.customer_accepted_total_cents is not null then
      raise exception 'Flight reprice acceptance must be recorded after receipt creation';
    end if;
    return new;
  end if;
  if old.status = 'price_changed'
    and old.customer_accepted_at is null
    and old.customer_accepted_by is null
    and old.customer_acceptance_sha256 is null
    and old.customer_acceptance_version is null
    and old.customer_accepted_currency is null
    and old.customer_accepted_total_cents is null
    and new.customer_accepted_at is not null
    and new.customer_accepted_by is not null
    and new.customer_acceptance_sha256 is null
    and new.customer_acceptance_version is null
    and new.customer_accepted_currency = old.currency
    and new.customer_accepted_total_cents = old.repriced_total_cents
    and to_jsonb(new) - array[
      'customer_accepted_at', 'customer_accepted_by', 'customer_acceptance_sha256',
      'customer_acceptance_version', 'customer_accepted_currency',
      'customer_accepted_total_cents'
    ] = to_jsonb(old) - array[
      'customer_accepted_at', 'customer_accepted_by', 'customer_acceptance_sha256',
      'customer_acceptance_version', 'customer_accepted_currency',
      'customer_accepted_total_cents'
    ] then
    select search.customer_id into v_customer_id
      from public.flight_offers as offer
      join public.flight_searches as search on search.id = offer.search_id
     where offer.id = new.offer_id;
    if v_customer_id is null
      or new.customer_accepted_by <> v_customer_id
      or auth.uid() is null
      or auth.uid() <> new.customer_accepted_by then
      raise exception 'Flight reprice acceptance actor does not own the search';
    end if;
    new.customer_accepted_at := clock_timestamp();
    new.customer_acceptance_version := 1;
    new.customer_acceptance_sha256 := encode(
      extensions.digest(
        convert_to(
          jsonb_build_object(
            'domain', 'iratepilot.flight.reprice.acceptance.v1',
            'receipt_id', old.id::text,
            'offer_id', old.offer_id::text,
            'actor_id', new.customer_accepted_by::text,
            'currency', old.currency,
            'total_cents', old.repriced_total_cents,
            'request_sha256', old.request_sha256,
            'response_sha256', old.response_sha256,
            'execution_mode', old.execution_mode,
            'execution_scope_sha256', old.execution_scope_sha256
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );
    return new;
  end if;
  raise exception 'Flight reprice evidence is immutable except for one customer acceptance';
end;
$$;

create or replace function public.protect_flight_operational_evidence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old jsonb;
  v_new jsonb := to_jsonb(new);
begin
  if tg_op = 'INSERT' then
    if (tg_table_name = 'flight_searches' and (v_new ->> 'status') <> 'created')
      or (tg_table_name = 'flight_offers' and (v_new ->> 'status') <> 'offered')
      or (tg_table_name = 'flight_ticket_documents' and (v_new ->> 'status') <> 'pending')
      or (tg_table_name = 'flight_payments' and (
        (v_new ->> 'status') <> 'requires_payment_method'
        or (v_new ->> 'authorized_cents')::bigint <> 0
        or (v_new ->> 'captured_cents')::bigint <> 0
        or (v_new ->> 'refunded_cents')::bigint <> 0
      ))
      or (tg_table_name = 'flight_service_requests' and (v_new ->> 'status') <> 'requested')
      or (tg_table_name = 'flight_provider_events' and (
        (v_new ->> 'processing_status') <> 'received'
        or (v_new ->> 'signature_verified')::boolean
        or (v_new ->> 'processed_at') is not null
      ))
      or (tg_table_name = 'flight_idempotency_records'
        and (v_new ->> 'status') <> 'in_progress')
      or (tg_table_name = 'flight_reconciliation_cases' and (v_new ->> 'status') <> 'open') then
      raise exception 'Flight evidence must be inserted in its exact initial lifecycle state';
    end if;
    if tg_table_name = 'flight_passenger_refs'
      and (
        (v_new ->> 'provider_passenger_ref_ciphertext') is not null
        or (v_new ->> 'provider_passenger_ref_sha256') is not null
      ) then
      raise exception 'Flight provider passenger identity must be bound after passenger creation';
    end if;
    return new;
  end if;
  v_old := to_jsonb(old);
  if tg_table_name = 'flight_searches' then
    if v_new - array['status', 'provider_request_sha256', 'updated_at']
      is distinct from v_old - array['status', 'provider_request_sha256', 'updated_at'] then
      raise exception 'Flight search criteria and identity evidence are immutable';
    end if;
    if old.provider_request_sha256 is not null
      and new.provider_request_sha256 is distinct from old.provider_request_sha256 then
      raise exception 'Flight provider request evidence is immutable after binding';
    end if;
    if new.status is distinct from old.status and not (
      (old.status = 'created' and new.status in ('searching', 'failed', 'expired'))
      or (old.status = 'searching' and new.status in ('complete', 'failed', 'expired'))
      or (old.status = 'complete' and new.status = 'expired')
    ) then
      raise exception 'Invalid flight search status transition from % to %', old.status, new.status;
    end if;
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  elsif tg_table_name = 'flight_offers' then
    if v_new - 'status' is distinct from v_old - 'status' then
      raise exception 'Flight offer price, provider, and itinerary evidence are immutable';
    end if;
    if new.status is distinct from old.status
      and not (old.status = 'offered' and new.status in ('expired', 'replaced')) then
      raise exception 'Invalid flight offer status transition from % to %', old.status, new.status;
    end if;
  elsif tg_table_name = 'flight_orders' then
    if v_new - array[
      'provider_order_ref_ciphertext', 'provider_order_ref_sha256',
      'provider_created_at', 'ticketing_deadline_at', 'status', 'updated_at'
    ] is distinct from v_old - array[
      'provider_order_ref_ciphertext', 'provider_order_ref_sha256',
      'provider_created_at', 'ticketing_deadline_at', 'status', 'updated_at'
    ] then
      raise exception 'Flight order identity, customer, and commercial evidence are immutable';
    end if;
    if old.ticketing_deadline_at is not null
      and new.ticketing_deadline_at is distinct from old.ticketing_deadline_at then
      raise exception 'Flight ticketing deadline is immutable after binding';
    end if;
    if old.provider_order_ref_sha256 is null
      and new.provider_order_ref_sha256 is not null
      and not (
        old.status = 'order_creating'
        and new.status = 'booked'
        and new.provider_order_ref_ciphertext is not null
        and new.provider_created_at is not null
        and new.ticketing_deadline_at is not null
      ) then
      raise exception 'Flight provider order identity must bind atomically when the order is booked';
    end if;
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  elsif tg_table_name = 'flight_passenger_refs' then
    if v_new - array['provider_passenger_ref_ciphertext', 'provider_passenger_ref_sha256']
      is distinct from v_old - array[
        'provider_passenger_ref_ciphertext', 'provider_passenger_ref_sha256'
      ] then
      raise exception 'Flight passenger linkage and minimized PII evidence are immutable';
    end if;
    if old.provider_passenger_ref_sha256 is not null
      and (
        new.provider_passenger_ref_sha256 is distinct from old.provider_passenger_ref_sha256
        or new.provider_passenger_ref_ciphertext
          is distinct from old.provider_passenger_ref_ciphertext
      ) then
      raise exception 'Flight provider passenger identity is immutable after binding';
    end if;
  elsif tg_table_name = 'flight_ticket_documents' then
    if v_new - array[
      'document_ref_ciphertext', 'document_ref_sha256',
      'status', 'issued_at', 'voided_at', 'updated_at'
    ] is distinct from v_old - array[
      'document_ref_ciphertext', 'document_ref_sha256',
      'status', 'issued_at', 'voided_at', 'updated_at'
    ] then
      raise exception 'Flight ticket document identity and reference evidence are immutable';
    end if;
    if old.document_ref_sha256 is not null and (
      new.document_ref_sha256 is distinct from old.document_ref_sha256
      or new.document_ref_ciphertext is distinct from old.document_ref_ciphertext
    ) then
      raise exception 'Flight ticket provider identity is immutable after binding';
    end if;
    if old.issued_at is not null and new.issued_at is distinct from old.issued_at then
      raise exception 'Flight ticket issuance time is immutable after binding';
    end if;
    if old.voided_at is not null and new.voided_at is distinct from old.voided_at then
      raise exception 'Flight ticket void time is immutable after binding';
    end if;
    if old.status = 'pending' and new.status = 'issued' then
      new.issued_at := clock_timestamp();
    elsif old.status = 'issued' and new.status = 'voided' then
      new.voided_at := clock_timestamp();
    end if;
    if new.status is distinct from old.status and not (
      (old.status = 'pending' and new.status in ('issued', 'failed'))
      or (old.status = 'issued' and new.status in ('voided', 'refunded'))
    ) then
      raise exception 'Invalid flight ticket status transition from % to %', old.status, new.status;
    end if;
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  elsif tg_table_name = 'flight_payments' then
    if v_new - array[
      'authorized_cents', 'captured_cents', 'refunded_cents', 'status',
      'authorized_at', 'captured_at', 'updated_at'
    ] is distinct from v_old - array[
      'authorized_cents', 'captured_cents', 'refunded_cents', 'status',
      'authorized_at', 'captured_at', 'updated_at'
    ] then
      raise exception 'Flight payment processor, idempotency, and order evidence are immutable';
    end if;
    if (old.authorized_cents > 0 and new.authorized_cents <> old.authorized_cents)
      or new.authorized_cents < old.authorized_cents
      or new.captured_cents < old.captured_cents
      or new.refunded_cents < old.refunded_cents then
      raise exception 'Flight payment monetary evidence cannot decrease or be rewritten';
    end if;
    if old.authorized_at is not null and new.authorized_at is distinct from old.authorized_at then
      raise exception 'Flight payment authorization time is immutable after binding';
    end if;
    if old.captured_at is not null and new.captured_at is distinct from old.captured_at then
      raise exception 'Flight payment capture time is immutable after binding';
    end if;
    if old.authorized_cents = 0 and new.authorized_cents > 0 then
      new.authorized_at := clock_timestamp();
    end if;
    if old.captured_cents = 0 and new.captured_cents > 0 then
      new.captured_at := clock_timestamp();
    end if;
    if old.status = 'ambiguous'
      and new.status is distinct from old.status
      and not exists (
        select 1
          from public.flight_orders as payment_order
          join public.flight_reconciliation_cases as reconciliation
            on reconciliation.order_id = payment_order.id
          join public.profiles as resolver on resolver.id = reconciliation.resolved_by
         where payment_order.id = new.order_id
           and payment_order.execution_mode = new.execution_mode
           and payment_order.execution_scope_sha256 = new.execution_scope_sha256
           and reconciliation.execution_mode = new.execution_mode
           and reconciliation.execution_scope_sha256 = new.execution_scope_sha256
           and reconciliation.provider_code = payment_order.provider_code
           and reconciliation.case_type = case
             when new.status in ('refund_pending', 'partially_refunded', 'refunded')
               then 'refund_mismatch'
             else 'payment_order_mismatch'
           end
           and reconciliation.subject_type = 'flight_payment'
           and reconciliation.subject_id = new.id
           and reconciliation.source_status = old.status
           and reconciliation.source_revision_at = old.updated_at
           and reconciliation.target_status = new.status
           and reconciliation.target_authorized_cents = new.authorized_cents
           and reconciliation.target_captured_cents = new.captured_cents
           and reconciliation.target_refunded_cents = new.refunded_cents
           and reconciliation.target_state_sha256 = encode(
             extensions.digest(
               convert_to(jsonb_build_object(
                 'domain', 'iratepilot.flight.reconciliation.target.v1',
                 'subject_type', 'flight_payment',
                 'subject_id', new.id::text,
                 'target_status', new.status,
                 'target_authorized_cents', new.authorized_cents,
                 'target_captured_cents', new.captured_cents,
                 'target_refunded_cents', new.refunded_cents,
                 'execution_mode', new.execution_mode,
                 'execution_scope_sha256', new.execution_scope_sha256
               )::text, 'UTF8'),
               'sha256'
             ),
             'hex'
           )
           and reconciliation.status = 'resolved'
           and reconciliation.resolution_evidence_sha256 is not null
           and reconciliation.resolved_at >= old.updated_at
           and resolver.role = 'admin'
      ) then
      raise exception 'Resolved payment reconciliation evidence is required after ambiguity';
    end if;
    if new.status is distinct from old.status and not (
      (old.status = 'requires_payment_method'
        and new.status in ('requires_action', 'authorized', 'failed', 'cancelled', 'ambiguous'))
      or (old.status = 'requires_action'
        and new.status in ('authorized', 'failed', 'cancelled', 'ambiguous'))
      or (old.status = 'authorized'
        and new.status in ('captured', 'failed', 'cancelled', 'ambiguous'))
      or (old.status = 'captured'
        and new.status in ('refund_pending', 'ambiguous'))
      or (old.status = 'refund_pending'
        and new.status in ('partially_refunded', 'refunded', 'ambiguous'))
      or (old.status = 'partially_refunded'
        and new.status in ('refund_pending', 'ambiguous'))
      or (old.status = 'ambiguous'
        and new.status in (
          'authorized', 'captured', 'refund_pending', 'partially_refunded',
          'refunded', 'cancelled', 'failed'
        ))
    ) then
      raise exception 'Invalid flight payment status transition from % to %', old.status, new.status;
    end if;
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  elsif tg_table_name = 'flight_service_requests' then
    if v_new - array[
      'status', 'provider_case_ref_ciphertext', 'provider_case_ref_sha256', 'updated_at'
    ] is distinct from v_old - array[
      'status', 'provider_case_ref_ciphertext', 'provider_case_ref_sha256', 'updated_at'
    ] then
      raise exception 'Flight service request, actor, and reason evidence are immutable';
    end if;
    if old.provider_case_ref_sha256 is not null
      and (
        new.provider_case_ref_sha256 is distinct from old.provider_case_ref_sha256
        or new.provider_case_ref_ciphertext is distinct from old.provider_case_ref_ciphertext
      ) then
      raise exception 'Flight provider service identity is immutable after binding';
    end if;
    if old.status = 'requires_review'
      and new.status is distinct from old.status
      and not exists (
        select 1
          from public.flight_orders as service_order
          join public.flight_reconciliation_cases as reconciliation
            on reconciliation.order_id = service_order.id
          join public.profiles as resolver on resolver.id = reconciliation.resolved_by
         where service_order.id = new.order_id
           and service_order.execution_mode = new.execution_mode
           and service_order.execution_scope_sha256 = new.execution_scope_sha256
           and reconciliation.execution_mode = new.execution_mode
           and reconciliation.execution_scope_sha256 = new.execution_scope_sha256
           and reconciliation.provider_code = service_order.provider_code
           and reconciliation.case_type = 'servicing_mismatch'
           and reconciliation.subject_type = 'flight_service_request'
           and reconciliation.subject_id = new.id
           and reconciliation.source_status = old.status
           and reconciliation.source_revision_at = old.updated_at
           and reconciliation.target_status = new.status
           and reconciliation.target_state_sha256 = encode(
             extensions.digest(
               convert_to(jsonb_build_object(
                 'domain', 'iratepilot.flight.reconciliation.target.v1',
                 'subject_type', 'flight_service_request',
                 'subject_id', new.id::text,
                 'target_status', new.status,
                 'execution_mode', new.execution_mode,
                 'execution_scope_sha256', new.execution_scope_sha256
               )::text, 'UTF8'),
               'sha256'
             ),
             'hex'
           )
           and reconciliation.status = 'resolved'
           and reconciliation.resolution_evidence_sha256 is not null
           and reconciliation.resolved_at >= old.updated_at
           and resolver.role = 'admin'
      ) then
      raise exception 'Resolved servicing reconciliation evidence is required after review';
    end if;
    if new.status is distinct from old.status and not (
      (old.status = 'requested'
        and new.status in ('quoted', 'accepted', 'declined', 'failed', 'requires_review'))
      or (old.status = 'quoted'
        and new.status in ('accepted', 'declined', 'failed', 'requires_review'))
      or (old.status = 'accepted'
        and new.status in ('processing', 'declined', 'failed', 'requires_review'))
      or (old.status = 'processing'
        and new.status in ('completed', 'failed', 'requires_review'))
      or (old.status = 'requires_review'
        and new.status in ('accepted', 'processing', 'completed', 'declined', 'failed'))
    ) then
      raise exception 'Invalid flight service status transition from % to %', old.status, new.status;
    end if;
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  elsif tg_table_name = 'flight_provider_events' then
    if v_new - array['signature_verified', 'processing_status', 'processed_at']
      is distinct from v_old - array['signature_verified', 'processing_status', 'processed_at'] then
      raise exception 'Flight provider event identity and payload digest are immutable';
    end if;
    if old.signature_verified and not new.signature_verified then
      raise exception 'Flight provider signature evidence cannot be revoked';
    end if;
    if old.processed_at is not null and new.processed_at is distinct from old.processed_at then
      raise exception 'Flight provider event processing time is immutable after binding';
    end if;
    if old.processing_status <> 'processed' and new.processing_status = 'processed' then
      new.processed_at := clock_timestamp();
    end if;
    if new.processing_status is distinct from old.processing_status and not (
      (old.processing_status = 'received'
        and new.processing_status in ('verified', 'duplicate', 'blocked', 'failed'))
      or (old.processing_status = 'verified'
        and new.processing_status in ('processed', 'duplicate', 'blocked', 'failed'))
    ) then
      raise exception 'Invalid flight provider-event transition from % to %',
        old.processing_status, new.processing_status;
    end if;
  elsif tg_table_name = 'flight_idempotency_records' then
    if v_new - array[
      'response_sha256', 'resource_type', 'resource_id', 'status', 'locked_until', 'updated_at'
    ] is distinct from v_old - array[
      'response_sha256', 'resource_type', 'resource_id', 'status', 'locked_until', 'updated_at'
    ] then
      raise exception 'Flight idempotency key, request, scope, and mode are immutable';
    end if;
    if (old.response_sha256 is not null
      and new.response_sha256 is distinct from old.response_sha256)
      or (old.resource_id is not null and (
        new.resource_id is distinct from old.resource_id
        or new.resource_type is distinct from old.resource_type
      )) then
      raise exception 'Flight idempotency result evidence is immutable after binding';
    end if;
    if new.locked_until < old.locked_until then
      raise exception 'Flight idempotency lock evidence cannot move backwards';
    end if;
    if new.status is distinct from old.status
      and not (old.status = 'in_progress'
        and new.status in ('succeeded', 'failed', 'ambiguous')) then
      raise exception 'Invalid flight idempotency transition from % to %', old.status, new.status;
    end if;
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  elsif tg_table_name = 'flight_reconciliation_cases' then
    if v_new - array[
      'status', 'resolution_code', 'resolution_evidence_sha256',
      'resolved_by', 'resolved_at', 'updated_at'
    ] is distinct from v_old - array[
      'status', 'resolution_code', 'resolution_evidence_sha256',
      'resolved_by', 'resolved_at', 'updated_at'
    ] then
      raise exception 'Flight reconciliation identity and observed evidence are immutable';
    end if;
    if old.resolution_evidence_sha256 is not null and (
      new.resolution_evidence_sha256 is distinct from old.resolution_evidence_sha256
      or new.resolution_code is distinct from old.resolution_code
      or new.resolved_by is distinct from old.resolved_by
      or new.resolved_at is distinct from old.resolved_at
    ) then
      raise exception 'Flight reconciliation resolution evidence is immutable after binding';
    end if;
    if old.status <> 'resolved' and new.status = 'resolved' then
      new.resolved_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
    end if;
    if new.status is distinct from old.status and not (
      (old.status = 'open' and new.status in ('investigating', 'blocked', 'resolved'))
      or (old.status = 'investigating' and new.status in ('blocked', 'resolved'))
      or (old.status = 'blocked' and new.status in ('investigating', 'resolved'))
    ) then
      raise exception 'Invalid flight reconciliation transition from % to %', old.status, new.status;
    end if;
    new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  else
    raise exception 'Unsupported flight evidence relation %', tg_table_name;
  end if;
  return new;
end;
$$;

create or replace function public.reject_flight_evidence_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Append-only flight evidence cannot be updated or deleted';
end;
$$;

revoke all on function public.protect_flight_runtime_controls()
  from public, anon, authenticated, service_role;
revoke all on function public.record_flight_runtime_control_receipt()
  from public, anon, authenticated, service_role;
revoke all on function public.flight_runtime_capability_enabled(text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.enforce_flight_runtime_capability()
  from public, anon, authenticated;
revoke all on function public.enforce_flight_order_runtime_capability()
  from public, anon, authenticated;
revoke all on function public.enforce_flight_evidence_runtime_capability()
  from public, anon, authenticated;
revoke all on function public.lock_flight_order_parent()
  from public, anon, authenticated;
revoke all on function public.validate_flight_idempotency_resource()
  from public, anon, authenticated;
revoke all on function public.validate_flight_order_chain()
  from public, anon, authenticated;
revoke all on function public.validate_flight_offer_snapshot()
  from public, anon, authenticated;
revoke all on function public.validate_flight_offer_chain()
  from public, anon, authenticated;
revoke all on function public.validate_flight_reprice_chain()
  from public, anon, authenticated;
revoke all on function public.validate_flight_order_child_mode()
  from public, anon, authenticated;
revoke all on function public.validate_flight_order_transition()
  from public, anon, authenticated;
revoke all on function public.protect_flight_reprice_evidence()
  from public, anon, authenticated;
revoke all on function public.protect_flight_operational_evidence()
  from public, anon, authenticated;
revoke all on function public.reject_flight_evidence_mutation()
  from public, anon, authenticated, service_role;
grant execute on function public.flight_runtime_capability_enabled(text, text, text, text, text)
  to service_role;
grant execute on function public.enforce_flight_runtime_capability() to service_role;
grant execute on function public.enforce_flight_order_runtime_capability() to service_role;
grant execute on function public.enforce_flight_evidence_runtime_capability() to service_role;
grant execute on function public.lock_flight_order_parent() to service_role;
grant execute on function public.validate_flight_idempotency_resource() to service_role;
grant execute on function public.validate_flight_order_chain() to service_role;
grant execute on function public.validate_flight_offer_snapshot() to service_role;
grant execute on function public.validate_flight_offer_chain() to service_role;
grant execute on function public.validate_flight_reprice_chain() to service_role;
grant execute on function public.validate_flight_order_child_mode() to service_role;
grant execute on function public.validate_flight_order_transition() to service_role;
grant execute on function public.protect_flight_reprice_evidence() to service_role;
grant execute on function public.protect_flight_operational_evidence() to service_role;

create trigger flight_searches_runtime_guard
before insert or update on public.flight_searches
for each row execute function public.enforce_flight_runtime_capability('shopping');
create trigger flight_searches_immutable_guard
before insert or update on public.flight_searches
for each row execute function public.protect_flight_operational_evidence();
create trigger flight_offers_runtime_guard
before insert or update on public.flight_offers
for each row execute function public.enforce_flight_runtime_capability('shopping');
create trigger flight_offers_immutable_guard
before insert or update on public.flight_offers
for each row execute function public.protect_flight_operational_evidence();
create trigger flight_offers_evidence_guard
before insert or update of search_id, execution_mode, execution_scope_sha256, expires_at
on public.flight_offers
for each row execute function public.validate_flight_offer_chain();
create trigger flight_offer_segments_runtime_guard
before insert on public.flight_offer_segments
for each row execute function public.enforce_flight_runtime_capability('shopping');
create trigger flight_offer_segments_evidence_guard
before insert on public.flight_offer_segments
for each row execute function public.validate_flight_offer_snapshot();
create trigger flight_offer_segments_append_only_guard
before update or delete on public.flight_offer_segments
for each row execute function public.reject_flight_evidence_mutation();
create trigger flight_offer_fare_terms_runtime_guard
before insert on public.flight_offer_fare_terms
for each row execute function public.enforce_flight_runtime_capability('shopping');
create trigger flight_offer_fare_terms_evidence_guard
before insert on public.flight_offer_fare_terms
for each row execute function public.validate_flight_offer_snapshot();
create trigger flight_offer_fare_terms_append_only_guard
before update or delete on public.flight_offer_fare_terms
for each row execute function public.reject_flight_evidence_mutation();
create trigger flight_reprice_receipts_runtime_guard
before insert or update on public.flight_reprice_receipts
for each row execute function public.enforce_flight_runtime_capability('shopping');
create trigger flight_reprice_receipts_evidence_guard
before insert or update of offer_id, execution_mode, execution_scope_sha256,
  currency, original_total_cents, expires_at
on public.flight_reprice_receipts
for each row execute function public.validate_flight_reprice_chain();
create trigger flight_reprice_receipts_immutable_guard
before insert or update on public.flight_reprice_receipts
for each row execute function public.protect_flight_reprice_evidence();
create trigger flight_orders_runtime_guard
before insert or update on public.flight_orders
for each row execute function public.enforce_flight_order_runtime_capability();
create trigger flight_orders_evidence_guard
before insert or update of customer_id, search_id, offer_id, reprice_receipt_id,
  execution_mode, provider_code, provider_order_ref_ciphertext,
  execution_scope_sha256, provider_order_ref_sha256, provider_created_at,
  currency, total_cents, status
on public.flight_orders
for each row execute function public.validate_flight_order_chain();
create trigger flight_orders_immutable_guard
before insert or update on public.flight_orders
for each row execute function public.protect_flight_operational_evidence();
create trigger flight_orders_transition_guard
before insert or update of status on public.flight_orders
for each row execute function public.validate_flight_order_transition();
create trigger flight_passenger_refs_00_parent_lock_guard
before insert or update on public.flight_passenger_refs
for each row execute function public.lock_flight_order_parent();
create trigger flight_passenger_refs_runtime_guard
before insert or update on public.flight_passenger_refs
for each row execute function public.enforce_flight_runtime_capability('order');
create trigger flight_passenger_refs_order_mode_guard
before insert or update of order_id, execution_mode, execution_scope_sha256,
  traveler_sequence, traveler_type,
  secure_pii_record_ref, pii_record_sha256, provider_passenger_ref_ciphertext,
  provider_passenger_ref_sha256, retention_expires_at
on public.flight_passenger_refs
for each row execute function public.validate_flight_order_child_mode();
create trigger flight_passenger_refs_immutable_guard
before insert or update on public.flight_passenger_refs
for each row execute function public.protect_flight_operational_evidence();
create trigger flight_ticket_documents_00_parent_lock_guard
before insert or update on public.flight_ticket_documents
for each row execute function public.lock_flight_order_parent();
create trigger flight_ticket_documents_runtime_guard
before insert or update on public.flight_ticket_documents
for each row execute function public.enforce_flight_runtime_capability('ticketing');
create trigger flight_ticket_documents_order_mode_guard
before insert or update of order_id, passenger_ref_id, execution_mode,
  execution_scope_sha256, document_type,
  document_ref_ciphertext, document_ref_sha256, issuing_carrier, status, issued_at, voided_at
on public.flight_ticket_documents
for each row execute function public.validate_flight_order_child_mode();
create trigger flight_ticket_documents_immutable_guard
before insert or update on public.flight_ticket_documents
for each row execute function public.protect_flight_operational_evidence();
create trigger flight_payments_00_parent_lock_guard
before insert or update on public.flight_payments
for each row execute function public.lock_flight_order_parent();
create trigger flight_payments_runtime_guard
before insert or update on public.flight_payments
for each row execute function public.enforce_flight_runtime_capability('payment');
create trigger flight_payments_order_mode_guard
before insert or update of order_id, execution_mode, execution_scope_sha256, processor_code,
  processor_reference_ciphertext, processor_reference_sha256,
  idempotency_key_sha256, currency, authorized_cents,
  captured_cents, refunded_cents, status, authorized_at, captured_at
on public.flight_payments
for each row execute function public.validate_flight_order_child_mode();
create trigger flight_payments_immutable_guard
before insert or update on public.flight_payments
for each row execute function public.protect_flight_operational_evidence();
create trigger flight_service_requests_00_parent_lock_guard
before insert or update on public.flight_service_requests
for each row execute function public.lock_flight_order_parent();
create trigger flight_service_requests_runtime_guard
before insert or update on public.flight_service_requests
for each row execute function public.enforce_flight_runtime_capability('servicing');
create trigger flight_service_requests_order_mode_guard
before insert or update of order_id, execution_mode, execution_scope_sha256,
  requested_by, request_type,
  reason_code, secure_request_ref, request_sha256, status,
  provider_case_ref_ciphertext, provider_case_ref_sha256
on public.flight_service_requests
for each row execute function public.validate_flight_order_child_mode();
create trigger flight_service_requests_immutable_guard
before insert or update on public.flight_service_requests
for each row execute function public.protect_flight_operational_evidence();
create trigger flight_provider_events_00_parent_lock_guard
before insert or update on public.flight_provider_events
for each row execute function public.lock_flight_order_parent();
create trigger flight_provider_events_runtime_guard
before insert or update on public.flight_provider_events
for each row execute function public.enforce_flight_runtime_capability('provider_event');
create trigger flight_provider_events_order_mode_guard
before insert or update of order_id, execution_mode, execution_scope_sha256, provider_code,
  provider_event_id_sha256, event_type, payload_sha256,
  signature_verified, processing_status, occurred_at, processed_at
on public.flight_provider_events
for each row execute function public.validate_flight_order_child_mode();
create trigger flight_provider_events_immutable_guard
before insert or update on public.flight_provider_events
for each row execute function public.protect_flight_operational_evidence();
create trigger flight_reconciliation_cases_00_parent_lock_guard
before insert or update on public.flight_reconciliation_cases
for each row execute function public.lock_flight_order_parent();
create trigger flight_reconciliation_cases_order_mode_guard
before insert or update of order_id, execution_mode, execution_scope_sha256,
  provider_code, case_type, subject_type, subject_id,
  source_status, source_revision_at,
  expected_state_sha256, observed_state_sha256,
  target_status, target_authorized_cents, target_captured_cents,
  target_refunded_cents, target_state_sha256, status,
  resolution_code, resolution_evidence_sha256, resolved_by, resolved_at
on public.flight_reconciliation_cases
for each row execute function public.validate_flight_order_child_mode();
create trigger flight_idempotency_records_runtime_guard
before insert or update on public.flight_idempotency_records
for each row execute function public.enforce_flight_evidence_runtime_capability();
create trigger flight_idempotency_records_resource_guard
before insert or update of scope, execution_mode, execution_scope_sha256,
  key_sha256, request_sha256,
  response_sha256, resource_type, resource_id, status, locked_until
on public.flight_idempotency_records
for each row execute function public.validate_flight_idempotency_resource();
create trigger flight_idempotency_records_immutable_guard
before insert or update on public.flight_idempotency_records
for each row execute function public.protect_flight_operational_evidence();
create trigger flight_reconciliation_cases_runtime_guard
before insert or update on public.flight_reconciliation_cases
for each row execute function public.enforce_flight_evidence_runtime_capability();
create trigger flight_reconciliation_cases_immutable_guard
before insert or update on public.flight_reconciliation_cases
for each row execute function public.protect_flight_operational_evidence();
create trigger flight_runtime_control_receipts_append_only_guard
before update or delete on public.flight_runtime_control_receipts
for each row execute function public.reject_flight_evidence_mutation();

alter table public.flight_runtime_controls enable row level security;
alter table public.flight_runtime_controls force row level security;
alter table public.flight_runtime_control_receipts enable row level security;
alter table public.flight_runtime_control_receipts force row level security;
alter table public.flight_searches enable row level security;
alter table public.flight_searches force row level security;
alter table public.flight_offers enable row level security;
alter table public.flight_offers force row level security;
alter table public.flight_offer_segments enable row level security;
alter table public.flight_offer_segments force row level security;
alter table public.flight_offer_fare_terms enable row level security;
alter table public.flight_offer_fare_terms force row level security;
alter table public.flight_reprice_receipts enable row level security;
alter table public.flight_reprice_receipts force row level security;
alter table public.flight_orders enable row level security;
alter table public.flight_orders force row level security;
alter table public.flight_passenger_refs enable row level security;
alter table public.flight_passenger_refs force row level security;
alter table public.flight_ticket_documents enable row level security;
alter table public.flight_ticket_documents force row level security;
alter table public.flight_payments enable row level security;
alter table public.flight_payments force row level security;
alter table public.flight_service_requests enable row level security;
alter table public.flight_service_requests force row level security;
alter table public.flight_provider_events enable row level security;
alter table public.flight_provider_events force row level security;
alter table public.flight_idempotency_records enable row level security;
alter table public.flight_idempotency_records force row level security;
alter table public.flight_reconciliation_cases enable row level security;
alter table public.flight_reconciliation_cases force row level security;

revoke all on table
  public.flight_runtime_controls,
  public.flight_runtime_control_receipts,
  public.flight_searches,
  public.flight_offers,
  public.flight_offer_segments,
  public.flight_offer_fare_terms,
  public.flight_reprice_receipts,
  public.flight_orders,
  public.flight_passenger_refs,
  public.flight_ticket_documents,
  public.flight_payments,
  public.flight_service_requests,
  public.flight_provider_events,
  public.flight_idempotency_records,
  public.flight_reconciliation_cases
from public, anon, authenticated, service_role;

grant select on table public.flight_runtime_controls to service_role;
grant select on table public.flight_runtime_control_receipts to service_role;
grant select, update on table public.flight_runtime_controls to authenticated;
grant select on table public.flight_runtime_control_receipts to authenticated;
grant select, insert on table
  public.flight_offer_segments,
  public.flight_offer_fare_terms
to service_role;
grant select, insert, update on table
  public.flight_searches,
  public.flight_offers,
  public.flight_reprice_receipts,
  public.flight_orders,
  public.flight_passenger_refs,
  public.flight_ticket_documents,
  public.flight_payments,
  public.flight_service_requests,
  public.flight_provider_events,
  public.flight_idempotency_records,
  public.flight_reconciliation_cases
to service_role;

grant select on table public.flight_searches to authenticated;
grant select (
  id, search_id, provider_code, execution_mode, currency, base_fare_cents,
  tax_cents, fee_cents, total_cents, validating_carrier, segment_count,
  itinerary_sha256, fare_rules_sha256, status, expires_at, created_at
) on public.flight_offers to authenticated;
grant select on table
  public.flight_offer_segments,
  public.flight_offer_fare_terms
to authenticated;
grant select (
  id, offer_id, execution_mode, currency, original_total_cents,
  repriced_total_cents, status, customer_accepted_at, customer_accepted_by,
  customer_acceptance_version, customer_accepted_currency, customer_accepted_total_cents,
  expires_at, created_at
) on public.flight_reprice_receipts to authenticated;
grant update (
  customer_accepted_at, customer_accepted_by,
  customer_accepted_currency, customer_accepted_total_cents
) on public.flight_reprice_receipts to authenticated;
grant select (
  id, customer_id, search_id, offer_id, reprice_receipt_id, confirmation_code,
  execution_mode, provider_code, currency, total_cents, status,
  provider_created_at, ticketing_deadline_at, created_at, updated_at
) on public.flight_orders to authenticated;
grant select (
  id, order_id, passenger_ref_id, execution_mode, document_type,
  issuing_carrier, status, issued_at, voided_at, created_at, updated_at
) on public.flight_ticket_documents to authenticated;
grant select (
  id, order_id, execution_mode, processor_code, currency, authorized_cents,
  captured_cents, refunded_cents, status, authorized_at, captured_at,
  created_at, updated_at
) on public.flight_payments to authenticated;
grant select (
  id, order_id, requested_by, execution_mode, request_type, reason_code,
  status, created_at, updated_at
) on public.flight_service_requests to authenticated;
grant select on table public.flight_reconciliation_cases to authenticated;
grant update (
  status, resolution_code, resolution_evidence_sha256,
  resolved_by, resolved_at, updated_at
) on public.flight_reconciliation_cases to authenticated;

create policy "Flight admins read runtime controls"
on public.flight_runtime_controls for select to authenticated
using (exists (
  select 1 from public.profiles
   where profiles.id = auth.uid()
     and profiles.role = 'admin'
));

create policy "Flight admins update runtime controls"
on public.flight_runtime_controls for update to authenticated
using (exists (
  select 1 from public.profiles
   where profiles.id = auth.uid()
     and profiles.role = 'admin'
))
with check (
  updated_by = auth.uid()
  and exists (
    select 1 from public.profiles
     where profiles.id = auth.uid()
       and profiles.role = 'admin'
  )
);

create policy "Flight admins read runtime control receipts"
on public.flight_runtime_control_receipts for select to authenticated
using (exists (
  select 1 from public.profiles
   where profiles.id = auth.uid()
     and profiles.role = 'admin'
));

create policy "Flight admins read flight reconciliation"
on public.flight_reconciliation_cases for select to authenticated
using (exists (
  select 1 from public.profiles
   where profiles.id = auth.uid()
     and profiles.role = 'admin'
));

create policy "Flight admins resolve flight reconciliation"
on public.flight_reconciliation_cases for update to authenticated
using (exists (
  select 1 from public.profiles
   where profiles.id = auth.uid()
     and profiles.role = 'admin'
))
with check (
  resolved_by is null
  or (
    resolved_by = auth.uid()
    and exists (
      select 1 from public.profiles
       where profiles.id = auth.uid()
         and profiles.role = 'admin'
    )
  )
);

create policy "Customers read own flight searches"
on public.flight_searches for select to authenticated
using (customer_id = auth.uid());

create policy "Customers read own flight offers"
on public.flight_offers for select to authenticated
using (exists (
  select 1 from public.flight_searches
  where flight_searches.id = flight_offers.search_id
    and flight_searches.customer_id = auth.uid()
));

create policy "Customers read own flight offer segments"
on public.flight_offer_segments for select to authenticated
using (exists (
  select 1
  from public.flight_offers
  join public.flight_searches on flight_searches.id = flight_offers.search_id
  where flight_offers.id = flight_offer_segments.offer_id
    and flight_searches.customer_id = auth.uid()
));

create policy "Customers read own flight fare terms"
on public.flight_offer_fare_terms for select to authenticated
using (exists (
  select 1
  from public.flight_offers
  join public.flight_searches on flight_searches.id = flight_offers.search_id
  where flight_offers.id = flight_offer_fare_terms.offer_id
    and flight_searches.customer_id = auth.uid()
));

create policy "Customers read own flight reprice receipts"
on public.flight_reprice_receipts for select to authenticated
using (exists (
  select 1
  from public.flight_offers
  join public.flight_searches on flight_searches.id = flight_offers.search_id
  where flight_offers.id = flight_reprice_receipts.offer_id
    and flight_searches.customer_id = auth.uid()
));

create policy "Customers accept own changed flight price"
on public.flight_reprice_receipts for update to authenticated
using (exists (
  select 1
  from public.flight_offers
  join public.flight_searches on flight_searches.id = flight_offers.search_id
  where flight_offers.id = flight_reprice_receipts.offer_id
    and flight_searches.customer_id = auth.uid()
))
with check (
  customer_accepted_by = auth.uid()
  and exists (
    select 1
    from public.flight_offers
    join public.flight_searches on flight_searches.id = flight_offers.search_id
    where flight_offers.id = flight_reprice_receipts.offer_id
      and flight_searches.customer_id = auth.uid()
  )
);

create policy "Customers read own flight orders"
on public.flight_orders for select to authenticated
using (customer_id = auth.uid());

create policy "Customers read own flight tickets"
on public.flight_ticket_documents for select to authenticated
using (exists (
  select 1 from public.flight_orders
  where flight_orders.id = flight_ticket_documents.order_id
    and flight_orders.customer_id = auth.uid()
));

create policy "Customers read own flight payments"
on public.flight_payments for select to authenticated
using (exists (
  select 1 from public.flight_orders
  where flight_orders.id = flight_payments.order_id
    and flight_orders.customer_id = auth.uid()
));

create policy "Customers read own flight service requests"
on public.flight_service_requests for select to authenticated
using (exists (
  select 1 from public.flight_orders
  where flight_orders.id = flight_service_requests.order_id
    and flight_orders.customer_id = auth.uid()
));

comment on table public.flight_runtime_controls is
  'Fail-closed database activation controls; all external flight capabilities start disabled.';
comment on table public.flight_runtime_control_receipts is
  'Append-only administrator-attributed runtime-control changes; never credentials or raw payloads.';
comment on table public.flight_searches is
  'Sanitized flight shopping criteria; never passenger names, contacts, or identity documents.';
comment on table public.flight_offers is
  'Normalized flight offers with encrypted provider references and payload digests only.';
comment on table public.flight_offer_segments is
  'Immutable normalized non-PII itinerary legs retained for confirmations, trips, and servicing.';
comment on table public.flight_offer_fare_terms is
  'Immutable normalized non-PII fare and baggage terms bound to an offer digest.';
comment on table public.flight_reprice_receipts is
  'Immutable-at-application reprice evidence bound to a single offer and customer acceptance.';
comment on table public.flight_passenger_refs is
  'References to separately protected passenger PII; this table must never contain raw PII or documents.';
comment on table public.flight_payments is
  'Payment lifecycle metadata and encrypted processor references; never PAN, CVC, or client secrets.';
comment on table public.flight_provider_events is
  'Verified airline/content-provider event metadata and payload digests only; payment-processor and raw webhook payloads are not stored.';
comment on table public.flight_idempotency_records is
  'SHA-256 idempotency receipts; raw idempotency keys are never persisted.';
comment on table public.flight_reconciliation_cases is
  'Digest-bound discrepancy cases without raw provider, passenger, payment, or credential payloads.';

commit;

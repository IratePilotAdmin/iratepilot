begin;

alter table public.property_pms_connections
  add column if not exists hotel_authorized boolean not null default false,
  add column if not exists room_type_mapping text,
  add column if not exists rate_plan_mapping text,
  add column if not exists tax_fee_mapping text,
  add column if not exists cancellation_policy_mapping text;

alter table public.property_pms_connections
  drop constraint if exists property_pms_connections_mapping_length,
  add constraint property_pms_connections_mapping_length check (
    coalesce(length(room_type_mapping), 0) <= 4000
    and coalesce(length(rate_plan_mapping), 0) <= 4000
    and coalesce(length(tax_fee_mapping), 0) <= 4000
    and coalesce(length(cancellation_policy_mapping), 0) <= 4000
  );

comment on column public.property_pms_connections.hotel_authorized is
  'Partner attestation that the hotel owner or authorized manager approved PMS onboarding.';
comment on column public.property_pms_connections.room_type_mapping is
  'Non-secret pilot mapping between iRatePilot room types and PMS room codes.';
comment on column public.property_pms_connections.rate_plan_mapping is
  'Non-secret pilot mapping between iRatePilot rate plans and PMS rate codes.';
comment on column public.property_pms_connections.tax_fee_mapping is
  'Non-secret pilot mapping notes for taxes and fees.';
comment on column public.property_pms_connections.cancellation_policy_mapping is
  'Non-secret pilot mapping between cancellation policies and PMS policy codes.';

commit;


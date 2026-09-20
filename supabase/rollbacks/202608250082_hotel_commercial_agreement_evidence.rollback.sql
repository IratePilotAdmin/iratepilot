begin;

-- Non-destructive compensation hold. Executed-agreement metadata is legal and
-- audit evidence, so rollback never drops or rewrites it. The hold deactivates
-- affected or commercially controlled properties, blocks new version/receipt
-- recording, and makes every agreement dynamically ineffective. A stale or
-- tampered review/property binding therefore cannot retain active state.
-- Termination and retirement RPCs remain available so operators can continue
-- reducing authority.
update public.properties as property_record
set active = false
where property_record.active
  and (
    property_record.listing_scope = 'commercial'
    or exists (
      select 1
      from public.hotel_commercial_agreement_evidence as agreement
      where agreement.property_id = property_record.id
    )
  );

revoke all on function public.record_counsel_approved_hotel_commercial_agreement_version(
  text, text, text, timestamptz, timestamptz, text
) from public, anon, authenticated, service_role;
revoke all on function public.record_hotel_commercial_agreement_receipt(
  uuid, uuid, text, text, text, text, text, text,
  timestamptz, timestamptz, timestamptz, timestamptz,
  boolean, boolean, text
) from public, anon, authenticated, service_role;
revoke all on function public.get_hotel_commercial_agreement_admin_state(uuid[])
  from public, anon, authenticated, service_role;
revoke all on function public.list_available_counsel_approved_hotel_commercial_agreement_versions()
  from public, anon, authenticated, service_role;

create or replace function public.current_hotel_commercial_agreement_evidence_id(
  p_property_id uuid
)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select null::uuid;
$$;

create or replace function public.is_hotel_commercial_agreement_effective(
  p_property_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select false;
$$;

revoke all on function public.current_hotel_commercial_agreement_evidence_id(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.is_hotel_commercial_agreement_effective(uuid)
  from public, anon, authenticated, service_role;

comment on function public.is_hotel_commercial_agreement_effective(uuid) is
  'Fail-closed migration 202608250082 compensation hold. No hotel agreement can authorize commercial review or publication.';

commit;

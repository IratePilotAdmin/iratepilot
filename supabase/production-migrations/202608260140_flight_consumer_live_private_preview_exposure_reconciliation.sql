begin;

-- Gate 140 is a route-free reconciliation composition over immutable evidence.
-- It derives every Gate 139 authorization input in the database after a
-- successful Gate 119/Gate 101/Gate 118/Gate 116 chain. It performs no Duffel
-- or Stripe request and grants no public-release or commercial authority.
do $migration$
begin
  if to_regclass(
      'public.flight_consumer_live_public_shopping_admissions'
    ) is null
    or to_regclass(
      'public.flight_consumer_live_public_shopping_dispatches'
    ) is null
    or to_regclass(
      'public.flight_consumer_live_duffel_shopping_attempts'
    ) is null
    or to_regclass(
      'public.flight_consumer_live_duffel_offer_source_batches'
    ) is null
    or to_regclass(
      'public.flight_consumer_live_public_offer_projection_batches'
    ) is null
    or to_regclass(
      'public.flight_consumer_live_private_preview_membership_events'
    ) is null
    or to_regclass(
      'public.flight_consumer_live_private_preview_exposures'
    ) is null
    or to_regprocedure(
      'public.canonical_flight_consumer_public_offer_json_v1(jsonb)'
    ) is null
    or to_regprocedure(
      'public.authorize_flight_consumer_live_private_preview_exposure_v1(text,uuid,text,text,text,uuid,text,text,text,integer,integer,integer,timestamp with time zone)'
    ) is null
    or to_regprocedure('extensions.digest(bytea,text)') is null
    or to_regprocedure('auth.role()') is null then
    raise exception
      'Flight Consumer Live private-preview reconciliation prerequisites are missing';
  end if;
end;
$migration$;

create function public.reconcile_flight_consumer_live_private_preview_exposure_v1(
  p_admission_id uuid,
  p_admission_receipt_sha256 text,
  p_subject_sha256 text,
  p_request_sha256 text
)
returns table (
  decision text, exposure_id uuid, exposure_receipt_sha256 text,
  reconciliation_mode text, exposure_not_after timestamptz,
  source_offer_count integer, projected_offer_count integer,
  refused_offer_count integer, private_preview_exposure_authorized boolean,
  consumer_public_release_authorized boolean, order_authorized boolean,
  stripe_dispatch_authorized boolean, booking_authorized boolean,
  payment_authorized boolean, capture_authorized boolean,
  refund_authorized boolean, settlement_authorized boolean,
  ticketing_authorized boolean, servicing_authorized boolean,
  consumer_release_enabled boolean, blind_retry_authorized boolean
)
language plpgsql security definer
set search_path = pg_catalog, public, extensions
as $reconcile_exposure$
declare
  v_admission public.flight_consumer_live_public_shopping_admissions;
  v_dispatch public.flight_consumer_live_public_shopping_dispatches;
  v_attempt public.flight_consumer_live_duffel_shopping_attempts;
  v_source_batch public.flight_consumer_live_duffel_offer_source_batches;
  v_projection public.flight_consumer_live_public_offer_projection_batches;
  v_membership public.flight_consumer_live_private_preview_membership_events;
  v_existing public.flight_consumer_live_private_preview_exposures;
  v_now timestamptz;
  v_preview_execution_scope_sha256 text;
  v_exposure_not_after timestamptz;
  v_min_presentation_not_after timestamptz;
  v_min_offer_not_after timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role'
    or p_admission_id is null
    or p_admission_receipt_sha256 is null
    or p_admission_receipt_sha256 !~ '^[0-9a-f]{64}$'
    or p_subject_sha256 is null
    or p_subject_sha256 !~ '^[0-9a-f]{64}$'
    or p_request_sha256 is null
    or p_request_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception
      'Flight Consumer Live private-preview reconciliation envelope is invalid';
  end if;

  -- Match Gate 139's lock order. The table locks make fresh creation and
  -- exact replay deterministic across concurrent workers, while a membership
  -- revoke cannot interleave between expiry selection and authorization.
  lock table public.flight_consumer_live_private_preview_membership_events
    in share row exclusive mode;
  lock table public.flight_consumer_live_private_preview_exposures
    in share row exclusive mode;

  select * into v_admission
    from public.flight_consumer_live_public_shopping_admissions as admission
   where admission.id = p_admission_id
   for share;
  if v_admission.id is not null then
    select * into v_dispatch
      from public.flight_consumer_live_public_shopping_dispatches as dispatch
     where dispatch.admission_id = v_admission.id
     for share;
  end if;
  if v_dispatch.id is not null then
    select * into v_attempt
      from public.flight_consumer_live_duffel_shopping_attempts as attempt
     where attempt.id = v_dispatch.shopping_attempt_id
     for share;
  end if;
  if v_attempt.id is not null then
    select * into v_source_batch
      from public.flight_consumer_live_duffel_offer_source_batches as batch
     where batch.source_shopping_attempt_id = v_attempt.id
     for share;
  end if;
  if v_admission.id is not null then
    select * into v_projection
      from public.flight_consumer_live_public_offer_projection_batches as batch
     where batch.admission_id = v_admission.id
     for share;
    select * into v_membership
      from public.flight_consumer_live_private_preview_membership_events as event
     where event.policy_sha256 = v_admission.policy_sha256
       and event.cohort_sha256 = v_admission.cohort_sha256
       and event.subject_sha256 = v_admission.subject_sha256
     order by event.event_sequence desc
     limit 1;
    select * into v_existing
      from public.flight_consumer_live_private_preview_exposures as exposure
     where exposure.admission_id = v_admission.id;
  end if;
  v_now := clock_timestamp();

  -- Reject before deriving or forwarding any evidence if the caller's four
  -- bindings or the immutable success chain are missing or inconsistent.
  if v_admission.id is null
    or v_admission.admission_receipt_sha256
      is distinct from p_admission_receipt_sha256
    or v_admission.subject_sha256 is distinct from p_subject_sha256
    or v_admission.request_sha256 is distinct from p_request_sha256
    or v_dispatch.id is null
    or v_dispatch.admission_id is distinct from v_admission.id
    or v_dispatch.admission_receipt_sha256
      is distinct from v_admission.admission_receipt_sha256
    or v_dispatch.subject_sha256 is distinct from v_admission.subject_sha256
    or v_dispatch.public_request_sha256
      is distinct from v_admission.request_sha256
    or v_attempt.id is null
    or v_attempt.id is distinct from v_dispatch.shopping_attempt_id
    or v_attempt.attempt_state <> 'succeeded'
    or v_attempt.attempt_revision <> 2
    or v_source_batch.source_shopping_attempt_id is null
    or v_source_batch.source_shopping_attempt_id is distinct from v_attempt.id
    or v_source_batch.source_response_sha256
      is distinct from v_attempt.terminal_response_sha256
    or v_source_batch.source_offer_count is distinct from v_attempt.offer_count
    or v_projection.id is null
    or v_projection.admission_id is distinct from v_admission.id
    or v_projection.source_shopping_attempt_id is distinct from v_attempt.id
    or v_projection.source_response_sha256
      is distinct from v_source_batch.source_response_sha256
    or v_projection.source_offer_count
      is distinct from v_source_batch.source_offer_count
    or v_projection.source_offer_count < 0
    or v_projection.projected_offer_count < 0
    or v_projection.refused_offer_count < 0
    or v_projection.source_offer_count <>
      v_projection.projected_offer_count + v_projection.refused_offer_count
    or v_membership.id is null
    or v_membership.event_type <> 'granted'
    or v_membership.membership_not_after <= v_now then
    raise exception
      'Flight Consumer Live private-preview reconciliation evidence is unavailable';
  end if;

  v_preview_execution_scope_sha256 := encode(extensions.digest(convert_to(
    public.canonical_flight_consumer_public_offer_json_v1(jsonb_build_object(
      'version',
        'flight-consumer-production-private-preview-exposure-scope-v1',
      'migrationVersion', '202608260139',
      'admissionExecutionScopeSha256', v_admission.execution_scope_sha256,
      'policySha256', v_admission.policy_sha256,
      'admissionPolicySha256', v_admission.admission_policy_sha256,
      'cohortSha256', v_admission.cohort_sha256,
      'privatePreviewExposureOnly', true,
      'consumerPublicReleaseAuthorized', false,
      'orderAuthorized', false,
      'stripeDispatchAuthorized', false,
      'bookingAuthorized', false,
      'paymentAuthorized', false,
      'captureAuthorized', false,
      'refundAuthorized', false,
      'settlementAuthorized', false,
      'ticketingAuthorized', false,
      'servicingAuthorized', false,
      'consumerReleaseEnabled', false,
      'blindRetryAuthorized', false
    )), 'UTF8'), 'sha256'), 'hex');

  if v_existing.id is not null then
    -- Gate 139 treats expiry as part of its immutable receipt. Reusing the
    -- stored value is mandatory for an exact replay and prevents extension.
    v_exposure_not_after := v_existing.exposure_not_after;
  else
    select min(projection.presentation_expires_at),
           min(projection.offer_expires_at)
      into v_min_presentation_not_after, v_min_offer_not_after
      from public.flight_consumer_live_public_offer_projections as projection
     where projection.batch_id = v_projection.id;

    if (v_projection.projected_offer_count = 0 and (
        v_min_presentation_not_after is not null
        or v_min_offer_not_after is not null
      )) or (v_projection.projected_offer_count > 0 and (
        v_min_presentation_not_after is null
        or v_min_offer_not_after is null
      )) then
      raise exception
        'Flight Consumer Live private-preview reconciliation lifetime is unavailable';
    end if;

    v_exposure_not_after := least(
      v_now + interval '60 seconds',
      v_membership.membership_not_after - interval '1 microsecond',
      coalesce(v_min_presentation_not_after, v_now + interval '60 seconds'),
      coalesce(v_min_offer_not_after, v_now + interval '60 seconds')
    );
    if v_exposure_not_after <= v_now
      or v_exposure_not_after > v_now + interval '60 seconds' then
      raise exception
        'Flight Consumer Live private-preview reconciliation lifetime is unavailable';
    end if;
  end if;

  -- This is the only write-capable call. Gate 139 re-locks and revalidates the
  -- complete chain, appends one exposure receipt, or returns its exact replay.
  return query
  select authorization_result.*
    from public.authorize_flight_consumer_live_private_preview_exposure_v1(
      v_preview_execution_scope_sha256,
      v_admission.id,
      v_admission.admission_receipt_sha256,
      v_admission.subject_sha256,
      v_admission.request_sha256,
      v_dispatch.id,
      v_dispatch.dispatch_receipt_sha256,
      v_projection.projection_batch_sha256,
      v_projection.projection_receipt_sha256,
      v_source_batch.source_offer_count,
      v_projection.projected_offer_count,
      v_projection.refused_offer_count,
      v_exposure_not_after
    ) as authorization_result;
end;
$reconcile_exposure$;

alter function public.reconcile_flight_consumer_live_private_preview_exposure_v1(
  uuid,text,text,text
) owner to postgres;

revoke all on function public.reconcile_flight_consumer_live_private_preview_exposure_v1(
  uuid,text,text,text
) from public, anon, authenticated, service_role;
grant execute on function public.reconcile_flight_consumer_live_private_preview_exposure_v1(
  uuid,text,text,text
) to service_role;

comment on function public.reconcile_flight_consumer_live_private_preview_exposure_v1(
  uuid,text,text,text
) is
  'Service-role-only crash-safe composition that derives an exact Gate 139 private-preview exposure from immutable succeeded Gate 115/119/118/116 evidence. Fresh exposure is bounded to at most 60 seconds; exact replay preserves the original expiry. It grants no public-release or commercial authority.';

commit;

begin;

-- Release receipts are short lived, but hotel intake and agreement evidence can
-- still change during that window. Recheck the current commercial graph at
-- every live launch authorization and again while finalizing a live payment.
create function public.has_current_bookable_hotel_property(
  p_property_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1
    from public.properties as property_record
    join public.partners as partner
      on partner.id = property_record.partner_id
    where property_record.id = p_property_id
      and property_record.active
      and property_record.star_rating in (4, 5)
      and property_record.listing_scope = 'commercial'
      and property_record.direct_request_mode = 'request_only'
      and property_record.commercial_terms_version =
        'hotel_partner_fee_disclosure_13_3_2026-08-22_v1'
      and property_record.commercial_verified_at is not null
      and property_record.commercial_verified_by is not null
      and nullif(trim(property_record.support_contact_email), '') is not null
      and partner.status = 'approved'
      and exists (
        select 1
        from public.partner_application_review_evidence as intake_review
        join public.partner_applications as application
          on application.id = intake_review.application_id
        where application.property_id = property_record.id
          and application.status = 'approved'
          and intake_review.decision = 'approved'
          and intake_review.legal_business_verified
          and intake_review.representative_authority_verified
          and intake_review.content_rights_verified
          and intake_review.commercial_terms_acknowledgement_verified
          and intake_review.inactive_draft_scope_confirmed
      )
      and exists (
        select 1
        from public.property_commercial_review_evidence as review
        where review.property_id = property_record.id
          and review.commercial_agreement_evidence_id =
            public.current_hotel_commercial_agreement_evidence_id(property_record.id)
          and review.id = (
            select latest_review.id
            from public.property_commercial_review_evidence as latest_review
            where latest_review.property_id = property_record.id
              and latest_review.commercial_agreement_evidence_id =
                public.current_hotel_commercial_agreement_evidence_id(property_record.id)
            order by latest_review.created_at desc, latest_review.id desc
            limit 1
          )
          and review.commercial_terms_version =
            property_record.commercial_terms_version
          and lower(trim(review.support_contact_email)) =
            lower(trim(property_record.support_contact_email))
          and review.reviewer_id = property_record.commercial_verified_by
          and review.created_at = property_record.commercial_verified_at
          and review.legal_business_verified
          and review.sole_owner_conflict_acknowledged
          and review.commercial_terms_evidence_verified
          and review.support_contact_verified
      )
  );
end;
$$;

revoke all on function public.has_current_bookable_hotel_property(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.has_current_bookable_hotel_property(uuid)
  to service_role;

create function public.has_current_commercial_hotel_inventory()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.properties as property_record
    where public.has_current_bookable_hotel_property(property_record.id)
      and exists (
        select 1
        from public.rooms as room
        where room.property_id = property_record.id
          and room.active
      )
      and not exists (
        select 1
        from public.rooms as room
        where room.property_id = property_record.id
          and room.active
          and (
            room.base_rate is null
            or room.base_rate < 25 or room.base_rate > 25000
            or room.max_guests is null
            or room.max_guests < 1 or room.max_guests > 30
            or nullif(trim(room.direct_rate_plan_code), '') is null
            or nullif(trim(room.direct_rate_plan_name), '') is null
            or room.direct_currency_code is distinct from 'USD'
            or length(trim(coalesce(room.direct_cancellation_policy, ''))) < 10
            or nullif(trim(room.direct_cancellation_policy_version), '') is null
            or not exists (
              select 1
              from public.inventory as inventory_record
              where inventory_record.room_id = room.id
                and inventory_record.stay_date >= current_date
                and inventory_record.available_units between 1 and 500
                and inventory_record.rate between 25 and 25000
                and inventory_record.direct_tax_amount between 0 and 25000
                and inventory_record.direct_mandatory_fee_amount between 0 and 25000
            )
          )
      )
  );
$$;

revoke all on function public.has_current_commercial_hotel_inventory()
  from public, anon, authenticated, service_role;
grant execute on function public.has_current_commercial_hotel_inventory()
  to service_role;

create or replace function public.complete_approved_booking_payment(
  p_booking_id uuid,
  p_customer_id uuid,
  p_payment_intent_id text,
  p_amount_total_cents integer,
  p_payment_mode text
) returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  if p_payment_intent_id is null or p_payment_intent_id !~ '^pi_' then
    raise exception 'Invalid payment reference';
  end if;
  if p_payment_mode not in ('test', 'live') then
    raise exception 'Invalid payment mode';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found or v_booking.customer_id <> p_customer_id then
    raise exception 'Booking not found';
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'Only confirmed reservations can be paid';
  end if;
  if round(v_booking.total * 100)::integer <> p_amount_total_cents then
    raise exception 'Payment amount does not match the reservation total';
  end if;
  if v_booking.stripe_payment_intent_id is not null then
    if v_booking.stripe_payment_intent_id = p_payment_intent_id
      and v_booking.stripe_payment_mode = p_payment_mode then
      return v_booking;
    end if;
    raise exception 'This reservation already has a different payment';
  end if;
  if p_payment_mode = 'live'
    and not public.has_current_bookable_hotel_property(v_booking.property_id)
  then
    raise exception 'The hotel is no longer commercially authorized for live payment';
  end if;

  update public.bookings
  set stripe_payment_intent_id = p_payment_intent_id,
      stripe_payment_mode = p_payment_mode,
      updated_at = now()
  where id = p_booking_id
  returning * into v_booking;

  update public.booking_financials
  set status = 'eligible'
  where booking_id = p_booking_id
    and status = 'awaiting_payment';

  insert into public.notifications (user_id, title, body)
  values (
    v_booking.customer_id,
    'Payment received',
    case when p_payment_mode = 'test'
      then 'Your Stripe test payment for ' || v_booking.confirmation_code ||
        ' was recorded. No live card charge was created.'
      else 'Your payment for ' || v_booking.confirmation_code ||
        ' was recorded and your reservation is confirmed.'
    end
  );

  return v_booking;
end;
$$;

revoke all on function public.complete_approved_booking_payment(uuid, uuid, text, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_approved_booking_payment(uuid, uuid, text, integer, text)
  to service_role;

commit;

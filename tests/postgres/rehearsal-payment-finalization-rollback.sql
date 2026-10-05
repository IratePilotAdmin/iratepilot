-- Isolated rehearsal project only. Every identity, agreement, payment reference,
-- and reservation below is synthetic and rolls back. No Stripe charge is made.
begin;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values
  ('11000000-0000-4000-8000-000000000011', 'approval-owner@example.invalid', now(), '{"full_name":"Synthetic Owner"}'),
  ('11000000-0000-4000-8000-000000000012', 'approval-reviewer@example.invalid', now(), '{"full_name":"Synthetic Reviewer"}');
update public.profiles set role = 'admin'
where id = '11000000-0000-4000-8000-000000000012';
select set_config('request.jwt.claim.sub', '11000000-0000-4000-8000-000000000012', true);

insert into public.partners (id, owner_id, business_name, status)
values ('22000000-0000-4000-8000-000000000022', '11000000-0000-4000-8000-000000000011', 'Synthetic Rehearsal Partner', 'approved');
insert into public.properties (
  id, partner_id, name, slug, type, city, country, listing_scope, active,
  star_rating, image_url, amenities
) values (
  '33000000-0000-4000-8000-000000000033',
  '22000000-0000-4000-8000-000000000022', 'Synthetic Approval Hotel',
  'synthetic-approval-hotel', 'hotel', 'Test City', 'US',
  'legacy_quarantined', false, 4,
  'https://example.invalid/synthetic-hotel.jpg', array['Synthetic Wi-Fi']
);

insert into public.partner_applications (
  id, property_id, property_name, contact_name, email, property_type, status,
  legal_business_name, support_contact_email, commercial_terms_acknowledged,
  commercial_terms_version_acknowledged, commercial_terms_acknowledged_at
) values (
  '55000000-0000-4000-8000-000000000055',
  '33000000-0000-4000-8000-000000000033',
  'Synthetic Approval Hotel', 'Synthetic Owner', 'approval-owner@example.invalid',
  'hotel', 'approved', 'Synthetic Rehearsal Partner',
  'approval-owner@example.invalid', true,
  'hotel_partner_fee_disclosure_13_3_2026-08-22_v1', now() - interval '3 days'
);
insert into public.partner_application_review_evidence (
  application_id, reviewer_id, decision, legal_business_verified,
  representative_authority_verified, content_rights_verified,
  commercial_terms_acknowledgement_verified, inactive_draft_scope_confirmed,
  evidence_summary
) values (
  '55000000-0000-4000-8000-000000000055',
  '11000000-0000-4000-8000-000000000012', 'approved',
  true, true, true, true, true,
  'Synthetic approval gate test only; transaction rolls back.'
);

insert into public.hotel_commercial_agreement_versions (
  agreement_version, template_document_sha256, counsel_approval_reference,
  counsel_approved_at, effective_at, recorded_by, evidence_summary
) values (
  'synthetic_rehearsal_v1', repeat('a', 64), 'synthetic-counsel-ref',
  now() - interval '4 days', now() - interval '3 days',
  '11000000-0000-4000-8000-000000000012',
  'Synthetic agreement version for rollback-only approval test.'
);
insert into public.hotel_commercial_agreement_evidence (
  id, application_id, partner_id, property_id, agreement_version,
  fee_disclosure_version, execution_reference, agreement_document_sha256,
  hotel_legal_business_name, hotel_signatory_name, hotel_signatory_title,
  hotel_signed_at, iratepilot_signed_at, effective_at,
  representative_authority_verified, executed_agreement_verified,
  recorded_by, evidence_summary
) values (
  '66000000-0000-4000-8000-000000000066',
  '55000000-0000-4000-8000-000000000055',
  '22000000-0000-4000-8000-000000000022',
  '33000000-0000-4000-8000-000000000033',
  'synthetic_rehearsal_v1',
  'hotel_partner_fee_disclosure_13_3_2026-08-22_v1',
  'synthetic-execution-ref', repeat('b', 64),
  'Synthetic Rehearsal Partner', 'Synthetic Owner', 'Owner',
  now() - interval '2 days', now() - interval '2 days', now() - interval '1 day',
  true, true, '11000000-0000-4000-8000-000000000012',
  'Synthetic agreement evidence for rollback-only approval test.'
);
insert into public.property_commercial_review_evidence (
  id, property_id, reviewer_id, commercial_terms_version, support_contact_email,
  legal_business_verified, sole_owner_conflict_acknowledged,
  reviewer_is_partner_owner, commercial_terms_evidence_verified,
  support_contact_verified, evidence_summary, commercial_agreement_evidence_id
) values (
  '77000000-0000-4000-8000-000000000077',
  '33000000-0000-4000-8000-000000000033',
  '11000000-0000-4000-8000-000000000012',
  'hotel_partner_fee_disclosure_13_3_2026-08-22_v1',
  'approval-owner@example.invalid',
  true, true, false, true, true,
  'Synthetic property review for rollback-only approval test.',
  '66000000-0000-4000-8000-000000000066'
);

update public.properties
set listing_scope = 'commercial', direct_request_mode = 'request_only',
    commercial_terms_version = 'hotel_partner_fee_disclosure_13_3_2026-08-22_v1',
    support_contact_email = 'approval-owner@example.invalid',
    commercial_verified_by = '11000000-0000-4000-8000-000000000012',
    commercial_verified_at = (
      select created_at from public.property_commercial_review_evidence
      where id = '77000000-0000-4000-8000-000000000077'
    )
where id = '33000000-0000-4000-8000-000000000033';

insert into public.rooms (
  id, property_id, name, max_guests, base_rate, active,
  direct_rate_plan_code, direct_rate_plan_name, direct_currency_code,
  direct_cancellation_policy, direct_cancellation_policy_version
) values (
  '44000000-0000-4000-8000-000000000044',
  '33000000-0000-4000-8000-000000000033',
  'Synthetic King', 2, 109, true, 'SYNTH-BAR', 'Synthetic Flexible', 'USD',
  'Cancel 24 hours before arrival for no charge.', 'synthetic-policy-v1'
);
insert into public.inventory (
  room_id, stay_date, available_units, rate,
  direct_tax_amount, direct_mandatory_fee_amount
) values (
  '44000000-0000-4000-8000-000000000044', current_date + 7,
  1, 109, 10, 0
);

select id, active from public.set_property_publication_state(
  '33000000-0000-4000-8000-000000000033', true
);
do $assert_publication$
begin
  if not public.is_approved_marketplace_property(
    '33000000-0000-4000-8000-000000000033'
  ) then
    raise exception 'Synthetic property did not pass marketplace approval';
  end if;
end;
$assert_publication$;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values (
  '11000000-0000-4000-8000-000000000013',
  'approval-guest@example.invalid', now(), '{"full_name":"Synthetic Guest"}'
);

-- Exercise the legacy transaction gates inside this transaction only. Their
-- persisted values remain false, so no real approval or payment is enabled.
update public.hotel_legacy_transaction_controls
set booking_approval_enabled = true,
    payment_finalization_enabled = true,
    reward_issuance_enabled = true
where singleton = true;

insert into public.bookings (
  id, confirmation_code, customer_id, property_id, room_id,
  check_in, check_out, guests, subtotal, taxes, fees, total, status
) values (
  '88000000-0000-4000-8000-000000000088', 'SYNTHETIC-ONLY-001',
  '11000000-0000-4000-8000-000000000013',
  '33000000-0000-4000-8000-000000000033',
  '44000000-0000-4000-8000-000000000044',
  current_date + 7, current_date + 8, 1, 109, 10, 0, 119, 'confirmed'
);
insert into public.booking_financials (
  booking_id, partner_id, gross_room_revenue, partner_commission,
  reward_program_fee, partner_net, status,
  partner_commission_rate_bps, reward_program_fee_rate_bps,
  fee_schedule_version
) values (
  '88000000-0000-4000-8000-000000000088',
  '22000000-0000-4000-8000-000000000022',
  109, 14.17, 3.27, 91.56, 'awaiting_payment', 1300, 300,
  'hotel_partner_commission_13_reward_fee_3_v1'
);

select id, stripe_payment_mode from public.complete_approved_booking_payment(
  '88000000-0000-4000-8000-000000000088',
  '11000000-0000-4000-8000-000000000013',
  'pi_synthetic_rehearsal_001', 11900, 'test'
);

-- Replaying the same Stripe reference must return the existing paid booking.
select id from public.complete_approved_booking_payment(
  '88000000-0000-4000-8000-000000000088',
  '11000000-0000-4000-8000-000000000013',
  'pi_synthetic_rehearsal_001', 11900, 'test'
);

do $assert_payment$
begin
  if not exists (
    select 1 from public.bookings
    where id = '88000000-0000-4000-8000-000000000088'
      and taxes = 10 and total = 119
      and stripe_payment_intent_id = 'pi_synthetic_rehearsal_001'
      and stripe_payment_mode = 'test'
  ) then
    raise exception 'Synthetic booking payment did not finalize with taxes';
  end if;
  if not exists (
    select 1 from public.booking_financials
    where booking_id = '88000000-0000-4000-8000-000000000088'
      and status = 'eligible' and partner_commission = 14.17
      and reward_program_fee = 3.27 and partner_net = 91.56
  ) then
    raise exception 'Synthetic 13 percent plus 3 percent financial split is incorrect';
  end if;
end;
$assert_payment$;

rollback;

select
  (select count(*) from public.properties where slug = 'synthetic-approval-hotel') as properties_left,
  (select count(*) from public.hotel_commercial_agreement_evidence where id = '66000000-0000-4000-8000-000000000066') as agreements_left,
  (select count(*) from auth.users where email like 'approval-%@example.invalid') as users_left,
  (select count(*) from public.bookings where id = '88000000-0000-4000-8000-000000000088') as bookings_left,
  (select booking_approval_enabled or payment_finalization_enabled or reward_issuance_enabled from public.hotel_legacy_transaction_controls where singleton = true) as legacy_controls_enabled;

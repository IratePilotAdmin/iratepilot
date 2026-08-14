-- iRatePilot consolidated migration preflight
-- Run in the Supabase SQL editor before applying migrations 202608020001-202608020025.
-- This script is read-only. Resolve every returned blocker before migration rollout.

-- 1. Duplicate open booking requests that would block the unique index.
select
  customer_id,
  room_id,
  check_in,
  check_out,
  count(*) as open_booking_count,
  array_agg(id order by created_at) as booking_ids
from public.bookings
where status in ('pending', 'confirmed')
group by customer_id, room_id, check_in, check_out
having count(*) > 1;

-- 2. Duplicate pending partner applications by normalized email.
select
  lower(trim(email)) as normalized_email,
  count(*) as pending_application_count,
  array_agg(id order by created_at) as application_ids
from public.partner_applications
where status = 'pending'
group by lower(trim(email))
having count(*) > 1;

-- 3. Existing payment intents linked to more than one booking.
select
  stripe_payment_intent_id,
  count(*) as booking_count,
  array_agg(id order by created_at) as booking_ids
from public.bookings
where stripe_payment_intent_id is not null
group by stripe_payment_intent_id
having count(*) > 1;

-- 4. Invalid room records that will be hidden or rejected by new constraints.
select id, property_id, name, max_guests, base_rate, active
from public.rooms
where max_guests < 1
   or max_guests > 20
   or base_rate <= 0
   or base_rate > 100000;

-- 5. Invalid inventory records.
select id, room_id, stay_date, available_units, rate
from public.inventory
where available_units < 0
   or available_units > 10000
   or rate <= 0
   or rate > 100000;

-- 6. Active properties owned by partners who are not approved.
select
  p.id as property_id,
  p.name as property_name,
  p.active,
  pa.id as partner_id,
  pa.status as partner_status
from public.properties p
join public.partners pa on pa.id = p.partner_id
where p.active = true
  and pa.status <> 'approved';

-- 7. Published properties missing marketplace readiness data.
select
  p.id,
  p.name,
  p.active,
  p.image_url,
  p.description,
  count(distinct r.id) filter (where r.active = true) as active_rooms,
  count(distinct i.id) filter (
    where i.stay_date >= current_date
      and i.available_units > 0
      and i.rate > 0
  ) as sellable_future_inventory_rows
from public.properties p
left join public.rooms r on r.property_id = p.id
left join public.inventory i on i.room_id = r.id
where p.active = true
group by p.id, p.name, p.active, p.image_url, p.description
having nullif(trim(coalesce(p.image_url, '')), '') is null
    or char_length(trim(coalesce(p.description, ''))) < 80
    or count(distinct r.id) filter (where r.active = true) = 0
    or count(distinct i.id) filter (
      where i.stay_date >= current_date
        and i.available_units > 0
        and i.rate > 0
    ) = 0;

-- 8. Cancellation requests with unexpected historical states.
select id, booking_id, status, created_at
from public.booking_cancellation_requests
where status not in ('pending', 'processing', 'approved', 'rejected', 'refunded');

-- 9. Paid financial records without a transfer state suitable for refund reconciliation.
select
  booking_id,
  partner_id,
  status,
  stripe_transfer_id,
  stripe_transfer_status
from public.booking_financials
where status = 'paid'
  and coalesce(stripe_transfer_status, '') not in ('paid', 'reversed');

-- 10. Summary counts for the rollout record.
select
  (select count(*) from public.profiles) as profiles,
  (select count(*) from public.partners) as partners,
  (select count(*) from public.properties) as properties,
  (select count(*) from public.rooms) as rooms,
  (select count(*) from public.inventory) as inventory_rows,
  (select count(*) from public.bookings) as bookings,
  (select count(*) from public.booking_financials) as booking_financials,
  (select count(*) from public.partner_applications) as partner_applications,
  (select count(*) from public.email_outbox) as email_jobs;

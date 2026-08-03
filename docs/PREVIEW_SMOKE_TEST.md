# iRatePilot Preview Smoke Test

Run this checklist only after the Supabase preflight passes, migrations `202608020001` through `202608020025` are applied in order, and both schema verification scripts pass.

Record the preview URL, tester, date, test accounts, property, room, stay dates, confirmation code, Stripe test PaymentIntent, and any defects.

## 1. Public marketplace

- [ ] Homepage loads without console or server errors.
- [ ] Search accepts destination, future check-in/check-out dates, and guest count.
- [ ] Results include only approved, published properties with sellable inventory for every requested night.
- [ ] Displayed room pricing matches dated inventory and the exact stay subtotal.
- [ ] Demo listings are clearly labeled and cannot be mistaken for live availability.
- [ ] Hotel details show the real room name, capacity, rate, amenities, image, and location.

## 2. Customer authentication and account

- [ ] A new customer can register, confirm email if required, sign in, and sign out.
- [ ] Unsafe external `next` redirect values are rejected.
- [ ] Customer navigation exposes account, trips, payments, membership, messages, and profile.
- [ ] A customer can update only their own name and phone.
- [ ] Account overview and notification read controls work without exposing another customer’s data.

## 3. Partner application and approval

- [ ] Public partner application accepts valid data and rejects malformed input.
- [ ] Repeated pending applications for the same normalized email do not create duplicates.
- [ ] An administrator can review and approve the application through the protected workflow.
- [ ] Approval provisions the correct partner account and role.
- [ ] An unapproved partner cannot access partner inventory, reservations, finance, Revenue AI, or Stripe Connect operations.

## 4. Property, room, and inventory setup

- [ ] Approved partner can create a complete property with description, safe HTTPS image, amenities, and location.
- [ ] Partner can create and edit a room with valid name, capacity, base rate, and active status.
- [ ] Partner cannot enter past inventory dates, negative rates, invalid rates, or invalid unit counts.
- [ ] Guided setup shows future-night coverage and pricing ranges.
- [ ] Property cannot be published until the partner, content, room, and future inventory requirements pass.
- [ ] Administrator can publish the property and provide review feedback.

## 5. Private booking request

- [ ] Customer selects verified dates, guests, and a room.
- [ ] Quote shows subtotal, traveler fee or active-member waiver, and exact total.
- [ ] Booking request is recalculated on the server and does not trust client totals.
- [ ] Repeating the same request reuses the existing open booking instead of duplicating it.
- [ ] Partner reservation queue shows the nearest pending check-in first.
- [ ] Partner approval locks and decrements inventory exactly once.
- [ ] Partner decline requires a meaningful reason.
- [ ] A request approved on or after check-in expires without decrementing inventory.

## 6. Stripe test payment and confirmation

- [ ] Stripe remains in test mode.
- [ ] Checkout rejects unauthenticated, unavailable, mismatched-price, or invalid-total requests.
- [ ] Repeated checkout attempts for the same attempt ID resolve idempotently.
- [ ] Use a Stripe test card and complete payment.
- [ ] Webhook finalization creates or confirms exactly one booking.
- [ ] Confirmation page requires authentication and ownership.
- [ ] Confirmation page shows real property, room, dates, guests, total, status, and confirmation code.
- [ ] Booking appears in Trips and payment history.
- [ ] Inventory is not decremented twice.

## 7. Messaging and notifications

- [ ] Customer can send a message only within their own booking.
- [ ] Approved property partner can read and reply only to bookings for their properties.
- [ ] Another customer or unrelated partner cannot access the conversation.
- [ ] Recipient receives an in-app notification.
- [ ] Email outbox receives expected booking or partner events.
- [ ] Email processor rejects missing or invalid `CRON_SECRET` authorization.

## 8. Membership and partner subscriptions

- [ ] Customer membership checkout uses the configured active Stripe test price and advertised amount.
- [ ] Membership lifecycle events update tier, status, and renewal date in event-time order.
- [ ] Only active membership receives fee waiver and reward points.
- [ ] Partner subscription checkout uses the configured active monthly test price.
- [ ] Duplicate active subscription checkout is blocked.
- [ ] Billing portal links are ownership-scoped and do not expose provider identifiers in application responses.

## 9. Cancellation and refund

- [ ] Customer can cancel a pending request without payment.
- [ ] Confirmed unpaid booking can be cancelled before check-in; inventory, finance, and provisional points are restored or reversed.
- [ ] Paid confirmed booking enters the reviewed refund workflow rather than unpaid cancellation.
- [ ] Only one administrator can claim a refund request for processing.
- [ ] Paid partner transfer must be reversed before refund finalization.
- [ ] Stripe test refund is idempotent.
- [ ] Booking, cancellation request, finance, inventory, reward ledger, history, and notifications agree after refund.

## 10. Admin and partner operations

- [ ] Admin overview contains live data and no demonstration metrics.
- [ ] Customer directory, support inbox, audit timeline, property review, content quality, and cancellation queue load correctly.
- [ ] Partner overview, reservations, analytics, finance, promotions, properties, rates, and onboarding show only owned data.
- [ ] Large-result caps and notices appear where documented.
- [ ] Revenue AI reads and writes remain restricted to approved property owners or administrators.

## 11. Mobile and resilience

- [ ] Manifest, icons, install page, and service worker load successfully.
- [ ] Offline fallback appears for failed public navigation.
- [ ] Authenticated account, booking, partner, admin, and API responses are not stored in the offline cache.
- [ ] Confirmed booking itinerary downloads as a valid `.ics` file.

## 12. Release gate

Do not mark PR #122 ready for review unless all of the following are true:

- [ ] Database backup confirmed.
- [ ] Preflight returned no unresolved blockers.
- [ ] All 25 migrations applied in order.
- [ ] `verify_schema.sql` passed.
- [ ] `postflight_20260802.sql` passed.
- [ ] GitHub Actions passed on the latest head commit.
- [ ] Vercel preview passed on the latest head commit.
- [ ] All critical smoke-test sections passed.
- [ ] Stripe remains in test mode.
- [ ] Automated payouts remain disabled.
- [ ] Demo inventory is not published as live inventory.
- [ ] Any known defects are documented with severity and owner.

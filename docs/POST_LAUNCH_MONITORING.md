# iRatePilot Post-Launch Monitoring

Use this checklist for the first 24 hours after a private-pilot release. Do not enable public booking or automated partner payouts during this period.

## Monitoring ownership

Record the assigned person for each role before release:

- Release owner:
- Application owner:
- Database owner:
- Payments owner:
- Customer support owner:
- Rollback decision owner:

At least one owner must be reachable throughout the observation window.

## Observation schedule

Complete and record checks at:

- 15 minutes after deployment
- 30 minutes after deployment
- 1 hour after deployment
- 2 hours after deployment
- 4 hours after deployment
- 8 hours after deployment
- 24 hours after deployment

Any critical alert interrupts this schedule and starts the incident process immediately.

## Application health

At every checkpoint, verify:

- Production deployment remains healthy in Vercel.
- Homepage, search, authentication, customer account, partner portal, and admin portal load without server errors.
- Error rates have not materially increased.
- No repeated redirect, session, middleware, or authorization failures appear.
- Cron and background routes reject unauthorized requests.
- No secrets or personal data appear in logs.

## Database health

Verify:

- Supabase database availability and connection health.
- No sustained increase in failed or long-running queries.
- No unexpected growth in duplicate, orphaned, or invalid records.
- Row-level security continues to isolate customer, partner, and admin data.
- Inventory never becomes negative.
- Confirmed bookings have complete financial and status records.
- Booking state changes are reflected in status history.

Run read-only reconciliation queries where appropriate. Do not modify production records manually without recording the reason and exact change.

## Booking funnel monitoring

Track counts and failures for:

1. Search results displayed.
2. Property detail pages viewed.
3. Booking requests created.
4. Partner approvals and rejections.
5. Stripe test checkouts started.
6. Payment webhooks received.
7. Bookings finalized.
8. Confirmation emails queued and sent.
9. Cancellations requested.
10. Refunds processed.

Investigate any unexpected drop between adjacent stages.

## Payment monitoring

Keep Stripe in test mode during the private pilot.

At every checkpoint verify:

- Checkout sessions correspond to the correct booking and amount.
- PaymentIntent identifiers are unique per booking.
- Webhook events are authenticated and processed idempotently.
- Paid bookings have matching booking-financial records.
- Failed checkouts do not confirm bookings or reduce inventory permanently.
- Refunds match the original booking total and do not duplicate.
- No transfer or payout is initiated automatically.

Immediately stop checkout if money, booking status, or inventory cannot be reconciled.

## Inventory monitoring

Verify:

- Availability is reduced exactly once for each confirmed booking.
- Rejected, expired, cancelled, or refunded bookings restore inventory when required.
- Partner updates affect only future inventory and authorized properties.
- Search availability matches the underlying room and inventory records.
- No demonstration inventory is presented as real availability.

## Email and notification monitoring

Verify:

- Transactional email jobs are claimed only by the service role.
- Jobs do not remain stuck indefinitely in queued or processing states.
- Duplicate confirmations or cancellation emails are not sent.
- Email failures do not expose provider responses or secrets to users.
- In-app notifications are delivered to the correct customer or partner.

## Access and security monitoring

Verify:

- Anonymous users cannot call privileged database functions.
- Customers cannot access other customers' bookings, messages, payments, or profiles.
- Partners cannot access properties or reservations owned by another partner.
- Non-admin users cannot access admin routes or actions.
- Service-role credentials never reach browser code or logs.
- Authentication redirects use the approved canonical domain.

Any confirmed cross-account access is a critical incident and requires immediate containment.

## Support monitoring

Record all pilot reports with:

- Time received
- User role
- Affected workflow
- Booking or application identifier, without copying sensitive payment data
- Severity
- Reproduction status
- Owner
- Resolution or workaround

Repeated reports of the same symptom should be treated as one potentially systemic incident.

## Quantitative release gates

Continue the pilot only while all of the following remain true:

- No confirmed security or privacy incident.
- No unreconciled payment or refund.
- No confirmed double booking.
- No negative inventory.
- No sustained critical-route outage.
- No unexplained database corruption or record loss.
- No unauthorized email, notification, transfer, or payout.

The release owner may define stricter thresholds in `docs/RELEASE_EVIDENCE.md` before launch.

## End-of-window review

After 24 hours:

1. Reconcile all pilot bookings, inventory changes, financial records, rewards, cancellations, refunds, emails, and notifications.
2. Review all logged errors and support reports.
3. Record unresolved defects and their owners.
4. Confirm whether the private pilot should continue, pause, or roll back.
5. Update `docs/RELEASE_EVIDENCE.md` with the decision and supporting evidence.

Public booking and automated partner payouts require a separate written approval and are not authorized by completion of this checklist.

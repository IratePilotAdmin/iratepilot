# Launch Support Playbook

Use this playbook during the private pilot and the first 30 days after launch.

## Support ownership

Assign one named owner for each role before launch:

- Launch commander
- Customer support owner
- Partner support owner
- Payments and refunds owner
- Technical incident owner
- Database owner
- Communications owner

Record names and contact methods in the private release record. Do not commit personal phone numbers, credentials, or private email addresses to the repository.

## Support channels

Maintain separate queues for:

- Customer booking and account issues
- Partner onboarding, property, rate, and inventory issues
- Payment, refund, membership, and subscription issues
- Security or privacy reports
- Technical incidents and service degradation

Security, cross-account access, duplicate charges, incorrect refunds, and double bookings must be escalated immediately under `docs/INCIDENT_SEVERITY.md`.

## Required ticket information

Each support ticket should record:

- Date and time
- Reporter type: customer, partner, admin, or internal
- Account ID or email, using the minimum information necessary
- Booking confirmation code when applicable
- Property and stay dates when applicable
- Payment or refund reference when applicable
- Clear problem statement
- Screenshots with sensitive data removed
- Current owner
- Severity
- Resolution and follow-up action

Never request passwords, full card numbers, CVV codes, Supabase keys, Stripe secrets, or one-time authentication codes.

## Booking support workflow

1. Confirm the booking confirmation code and customer identity.
2. Check the booking status, property, room, stay dates, and inventory record.
3. Check booking status history and related notifications.
4. For payment issues, compare the booking, booking financials, and Stripe test records.
5. Do not manually confirm or cancel a booking by editing database rows unless the incident owner approves a documented recovery procedure.
6. Record every correction and verify inventory after the correction.

## Partner support workflow

1. Verify the partner account and approval status.
2. Confirm the property belongs to the partner.
3. Review property publication readiness, room configuration, rates, and future inventory.
4. Do not publish incomplete or demonstration inventory as real availability.
5. Escalate ownership, access, or cross-property visibility problems immediately.

## Payment and refund workflow

1. Keep Stripe in test mode during the private pilot.
2. Confirm the booking amount, payment intent, webhook status, and booking financial record.
3. Do not issue a second refund because a customer reports a delay.
4. Verify whether a refund already exists before retrying.
5. Reconcile inventory, booking status, reward points, and finance records after every cancellation or refund.
6. Automated partner payouts remain disabled until separately approved.

## Security reports

Immediately contain and escalate reports involving:

- Cross-account or cross-property data exposure
- Unauthorized admin or partner access
- Exposed credentials or secret values
- Suspicious authentication or webhook activity
- Payment information appearing in logs, screenshots, or tickets

Do not delete evidence. Rotate exposed credentials and follow the rollback and incident runbooks.

## Communication standards

- Acknowledge critical reports immediately.
- Do not promise a refund, compensation, or resolution until records are verified.
- Use clear timestamps and confirmation codes.
- Avoid exposing internal IDs, secrets, or another user's information.
- Record the final customer or partner communication in the support ticket.

## Daily support review

At least once per day during the pilot, review:

- Open critical and high-priority tickets
- Pending booking requests near check-in
- Failed or delayed emails
- Payment and refund exceptions
- Partner onboarding blockers
- Inventory or rate complaints
- Repeated product defects

Create a tracked GitHub issue for recurring defects, but keep customer personal information out of GitHub.

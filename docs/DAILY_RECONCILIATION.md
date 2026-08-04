# Daily Pilot Reconciliation

Complete this checklist every operating day during the private pilot. Store the completed evidence outside the public repository and link only a non-sensitive reference in the release record.

## Booking reconciliation

- Count bookings created during the review period by status.
- Confirm each confirmed paid booking has exactly one Stripe PaymentIntent.
- Confirm each open stay has only one pending or confirmed booking for the same customer, room, and dates.
- Review pending booking requests approaching check-in.
- Review cancellations and refunds completed during the period.
- Confirm status history matches the final booking state.

## Inventory reconciliation

- Confirm inventory was reduced once for each confirmed reservation.
- Confirm inventory was restored once for each completed cancellation or refund.
- Confirm no inventory row has a negative available-unit count.
- Review unusually large inventory changes.
- Confirm partners can modify only their own future inventory.

## Payment and finance reconciliation

- Compare successful Stripe test payments with booking financial records.
- Identify payments without confirmed bookings.
- Identify confirmed paid bookings without successful payments.
- Confirm gross room revenue, commission, partner net, and booking total agree.
- Review failed, duplicated, delayed, or replayed webhook events.
- Confirm automated partner payouts remain disabled.

## Refund reconciliation

- Confirm each refund references one cancellation request and one booking.
- Confirm the refunded amount equals the approved amount.
- Confirm partner transfer status is safe before refund finalization.
- Confirm refunded bookings have inventory restored.
- Confirm reward points were reversed once and not below zero.
- Investigate requests stuck in `processing`.

## Membership and subscription reconciliation

- Compare active customer memberships with Stripe test subscriptions.
- Compare active partner plans with Stripe test subscriptions.
- Review duplicate subscriptions, missing price IDs, and unexpected cancellations.
- Confirm annual billing prices match the approved private-pilot configuration.

## Email and notification reconciliation

- Review failed and repeatedly retried email jobs.
- Confirm booking approval, payment, cancellation, and refund notifications were generated.
- Confirm the email worker requires `CRON_SECRET` or service-role authorization.
- Review messages or notifications delivered to an incorrect account as a security incident.

## Partner and property reconciliation

- Review newly approved partner applications.
- Confirm active or published properties belong to approved partners.
- Confirm published properties have required content, rooms, rates, images, and future inventory.
- Review partner access or ownership complaints.

## Support and incident review

- Review all Severity 0 and Severity 1 incidents.
- Review unresolved customer and partner tickets.
- Link recurring product defects to tracked GitHub issues without personal information.
- Record the owner and next action for every unresolved financial exception.

## Daily sign-off

Record:

- Review date and covered time period
- Release commit
- Reviewer
- Number of bookings, payments, cancellations, and refunds reviewed
- Exceptions found
- Corrective actions completed
- Open risks
- Continue, restrict, or suspend pilot decision

Any unexplained payment mismatch, double booking, negative inventory, cross-account access, or unreconciled refund requires immediate escalation and may require suspension under `docs/INCIDENT_SEVERITY.md`.

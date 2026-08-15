# First-hotel onboarding runbook

Use this runbook to prepare the first hotel in a private sandbox. It does not authorize a real supplier activation, a public listing, a live transaction, an invitation email, or SynXis traffic.

## Gate status

- Pilot mode remains enabled.
- Public booking, live payments, live Stripe webhooks, and live partner payouts remain disabled.
- SynXis traffic remains disabled.
- Stripe Connect may be inspected in test mode, but starting onboarding is a separate external-action gate because it creates a Stripe account and onboarding link.
- Manager invitations are a separate external-email gate. Creating an invitation queues a transactional email.
- Scoped hotel-management migrations 054–059 are recorded in production. Migration 055 restores integration-only property reads and adds explicit organization selection for managers assigned to multiple partners. Migration 056 restricts delegated property updates to approved draft-content fields and prevents non-admin room transfers between properties. Migration 057 prevents non-admin inventory transfers between rooms. Migration 058 additionally makes inventory stay dates immutable for non-admin users. Migration 059 removes the temporary migration-054 hotel-access backfill and records hotel-write scope on invitations, so an existing integration-scoped manager stays restricted until the owner sends a newly disclosed invitation and the manager accepts it. The application remains inactive in production until the corresponding application changes receive separate merge and deployment approval.
- Migrations 060 and 061 are recorded in production and preview. Migration 060 prevents delegated managers from editing an active property or changing its publication state; delegated content edits are limited to properties that were already inactive. Migration 061 restores room and inventory deletion for approved partner owners only while keeping delegated managers blocked from deletion. Do not merge or deploy the manager application flow without separate production approval, and do not send a manager invitation or activate a hotel manager until that deployment is verified under its own approval gate.
- The delegated scope is limited to inactive property content, rooms/rates, and future inventory. It does not permit publication, property transfer, room or inventory deletion, invitations, billing, payouts, or live supplier traffic.

## Verified intake required before creating a real record

Collect and independently verify:

1. Legal business name, property trading name, address, country, and primary website.
2. Authorized hotel owner or representative, their business email, and written authority to submit the property.
3. Intended manager role: general manager, revenue manager, or sales manager.
4. Property type, star rating, public description, HTTPS primary-photo URL, and at least one amenity.
5. Room-type name, maximum occupancy, base rate, dated availability, taxes, fees, and cancellation terms.
6. Commercial agreement status, marketplace commission acknowledgement, support contact, and escalation contact.
7. Payout-country and legal-entity details for later Stripe Connect test onboarding. Do not collect card details or bank credentials in iRatePilot evidence.

Stop if the supplier identity, authority, content rights, rate ownership, or payout entity cannot be verified. Never invent missing hotel information.

## Safe preparation sequence

1. Confirm the target is a non-production sandbox and record its project/deployment identifier.
2. Run `npm run commercial:sandbox-preflight` with sandbox-only configuration. Require `ready: true`, `networkRequestsMade: 0`, `liveTransactions: disabled`, and `synxisTraffic: disabled`.
3. Confirm the hotel owner has a partner account. Do not approve a real partner without verified intake and the required business review.
4. Create the property as a draft. The property API must return `active: false`.
5. Add property content. A delegated manager may edit only a property that is already inactive, and their save must preserve `active: false`. Owner or administrator content edits return the property to `active: false`.
6. Configure a room type and future sandbox inventory only after the partner is approved in the sandbox. Use synthetic dates, units, and rates when validating mechanics.
7. Confirm the readiness result requires all four controls: safe primary photo, amenities, an active room type, and future sellable inventory.
8. Leave the property inactive. Administrator publication requires a separate approval and must be blocked when the partner or listing is incomplete.
9. Inspect Stripe Connect status in test mode only. Do not press **Connect payout account** during preparation; that action creates an external Stripe account/link.
10. Inspect the manager-role selector only. Do not submit an invitation; submission creates a pending record and queues an external email.
11. Do not create a booking request, PaymentIntent, supplier reservation, refund, transfer, payout, transactional email, or SynXis request.

## Sandbox acceptance checks

| Check | Expected result | Evidence |
| --- | --- | --- |
| Partner authorization | Non-admin property, room, inventory, finance, and Connect access requires an approved partner | Test name and result |
| Draft property | New property is inactive | Sanitized record ID and `active: false` |
| Content edit | Delegated managers can edit only an already-inactive property and cannot change publication state | Sanitized record ID and `active: false` |
| Publication gate | Admin publication rejects an unapproved partner or incomplete listing | HTTP status and missing requirements |
| Readiness | Photo, amenities, active room, and future inventory are all required | Readiness object without hotel PII |
| Inventory bounds | Dates and units satisfy configured limits and stay in the sandbox | Date range and row count |
| Stripe mode | Test mode is visible and no live Connect account is replaced | Mode and status only; no credentials |
| Manager roles | Only general, revenue, and sales manager roles are accepted | Validation result; no invitation submitted |
| Delegated hotel operations | In preview, active general, revenue, and sales managers can manage inactive property content, rooms/rates, and future inventory only | API tests, helper functions, and eight scoped RLS policies |
| Delegated restrictions | Managers cannot edit or deactivate an active property, change publication state, transfer a property, delete rooms/inventory, invite teammates, or access billing/payout controls | Negative API/RLS test evidence |
| Email | No invitation or transactional email was queued | Queue delta equals zero |
| External effects | No supplier, payment, payout, refund, or SynXis request occurred | Provider/event deltas equal zero |

## Evidence record

Record the following without secrets or personal data:

- Date/time and operator.
- Git commit and preview deployment.
- Sandbox project identifier.
- Sanitized partner/property/room identifiers, if synthetic records were used.
- Commands and test names with pass/fail results.
- Before/after counts for draft properties, pending invitations, email jobs, bookings, Stripe objects, payouts, and SynXis requests.
- Any deviation, owner, and required remediation.

## Exit criteria

Preparation is complete when the sandbox controls pass, the operator packet is ready, and no external side effect occurred. The first real hotel is not onboarded until verified hotel data is supplied and separately approved actions complete the partner review, manager invitation, Stripe Connect onboarding, listing publication, and controlled commercial activation.

## Separate approval gates

1. Create the verified real hotel owner and inactive partner/property records.
2. Publish the scoped manager-permission changes for review and pass CI.
3. Confirm migrations 055–061 remain recorded in production, then merge and deploy the corresponding application changes under a separate production approval.
4. Send a manager invitation email to the verified general, revenue, or sales manager.
5. Start Stripe Connect test onboarding for the verified payout entity.
6. Load and review real hotel inventory while keeping the listing private.
7. Publish the hotel and enable controlled booking only after payment, email, support, and supplier gates are approved.
8. Enable SynXis only after Sabre certification and a dedicated production-traffic approval.

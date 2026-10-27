# RateHawk live-booking readiness — 2026-10-27

**Company:** iRatePilot Group, LLC

**Provider:** RateHawk / Emerging Travel Group (ETG)

**Current environment:** Sandbox only

**Production status:** Live RateHawk search, booking, payment, and cancellation traffic remain disabled.

## Implemented foundation

- Fail-closed sandbox credential and runtime gates.
- Exact endpoint allowlist for hotel search, hotel page, prebook, booking form, booking finish, booking status, and cancellation.
- Sandbox search and prebook validation with persisted evidence.
- Strict booking request validation for partner order IDs, IP addresses, contacts, guests, rooms, and amounts.
- Booking-form, booking-status, and cancellation response parsing.
- Bounded final-status polling that never treats `processing`, `timeout`, or `unknown` as confirmation.
- A final status request at the configured booking deadline.
- Separate production credential names; sandbox credentials cannot silently become production credentials.
- A readiness evaluator that cannot report live-ready until every certification and production gate passes.

## Remaining gates in order

1. Map ETG sandbox certification hotels `10004834` and `8819557` into iRatePilot's RateHawk hotel catalog.
2. Implement and verify the Content API/static-content import and recurring update process.
3. Validate sandbox search for both certification hotels.
4. Validate the hotel-page step and its cancellation, tax, room, and payment-option projections.
5. Validate prebook from hotel page, including changed-price handling.
6. Execute booking form, booking finish, final-status polling, and cancellation certification scenarios with genuine test data.
7. Complete every mandatory ETG certification scenario, including children and required country/citizenship behavior.
8. Submit the ETG pre-certification checklist and requested access/evidence.
9. Receive written ETG certification approval.
10. Store separately issued production credentials in the server-side credential vault.
11. Run one controlled production smoke test with written approval and immediate reconciliation.
12. Explicitly enable RateHawk live traffic only after the smoke test passes.

## Action-time controls

The following actions require an immediate human confirmation because they affect an external system or can create financial responsibility:

- execute a RateHawk booking or cancellation;
- submit certification evidence or email ETG;
- merge or deploy the implementation;
- apply database migrations to production;
- save production credentials; or
- enable live RateHawk traffic.

## Go/no-go rule

Do not describe RateHawk as live-ready and do not expose its inventory to consumers until all readiness gates pass. A sandbox success is evidence for certification, not production authorization. Only a final booking status of `ok` is confirmation. A timeout or unknown result must continue to the status check; it must never create a second booking attempt with the same customer intent.

## Official sources reviewed

- https://docs.emergingtravel.com/docs/integration-guide/
- https://docs.emergingtravel.com/docs/integration-requirements/
- https://docs.emergingtravel.com/docs/certification/
- https://docs.emergingtravel.com/docs/b2b-api/hotel-search/retrieve-hotelpage/
- https://docs.emergingtravel.com/docs/b2b-api/booking/create-booking-process/
- https://docs.emergingtravel.com/docs/b2b-api/booking/start-booking-process/
- https://docs.emergingtravel.com/docs/b2b-api/booking/check-booking-process/
- https://docs.emergingtravel.com/docs/b2b-api/post-booking/cancel-booking/

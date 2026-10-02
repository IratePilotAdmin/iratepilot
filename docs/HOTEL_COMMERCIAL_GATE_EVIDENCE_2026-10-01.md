# Hotel commercial gate evidence — 2026-10-01

This record documents local software validation for the hotel commercial-release gate. It does not create, approve, execute, or accept an agreement, represent legal review, publish a hotel, enable bookings, move money, or contact a third party.

## Verified controls

- Hotel publication requires an effective executed commercial agreement linked to the same inventory-ready property.
- Agreement evidence must be paired with an accountable commercial review before the hotel can satisfy the commercial gate.
- The review requires the approved listing scope, booking mode, current 13% commission plus 3% Rewards Program fee disclosure, and a hotel support contact.
- Missing or mismatched agreement evidence fails closed and blocks publication.
- The marketplace release gate cannot bypass the property-specific agreement and commercial-review checks.

## Automated evidence

- 34 tests passed across 5 focused agreement, publication, commercial-booking, launch-readiness, and fee-alignment test files.
- The tests cover administrator agreement handling, publication denial without current agreement evidence, marketplace publication separation, commercial booking authorization, the seven-gate countdown, and current fee disclosure.

## Remaining external work

- Obtain a counsel-approved agreement template.
- Verify the hotel's legal entity, signing authority, listing rights, support contact, commercial scope, and booking mode.
- Obtain both parties' signatures and record immutable executed-agreement evidence.
- Complete the accountable commercial review for an inventory-ready hotel.
- Keep hotel publication, public booking, supplier traffic, live payments, webhooks, and payouts disabled until their separate gates pass.

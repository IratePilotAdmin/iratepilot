# Stuba commercial and API onboarding call

**Meeting:** October 16, 2026, 12:00 PM Eastern / 11:00 AM Central  
**Company:** iRatePilot Group, LLC  
**Status before the call:** Trade account active; API credentials not issued; sandbox traffic disabled.

## Outcome required from this call

Leave the call with a written path to HAPI and Content API test access, including the deposit or credit requirement, certification steps, technical contacts, and an expected date for issuing sandbox credentials.

## Commercial terms already confirmed

- Stuba supplies net rates rather than paying commission.
- Stuba rates must be visible only after the customer signs in with a password.
- The account deposit serves as the credit line.
- Bookings whose cancellation deadline is more than 10 days away can be made without a prefunded balance. Stuba invoices weekly when a booking moves within 10 days of its cancellation deadline, and payment must arrive before that deadline.
- Bookings within 10 days of cancellation or nonrefundable bookings require sufficient account balance.
- Payment is by bank transfer to Stuba's U.S. bank account.
- Stuba specializes in FIT bookings. More than five rooms or more than nine guests for the same hotel and stay dates is treated as a group booking.
- Stuba provides hotel confirmation numbers when bookings enter the seven-day arrival window.

## Questions to resolve

1. What minimum opening deposit is required, and can it increase later as booking volume grows?
2. Is there a minimum monthly production or booking-volume commitment?
3. Which currencies are available for the account, rates, invoices, and settlement?
4. Are taxes, resort fees, mandatory property charges, and cancellation penalties fully itemized through HAPI and the Content API?
5. Will Stuba issue separate sandbox and production API keys? What are the sandbox endpoint, rate limits, and permitted test scenarios?
6. Which HAPI operations are required for certification: search, details, availability, recheck, book, retrieve, cancel, and amendments?
7. How is Content API data delivered and refreshed? Ask about hotel IDs, images, room types, amenities, policies, and incremental updates.
8. What evidence must iRatePilot submit for certification, and who reviews it?
9. Does Stuba provide webhooks, polling guidance, or a booking-status feed for changes after confirmation?
10. What is the production-launch checklist and typical approval timeline after certification?
11. Confirm that an authenticated iRatePilot customer account satisfies the protected-pricing rule, including search results, hotel pages, emails, and shared links.
12. Confirm whether customer-facing prices may include iRatePilot's markup and whether the net rate must remain hidden from the traveler.
13. Who handles technical onboarding, API incidents, booking operations, and payment questions?

## iRatePilot commitments to state clearly

- iRatePilot is pre-launch and is not accepting live customer bookings.
- Stuba rates will not be shown on public pages. Customers must authenticate before any Stuba-sourced price is returned or rendered.
- Sandbox and production traffic use separate credentials and default-off controls.
- Production booking traffic remains disabled until commercial approval, technical certification, payment controls, and an end-to-end smoke test are complete.
- Credentials will be stored server-side and will never be exposed in the browser or source control.

## Evidence to request before ending the call

- Written commercial terms and deposit amount.
- HAPI and Content API onboarding instructions.
- Sandbox credential request or issuance process.
- Certification checklist and reviewer contact.
- Production activation checklist.
- Technical support and booking-operations contacts.
- Target date for the next onboarding milestone.

## Internal follow-up after the call

1. Record the agreed deposit and settlement rules without storing bank details in the repository.
2. Add issued sandbox credentials to protected deployment secrets.
3. Keep `HOTEL_INVENTORY_STUBA_SANDBOX_ENABLED=false` until credentials and the approved sandbox scope are verified.
4. Implement authenticated-only Stuba price access before connecting any Stuba search response to consumer pages.
5. Complete search, details, recheck, booking, retrieval, cancellation, and reconciliation tests.
6. Submit certification evidence and record written approval.
7. Run a controlled production smoke test only after all launch gates are satisfied.


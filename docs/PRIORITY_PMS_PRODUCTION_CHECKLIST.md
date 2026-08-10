# Priority PMS production checklist

This checklist governs live activation for Oracle OPERA / OPERA Cloud, Hilton PEP, Hilton OnQ, Marriott FOSSE, Marriott FS-PMS, and HotelKey.

Completing connector code does not authorize production traffic. Keep each connector disabled until every item below is verified for the specific vendor and property.

## 1. Vendor authorization

- Obtain written vendor or brand approval for iRatePilot connectivity.
- Confirm whether the agreement permits availability, booking, modification, cancellation, and webhook traffic.
- Record the approved sandbox and production environments without storing credentials in tickets or source control.
- Complete required certification or connectivity-partner review.

## 2. Property authorization

- Confirm the hotel owner or authorized manager approved the connection.
- Record the vendor-issued hotel/property code in the partner PMS declaration.
- Verify the credential scope includes only the authorized property or portfolio.
- Confirm room, rate-plan, tax, fee, and cancellation-policy mappings.

## 3. Vercel Production configuration

- Add every required key from `priorityPmsProductionManifest` to Vercel Production.
- Store credentials and webhook secrets as sensitive server-only variables.
- Use HTTPS vendor endpoints and vendor-issued operation paths; never guess paths.
- Keep Preview and Production credentials isolated.
- Redeploy after environment-variable changes.

## 4. Sandbox validation

- Run the provider connection test against a vendor-approved read-only resource.
- Verify availability for an approved property and date range.
- Create one non-chargeable sandbox reservation with an idempotent iRatePilot reference.
- Retrieve and modify that reservation.
- Cancel it and verify the cancellation identifier.
- Verify signed webhook events and reject invalid signatures.
- Confirm retries do not create duplicate reservations.

## 5. Production go-live

- Repeat a vendor-approved smoke test using a designated production test property.
- Confirm monitoring and escalation contacts for iRatePilot, the vendor, and the hotel.
- Confirm booking, cancellation, and failure notifications reach the correct parties.
- Obtain final vendor/property sign-off.
- Mark vendor approval, property mapping, and sandbox validation as complete in the readiness audit.
- Enable live traffic for one pilot property before expanding the portfolio.

## Stop conditions

Do not enable live traffic when any required environment key is missing, vendor approval is absent, the property mapping is incomplete, sandbox validation has not passed, webhook signatures are not enforced, or credentials are broader than the approved hotel scope.

# Apaleo pre-certification readiness — 2026-10-16

**Meeting:** October 16, 2026, 9:30 AM Central  
**Apaleo contact:** Vitaliy Porsnev  
**Company:** iRatePilot Group, LLC  
**Current external status:** Developer API access approved; pre-certification form accepted; pre-certification call booked.  
**Production status:** No live hotel inventory, consumer booking, payment, or Apaleo production traffic is enabled.

## Outcome required from this call

Leave the call with a written, ordered certification plan for the iRatePilot booking-engine use case. Confirm the application access model, exact least-privilege permissions, test-property access, webhook requirements, payment expectations, certification scenarios, evidence format, reviewer, and target date for the certification call.

## Verified external evidence

- Apaleo Technical Partnerships approved access to the Apaleo APIs on October 15, 2026. Gmail message ID: `1a13fe6261e002ac`.
- Apaleo acknowledged the completed pre-certification form on October 15, 2026. Gmail message ID: `1a140b43d77d3f8f`.
- Vitaliy Porsnev's meeting confirmation states October 16, 2026 at 9:30 AM CDT. Gmail message ID: `1a140bce376c0f9b`.
- The Teams invitation is stored in Gmail message ID `1a140bd1c6cefd48`.

These message IDs are internal evidence references. They contain no API credential or secret.

## Implementation that exists today

The repository contains a server-side Apaleo connector with:

- OAuth 2.0 Authorization Code Grant initiation and callback handling;
- a cryptographically random `state` value bound to the authenticated admin and PMS connection;
- production callback URL `https://www.iratepilot.com/api/admin/integrations/pms/apaleo/callback`;
- encrypted storage of the returned refresh token in the PMS credential vault;
- refresh-token rotation during connection validation;
- a property-read connection test using `GET /inventory/v1/properties`;
- an admin property selector that reads only the authorized Apaleo properties, revalidates the selected property against Apaleo before saving it, and leaves live traffic disabled;
- offer search using `GET /booking/v1/offers` with `channelCode=Ibe`;
- booking creation using `POST /booking/v1/bookings` with an idempotency key;
- reservation cancellation using `PUT /booking/v1/reservation-actions/{id}/cancel`;
- bounded request timeouts and normalized error handling; and
- local unit coverage for the adapter, HTTP transport, OAuth state, connection test, and booking sync.

The OAuth authorization request currently asks for `offline_access openid profile`. This is appropriate only if the registered Store app is a fine-grained client whose API permissions are configured on the app. If the app is a legacy scope client, the authorization request must also include the required API scopes. Confirm the client access type during the call before changing the request.

## Certification gaps that remain

Do not describe the integration as certification-ready until these items are implemented and proven:

1. Move the property selector into the hotel-facing onboarding flow, or obtain Apaleo confirmation that the current admin-managed mapping satisfies certification.
2. Enforcement that property reads, offer searches, bookings, and webhook subscriptions remain within those selected properties.
3. Webhook subscription creation during onboarding for selected properties only.
4. An HTTPS webhook receiver with authentication, deduplication by event ID, out-of-order handling, retry-safe processing, and sanitized operational evidence.
5. Webhook subscription deletion during disconnect/offboarding, with proof that no orphaned subscription remains.
6. Mandatory services displayed before booking, optional service offers, and correct service inclusion in the booking request.
7. Correct display and accounting for `totalGrossAmount`, `prePaymentGrossAmount`, city tax, and additional mandatory fees.
8. Apaleo's required payment flow for `Prepayment` and `CreditCard` guarantee types, including 3-D Secure, declines, `transactionReference`, and payment-account references. No payment assumption should be made before Apaleo confirms the approved processor and flow.
9. Reservation retrieval and reconciliation after create/cancel and after relevant webhook events.
10. Graceful 404 behavior, `pageSize=200` where pagination applies, one-hour access-token expiry, and complete end-to-end test evidence.
11. A live disconnect-and-reconnect demonstration in the Apaleo test account.
12. Apaleo review and certification approval before Store publication or any real hotel activation.

## Questions to resolve with Apaleo

1. Is the registered iRatePilot Store app a fine-grained client or a legacy scope client?
2. If fine-grained, which exact Core API, Payment API, and Webhook API permissions should be configured for an IBE that reads properties and offers, creates and cancels bookings, reconciles reservations, and manages property-scoped subscriptions?
3. If scope-based, which exact scopes must be included in the authorization request?
4. Which test account and properties should be used for certification, and may Apaleo provide test properties if no pilot hotel is ready?
5. Is a pilot customer required for iRatePilot's certification, or may the certification use the developer test account?
6. Which reservation events are mandatory for this use case: created, amended, changed, canceled, deleted, no-show, checked-in, checked-out, and payment-account events?
7. What authentication method does Apaleo expect on the webhook endpoint, and what evidence is required for duplicate, out-of-order, retry, health-check, and invalid-authentication cases?
8. Confirm the full IBE certification matrix for property selection, offers, mandatory and optional services, taxes and fees, children, decimal prices, payment authorization, 3-D Secure, declined payment, booking, cancellation, reconciliation, onboarding, and offboarding.
9. Does certification require Adyen, and if so, must iRatePilot use Apaleo Pay or may it use an independently contracted Adyen account?
10. What must appear in the onboarding guide and Store listing before the certification call?
11. What evidence should iRatePilot submit, who reviews it, and how long does review normally take?
12. What are the production activation steps after certification, including support contacts and incident escalation?

## Demonstration sequence after the gaps are closed

1. Start with no active Apaleo connection or webhook subscription.
2. Create or select an Apaleo PMS connection in iRatePilot Admin.
3. Save the Store app client ID and secret through the encrypted credential vault.
4. Click **Connect Apaleo account** and complete Apaleo consent.
5. Return through the production callback and confirm refresh-token storage without exposing any token.
6. Load accessible properties, select only the hotel properties that iRatePilot should serve, and persist that allowlist.
7. Create only the required webhook subscriptions for the selected properties.
8. Search offers for a selected property and show mandatory services, optional services, taxes, fees, total gross, and prepayment amount accurately.
9. Complete Apaleo's approved payment scenarios and create a booking with `channelCode=Ibe`.
10. Reconcile the booking through the API and webhook events, then cancel it and reconcile the cancellation.
11. Disconnect the app, delete every subscription created by iRatePilot, revoke local credentials, and prove that no selected property or webhook remains active.

## Go/no-go rule

The pre-certification call may advance the integration into the certification build phase. It does not authorize Store publication, a real hotel connection, consumer booking, payment collection, or production traffic. Those remain disabled until the complete certification matrix passes, Apaleo provides written approval, one authorized hotel mapping is verified, and iRatePilot records a controlled production smoke test.

## Official sources reviewed

- `https://apaleo.dev/guides/apaleo-store/certify-your-app.html`
- `https://apaleo.dev/guides/api/scopes.html`
- `https://apaleo.dev/guides/oauth-connection/auth-code-grant`
- `https://apaleo.dev/guides/business-cases/ibe/get-certified.html`
- `https://apaleo.dev/guides/business-cases/ibe/get-offers.html`
- `https://apaleo.dev/guides/business-cases/ibe/create-the-booking.html`
- `https://apaleo.dev/guides/webhook/configuration.html`
- `https://apaleo.dev/guides/webhook/best-practices.html`


# Connect iRatePilot to Apaleo

This guide describes the intended hotel onboarding and offboarding flow for the certified iRatePilot Apaleo integration. The connection must remain in test mode until Apaleo certifies the completed flow.

## Before you begin

You need:

- an active Apaleo account and a user whose role covers the permissions requested by iRatePilot;
- access to every hotel property you intend to connect;
- authority from the hotel to share availability and create reservations through iRatePilot; and
- an iRatePilot hotel-partner account approved for PMS onboarding.

Do not send passwords, client secrets, refresh tokens, card data, or one-time codes by email or support chat.

## Connect the account

1. Sign in to the iRatePilot partner or admin portal.
2. Open the PMS connection for the hotel and select **Apaleo**.
3. Start **Connect Apaleo account**.
4. Apaleo opens its consent page. Sign in with your Apaleo user credentials and review the requested permissions.
5. Select only the properties that iRatePilot is authorized to serve, then approve the connection.
6. Apaleo returns you to iRatePilot. iRatePilot stores the connection credential in its encrypted server-side vault.
7. Confirm the property list and explicitly enable only the properties whose offers and bookings should be available through iRatePilot.
8. Run the connection test. A successful test proves access to the selected test properties; it does not by itself authorize production traffic.

## What iRatePilot configures

After connection, the certified flow will:

- store the authorized property allowlist;
- create only a `reservation/*` Apaleo webhook subscription for the selected property after an explicit admin action;
- authenticate incoming events with a unique endpoint token kept in the encrypted credential vault and retain only the provider entity reference and digest evidence needed for reconciliation;
- retrieve the current Apaleo reservation through a retry-safe worker, validate it against the selected property, and retain a PII-free state digest without changing the reservation or an iRatePilot booking;
- use Apaleo's IBE channel when retrieving offers and creating bookings;
- refresh access tokens without asking the hotel to reconnect each hour; and
- keep Apaleo credentials and payment references on the server.

## Validation before activation

iRatePilot and the hotel must validate:

1. the expected properties appear and no unapproved property is selectable;
2. room and rate-plan mappings are correct;
3. mandatory services, optional services, taxes, fees, cancellation terms, total price, and prepayment amount display correctly;
4. test bookings, payment outcomes, reservation retrieval, cancellation, and webhook reconciliation pass;
5. duplicate and out-of-order webhook events do not create duplicate bookings or notifications; and
6. support and incident contacts are recorded.

Production booking remains disabled until Apaleo certification, hotel authorization, mapping approval, webhook validation, and a controlled production smoke test are complete.

## Disconnect the account

1. Open the hotel's Apaleo connection in iRatePilot.
2. Choose **Disconnect**.
3. iRatePilot removes every webhook subscription that it created for the selected properties.
4. iRatePilot revokes or deletes the locally stored connection credential and disables Apaleo traffic.
5. In Apaleo, open **Apps > Connected apps** and confirm that iRatePilot is disconnected.
6. Verify that no iRatePilot webhook subscription or property mapping remains active.

If disconnect cleanup fails, keep traffic disabled and contact iRatePilot support before reconnecting.

## Support information to record

For each connected hotel, record the hotel name, Apaleo account reference, selected property IDs, hotel-authorized contact, iRatePilot connection ID, activation state, last successful validation time, and support case reference. Never place secrets or guest information in this record.


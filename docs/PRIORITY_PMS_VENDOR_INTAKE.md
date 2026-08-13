# Priority PMS vendor intake package

Use this document when Oracle, Hilton, Marriott, or HotelKey responds to an integration request. Do not place passwords, tokens, client secrets, or webhook secrets in email, tickets, chat, or source control. Ask the vendor to use its approved secure credential-delivery method, then enter the values through the iRatePilot Admin PMS Credential Console.

## Information required from every provider

- Written approval naming iRatePilot and the approved sandbox and production environments.
- Authorized hotel/property identifiers and the hotel representative who approved the connection.
- HTTPS base URL and documented paths for availability, create, retrieve, modify, cancel, and read-only validation operations.
- Authentication method, credential header, credential scheme, credential scope, and rotation procedure.
- Signed-webhook specification, event types, retry policy, and a securely delivered webhook secret.
- Rate-plan, room-type, tax, fee, guarantee, cancellation-policy, and status mappings.
- Sandbox test-property details, certification steps, production smoke-test procedure, support contact, and escalation contact.

## Oracle OPERA / OPERA Cloud

Request OHIP Property API access plus the separate OPERA Cloud Distribution Shop/Book channel credentials. Required secure configuration:

- `PMS_ORACLE_OPERA_BASE_URL`
- `PMS_ORACLE_OPERA_CLIENT_ID`
- `PMS_ORACLE_OPERA_CLIENT_SECRET`
- `PMS_ORACLE_OPERA_APP_KEY`
- `PMS_ORACLE_OPERA_HOTEL_ID`
- `PMS_ORACLE_OPERA_DISTRIBUTION_BASE_URL`
- `PMS_ORACLE_OPERA_DISTRIBUTION_TOKEN_URL`
- `PMS_ORACLE_OPERA_DISTRIBUTION_USERNAME`
- `PMS_ORACLE_OPERA_DISTRIBUTION_PASSWORD`
- `PMS_ORACLE_OPERA_DISTRIBUTION_APP_KEY`
- `PMS_ORACLE_OPERA_DISTRIBUTION_CHANNEL_CODE`
- `PMS_ORACLE_OPERA_WEBHOOK_SECRET`

Also request the approved hotel/channel mapping, integration user scope, token endpoint, event-signature format, and Oracle certification case number.

## Hilton PEP and Hilton OnQ

Request separate credentials and endpoint sets for PEP and OnQ. Each provider requires:

- HTTPS base URL.
- API credential and its approved header/scheme.
- Availability, create, retrieve, modify, cancel, and validation paths.
- Webhook secret and signed-event documentation.
- Hilton property code, environment name, certification case number, and approved connectivity intermediary when applicable.

The corresponding server-only prefixes are `PMS_HILTON_PEP_` and `PMS_HILTON_ONQ_`.

## Marriott FOSSE and Marriott FS-PMS

Request separate specifications and credentials for FOSSE and FS-PMS. Each provider requires:

- HTTPS base URL.
- API credential and its approved header/scheme.
- Availability, create, retrieve, modify, cancel, and validation paths.
- Webhook secret and signed-event documentation.
- Marriott property/MARSHA code, environment name, certification case number, and authorized connectivity path.

The corresponding server-only prefixes are `PMS_MARRIOTT_FOSSE_` and `PMS_MARRIOTT_FS_PMS_`.

## HotelKey

Request:

- HTTPS base URL.
- API credential and its approved header/scheme.
- Availability, create, retrieve, modify, cancel, and validation paths.
- Webhook secret and signed-event documentation.
- HotelKey property code, approved environment, partnership/certification reference, and support escalation contact.

The server-only prefix is `PMS_HOTELKEY_`.

## Activation evidence sequence

For each provider and pilot property, record these gates in order in the Admin PMS readiness dashboard:

1. Vendor approval confirmed.
2. Property and room/rate mappings confirmed.
3. Sandbox availability and reservation lifecycle passed without a real charge.
4. Valid signed webhook accepted and invalid signature rejected.
5. Vendor-approved production test-property smoke test passed.
6. Live traffic explicitly enabled for the pilot property.

Stop immediately if credentials are missing or over-scoped, an endpoint is not HTTPS, operation paths are undocumented, webhook signatures cannot be verified, or the vendor/property has not approved production traffic.

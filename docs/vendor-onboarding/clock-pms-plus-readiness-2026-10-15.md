# Clock PMS+ integration readiness — 2026-10-15

## Decision

Do not submit Clock Software's integration request yet. The official form requires truthful details that iRatePilot does not currently have:

- at least one active Clock PMS+ pilot customer;
- that customer's Clock PMS+ Subscription ID; and
- a declared demand band beginning at 5–10 interested active Clock customers.

iRatePilot currently has no approved pilot Clock hotel, so inventing these values would misrepresent customer demand. The external gate is to recruit one real Clock PMS+ hotel and obtain written permission to use its Subscription ID for the integration request.

## Official integration path

Clock documents two integration models:

- **Established Industry Solution** — broad hotel-industry product, normally published in an established hotel technology directory such as HotelTechReport.
- **Custom Project Integration** — built for a specific customer or small customer group.

Both models require an identified pilot customer before the integration begins. Clock provides a free sandbox and documentation for both. Certification is free for an established industry solution and listed at €400 for a custom project, with up to two validation sessions. Optional engineering assistance is €150 per hour with a two-hour advance minimum.

## Architecture required for iRatePilot

For OTA distribution, Clock directs partners to its **OTA Channel Connect API**, which is separate from the property-scoped REST APIs already scaffolded in iRatePilot.

Clock PMS+ is the active side of the SOAP exchange. About every five minutes it:

1. downloads new or modified reservations from the channel endpoint; and
2. pushes availability, prices, restrictions, and length-of-stay updates.

The channel endpoint must support SOAP 1.1 and WS-Security `UsernameToken` credentials supplied by iRatePilot. Requests identify the hotel with `HotelCode`. Credentials may be shared across hotels or unique per hotel; production should use unique credentials per hotel when Clock allows it.

The existing `services/hotel-suppliers/clock-pms-plus` adapter uses Clock's REST API with HTTP Digest authentication. It can support a property-authorized direct PMS connection, but it is not the OTA Channel Connect endpoint and must not be presented as a certified public Clock channel.

## Operational limits and security

- REST API limit: 5 calls per second per API user.
- Retry HTTP 429 responses with bounded backoff; do not automatically retry other 4xx or 5xx errors.
- Use filtered or event-driven reads instead of full-table extraction.
- Clock's complimentary monthly API CPU allowance is 180,000,000 ms (50 hours) per hotel across integrations; excess usage is billed to the hotel at €1 per CPU hour.
- Clock's push notifications use Amazon SNS payloads and permit only one webhook per API user per account.
- Store API and WS-Security credentials only in the encrypted PMS credential vault. Never put them in launch evidence notes or client-visible configuration.

## Next executable steps

1. Recruit one real hotel already using Clock PMS+.
2. Obtain written hotel authorization and its Clock Subscription ID.
3. Confirm whether Clock classifies iRatePilot as an Established Industry Solution or Custom Project.
4. Submit the Clock integration form with the authorized pilot details.
5. Receive the sandbox account and agreed channel credentials.
6. Implement the SOAP Channel Connect endpoint against Clock's exact certification cases.
7. Prepare integration workflows and test data before the validation meeting.
8. Pass Clock's end-to-end production validation.
9. Record vendor approval, property mapping, sandbox validation, webhook validation, and production smoke evidence in iRatePilot Admin.
10. Enable real traffic only after all internal and Clock validation gates pass.

## Source pages reviewed

- `https://developers.clock-software.com/support/solutions/articles/9000221956-1-before-you-start`
- `https://developers.clock-software.com/support/solutions/articles/9000221951-2-check-the-api-specs`
- `https://developers.clock-software.com/support/solutions/articles/9000221952-3-ask-questions-or-start-the-integration`
- `https://developers.clock-software.com/support/solutions/articles/9000221953-4-get-it-done-and-let-us-know`
- `https://api-docs.clock-software.com/#3e8c054b-b4ac-4ad8-99e7-8b34c920ff01`

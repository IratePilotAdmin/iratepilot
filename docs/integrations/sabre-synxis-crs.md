# Sabre SynXis CRS integration

SynXis Central Reservation System is tracked as a CRS/distribution connector, not as one of
iRatePilot's PMS adapters. Its production boundary remains disabled until Sabre approval,
certification, property mapping, sandbox validation, and a production smoke test are recorded.

## Phase-one scope

- Import and reconcile SynXis room, rate, rate-category, and product codes.
- Push rate changes with delta updates.
- Push inventory changes for the mapped property and channel.
- Receive and reconcile reservation delivery events.
- Preserve request IDs, audit results, retry transient failures, and never log credentials.

Phase 2 adds hardened SOAP 1.1 HTNG and SOAP 1.2 WS-Security transport profiles, plus OTA
rate-amount and inventory XML mappers. The configured endpoint and SOAP actions must still be
reconciled against the WSDL and interface package provisioned to iRatePilot by Sabre. Phase 4 adds a certification execution harness that validates success, warning, and error
acknowledgements and retries only transient transport failures up to three attempts. Phase 5
adds a Supabase/Postgres reservation coordinator that spaces starts at no more than five
transactions per second across every application instance. The certification client requires
an explicit limiter, preventing a caller from silently falling back to process-local control.
Phase 6 adds a private certification-evidence ledger and an admin-only API at
`/api/admin/integrations/crs/synxis`. Migration
`202608130040_synxis_crs_launch_evidence.sql` enforces the approval sequence in the database;
neither an API mistake nor a direct write can set `live_enabled` before the preceding gates and
non-secret activation details are present. Reservation delivery remains out of scope until that
certified contract is available. Phase 7 adds the SynXis certification panel to Admin Settings,
including ordered gate controls, non-secret evidence fields, configuration warnings, and an exact
confirmation phrase for the final live switch. The API independently rejects live activation when
production configuration is missing or invalid, so the browser cannot bypass that safeguard.
Phase 8 adds migration `202608130041_synxis_crs_evidence_audit.sql`, which records every evidence
change through a database trigger, blocks update/delete operations against audit events, and shows
the latest 25 events in Admin Settings. Audit snapshots contain certification evidence only and
must never contain connector secrets.

## Configuration

Every property must have its own credential set. Store secret values in the server credential
vault; never store them in launch-evidence notes.

Required server configuration:

- `CRS_SYNXIS_BASE_URL`
- `CRS_SYNXIS_USERNAME`
- `CRS_SYNXIS_PASSWORD`
- `CRS_SYNXIS_HOTEL_ID`
- `CRS_SYNXIS_RATE_SOAP_ACTION`
- `CRS_SYNXIS_INVENTORY_SOAP_ACTION`

Optional server configuration:

- `CRS_SYNXIS_ENDPOINT_PATH` (normally `/ChannelConnect/api` for SOAP 1.1)
- `CRS_SYNXIS_TIMEOUT_MS` (1,000-120,000 milliseconds)

## Activation checklist

Complete these gates in order:

1. Sabre vendor/connectivity approval is documented.
2. Sabre provisions iRatePilot's certification environment and interface package.
3. The real SynXis Hotel ID, room codes, rate codes, and channel codes are mapped.
4. Product query, delta rate push, inventory push, and reservation delivery pass in certification.
5. Migration `202608130039_synxis_distributed_rate_limit.sql` is applied and the
   `createSynxisDistributedRateLimiter()` coordinator is used for certification traffic.
6. Replay, duplicate, timeout, retry, credential-redaction, and the Sabre 5-TPS system-level
   limit are validated across concurrent application instances.
7. A controlled production smoke test passes for the pilot property.
8. Migration `202608130040_synxis_crs_launch_evidence.sql` is applied and the non-secret
   approval references are recorded through the admin-only evidence endpoint.
9. An administrator explicitly enables live traffic.
10. Preserve migration 041 audit history for the certification record and any future investigation.

Configuration alone never permits live traffic.

## Official references

- [Channel Connect specification](https://developer.sabre.com/sites/default/files/resources/1575/SHS_Channel_Connect_Specification_10.29.0_CHC_v2.6.pdf)
- [Property Connect integration guide](https://developer.sabre.com/sites/default/files/2019-11/FAQ%20Property%20Connect%20Integration%20Guide%20for%20Vendors%20V10.13.pdf)
- [Generic ARI Push specification](https://developer.sabre.com/sites/default/files/resources/1718/SHS_Generic_ARI_Push_Specification_v10.29.0.pdf)
- [Query Products specification](https://developer.sabre.com/sites/default/files/2019-08/Query%20Products%20Specification_v1.1.pdf)

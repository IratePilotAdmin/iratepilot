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
must never contain connector secrets. Phase 9 replaces caller-supplied approval booleans with a
required runtime authorizer. Every SOAP execution re-reads the persisted launch evidence before
credentials are loaded or a network request begins. Certification, production-smoke, and live
traffic modes each require their corresponding ordered gates, and database errors fail closed.
Phase 10 adds migration `202608130042_synxis_request_journal.sql`. Each transport attempt must
create a unique non-secret receipt before credentials or network access, then transition it once to
success or failure. Duplicate request/attempt pairs, missing journal storage, and completion-write
failures stop execution without an automatic retry. SOAP bodies and credential values are never
stored in the journal.
Phase 11 adds the latest 50 request receipts to Admin Settings with status counts, HTTP status,
attempt number, traffic mode, and elapsed time. Receipts left in `started` for five minutes are
flagged for manual vendor-outcome reconciliation before any retry is considered.
Phase 12 adds an admin-only certification packet download. The JSON export includes readiness,
non-secret evidence, audit history, and request receipts, marks bounded sections when truncated,
and includes a SHA-256 checksum. Environment values, credentials, tokens, and SOAP bodies are
explicitly excluded.
Phase 13 adds an admin-only packet verifier in Admin Settings. It accepts exported JSON packets up
to 2 MB, validates the provider and schema, and recomputes the SHA-256 checksum. A successful check
confirms that packet contents have not changed since export; it does not prove who created or
approved the packet.
Phase 14 adds migration `202608130043_synxis_certification_export_receipts.sql`. Before a packet is
returned, the server records an immutable, non-secret issuance receipt containing its checksum,
schema, counts, timestamps, and exporting administrator. Packet verification then distinguishes an
unchanged packet from an unchanged packet whose issuance is also recorded by iRatePilot. Packet
bodies, evidence contents, and credentials are never stored in this ledger.
Phase 15 makes migration 043 readiness explicit in Admin Settings and shows the latest 25 issuance
receipts. The download control remains locked until the issuance ledger can be queried, preventing
an administrator from starting an export that the server must reject. The history displays only
checksum, schema, counts, timestamps, and administrator attribution.
Phase 16 embeds the issuance receipt UUID into every new packet before its checksum is calculated.
The verifier requires both receipt ID and checksum to match the same immutable ledger row. Existing
schema-1 packets without an embedded receipt ID remain verifiable through their unique checksum and
are explicitly identified as legacy checksum matches.
Phase 17 adds migration `202608130044_synxis_certification_packet_schema_v2.sql`. New receipt-bound
packets use schema 2, which requires an embedded receipt UUID; the ledger records that binding
requirement. Schema 1 remains supported for legacy packets. Admin Settings deliberately queries the
migration-044 marker so schema-2 exports stay locked until the database contract is ready.
Phase 18 adds packet freshness verification. After integrity and issuance are confirmed, the
verifier checks the newest evidence audit event and request receipt in parallel. A packet is marked
superseded when either occurred after packet generation, prompting the administrator to export a
new packet before certification handoff. Freshness lookup failures fail closed.
Phase 19 adds an explicit certification-handoff eligibility decision. A packet is eligible only
when checksum integrity, schema-2 receipt binding, iRatePilot issuance, freshness, and complete
evidence and request-journal sections are all verified. Legacy, unissued, superseded, malformed, or
truncated packets remain inspectable but are clearly blocked from handoff. This assessment stores
no uploaded packet content and does not alter the production activation gates.
Phase 20 adds a separate per-property SynXis onboarding request in Partner Center. An approved
partner account can submit a non-secret SynXis Hotel ID and record whether the authorized hotel
representative is an owner, general manager, revenue manager, or sales manager. Migration
`202608130045_synxis_property_onboarding_requests.sql` restricts partners to their own properties
and to the vendor-approval-pending state; administrators retain the later workflow. Requests never
accept credentials and cannot activate traffic. The declared representative role is an attestation,
not a delegated iRatePilot login; team-member accounts require a separate RBAC phase.

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
11. Construct every SOAP transport with `createSynxisRuntimeAuthorizer()` and the explicit
    `certification`, `production_smoke`, or `live` traffic mode. Never substitute a caller-supplied
    boolean or a cached approval value for the persisted check.
12. Apply migration `202608130042_synxis_request_journal.sql` and construct the transport with
    `createSynxisRequestJournal()`. Retain request IDs and attempt receipts for Sabre certification
    reconciliation; never add XML payloads or credentials to the journal.
13. Apply migration `202608130043_synxis_certification_export_receipts.sql` before downloading a
    certification packet. Preserve issuance receipts with the certification record; rollback is
    intentionally blocked once any receipt exists.
14. Apply migration `202608130044_synxis_certification_packet_schema_v2.sql` to enable new packet
    exports. Schema-2 receipt IDs and checksums must match the same immutable issuance row.
15. Apply migration `202608130045_synxis_property_onboarding_requests.sql` before accepting
    property-level SynXis requests from approved partner accounts.

Configuration alone never permits live traffic.

## Official references

- [Channel Connect specification](https://developer.sabre.com/sites/default/files/resources/1575/SHS_Channel_Connect_Specification_10.29.0_CHC_v2.6.pdf)
- [Property Connect integration guide](https://developer.sabre.com/sites/default/files/2019-11/FAQ%20Property%20Connect%20Integration%20Guide%20for%20Vendors%20V10.13.pdf)
- [Generic ARI Push specification](https://developer.sabre.com/sites/default/files/resources/1718/SHS_Generic_ARI_Push_Specification_v10.29.0.pdf)
- [Query Products specification](https://developer.sabre.com/sites/default/files/2019-08/Query%20Products%20Specification_v1.1.pdf)

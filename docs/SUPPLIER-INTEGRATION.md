# Hotel PMS integrations

iRatePilot uses one normalized supplier contract for availability, rates, inventory, reservations, cancellations, and webhooks. Vendor-specific payloads must stay inside their adapter; customer booking routes must never call a PMS directly.

## Supported integration targets

| Provider | Access path | Current implementation state |
| --- | --- | --- |
| Oracle OPERA / OPERA Cloud | Oracle Hospitality Integration Platform (OHIP) plus hotel authorization | Adapter manifest and credential readiness |
| Hilton PEP | Hilton certification and issued connectivity specification | Adapter manifest and credential readiness |
| Hilton OnQ | Hilton certification or an approved connectivity intermediary | Adapter manifest and credential readiness |
| Marriott FOSSE | Marriott certification and issued connectivity specification | Adapter manifest and credential readiness |
| Marriott FS-PMS | Marriott certification and issued connectivity specification | Adapter manifest and credential readiness |
| HotelKey | HotelKey partnership, documentation, and property authorization | Adapter manifest and credential readiness |

These systems are not anonymous public inventory feeds. Do not scrape them, reverse engineer hotel systems, or accept credentials from a hotel before the brand/vendor confirms that iRatePilot is authorized to use them.

## Server-only configuration

Each provider uses an environment prefix and required configuration list declared in `services/hotel-suppliers/providers.ts`. Every provider requires these server-side values:

- `<PREFIX>_BASE_URL`
- `<PREFIX>_CLIENT_ID`
- `<PREFIX>_CLIENT_SECRET`

Oracle OPERA also requires `PMS_ORACLE_OPERA_APP_KEY`. Its token endpoint defaults to `<BASE_URL>/oauth/v1/tokens`; an issued alternative can be set with `PMS_ORACLE_OPERA_TOKEN_URL`. Request timeouts default to 15 seconds and can be overridden with `PMS_ORACLE_OPERA_TIMEOUT_MS`.

Never prefix these variables with `NEXT_PUBLIC_`. The admin-only endpoint `GET /api/admin/integrations/pms` reports missing variable names and readiness, but never returns their values.

## Activation sequence

1. Execute a vendor/brand connectivity agreement and obtain sandbox access.
2. Record the authorized hotel chain and property identifiers.
3. Implement the vendor payload mapper behind the normalized supplier contract.
4. Verify availability, rate, reservation, cancellation, retry, and idempotency behavior in sandbox.
5. Complete vendor certification and a single-property pilot.
6. Enable production traffic behind a provider/property feature flag.

No provider should be marked live merely because environment variables are present. `ready_for_validation` means credentials are complete enough to begin sandbox verification; it does not mean vendor certification or production approval is complete.

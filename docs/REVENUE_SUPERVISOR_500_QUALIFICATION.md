# Supervisor queue: 500-property database qualification

On September 30, 2026, the actual PMS database `eiqmdldjnedqgbtoozqa` passed a bounded single-session queue check with 500 authorized properties and 2,490 active exceptions. The fixture used 496 temporary properties plus four properties already authorized to the private pilot owner. Two test room types and duplicated gateway routes per fixture exercised room-mapping, duplicate-route, oversold-inventory, stale-capture and forecast-validation conditions. No external delivery occurred.

| Request | Server execution time |
| --- | ---: |
| First page, including initial observations | 1,313.441 ms |
| Next page | 2,034.934 ms |
| Last page | 2,613.612 ms |
| Past-end page | 3,135.644 ms |

The first page contained 50 issues and a 31,978-byte JSON response. The final page contained 40 issues. First/next/last/past-end page contracts passed; the first two pages contained no duplicate issue IDs. The check sampled these pagination boundaries; it did not traverse every intermediate page. Claiming a fixture issue and replaying the same request returned the same revision. A stale review revision was rejected, and adding a 501st property triggered the documented property-count limit.

All fixture data, queue observations and claim operations were rolled back within a PL/pgSQL subtransaction. A separate cleanup query confirmed the original two tenants, five properties, 2,250 snapshot rows and 180 forecast records remained, with zero temporary tenants or properties. No users were created, no real memberships were deleted, no rates or reservations were changed, and no signing credential or outbound request was used.

Run `scripts/qualify-revenue-supervisor-500.sql` only against the PMS database with administrative test access. It asserts its contracts, rolls back on both success and failure, and returns a compact qualification report. A success signal is evidence for this specific database workload, not permission to activate live pricing.

These times are PostgreSQL function execution inside one transaction, excluding HTTP, authentication transport, mobile rendering and network latency. They are four individual measurements, not a p95/p99 benchmark. Concurrent operators, multiple tenants with different owners, sustained one-minute refreshes, database growth, process failures and end-to-end browser behavior remain unqualified. Forecast recording is still enrolled only for Red Roof, and forecast accuracy plus signed PMS-to-OTA HTTP validation remain open release gates. This check does not establish that one person can successfully operate 500 live hotels.

A separate bounded concurrent claim/replay check passed for one supervisor and one isolated exception; see REVENUE_SUPERVISOR_CONCURRENCY.md. It does not qualify concurrent traffic at 500 properties.

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const evidence = JSON.parse(
  readFileSync(
    new URL(
      "../docs/evidence/FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_SHOPPING_CANARY_2026-08-26.json",
      import.meta.url,
    ),
    "utf8",
  ),
).evidence;

describe("Production Duffel live-shopping canary evidence", () => {
  it("records one bounded shopping request without commerce authority", () => {
    expect(evidence.scope).toBe(
      "one_live_duffel_offer_request_without_booking_payment_or_ticketing",
    );
    expect(evidence.consumerReleaseAuthorized).toBe(false);
    expect(evidence.bookingAuthorized).toBe(false);
    expect(evidence.paymentAuthorized).toBe(false);
    expect(evidence.settlementAuthorized).toBe(false);
    expect(evidence.ticketingAuthorized).toBe(false);
    expect(evidence.secretsIncluded).toBe(false);
    expect(evidence.providerReferencesIncluded).toBe(false);

    expect(evidence.boundedSearch).toMatchObject({
      applicationHttpStatus: 200,
      providerHttpStatus: 201,
      offerCount: 117,
      journalReplay: false,
    });
    expect(evidence.boundedSearch.responseSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("accounts for the sole dispatch and the pre-dispatch prepared row", () => {
    expect(evidence.productionJournal).toMatchObject({
      attemptCount: 2,
      unclaimedPreparedCount: 1,
      succeededCount: 1,
      failedCount: 0,
      ambiguousCount: 0,
      terminalHttp201Count: 1,
      totalOfferCount: 117,
      rawProviderPayloadStored: false,
      rawProviderIdentifiersStored: false,
    });
    expect(evidence.dispatchAccounting).toMatchObject({
      providerRequestsDispatched: 1,
      successfulProviderResponses: 1,
      preDispatchPreparedRows: 1,
      failedOrAmbiguousDispatches: 0,
    });
  });

  it("proves provider traffic and order creation were closed after the canary", () => {
    expect(evidence.closureDeployment).toMatchObject({
      promotedToCanonicalOrigin: true,
      darkShoppingEnabledAfterCanary: false,
      orderCreationEnabledAfterCanary: false,
      authenticatedLiveSearchClosureCheckStatus: 503,
      publicOrderEndpointStatus: 503,
      publicOrderPayloadInspected: false,
      journalCountAfterClosureCheck: 2,
      runtimeErrorClusters: 0,
    });
    expect(evidence.outcome).toBe(
      "single_live_duffel_shopping_canary_passed_and_provider_traffic_reclosed",
    );
  });

  it("distinguishes guarded object application from the standard migration ledger", () => {
    expect(evidence.productionJournal).toMatchObject({
      applicationMethod: "guarded_dashboard_sql",
      standardMigrationLedgerState: "object_applied_not_ledgered",
      standardMigrationLedgerLatestVersion: "202608220063",
      standardMigrationLedgerContains101: false,
      standardMigrationLedgerContains102: false,
    });
  });
});

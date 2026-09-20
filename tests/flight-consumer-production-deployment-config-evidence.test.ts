import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const evidencePath =
  "docs/evidence/FLIGHT_CONSUMER_PRODUCTION_DEPLOYMENT_CONFIG_AUDIT_2026-08-27.json";
const rawEvidence = readFileSync(evidencePath, "utf8");
const evidence = JSON.parse(rawEvidence).evidence;

describe("Flight Consumer Production deployment configuration evidence", () => {
  it("records the exact blocked Production deployment without claiming promotion", () => {
    expect(evidence).toMatchObject({
      environment: "vercel_production_read_only",
      result: "BLOCKED",
      sanitized: true,
      secretValuesRead: false,
      secretValuesIncluded: false,
      productionDeployment: {
        deploymentId: "dpl_D4pjuUgaNpQJ73Q4ejz2fxn5fA3w",
        target: "production",
        sourceCommit: "29df1d6120f0319e038dabfe2747d210020f41ee",
        latestAcceptedPreviewBranchCommitAtAuditStart:
          "f7b505a8c80f2a73b463f5f948a94594c41b745e",
        productionIncludesLatestAcceptedFlightBranch: false,
        productionPromotionPerformed: false,
      },
    });
  });

  it("pins missing provider bindings and the fail-closed Stripe preflight", () => {
    expect(evidence.productionVariablesMissing).toEqual(expect.arrayContaining([
      "FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_ID",
      "FLIGHT_CONSUMER_PRODUCTION_DUFFEL_ACCOUNT_SHA256",
      "FLIGHT_CONSUMER_PRODUCTION_DUFFEL_CREDENTIAL_SHA256",
      "FLIGHT_PAYMENT_PROCESSOR_ID",
      "FLIGHT_PAYMENT_ADAPTER_VERSION",
      "FLIGHT_PAYMENT_ADAPTER_SOURCE_SHA256",
      "FLIGHT_PAYMENT_ACCOUNT_SCOPE_SHA256",
      "FLIGHT_PAYMENT_ENVIRONMENT_SCOPE_SHA256",
      "FLIGHT_CONSUMER_PRODUCTION_STRIPE_PAYMENT_PLAN_DARK_ENABLED",
      "FLIGHT_CONSUMER_PRODUCTION_DUFFEL_LIVE_REPRICE_DARK_ENABLED",
      "FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_PREVIEW_ENABLED",
      "FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_POLICY_SHA256",
      "FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_COHORT_SHA256",
      "FLIGHT_CONSUMER_PRODUCTION_PUBLIC_SHOPPING_SOURCE_COMMIT_SHA",
    ]));
    expect(evidence.stripeAccountPreflightAttempt).toEqual({
      page: "/admin/flights/consumer-production/stripe-account",
      method: "POST",
      responseStatus: 503,
      userVisibleResult: "The Production Stripe account preflight is unavailable.",
      runtimeLogDiagnostic: "runtime_unavailable",
      stripeProviderRequestPerformed: false,
      paymentIntentCreated: false,
      chargeCreated: false,
      refundCreated: false,
      duffelOrderCreated: false,
      ticketIssued: false,
    });
    expect(evidence.productionConsumerSurface).toEqual({
      path: "/flights",
      observedMode: "Flights Phase 1 supplier-offline planning preview",
      primaryAction: "Preview synthetic options",
      liveAirlineInventoryConnected: false,
      liveScheduleOrFareDisplayed: false,
      consumerBookingAccepted: false,
      consumerPaymentAccepted: false,
      ticketIssued: false,
    });
    expect(evidence.disposition).toMatchObject({
      productionDatabaseTouched: false,
      productionEnvironmentChanged: false,
      productionDeploymentChanged: false,
      providerMutationPerformed: false,
      paymentPerformed: false,
      bookingPerformed: false,
      ticketingPerformed: false,
      publicReleasePerformed: false,
    });
  });

  it("contains no credential material or secret-shaped values", () => {
    expect(rawEvidence).not.toMatch(
      /(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9_]+|duffel_(?:live|test)_[A-Za-z0-9_]+/,
    );
    expect(rawEvidence).not.toMatch(/password|database[_-]?url|access[_-]?token\s*:/i);
  });
});

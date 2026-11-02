import { describe, expect, it } from "vitest";
import { evaluateExpediaRapidProductionReadiness } from "../services/hotel-suppliers/expedia-rapid-production-readiness";

const sandbox = {
  HOTEL_INVENTORY_EXPEDIA_RAPID_API_KEY: "sandbox-key",
  HOTEL_INVENTORY_EXPEDIA_RAPID_SHARED_SECRET: "sandbox-secret",
  HOTEL_INVENTORY_EXPEDIA_RAPID_SANDBOX_ENABLED: "true",
};

const completeEvidence = {
  sandboxSearchValidated: true,
  bookingPayloadContractValidated: true,
  siteReviewComplete: true,
  partnerApproved: true,
  paymentLaunchReady: true,
  productionSmokeValidated: true,
  liveEnabled: true,
};

describe("Expedia Rapid production readiness", () => {
  it("fails closed at the first missing gate", () => {
    expect(evaluateExpediaRapidProductionReadiness({}, completeEvidence).nextGate)
      .toBe("sandbox_credentials");
    expect(evaluateExpediaRapidProductionReadiness(sandbox, {}).nextGate)
      .toBe("sandbox_search");
  });

  it("requires site-review completion before external approval", () => {
    expect(evaluateExpediaRapidProductionReadiness(sandbox, {
      sandboxSearchValidated: true,
      bookingPayloadContractValidated: true,
    })).toMatchObject({
      nextGate: "site_review",
      readyForLiveBooking: false,
    });
  });

  it("requires distinct production credentials after partner approval", () => {
    expect(evaluateExpediaRapidProductionReadiness(sandbox, {
      ...completeEvidence,
      productionSmokeValidated: false,
    }).nextGate).toBe("production_credentials");
    expect(evaluateExpediaRapidProductionReadiness({
      ...sandbox,
      HOTEL_INVENTORY_EXPEDIA_RAPID_PRODUCTION_API_KEY: "sandbox-key",
      HOTEL_INVENTORY_EXPEDIA_RAPID_PRODUCTION_SHARED_SECRET: "sandbox-secret",
    }, completeEvidence).nextGate).toBe("production_credentials");
  });

  it("keeps payment, smoke, and activation as independent gates", () => {
    const environment = {
      ...sandbox,
      HOTEL_INVENTORY_EXPEDIA_RAPID_PRODUCTION_API_KEY: "production-key",
      HOTEL_INVENTORY_EXPEDIA_RAPID_PRODUCTION_SHARED_SECRET: "production-secret",
    };
    expect(evaluateExpediaRapidProductionReadiness(environment, {
      ...completeEvidence,
      paymentLaunchReady: false,
    }).nextGate).toBe("payment_readiness");
    expect(evaluateExpediaRapidProductionReadiness(environment, {
      ...completeEvidence,
      productionSmokeValidated: false,
    }).nextGate).toBe("production_smoke");
    expect(evaluateExpediaRapidProductionReadiness(environment, {
      ...completeEvidence,
      liveEnabled: false,
    }).nextGate).toBe("live_activation");
    expect(evaluateExpediaRapidProductionReadiness(environment, completeEvidence)).toMatchObject({
      nextGate: "live",
      readyForLiveBooking: true,
    });
  });
});

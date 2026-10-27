import { describe, expect, it } from "vitest";

import { evaluateRatehawkCertificationReadiness } from "../services/hotel-suppliers/ratehawk-certification-readiness";

const sandbox = {
  HOTEL_INVENTORY_RATEHAWK_KEY_ID: "sandbox-key-id",
  HOTEL_INVENTORY_RATEHAWK_API_KEY: "sandbox-api-key",
  HOTEL_INVENTORY_RATEHAWK_SANDBOX_ENABLED: "true",
};

describe("RateHawk certification readiness", () => {
  it("requires both official certification hotels before implementation evidence", () => {
    expect(evaluateRatehawkCertificationReadiness(sandbox, {
      mappedHotelIds: [10004834],
    }).nextGate).toBe("certification_hotel_mapping");
  });

  it("does not treat completed sandbox work as production approval", () => {
    const readiness = evaluateRatehawkCertificationReadiness(sandbox, {
      mappedHotelIds: [10004834, 8819557],
      contentImplemented: true,
      searchValidated: true,
      hotelpageImplemented: true,
      prebookValidated: true,
      bookingFormValidated: true,
      bookingFinishValidated: true,
      finalStatusValidated: true,
      cancellationValidated: true,
      checklistSubmitted: true,
    });
    expect(readiness.nextGate).toBe("certification_approval");
    expect(readiness.readyForLiveBooking).toBe(false);
  });

  it("requires separate production credentials, smoke evidence, and activation", () => {
    const evidence = {
      mappedHotelIds: [10004834, 8819557],
      contentImplemented: true, searchValidated: true, hotelpageImplemented: true,
      prebookValidated: true, bookingFormValidated: true, bookingFinishValidated: true,
      finalStatusValidated: true, cancellationValidated: true, checklistSubmitted: true,
      certificationApproved: true, productionSmokeValidated: true, liveEnabled: true,
    };
    expect(evaluateRatehawkCertificationReadiness(sandbox, evidence).nextGate)
      .toBe("production_credentials");
    expect(evaluateRatehawkCertificationReadiness({
      ...sandbox,
      HOTEL_INVENTORY_RATEHAWK_PRODUCTION_KEY_ID: "production-key-id",
      HOTEL_INVENTORY_RATEHAWK_PRODUCTION_API_KEY: "production-api-key",
    }, evidence)).toMatchObject({ nextGate: "live", readyForLiveBooking: true });
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { evaluateInventorySandboxRuntimeGate } from
  "../services/hotel-suppliers/inventory-runtime-gate.server";

describe("inventory supplier sandbox runtime gate", () => {
  it("defaults every supplier to disabled", () => {
    expect(evaluateInventorySandboxRuntimeGate("hotelbeds", {})).toMatchObject({
      status: "disabled",
      credentialStatus: "not_configured",
      enablementKey: "HOTEL_INVENTORY_HOTELBEDS_SANDBOX_ENABLED",
    });
    expect(evaluateInventorySandboxRuntimeGate("ratehawk", {}).status).toBe("disabled");
    expect(evaluateInventorySandboxRuntimeGate("expedia-rapid", {}).status).toBe("disabled");
    expect(evaluateInventorySandboxRuntimeGate("booking-com", {})).toMatchObject({
      status: "disabled",
      enablementKey: "HOTEL_INVENTORY_BOOKING_COM_SANDBOX_ENABLED",
    });
    expect(evaluateInventorySandboxRuntimeGate("airbnb", {})).toMatchObject({
      status: "disabled",
      credentialStatus: "access_requests_closed",
      enablementKey: "HOTEL_INVENTORY_AIRBNB_SANDBOX_ENABLED",
    });
  });

  it("authorizes Booking.com only with credentials and an explicit sandbox flag", () => {
    expect(evaluateInventorySandboxRuntimeGate("booking-com", {
      HOTEL_INVENTORY_BOOKING_COM_SANDBOX_ENABLED: "true",
      HOTEL_INVENTORY_BOOKING_COM_API_KEY: "issued-booking-com-api-token",
      HOTEL_INVENTORY_BOOKING_COM_AFFILIATE_ID: "123456",
    })).toMatchObject({
      status: "authorized",
      credentialStatus: "ready_for_sandbox_validation",
    });
  });

  it("keeps Airbnb blocked until a dedicated transport is implemented", () => {
    expect(evaluateInventorySandboxRuntimeGate("airbnb", {
      HOTEL_INVENTORY_AIRBNB_SANDBOX_ENABLED: "true",
      HOTEL_INVENTORY_AIRBNB_PARTNER_APPROVED: "true",
      HOTEL_INVENTORY_AIRBNB_API_CLIENT_ID: "issued-airbnb-client-id",
      HOTEL_INVENTORY_AIRBNB_API_CLIENT_SECRET: "issued-airbnb-client-secret",
    })).toMatchObject({
      status: "unsupported_transport",
      credentialStatus: "ready_for_sandbox_validation",
    });
  });

  it("rejects an ambiguous enablement value", () => {
    expect(evaluateInventorySandboxRuntimeGate("ratehawk", {
      HOTEL_INVENTORY_RATEHAWK_SANDBOX_ENABLED: "yes",
    }).status).toBe("invalid_enablement");
  });

  it("requires complete valid credentials when explicitly enabled", () => {
    expect(evaluateInventorySandboxRuntimeGate("ratehawk", {
      HOTEL_INVENTORY_RATEHAWK_SANDBOX_ENABLED: "true",
    })).toMatchObject({
      status: "credentials_not_ready",
      credentialStatus: "not_configured",
    });
    expect(evaluateInventorySandboxRuntimeGate("ratehawk", {
      HOTEL_INVENTORY_RATEHAWK_SANDBOX_ENABLED: "true",
      HOTEL_INVENTORY_RATEHAWK_KEY_ID: "partner-id",
      HOTEL_INVENTORY_RATEHAWK_API_KEY: "ratehawk-api-key",
    })).toMatchObject({
      status: "authorized",
      credentialStatus: "ready_for_sandbox_validation",
    });
  });
});

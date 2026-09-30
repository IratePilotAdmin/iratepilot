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

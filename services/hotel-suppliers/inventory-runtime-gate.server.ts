import "server-only";

import {
  buildInventorySupplierReadiness,
  type InventorySupplierId,
  type InventorySupplierStatus,
} from "./inventory-readiness";

type Environment = Record<string, string | undefined>;

export type InventorySandboxGateStatus =
  | "disabled"
  | "invalid_enablement"
  | "credentials_not_ready"
  | "authorized";

export type InventorySandboxRuntimeGate = {
  supplierId: InventorySupplierId;
  status: InventorySandboxGateStatus;
  enablementKey: string;
  credentialStatus: InventorySupplierStatus;
};

const enablementKeys: Record<InventorySupplierId, string> = {
  hotelbeds: "HOTEL_INVENTORY_HOTELBEDS_SANDBOX_ENABLED",
  ratehawk: "HOTEL_INVENTORY_RATEHAWK_SANDBOX_ENABLED",
  "expedia-rapid": "HOTEL_INVENTORY_EXPEDIA_RAPID_SANDBOX_ENABLED",
};

export function evaluateInventorySandboxRuntimeGate(
  supplierId: InventorySupplierId,
  environment: Environment,
): InventorySandboxRuntimeGate {
  const readiness = buildInventorySupplierReadiness(environment)
    .find((supplier) => supplier.id === supplierId);
  if (!readiness) throw new Error("Inventory supplier configuration is unavailable.");

  const enablementKey = enablementKeys[supplierId];
  const configuredFlag = environment[enablementKey]?.trim().toLowerCase() ?? "";
  const status = configuredFlag === "" || configuredFlag === "false"
    ? "disabled"
    : configuredFlag !== "true"
      ? "invalid_enablement"
      : readiness.status !== "ready_for_sandbox_validation"
        ? "credentials_not_ready"
        : "authorized";

  return {
    supplierId,
    status,
    enablementKey,
    credentialStatus: readiness.status,
  };
}

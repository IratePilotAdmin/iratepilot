export type InventorySupplierId = "hotelbeds" | "ratehawk" | "expedia-rapid";

export type InventorySupplierStatus =
  | "not_configured"
  | "credentials_required"
  | "ready_for_sandbox_validation";

export type InventorySupplierReadiness = {
  id: InventorySupplierId;
  name: string;
  status: InventorySupplierStatus;
  requiredEnvironmentKeys: readonly string[];
  missingEnvironmentKeys: string[];
  documentationUrl: string;
  approvalNote: string;
};

type Environment = Record<string, string | undefined>;

type InventorySupplierManifest = Omit<
  InventorySupplierReadiness,
  "status" | "missingEnvironmentKeys"
>;

const inventorySupplierManifests = [
  {
    id: "hotelbeds",
    name: "Hotelbeds / HBX Group",
    requiredEnvironmentKeys: [
      "HOTEL_INVENTORY_HOTELBEDS_API_KEY",
      "HOTEL_INVENTORY_HOTELBEDS_SECRET",
      "HOTEL_INVENTORY_HOTELBEDS_MTLS_CERTIFICATE",
      "HOTEL_INVENTORY_HOTELBEDS_MTLS_PRIVATE_KEY",
    ],
    documentationUrl: "https://developer.hotelbeds.com/documentation/getting-started/",
    approvalNote: "Requires issued credentials, the required mTLS material, and Hotelbeds certification before live traffic.",
  },
  {
    id: "ratehawk",
    name: "RateHawk / Emerging Travel Group",
    requiredEnvironmentKeys: [
      "HOTEL_INVENTORY_RATEHAWK_KEY_ID",
      "HOTEL_INVENTORY_RATEHAWK_API_KEY",
    ],
    documentationUrl: "https://docs.emergingtravel.com/docs/fundamentals/authorization/",
    approvalNote: "Requires an approved contract and environment-specific API key before sandbox or production traffic.",
  },
  {
    id: "expedia-rapid",
    name: "Expedia Group Rapid",
    requiredEnvironmentKeys: [
      "HOTEL_INVENTORY_EXPEDIA_RAPID_API_KEY",
      "HOTEL_INVENTORY_EXPEDIA_RAPID_SHARED_SECRET",
    ],
    documentationUrl: "https://developers.expediagroup.com/rapid/lodging/reference/signature-authentication",
    approvalNote: "Requires Rapid partner approval and issued credentials; production access remains restricted until launch review.",
  },
] as const satisfies readonly InventorySupplierManifest[];

export function buildInventorySupplierReadiness(
  environment: Environment,
): InventorySupplierReadiness[] {
  return inventorySupplierManifests.map((supplier) => {
    const configuredCount = supplier.requiredEnvironmentKeys.filter(
      (key) => Boolean(environment[key]?.trim()),
    ).length;
    const missingEnvironmentKeys = supplier.requiredEnvironmentKeys.filter(
      (key) => !environment[key]?.trim(),
    );
    const status = configuredCount === 0
      ? "not_configured"
      : missingEnvironmentKeys.length > 0
        ? "credentials_required"
        : "ready_for_sandbox_validation";

    return {
      ...supplier,
      status,
      missingEnvironmentKeys,
    };
  });
}

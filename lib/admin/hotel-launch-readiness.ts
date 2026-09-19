export type HotelLaunchGateStatus = "ready" | "blocked" | "waiting_external" | "unavailable";

export type HotelLaunchGate = {
  id: string;
  label: string;
  status: HotelLaunchGateStatus;
  detail: string;
  actionHref: string;
  actionLabel: string;
};

export type HotelLaunchReadinessInput = {
  approvedHotelCount: number;
  approvedHotelStateAvailable: boolean;
  inventoryReadyHotelCount: number;
  commerciallyReadyHotelCount: number;
  commercialStateAvailable: boolean;
  liveSupplierCount: number;
  supplierStateAvailable: boolean;
  paymentConfigurationReady: boolean;
  paymentAuthorizationValid: boolean;
  paymentAuthorizationStateAvailable: boolean;
  operationsReady: boolean;
  operationsStateAvailable: boolean;
  publicationEnabled: boolean;
};

function gate(
  id: string,
  label: string,
  status: HotelLaunchGateStatus,
  detail: string,
  actionHref: string,
  actionLabel: string,
): HotelLaunchGate {
  return { id, label, status, detail, actionHref, actionLabel };
}

export function buildHotelLaunchReadiness(input: HotelLaunchReadinessInput) {
  const gates: HotelLaunchGate[] = [
    gate(
      "approved_hotel",
      "Approved hotel intake",
      !input.approvedHotelStateAvailable
        ? "unavailable"
        : input.approvedHotelCount > 0
          ? "ready"
          : "waiting_external",
      !input.approvedHotelStateAvailable
        ? "Hotel application approval evidence could not be verified. This gate fails closed."
        : input.approvedHotelCount > 0
        ? `${input.approvedHotelCount} approved hotel application${input.approvedHotelCount === 1 ? " is" : "s are"} linked to a property.`
        : "Waiting for the first real 4- or 5-star hotel application to be approved and linked to a property.",
      "/admin/partners",
      "Review hotel applications",
    ),
    gate(
      "listing_inventory",
      "Listing and sellable inventory",
      input.inventoryReadyHotelCount > 0 ? "ready" : "blocked",
      input.inventoryReadyHotelCount > 0
        ? `${input.inventoryReadyHotelCount} approved hotel listing${input.inventoryReadyHotelCount === 1 ? " has" : "s have"} complete content, an active room, and future inventory.`
        : input.approvedHotelCount > 0
          ? "No approved hotel yet has complete content, an active room, and future sellable inventory."
          : "A linked approved hotel is required before listing and inventory readiness can pass.",
      "/admin/properties",
      "Review properties",
    ),
    gate(
      "commercial_release",
      "Executed agreement and commercial review",
      !input.commercialStateAvailable
        ? "unavailable"
        : input.commerciallyReadyHotelCount > 0
          ? "ready"
          : "waiting_external",
      !input.commercialStateAvailable
        ? "Commercial agreement evidence could not be verified. This gate fails closed."
        : input.commerciallyReadyHotelCount > 0
          ? `${input.commerciallyReadyHotelCount} inventory-ready hotel${input.commerciallyReadyHotelCount === 1 ? " has" : "s have"} an effective executed agreement and completed commercial review.`
          : "Waiting for a counsel-approved template, both parties' signatures, and the accountable commercial review for an inventory-ready hotel.",
      "/admin/agreements",
      "Review hotel agreements",
    ),
    gate(
      "supplier_connection",
      "Live supplier or PMS connection",
      !input.supplierStateAvailable
        ? "unavailable"
        : input.liveSupplierCount > 0
          ? "ready"
          : "waiting_external",
      !input.supplierStateAvailable
        ? "Supplier launch evidence could not be verified. This gate fails closed."
        : input.liveSupplierCount > 0
          ? `${input.liveSupplierCount} priority supplier connection${input.liveSupplierCount === 1 ? " is" : "s are"} fully validated and enabled for live traffic.`
          : "Waiting for vendor approval, real property mapping, sandbox and webhook validation, a production smoke test, and controlled activation.",
      "/admin/settings",
      "Review PMS readiness",
    ),
    gate(
      "production_payments",
      "Production booking payments",
      !input.paymentAuthorizationStateAvailable
        ? "unavailable"
        : input.paymentConfigurationReady && input.paymentAuthorizationValid
          ? "ready"
          : "blocked",
      !input.paymentAuthorizationStateAvailable
        ? "Production payment approval evidence could not be verified. This gate fails closed."
        : input.paymentConfigurationReady && input.paymentAuthorizationValid
          ? "All live Stripe configuration checks pass and a current production payment approval receipt is recorded."
          : input.paymentConfigurationReady
            ? "Live Stripe configuration passes, but a current production payment approval receipt is still required."
            : "Live Stripe keys, webhook verification, payment and payout flags, or commercial operating mode are incomplete.",
      "/admin/settings",
      "Review payment readiness",
    ),
    gate(
      "support_operations",
      "Email and support operations",
      !input.operationsStateAvailable
        ? "unavailable"
        : input.operationsReady
          ? "ready"
          : "blocked",
      !input.operationsStateAvailable
        ? "Operational email and payout exception data could not be verified. This gate fails closed."
        : input.operationsReady
          ? "The email worker is enabled with no delivery backlog, dead letters, webhook failures, or payout exceptions."
          : "Resolve the email queue, delivery failures, payout exceptions, or disabled worker before launch.",
      "/admin/operations",
      "Review operations",
    ),
    gate(
      "production_release",
      "Production publication release",
      input.publicationEnabled
        && input.commerciallyReadyHotelCount > 0
        && input.liveSupplierCount > 0
        && input.paymentConfigurationReady
        && input.paymentAuthorizationValid
        && input.operationsReady
        ? "ready"
        : "blocked",
      input.publicationEnabled
        ? "The server publication gate is enabled, but every earlier launch gate must also remain ready."
        : "The server publication gate remains locked until every earlier gate passes and a controlled production release is approved.",
      "/admin/properties",
      "Review release candidates",
    ),
  ];

  const complete = gates.filter(({ status }) => status === "ready").length;
  return {
    checkedAt: new Date().toISOString(),
    complete,
    total: gates.length,
    percent: Math.round((complete / gates.length) * 100),
    launchReady: complete === gates.length,
    readOnly: true as const,
    gates,
  };
}

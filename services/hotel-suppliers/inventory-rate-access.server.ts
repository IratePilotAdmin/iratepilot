import "server-only";

import type { InventorySupplierId } from "./inventory-readiness";

export type InventoryRateAccessDenial =
  | "authentication_required"
  | "supplier_terms_unverified";

export type InventoryRateAccessDecision =
  | Readonly<{
    allowed: true;
    supplierId: InventorySupplierId;
    audience: "authenticated_customer";
  }>
  | Readonly<{
    allowed: false;
    supplierId: InventorySupplierId;
    reason: InventoryRateAccessDenial;
  }>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Fail-closed presentation policy for supplier prices.
 *
 * Callers must pass a customer id obtained from a server-verified session. This
 * decision never enables supplier traffic and never accepts a client-provided
 * authentication claim as proof of identity.
 */
export function evaluateInventoryRateAccess(input: {
  supplierId: InventorySupplierId;
  authenticatedCustomerId?: string | null;
}): InventoryRateAccessDecision {
  if (input.supplierId !== "stuba") {
    return Object.freeze({
      allowed: false,
      supplierId: input.supplierId,
      reason: "supplier_terms_unverified",
    });
  }

  const customerId = input.authenticatedCustomerId?.trim() ?? "";
  if (!uuidPattern.test(customerId)) {
    return Object.freeze({
      allowed: false,
      supplierId: input.supplierId,
      reason: "authentication_required",
    });
  }

  return Object.freeze({
    allowed: true,
    supplierId: input.supplierId,
    audience: "authenticated_customer",
  });
}

export class InventoryRateAccessError extends Error {
  readonly code: InventoryRateAccessDenial;

  constructor(code: InventoryRateAccessDenial) {
    super(code === "authentication_required"
      ? "Sign in before viewing this supplier price."
      : "This supplier price cannot be displayed until its distribution terms are verified.");
    this.name = "InventoryRateAccessError";
    this.code = code;
  }
}

export function requireInventoryRateAccess(input: {
  supplierId: InventorySupplierId;
  authenticatedCustomerId?: string | null;
}) {
  const decision = evaluateInventoryRateAccess(input);
  if (!decision.allowed) throw new InventoryRateAccessError(decision.reason);
  return decision;
}

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/require-role";
import { InventorySupplierResponseError } from "@/services/hotel-suppliers/inventory-response.server";
import { InventorySandboxTransportError } from "@/services/hotel-suppliers/inventory-sandbox-transport.server";
import {
  RatehawkSandboxValidationError,
  runRatehawkSandboxValidation,
} from "@/services/hotel-suppliers/ratehawk-sandbox-validation.server";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST() {
  const auth = await requireRole(["admin"]);
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, {
      status: auth.status,
      headers: noStoreHeaders,
    });
  }

  try {
    const result = await runRatehawkSandboxValidation({ environment: process.env });
    return NextResponse.json({
      ...result,
      message: "RateHawk sandbox search passed. No booking or payment was created.",
    }, { headers: noStoreHeaders });
  } catch (error) {
    const configurationError = (error instanceof RatehawkSandboxValidationError
      && error.code === "credentials_not_ready")
      || (error instanceof InventorySandboxTransportError
      && ["disabled", "invalid_enablement", "credentials_not_ready"].includes(error.code));
    const supplierRejected = error instanceof InventorySupplierResponseError
      || error instanceof InventorySandboxTransportError
      || error instanceof RatehawkSandboxValidationError;

    return NextResponse.json({
      error: configurationError
        ? "RateHawk sandbox validation is not configured."
        : supplierRejected
          ? "RateHawk sandbox validation did not pass. Try again later."
          : "RateHawk sandbox validation could not be completed.",
    }, {
      status: configurationError ? 409 : 502,
      headers: noStoreHeaders,
    });
  }
}

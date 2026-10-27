import "server-only";

import type { InventoryJsonValue } from "./inventory-response.server";

export type RatehawkBookingStatus = "confirmed" | "processing" | "failed";

export class RatehawkBookingResponseError extends Error {
  constructor(
    readonly code: "invalid_response" | "booking_failed",
    readonly supplierError: string | null = null,
  ) {
    super(`RateHawk booking response failed (${code}).`);
    this.name = "RatehawkBookingResponseError";
  }
}

function objectValue(value: InventoryJsonValue | undefined) {
  return value && !Array.isArray(value) && typeof value === "object" ? value : null;
}

function root(response: InventoryJsonValue) {
  const value = objectValue(response ?? undefined);
  if (!value || typeof value.status !== "string") {
    throw new RatehawkBookingResponseError("invalid_response");
  }
  return value;
}

export function parseRatehawkBookingFormResponse(response: InventoryJsonValue) {
  const value = root(response);
  const data = objectValue(value.data);
  if (value.status !== "ok" || !data
    || !Number.isSafeInteger(data.order_id) || Number(data.order_id) < 1
    || typeof data.partner_order_id !== "string" || !data.partner_order_id
    || !Array.isArray(data.payment_types) || data.payment_types.length < 1) {
    throw new RatehawkBookingResponseError(value.status === "error" ? "booking_failed" : "invalid_response");
  }
  return {
    orderId: Number(data.order_id),
    partnerOrderId: data.partner_order_id,
    paymentTypeCount: data.payment_types.length,
  };
}

const retryableBookingFormErrors = new Set([
  "double_booking_form",
  "duplicate_reservation",
  "timeout",
  "unknown",
]);

export function classifyRatehawkBookingFormResponse(response: InventoryJsonValue):
  | { status: "accepted"; orderId: number; partnerOrderId: string; paymentTypeCount: number }
  | { status: "retryable"; error: string }
  | { status: "failed"; error: string } {
  const value = root(response);
  if (value.status === "ok") {
    return { status: "accepted", ...parseRatehawkBookingFormResponse(response) };
  }
  const error = typeof value.error === "string" && value.error ? value.error : null;
  if (value.status !== "error" || !error) {
    throw new RatehawkBookingResponseError("invalid_response");
  }
  return retryableBookingFormErrors.has(error)
    ? { status: "retryable", error }
    : { status: "failed", error };
}

const transientErrors = new Set(["timeout", "unknown"]);

export function classifyRatehawkBookingStatusResponse(response: InventoryJsonValue): {
  status: RatehawkBookingStatus;
  partnerOrderId: string | null;
  error: string | null;
} {
  const value = root(response);
  const data = objectValue(value.data);
  const partnerOrderId = typeof data?.partner_order_id === "string" ? data.partner_order_id : null;
  const error = typeof value.error === "string" ? value.error : null;
  if (value.status === "ok") return { status: "confirmed", partnerOrderId, error: null };
  if (value.status === "processing" || (error && transientErrors.has(error))) {
    return { status: "processing", partnerOrderId, error };
  }
  if (value.status === "error" && error) return { status: "failed", partnerOrderId, error };
  throw new RatehawkBookingResponseError("invalid_response");
}

export function parseRatehawkCancellationResponse(response: InventoryJsonValue) {
  const value = root(response);
  const data = objectValue(value.data);
  const amountPayable = objectValue(data?.amount_payable);
  if (value.status !== "ok" || !data || !amountPayable
    || typeof amountPayable.amount !== "string"
    || typeof amountPayable.currency_code !== "string") {
    throw new RatehawkBookingResponseError(
      value.status === "error" ? "booking_failed" : "invalid_response",
      value.status === "error" && typeof value.error === "string" ? value.error : null,
    );
  }
  return {
    cancelled: true as const,
    amountPayable: amountPayable.amount,
    currencyCode: amountPayable.currency_code,
  };
}

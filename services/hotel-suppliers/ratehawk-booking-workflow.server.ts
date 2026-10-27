import "server-only";

import type { InventoryJsonValue } from "./inventory-response.server";
import {
  classifyRatehawkBookingFormResponse,
  classifyRatehawkBookingStatusResponse,
} from "./ratehawk-booking-response.server";
import { isRatehawkSandboxPartnerOrderId } from "./ratehawk-partner-order-id.server";

export type RatehawkBookingFormResult =
  | {
    status: "accepted";
    partnerOrderId: string;
    orderId: number;
    paymentTypeCount: number;
    attempts: number;
  }
  | { status: "failed"; error: string; attempts: number }
  | { status: "retries_exhausted"; error: string; attempts: number };

export type RatehawkBookingFinalStatus =
  | { status: "confirmed"; partnerOrderId: string | null; attempts: number }
  | { status: "failed"; partnerOrderId: string | null; attempts: number; error: string }
  | { status: "timed_out"; partnerOrderId: string; attempts: number };

export class RatehawkBookingWorkflowError extends Error {
  constructor(readonly code: "invalid_partner_order_id" | "invalid_polling_options") {
    super(`RateHawk booking workflow failed (${code}).`);
    this.name = "RatehawkBookingWorkflowError";
  }
}

/**
 * Retries only ETG's documented transient booking-form failures, always with a
 * fresh partner order ID, and never more than ten times.
 */
export async function createRatehawkBookingFormWithRetry(input: {
  createPartnerOrderId: () => string;
  requestBookingForm: (partnerOrderId: string) => Promise<InventoryJsonValue>;
  isRetryableTransportFailure?: (error: unknown) => boolean;
  maximumAttempts?: number;
}): Promise<RatehawkBookingFormResult> {
  const maximumAttempts = input.maximumAttempts ?? 10;
  if (!Number.isSafeInteger(maximumAttempts) || maximumAttempts < 1 || maximumAttempts > 10) {
    throw new RatehawkBookingWorkflowError("invalid_polling_options");
  }

  const usedIds = new Set<string>();
  let lastError = "unknown";
  for (let attempts = 1; attempts <= maximumAttempts; attempts += 1) {
    const partnerOrderId = input.createPartnerOrderId().trim();
    if (!isRatehawkSandboxPartnerOrderId(partnerOrderId) || usedIds.has(partnerOrderId)) {
      throw new RatehawkBookingWorkflowError("invalid_partner_order_id");
    }
    usedIds.add(partnerOrderId);

    let response: InventoryJsonValue;
    try {
      response = await input.requestBookingForm(partnerOrderId);
    } catch (error) {
      if (!input.isRetryableTransportFailure?.(error)) throw error;
      lastError = "transport_failure";
      if (attempts === maximumAttempts) {
        return { status: "retries_exhausted", error: lastError, attempts };
      }
      continue;
    }

    const result = classifyRatehawkBookingFormResponse(response);
    if (result.status === "accepted") {
      return {
        status: "accepted",
        partnerOrderId: result.partnerOrderId,
        orderId: result.orderId,
        paymentTypeCount: result.paymentTypeCount,
        attempts,
      };
    }
    if (result.status === "failed") {
      return { status: "failed", error: result.error, attempts };
    }
    lastError = result.error;
    if (attempts === maximumAttempts) {
      return { status: "retries_exhausted", error: lastError, attempts };
    }
  }

  return { status: "retries_exhausted", error: lastError, attempts: maximumAttempts };
}

/**
 * Polls RateHawk until it returns an explicit final status. A processing or
 * transient timeout/unknown response is never treated as a confirmed booking.
 * The last request is made at the configured deadline, as required by ETG.
 */
export async function pollRatehawkBookingUntilFinal(input: {
  partnerOrderId: string;
  checkStatus: (partnerOrderId: string) => Promise<InventoryJsonValue>;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  timeoutMs?: number;
  intervalMs?: number;
  maximumAttempts?: number;
  isRetryableTransportFailure?: (error: unknown) => boolean;
}): Promise<RatehawkBookingFinalStatus> {
  const partnerOrderId = input.partnerOrderId.trim();
  if (!isRatehawkSandboxPartnerOrderId(partnerOrderId)) {
    throw new RatehawkBookingWorkflowError("invalid_partner_order_id");
  }

  const timeoutMs = input.timeoutMs ?? 180_000;
  const intervalMs = input.intervalMs ?? 5_000;
  const maximumAttempts = input.maximumAttempts ?? 10;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 900_000
    || !Number.isSafeInteger(intervalMs) || intervalMs < 250 || intervalMs > 30_000
    || intervalMs > timeoutMs
    || !Number.isSafeInteger(maximumAttempts) || maximumAttempts < 1 || maximumAttempts > 10) {
    throw new RatehawkBookingWorkflowError("invalid_polling_options");
  }

  const sleep = input.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  }));
  const now = input.now ?? Date.now;
  const startedAt = now();
  let attempts = 0;

  while (true) {
    attempts += 1;
    try {
      const result = classifyRatehawkBookingStatusResponse(
        await input.checkStatus(partnerOrderId),
      );
      if (result.status === "confirmed") {
        return { status: "confirmed", partnerOrderId: result.partnerOrderId, attempts };
      }
      if (result.status === "failed") {
        return {
          status: "failed",
          partnerOrderId: result.partnerOrderId,
          attempts,
          error: result.error ?? "unknown",
        };
      }
    } catch (error) {
      if (!input.isRetryableTransportFailure?.(error)) throw error;
    }

    const elapsedMs = Math.max(0, now() - startedAt);
    if (attempts >= maximumAttempts || elapsedMs >= timeoutMs) {
      return { status: "timed_out", partnerOrderId, attempts };
    }
    await sleep(Math.min(intervalMs, timeoutMs - elapsedMs));
  }
}

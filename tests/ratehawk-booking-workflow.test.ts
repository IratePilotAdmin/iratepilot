import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createRatehawkBookingFormWithRetry,
  pollRatehawkBookingUntilFinal,
  RatehawkBookingWorkflowError,
} from "../services/hotel-suppliers/ratehawk-booking-workflow.server";

const partnerOrderId = "123e4567-e89b-42d3-a456-426614174000";

describe("RateHawk booking workflow", () => {
  it("retries transient booking-form errors with a fresh order ID", async () => {
    const ids = [
      "123e4567-e89b-42d3-a456-426614174001",
      "123e4567-e89b-42d3-a456-426614174002",
    ];
    const requestBookingForm = vi.fn()
      .mockResolvedValueOnce({ status: "error", error: "timeout" })
      .mockResolvedValueOnce({
        status: "ok",
        data: { order_id: 42, partner_order_id: ids[1], payment_types: [{ type: "deposit" }] },
      });

    const result = await createRatehawkBookingFormWithRetry({
      createPartnerOrderId: () => ids.shift() ?? "",
      requestBookingForm,
    });

    expect(result).toEqual({
      status: "accepted",
      partnerOrderId: "123e4567-e89b-42d3-a456-426614174002",
      orderId: 42,
      paymentTypeCount: 1,
      attempts: 2,
    });
    expect(requestBookingForm).toHaveBeenNthCalledWith(
      1,
      "123e4567-e89b-42d3-a456-426614174001",
    );
    expect(requestBookingForm).toHaveBeenNthCalledWith(
      2,
      "123e4567-e89b-42d3-a456-426614174002",
    );
  });

  it("never exceeds ETG's ten-attempt booking-form retry limit", async () => {
    let sequence = 0;
    const result = await createRatehawkBookingFormWithRetry({
      createPartnerOrderId: () => `123e4567-e89b-42d3-a456-${String(++sequence).padStart(12, "0")}`,
      requestBookingForm: vi.fn().mockResolvedValue({ status: "error", error: "unknown" }),
    });

    expect(result).toEqual({
      status: "retries_exhausted",
      error: "unknown",
      attempts: 10,
    });
  });

  it("polls processing responses until RateHawk explicitly confirms the booking", async () => {
    let currentTime = 0;
    const checkStatus = vi.fn()
      .mockResolvedValueOnce({ status: "processing", error: null, data: { partner_order_id: partnerOrderId } })
      .mockResolvedValueOnce({ status: "processing", error: "timeout", data: { partner_order_id: partnerOrderId } })
      .mockResolvedValueOnce({ status: "ok", error: null, data: { partner_order_id: partnerOrderId } });

    const result = await pollRatehawkBookingUntilFinal({
      partnerOrderId,
      checkStatus,
      timeoutMs: 10_000,
      intervalMs: 5_000,
      now: () => currentTime,
      sleep: async (milliseconds) => { currentTime += milliseconds; },
    });

    expect(result).toEqual({ status: "confirmed", partnerOrderId, attempts: 3 });
    expect(checkStatus).toHaveBeenCalledTimes(3);
  });

  it("performs a final check at the booking deadline before timing out", async () => {
    let currentTime = 0;
    const checkStatus = vi.fn().mockResolvedValue({
      status: "processing",
      error: null,
      data: { partner_order_id: partnerOrderId },
    });

    const result = await pollRatehawkBookingUntilFinal({
      partnerOrderId,
      checkStatus,
      timeoutMs: 12_000,
      intervalMs: 5_000,
      now: () => currentTime,
      sleep: async (milliseconds) => { currentTime += milliseconds; },
    });

    expect(result).toEqual({ status: "timed_out", partnerOrderId, attempts: 4 });
    expect(currentTime).toBe(12_000);
    expect(checkStatus).toHaveBeenCalledTimes(4);
  });

  it("stops immediately on a final booking error", async () => {
    const checkStatus = vi.fn().mockResolvedValue({
      status: "error",
      error: "soldout",
      data: { partner_order_id: partnerOrderId },
    });

    const result = await pollRatehawkBookingUntilFinal({ partnerOrderId, checkStatus });

    expect(result).toEqual({
      status: "failed",
      partnerOrderId,
      attempts: 1,
      error: "soldout",
    });
  });

  it("rejects invalid identifiers and unbounded polling options", async () => {
    await expect(pollRatehawkBookingUntilFinal({
      partnerOrderId: "not-a-uuid",
      checkStatus: vi.fn(),
    })).rejects.toMatchObject({
      code: "invalid_partner_order_id",
    } satisfies Partial<RatehawkBookingWorkflowError>);

    await expect(pollRatehawkBookingUntilFinal({
      partnerOrderId,
      checkStatus: vi.fn(),
      timeoutMs: 901_000,
    })).rejects.toMatchObject({
      code: "invalid_polling_options",
    } satisfies Partial<RatehawkBookingWorkflowError>);
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  flightConsumerPreviewServiceRequestInputSchema,
  flightConsumerPreviewServiceRequestReasons,
} from "../lib/flights/consumer-preview/service-request-contract";
import {
  createFlightConsumerPreviewServiceRequest,
  FlightConsumerPreviewServiceRequestError,
  hashFlightConsumerPreviewServiceRequestIdempotencyKey,
  listFlightConsumerPreviewAdminServiceRequests,
  listFlightConsumerPreviewServiceRequests,
} from "../lib/flights/consumer-preview/service-requests.server";

const orderId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
const customerId = "33333333-3333-4333-8333-333333333333";
const idempotencyKey = "44444444-4444-4444-8444-444444444444";
const timestamp = "2026-08-25T18:00:00.000Z";

const requestRow = {
  service_request_id: requestId,
  order_id: orderId,
  request_type: "cancel",
  reason_code: "plans_changed",
  request_status: "requested",
  created_at: timestamp,
  updated_at: timestamp,
};

describe("Flight Consumer Preview support request contract", () => {
  it("accepts only enumerated type/reason pairs and no freeform fields", () => {
    for (const [requestType, reasons] of Object.entries(flightConsumerPreviewServiceRequestReasons)) {
      for (const { code } of reasons) {
        expect(flightConsumerPreviewServiceRequestInputSchema.safeParse({
          requestType,
          reasonCode: code,
        }).success).toBe(true);
      }
    }
    for (const input of [
      { requestType: "cancel", reasonCode: "fictional_name_correction" },
      { requestType: "change", reasonCode: "traveler wrote a freeform explanation" },
      { requestType: "cancel", reasonCode: "plans_changed", travelerName: "Not allowed" },
      { requestType: "live_cancel", reasonCode: "plans_changed" },
    ]) expect(flightConsumerPreviewServiceRequestInputSchema.safeParse(input).success).toBe(false);
  });

  it("hashes the browser idempotency UUID under a versioned domain", () => {
    const digest = hashFlightConsumerPreviewServiceRequestIdempotencyKey(idempotencyKey);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).toBe(hashFlightConsumerPreviewServiceRequestIdempotencyKey(idempotencyKey));
    expect(digest).not.toContain(idempotencyKey);
    expect(() => hashFlightConsumerPreviewServiceRequestIdempotencyKey("not-a-uuid"))
      .toThrow(FlightConsumerPreviewServiceRequestError);
  });

  it("creates through the strict RPC and accepts only an exact bounded result", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ decision: "created", ...requestRow }],
      error: null,
    });
    await expect(createFlightConsumerPreviewServiceRequest({ rpc }, {
      orderId,
      requestType: "cancel",
      reasonCode: "plans_changed",
      idempotencyKey,
    })).resolves.toEqual({
      decision: "created",
      request: {
        id: requestId,
        orderId,
        requestType: "cancel",
        reasonCode: "plans_changed",
        status: "requested",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    expect(rpc).toHaveBeenCalledWith("create_flight_consumer_preview_service_request_v1", {
      p_order_id: orderId,
      p_request_type: "cancel",
      p_reason_code: "plans_changed",
      p_idempotency_key_sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });

    rpc.mockResolvedValueOnce({ data: [{ decision: "created", ...requestRow, provider_order_ref: "leak" }], error: null });
    await expect(createFlightConsumerPreviewServiceRequest({ rpc }, {
      orderId,
      requestType: "cancel",
      reasonCode: "plans_changed",
      idempotencyKey,
    })).rejects.toThrow(FlightConsumerPreviewServiceRequestError);
  });

  it("lists only sanitized owner/admin RPC projections and maps conflict SQLSTATEs", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [requestRow], error: null })
      .mockResolvedValueOnce({
        data: [{
          ...requestRow,
          customer_id: customerId,
          confirmation_code: "IRP-TEST-0001",
          order_status: "ticketed",
        }],
        error: null,
      });
    await expect(listFlightConsumerPreviewServiceRequests({ rpc }, { orderId }))
      .resolves.toEqual([expect.objectContaining({ id: requestId, orderId })]);
    await expect(listFlightConsumerPreviewAdminServiceRequests({ rpc }, { limit: 25, status: "requested" }))
      .resolves.toEqual([expect.objectContaining({
        id: requestId,
        customerId,
        confirmationCode: "IRP-TEST-0001",
      })]);
    expect(rpc).toHaveBeenNthCalledWith(1, "list_flight_consumer_preview_service_requests_v1", {
      p_order_id: orderId,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "list_flight_consumer_admin_service_requests_v1", {
      p_limit: 25,
      p_status: "requested",
    });

    const conflictRpc = vi.fn().mockResolvedValue({ data: null, error: { code: "23514" } });
    await expect(createFlightConsumerPreviewServiceRequest({ rpc: conflictRpc }, {
      orderId,
      requestType: "cancel",
      reasonCode: "plans_changed",
      idempotencyKey,
    })).rejects.toMatchObject({ kind: "conflict" });
  });
});

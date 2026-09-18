import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc }),
}));

import { deliverNativePmsEventOnce } from "./native-delivery";

const env = {
  IRP_PMS_SYNC_ENABLED: "true",
  IRP_PMS_CONNECTION_ID: "red_roof_ridgeland_test",
  IRP_PMS_OTA_PROPERTY_ID: "11111111-1111-4111-8111-111111111111",
  IRP_PMS_TENANT_ID: "22222222-2222-4222-8222-222222222222",
  IRP_PMS_PROPERTY_ID: "33333333-3333-4333-8333-333333333333",
  IRP_PMS_DESTINATION_URL: "https://example.supabase.co/rest/v1/rpc/irp_pms_ota_gateway",
  IRP_PMS_DESTINATION_PUBLISHABLE_KEY: "sb_publishable_abcdefghijklmnop",
  IRP_PMS_SIGNING_SECRET: "a-test-signing-secret-that-is-long-enough",
} satisfies Record<string, string>;

const event = {
  eventId: "44444444-4444-4444-8444-444444444444",
  sourceVersion: 1,
  booking: {
    id: "55555555-5555-4555-8555-555555555555",
    property_id: env.IRP_PMS_OTA_PROPERTY_ID,
  },
};

const row = {
  event_id: event.eventId,
  booking_id: event.booking.id,
  property_id: env.IRP_PMS_OTA_PROPERTY_ID,
  connection_id: env.IRP_PMS_CONNECTION_ID,
  tenant_id: env.IRP_PMS_TENANT_ID,
  pms_property_id: env.IRP_PMS_PROPERTY_ID,
  source_version: 1,
  lease_token: "66666666-6666-4666-8666-666666666666",
  event_payload: event,
};

describe("native iRatePilot PMS delivery", () => {
  beforeEach(() => rpc.mockReset());

  it("stays dormant unless the explicit kill switch is enabled", async () => {
    await expect(deliverNativePmsEventOnce({ env: {} })).resolves.toEqual({ outcome: "disabled" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("claims only the configured Red Roof scope and acknowledges a signed delivery", async () => {
    rpc
      .mockResolvedValueOnce({ data: [row], error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.p_connection).toBe(env.IRP_PMS_CONNECTION_ID);
      expect(body.p_signature).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.parse(body.p_raw_body)).toEqual(event);
      return Response.json({
        status: 200,
        body: { outcome: "reservation-staged", eventId: event.eventId, sourceVersion: 1 },
      });
    });

    await expect(deliverNativePmsEventOnce({ env, fetcher, now: 1_800_000_000_000 }))
      .resolves.toEqual({
        outcome: "acknowledged",
        eventId: event.eventId,
        receiverOutcome: "reservation-staged",
      });
    expect(rpc.mock.calls[0]).toEqual(["irp_pms_claim_configured_event", {
      p_connections: [{
        connection_id: env.IRP_PMS_CONNECTION_ID,
        property_id: env.IRP_PMS_OTA_PROPERTY_ID,
        tenant_id: env.IRP_PMS_TENANT_ID,
        pms_property_id: env.IRP_PMS_PROPERTY_ID,
      }],
    }]);
    expect(rpc.mock.calls[1][0]).toBe("irp_pms_finish_event");
    expect(rpc.mock.calls[1][1].p_outcome).toBe("acknowledged");
  });

  it("places a mismatched claimed event into review without sending it", async () => {
    rpc
      .mockResolvedValueOnce({ data: [{ ...row, property_id: "77777777-7777-4777-8777-777777777777" }], error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const fetcher = vi.fn();

    await expect(deliverNativePmsEventOnce({ env, fetcher }))
      .resolves.toEqual({ outcome: "review-required", eventId: event.eventId, receiverOutcome: null });
    expect(fetcher).not.toHaveBeenCalled();
    expect(rpc.mock.calls[1][1]).toMatchObject({
      p_outcome: "review-required",
      p_code: "connection_scope_mismatch",
    });
  });
});

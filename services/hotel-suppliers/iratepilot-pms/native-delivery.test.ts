import { beforeEach, describe, expect, it, vi } from "vitest";
import { encryptPmsCredentials } from "@/lib/integrations/pms-credentials";

const rpc = vi.fn();
const afterTask = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc }),
}));
vi.mock("next/server", () => ({ after: (task: () => void | Promise<void>) => afterTask(task) }));

import { deliverNativePmsEventOnce, drainNativePmsEvents, scheduleNativePmsOutboxDelivery } from "./native-delivery";

const env = {
  IRP_PMS_SYNC_ENABLED: "true",
  IRP_PMS_DESTINATION_URL: "https://example.supabase.co/rest/v1/rpc/irp_pms_ota_gateway",
  IRP_PMS_DESTINATION_PUBLISHABLE_KEY: "sb_publishable_abcdefghijklmnop",
} satisfies Record<string, string>;
const key = Buffer.alloc(32, 7).toString("base64");
const secret = "a-test-signing-secret-that-is-long-enough";
const scopes = [
  {
    connection_id: "red_roof_ridgeland_test",
    property_id: "11111111-1111-4111-8111-111111111111",
    tenant_id: "22222222-2222-4222-8222-222222222222",
    pms_property_id: "33333333-3333-4333-8333-333333333333",
  },
];

function storedConnection(scope = scopes[0], signingSecret = secret) {
  process.env.PMS_CREDENTIAL_ENCRYPTION_KEY = key;
  const encrypted = encryptPmsCredentials({ IRATEPILOT_PMS_ARI_SIGNING_SECRET: signingSecret });
  return {
    ...scope,
    secret_ciphertext: encrypted.ciphertext,
    secret_initialization_vector: encrypted.initializationVector,
    secret_authentication_tag: encrypted.authenticationTag,
    secret_key_version: encrypted.keyVersion,
  };
}

const event = {
  eventId: "44444444-4444-4444-8444-444444444444",
  sourceVersion: 1,
  booking: {
    id: "55555555-5555-4555-8555-555555555555",
    confirmation_code: "RP-TEST-1001",
    customer_id: "77777777-7777-4777-8777-777777777777",
    property_id: scopes[0].property_id,
    room_id: "88888888-8888-4888-8888-888888888888",
    check_in: "2026-10-01",
    check_out: "2026-10-03",
    guests: 2,
    subtotal: "200.00",
    taxes: "20.00",
    fees: "5.00",
    total: "225.00",
    status: "confirmed",
    guest_name: "Test Guest",
  },
};

const row = {
  event_id: event.eventId,
  booking_id: event.booking.id,
  property_id: scopes[0].property_id,
  connection_id: scopes[0].connection_id,
  tenant_id: scopes[0].tenant_id,
  pms_property_id: scopes[0].pms_property_id,
  source_version: 1,
  lease_token: "66666666-6666-4666-8666-666666666666",
  event_payload: event,
};

describe("native iRatePilot PMS delivery", () => {
  beforeEach(() => { rpc.mockReset(); afterTask.mockReset(); process.env.PMS_CREDENTIAL_ENCRYPTION_KEY = key; });

  it("uses the PMS gateway booking contract and sends only the guest display name", () => {
    expect(Object.keys(event).sort()).toEqual(["booking", "eventId", "sourceVersion"]);
    expect(Object.keys(event.booking).sort()).toEqual([
      "check_in", "check_out", "confirmation_code", "customer_id", "fees", "guest_name", "guests", "id",
      "property_id", "room_id", "status", "subtotal", "taxes", "total",
    ].sort());
    expect(Number(event.booking.subtotal) + Number(event.booking.taxes) + Number(event.booking.fees))
      .toBe(Number(event.booking.total));
    expect(event.booking.guest_name).toBe("Test Guest");
  });

  it("schedules immediate post-response delivery while keeping the durable cron fallback", async () => {
    const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
    Object.assign(process.env, env);
    rpc.mockResolvedValueOnce({ data: [], error: null });
    try {
      scheduleNativePmsOutboxDelivery();
      expect(afterTask).toHaveBeenCalledOnce();
      await afterTask.mock.calls[0][0]();
      expect(rpc).toHaveBeenCalledWith("irp_pms_list_configured_delivery_connections");
      expect(rpc).not.toHaveBeenCalledWith("irp_pms_claim_configured_event", expect.anything());
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("stays dormant unless the explicit kill switch is enabled", async () => {
    await expect(deliverNativePmsEventOnce({ env: {} })).resolves.toEqual({ outcome: "disabled" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("claims every configured scope and signs a delivery with that property's stored secret", async () => {
    rpc
      .mockResolvedValueOnce({ data: [storedConnection()], error: null })
      .mockResolvedValueOnce({ data: [row], error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.p_connection).toBe(scopes[0].connection_id);
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
    expect(rpc.mock.calls[0][0]).toBe("irp_pms_list_configured_delivery_connections");
    expect(rpc.mock.calls[1]).toEqual(["irp_pms_claim_configured_event", { p_connections: scopes }]);
    expect(rpc.mock.calls[2][0]).toBe("irp_pms_finish_event");
    expect(rpc.mock.calls[2][1].p_outcome).toBe("acknowledged");
  });

  it("cancels an oversized acknowledgement stream and retries without buffering the response", async () => {
    rpc
      .mockResolvedValueOnce({ data: [storedConnection()], error: null })
      .mockResolvedValueOnce({ data: [row], error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(64 * 1024)); },
      cancel() { cancelled = true; },
    });
    const fetcher = vi.fn(async () => new Response(body, { status: 200 }));

    await expect(deliverNativePmsEventOnce({ env, fetcher }))
      .resolves.toEqual({ outcome: "retry", eventId: event.eventId, receiverOutcome: null });
    expect(cancelled).toBe(true);
    expect(rpc.mock.calls[2][1]).toMatchObject({ p_outcome: "retry", p_code: "invalid_acknowledgement" });
  });

  it("retries malformed, non-JSON, and non-object acknowledgements without treating them as delivered", async () => {
    const replies = [
      new Response(JSON.stringify({ status: 200, body: { outcome: "reservation-staged", eventId: event.eventId, sourceVersion: 1 } }), {
        status: 200, headers: { "content-type": "text/html" },
      }),
      Response.json(null),
      Response.json([]),
      Response.json({ status: 200, body: null }),
      Response.json({ status: 200, body: [] }),
      new Response(Uint8Array.from([0xff, 0xfe]), { status: 200, headers: { "content-type": "application/json" } }),
    ];

    for (const response of replies) {
      rpc
        .mockResolvedValueOnce({ data: [storedConnection()], error: null })
        .mockResolvedValueOnce({ data: [row], error: null })
        .mockResolvedValueOnce({ data: true, error: null });
      const fetcher = vi.fn(async () => response);
      await expect(deliverNativePmsEventOnce({ env, fetcher }))
        .resolves.toMatchObject({ outcome: "retry", eventId: event.eventId, receiverOutcome: null });
      expect(rpc.mock.calls.at(-1)?.[1]).toMatchObject({ p_outcome: "retry", p_code: "invalid_acknowledgement" });
      rpc.mockReset();
    }
  });

  it("places a mismatched claimed event into review without sending it", async () => {
    rpc
      .mockResolvedValueOnce({ data: [storedConnection()], error: null })
      .mockResolvedValueOnce({ data: [{ ...row, property_id: "77777777-7777-4777-8777-777777777777" }], error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const fetcher = vi.fn();

    await expect(deliverNativePmsEventOnce({ env, fetcher }))
      .resolves.toEqual({ outcome: "review-required", eventId: event.eventId, receiverOutcome: null });
    expect(fetcher).not.toHaveBeenCalled();
    expect(rpc.mock.calls[2][1]).toMatchObject({
      p_outcome: "review-required",
      p_code: "connection_scope_mismatch",
    });
  });

  it("routes a claimed event to the exact matching property's signing key", async () => {
    const secondScope = {
      connection_id: "boutique_second_property",
      property_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      tenant_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      pms_property_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    };
    const secondEvent = {
      eventId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      sourceVersion: 2,
      booking: { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", property_id: secondScope.property_id },
    };
    const secondRow = {
      ...row,
      ...{
        event_id: secondEvent.eventId,
        booking_id: secondEvent.booking.id,
        property_id: secondScope.property_id,
        connection_id: secondScope.connection_id,
        tenant_id: secondScope.tenant_id,
        pms_property_id: secondScope.pms_property_id,
        source_version: 2,
        event_payload: secondEvent,
      },
    };
    rpc
      .mockResolvedValueOnce({ data: [storedConnection(), storedConnection(secondScope, "another-test-signing-secret-long-enough")], error: null })
      .mockResolvedValueOnce({ data: [secondRow], error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.p_connection).toBe(secondScope.connection_id);
      const expected = await import("node:crypto").then(({ createHmac }) => createHmac("sha256", "another-test-signing-secret-long-enough")
        .update(`${body.p_timestamp}.${secondScope.connection_id}.`).update(body.p_raw_body).digest("hex"));
      expect(body.p_signature).toBe(expected);
      return Response.json({ status: 200, body: { outcome: "reservation-staged", eventId: secondEvent.eventId, sourceVersion: 2 } });
    });

    await expect(deliverNativePmsEventOnce({ env, fetcher })).resolves.toMatchObject({ outcome: "acknowledged", eventId: secondEvent.eventId });
    expect(rpc.mock.calls[1][1].p_connections).toHaveLength(2);
  });

  it("moves events with unavailable per-property credentials to review without sending", async () => {
    rpc
      .mockResolvedValueOnce({ data: [{ ...storedConnection(), secret_ciphertext: null, secret_initialization_vector: null, secret_authentication_tag: null, secret_key_version: null }], error: null })
      .mockResolvedValueOnce({ data: [row], error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const fetcher = vi.fn();

    await expect(deliverNativePmsEventOnce({ env, fetcher })).resolves.toMatchObject({ outcome: "review-required" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(rpc.mock.calls[2][1]).toMatchObject({ p_outcome: "review-required", p_code: "credential_unavailable" });
  });

  it("continues draining another property after moving an event to review", async () => {
    const secondScope = {
      connection_id: "second_hotel",
      property_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      tenant_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      pms_property_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    };
    const secondEvent = {
      eventId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      sourceVersion: 2,
      booking: { id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", property_id: secondScope.property_id },
    };
    rpc
      .mockResolvedValueOnce({ data: [{ ...storedConnection(), secret_ciphertext: null, secret_initialization_vector: null, secret_authentication_tag: null, secret_key_version: null }], error: null })
      .mockResolvedValueOnce({ data: [row], error: null })
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: [storedConnection(secondScope)], error: null })
      .mockResolvedValueOnce({ data: [{
        ...row,
        event_id: secondEvent.eventId,
        booking_id: secondEvent.booking.id,
        property_id: secondScope.property_id,
        connection_id: secondScope.connection_id,
        tenant_id: secondScope.tenant_id,
        pms_property_id: secondScope.pms_property_id,
        source_version: 2,
        event_payload: secondEvent,
      }], error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const fetcher = vi.fn(async () => Response.json({ status: 200, body: {
      outcome: "reservation-staged", eventId: secondEvent.eventId, sourceVersion: 2,
    } }));
    const previous = Object.fromEntries(Object.keys(env).map((name) => [name, process.env[name]]));
    Object.assign(process.env, env);
    vi.stubGlobal("fetch", fetcher);
    try {
      await expect(drainNativePmsEvents(2)).resolves.toMatchObject([
        { outcome: "review-required", eventId: event.eventId },
        { outcome: "acknowledged", eventId: secondEvent.eventId },
      ]);
      expect(fetcher).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
      for (const [name, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it("fails closed when the active connection count exceeds the claim RPC bound", async () => {
    rpc.mockResolvedValueOnce({ data: Array.from({ length: 101 }, () => storedConnection()), error: null });
    await expect(deliverNativePmsEventOnce({ env })).rejects.toThrow("Native PMS delivery connections were invalid.");
    expect(rpc).toHaveBeenCalledOnce();
  });
});

import { describe, expect, it } from "vitest";
import { nativePmsReservationSignature, runNativePmsReservationDelivery } from "@/lib/native-pms-reservation-delivery";

const eventId = "11111111-1111-4111-8111-111111111111";
const leaseToken = "22222222-2222-4222-8222-222222222222";
const bookingId = "33333333-3333-4333-8333-333333333333";
const secret = "reservation-sandbox-signing-secret-at-least-32-bytes";
const connectionId = "red-roof-sandbox";
const propertyId = "44444444-4444-4444-8444-444444444444";
const tenantId = "66666666-6666-4666-8666-666666666666";
const pmsPropertyId = "77777777-7777-4777-8777-777777777777";
const payload = {
  eventId,
  sourceVersion: 1,
  booking: {
    id: bookingId, confirmation_code: "RP-TEST-1", property_id: propertyId,
    room_id: "55555555-5555-4555-8555-555555555555", check_in: "2026-10-01", check_out: "2026-10-03",
    guests: 2, subtotal: "200.00", taxes: "20.00", fees: "5.00", total: "225.00", status: "confirmed",
  },
};
const registry = [{
  connection_id: connectionId, property_id: propertyId, tenant_id: tenantId, pms_property_id: pmsPropertyId,
  secret_ciphertext: Buffer.from("encrypted-secret").toString("base64"),
  secret_initialization_vector: Buffer.alloc(12, 1).toString("base64"),
  secret_authentication_tag: Buffer.alloc(16, 2).toString("base64"), secret_key_version: 1,
}];
const claimed = {
  event_id: eventId, connection_id: connectionId, property_id: propertyId, tenant_id: tenantId,
  pms_property_id: pmsPropertyId, lease_token: leaseToken, attempts: 1, source_version: 1, event_payload: payload,
};
const config = {
  supabaseUrl: "https://project.supabase.co", serviceRoleKey: "s".repeat(40),
  endpoint: "https://pms-project.supabase.co/rest/v1/rpc/irp_pms_ota_gateway",
  publishableKey: "sb_publishable_abcdefghijklmnop",
  credentialEncryptionKey: Buffer.alloc(32, 7).toString("base64"),
  decryptCredentials: () => ({ IRATEPILOT_PMS_ARI_SIGNING_SECRET: secret }),
};
const rpcResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function databaseFetch(claim: unknown = [claimed], finish?: (args: Record<string, unknown>) => void): typeof fetch {
  return async (input, init) => {
    const url = String(input);
    if (url.endsWith("/irp_pms_list_configured_delivery_connections")) return rpcResponse(registry);
    if (url.endsWith("/irp_pms_claim_configured_event")) {
      expect(JSON.parse(String(init?.body)).p_connections).toEqual([{
        connection_id: connectionId, property_id: propertyId, tenant_id: tenantId, pms_property_id: pmsPropertyId,
      }]);
      return rpcResponse(claim);
    }
    if (url.endsWith("/irp_pms_finish_event")) {
      finish?.(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return rpcResponse(true);
    }
    throw new Error("Unexpected worker request.");
  };
}

describe("native PMS reservation delivery worker", () => {
  it("uses the encrypted connection registry, signs the exact event body, and records a valid receipt", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = databaseFetch([claimed], (args) => {
      expect(args).toMatchObject({ p_event: eventId, p_lease: leaseToken, p_outcome: "acknowledged", p_code: "pms_reservation-staged" });
    });
    const routed: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.startsWith("https://project.supabase.co/")) return fetcher(input, init);
      expect(url).toBe("https://pms-project.supabase.co/rest/v1/rpc/irp_pms_ota_gateway");
      const headers = new Headers(init?.headers);
      expect(headers.get("apikey")).toBe(config.publishableKey);
      const wrapper = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const rawBody = String(wrapper.p_raw_body);
      const timestamp = "1790812800";
      expect(wrapper.p_connection).toBe(connectionId);
      expect(wrapper.p_timestamp).toBe(timestamp);
      expect(wrapper.p_signature).toBe(nativePmsReservationSignature(secret, timestamp, connectionId, rawBody));
      return rpcResponse({ status: 200, body: { outcome: "reservation-staged", eventId, sourceVersion: 1 } });
    };

    const result = await runNativePmsReservationDelivery(config, routed, 1790812800000);
    expect(result).toEqual({ outcome: "delivered", eventId, code: "pms_reservation-staged" });
    expect(calls).toHaveLength(4);
  });

  it.each([
    [503, "retry", "http_503"], [429, "retry", "http_429"],
    [422, "review", "http_422"], [409, "review", "http_409"],
  ] as const)("classifies PMS HTTP %i as %s", async (status, expected, code) => {
    let finishArgs: Record<string, unknown> | null = null;
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/irp_pms_list_configured_delivery_connections")) return rpcResponse(registry);
      if (url.endsWith("/irp_pms_claim_configured_event")) return rpcResponse([claimed]);
      if (url.endsWith("/irp_pms_finish_event")) {
        finishArgs = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return rpcResponse(true);
      }
      return new Response(JSON.stringify({ error: "test" }), { status });
    };
    const result = await runNativePmsReservationDelivery(config, fetcher, 1790812800000);
    expect(result).toMatchObject({ outcome: expected, code });
    expect(finishArgs).toMatchObject({ p_outcome: expected === "retry" ? "retry" : "review-required", p_code: code });
  });

  it("does not acknowledge a successful HTTP response for a different event or version", async () => {
    let finishArgs: Record<string, unknown> | null = null;
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/irp_pms_list_configured_delivery_connections")) return rpcResponse(registry);
      if (url.endsWith("/irp_pms_claim_configured_event")) return rpcResponse([claimed]);
      if (url.endsWith("/irp_pms_finish_event")) {
        finishArgs = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return rpcResponse(true);
      }
      return rpcResponse({ status: 200, body: { outcome: "reservation-staged", eventId: "99999999-9999-4999-8999-999999999999", sourceVersion: 7 } });
    };
    const result = await runNativePmsReservationDelivery(config, fetcher);
    expect(result).toMatchObject({ outcome: "review", code: "invalid_pms_ack" });
    expect(finishArgs).toMatchObject({ p_outcome: "review-required", p_code: "invalid_pms_ack" });
  });

  it("does not claim events if the stored property secret cannot be decrypted", async () => {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      calls.push(String(input));
      return rpcResponse(registry);
    };
    const result = await runNativePmsReservationDelivery({ ...config, decryptCredentials: () => ({}) }, fetcher);
    expect(result).toMatchObject({ outcome: "idle", code: "no_valid_connection_credentials" });
    expect(calls).toHaveLength(1);
  });

  it("leaves a durable event retryable when the PMS request fails", async () => {
    let finishArgs: Record<string, unknown> | null = null;
    const fetcher: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/irp_pms_list_configured_delivery_connections")) return rpcResponse(registry);
      if (url.endsWith("/irp_pms_claim_configured_event")) return rpcResponse([claimed]);
      if (url.endsWith("/irp_pms_finish_event")) {
        finishArgs = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return rpcResponse(true);
      }
      throw new Error("network timeout");
    };
    const result = await runNativePmsReservationDelivery(config, fetcher);
    expect(result).toMatchObject({ outcome: "retry", code: "transport_failure" });
    expect(finishArgs).toMatchObject({ p_outcome: "retry", p_code: "transport_failure" });
  });

  it("moves a claimed event to review when its property scope differs from the configured connection", async () => {
    let finishArgs: Record<string, unknown> | null = null;
    const mismatched = [{ ...claimed, pms_property_id: "88888888-8888-4888-8888-888888888888" }];
    const fetcher = databaseFetch(mismatched, (args) => { finishArgs = args; });
    const result = await runNativePmsReservationDelivery(config, fetcher);
    expect(result).toMatchObject({ outcome: "review", code: "connection_scope_mismatch" });
    expect(finishArgs).toMatchObject({ p_outcome: "review-required", p_code: "connection_scope_mismatch" });
  });

  it("does not use unapproved gateway URLs", async () => {
    const fetcher: typeof fetch = async () => { throw new Error("must not send"); };
    await expect(runNativePmsReservationDelivery({ ...config, endpoint: "https://example.com/collect" }, fetcher))
      .rejects.toThrow("gateway URL is invalid");
  });
});

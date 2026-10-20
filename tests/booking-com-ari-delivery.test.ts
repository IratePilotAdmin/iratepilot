import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createHash } from "node:crypto";
import { assessBookingComAriScope, runBookingComAriDelivery } from "@/lib/booking-com-ari-delivery";

const xml = `<?xml version="1.0" encoding="UTF-8"?><OTA_HotelAvailNotifRQ><AvailStatusMessages><AvailStatusMessage BookingLimit="2"><StatusApplicationControl Start="2026-10-01" End="2026-10-01" InvTypeCode="NDQ2"/></AvailStatusMessage></AvailStatusMessages></OTA_HotelAvailNotifRQ>`;
const job = {
  jobId: "11111111-1111-4111-8111-111111111111",
  connectionId: "booking-ridgeland-test",
  propertyId: "22222222-2222-4222-8222-222222222222",
  machineAccountId: "33333333-3333-4333-8333-333333333333",
  providerPropertyId: "partner-property-1",
  kind: "availability" as const,
  endpoint: "https://supply-xml.booking.com/hotels/ota/OTA_HotelAvailNotif",
  requestXml: xml,
  requestSha256: createHash("sha256").update(xml).digest("hex"),
  attempt: 1,
  leaseToken: "44444444-4444-4444-8444-444444444444",
};

const connection = {
  connection_id: job.connectionId,
  property_id: job.propertyId,
  machine_account_id: job.machineAccountId,
  provider_property_id: job.providerPropertyId,
  provider: "booking_com",
  environment: "test",
  enabled: true,
  partner_approved: true,
  ari_endpoint_approved: true,
  certification_complete: true,
};

function dependencies(overrides: { claim?: unknown[]; status?: number; body?: string; tokenError?: Error; scope?: "ready" | "paused" | "stale" | "unavailable" } = {}) {
  const finish = vi.fn(async () => undefined);
  const fetcher = vi.fn(async () => new Response(overrides.body ?? `<OTA_HotelAvailNotifRS><Success/></OTA_HotelAvailNotifRS>`, { status: overrides.status ?? 200 }));
  const getToken = vi.fn(async () => {
    if (overrides.tokenError) throw overrides.tokenError;
    return "a.very-long-test-token.with-enough-length";
  });
  const validateScope = vi.fn(async () => overrides.scope ?? "ready" as const);
  return {
    finish, fetcher, getToken, validateScope,
    options: { store: { claim: async () => (overrides.claim ?? [job]) as never[], validateScope, finish }, fetcher: fetcher as typeof fetch, getToken },
  };
}

describe("Booking.com ARI delivery worker", () => {
  it("refuses a queued job after its property mapping changes or approval is withdrawn", async () => {
    expect(assessBookingComAriScope(job, connection)).toBe("ready");
    expect(assessBookingComAriScope(job, { ...connection, provider_property_id: "other-hotel" })).toBe("stale");
    expect(assessBookingComAriScope(job, { ...connection, property_id: "55555555-5555-4555-8555-555555555555" })).toBe("stale");
    expect(assessBookingComAriScope(job, { ...connection, machine_account_id: "66666666-6666-4666-8666-666666666666" })).toBe("stale");
    expect(assessBookingComAriScope(job, { ...connection, certification_complete: false })).toBe("paused");
    expect(assessBookingComAriScope(job, null)).toBe("stale");
  });

  it.each([
    ["stale", "review", "booking_com_ari_scope_stale"],
    ["paused", "retry", "booking_com_ari_scope_paused"],
    ["unavailable", "retry", "booking_com_ari_scope_unavailable"],
  ] as const)("holds a %s scope without loading credentials or calling the provider", async (scope, outcome, code) => {
    const deps = dependencies({ scope });
    await runBookingComAriDelivery(deps.options);
    expect(deps.validateScope).toHaveBeenCalledWith(job);
    expect(deps.getToken).not.toHaveBeenCalled();
    expect(deps.fetcher).not.toHaveBeenCalled();
    expect(deps.finish).toHaveBeenCalledWith(job.jobId, job.leaseToken, outcome, null, { code });
  });

  it("sends only the claimed test job and durably records provider success", async () => {
    const deps = dependencies();
    const result = await runBookingComAriDelivery(deps.options);
    expect(result).toEqual({ claimed: 1, sent: 1, retry: 0, review: 0, leaseLost: 0 });
    expect(deps.fetcher).toHaveBeenCalledTimes(1);
    const [endpoint, init] = deps.fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(endpoint).toBe(job.endpoint);
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer a.very-long-test-token.with-enough-length");
    expect(init.body).toBe(xml);
    expect(deps.finish).toHaveBeenCalledWith(job.jobId, job.leaseToken, "sent", 200, {
      outcome: "accepted", errorCount: 0, warningCount: 0,
    });
  });

  it("retries transient provider failures and sends no guest or credential data to the stored result", async () => {
    const deps = dependencies({ status: 503, body: "upstream unavailable" });
    const result = await runBookingComAriDelivery(deps.options);
    expect(result).toMatchObject({ retry: 1, sent: 0 });
    expect(deps.finish).toHaveBeenCalledWith(job.jobId, job.leaseToken, "retry", 503, {
      outcome: "retryable", errorCount: 0, warningCount: 0,
    });
  });

  it("moves malformed claims or payload hashes to review without contacting Booking.com", async () => {
    const tampered = { ...job, requestSha256: "a".repeat(64) };
    const deps = dependencies({ claim: [tampered] });
    const result = await runBookingComAriDelivery(deps.options);
    expect(result.review).toBe(1);
    expect(deps.fetcher).not.toHaveBeenCalled();
    expect(deps.getToken).not.toHaveBeenCalled();
    expect(deps.finish).toHaveBeenCalledWith(job.jobId, job.leaseToken, "review", null, {
      code: "booking_com_ari_payload_integrity_failed",
    });
  });

  it("moves credential rejection to review and retries temporary auth failures", async () => {
    const rejected = dependencies({ tokenError: new Error("booking_com_auth_rejected") });
    expect(await runBookingComAriDelivery(rejected.options)).toMatchObject({ review: 1 });
    expect(rejected.fetcher).not.toHaveBeenCalled();
    expect(rejected.finish).toHaveBeenCalledWith(job.jobId, job.leaseToken, "review", null, { code: "provider_auth_or_dispatch_rejected" });

    const temporary = dependencies({ tokenError: new Error("booking_com_auth_temporarily_unavailable") });
    expect(await runBookingComAriDelivery(temporary.options)).toMatchObject({ retry: 1 });
    expect(temporary.finish).toHaveBeenCalledWith(job.jobId, job.leaseToken, "retry", null, { code: "booking_com_auth_temporarily_unavailable" });
  });

  it("does not dispatch an acknowledgement without an OTA success element", async () => {
    const deps = dependencies({ body: `<OTA_HotelAvailNotifRS/>` });
    expect(await runBookingComAriDelivery(deps.options)).toMatchObject({ review: 1, sent: 0 });
    expect(deps.finish).toHaveBeenCalledWith(job.jobId, job.leaseToken, "review", 200, {
      outcome: "unknown", errorCount: 0, warningCount: 0,
    });
  });

  it("stores only counts when provider errors contain guest information", async () => {
    const privateText = "Guest Jane Example, booking RP-1234";
    const deps = dependencies({ status: 400, body: `<OTA_HotelAvailNotifRS><Errors><Error Code="${privateText}" ShortText="${privateText}"/></Errors><Warnings><Warning Code="${privateText}" ShortText="${privateText}"/></Warnings></OTA_HotelAvailNotifRS>` });
    expect(await runBookingComAriDelivery(deps.options)).toMatchObject({ review: 1, sent: 0 });
    expect(deps.finish).toHaveBeenCalledWith(job.jobId, job.leaseToken, "review", 400, {
      outcome: "rejected", errorCount: 1, warningCount: 1,
    });
    expect(JSON.stringify(deps.finish.mock.calls)).not.toContain(privateText);
  });
});

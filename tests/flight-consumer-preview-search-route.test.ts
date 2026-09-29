import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  recover: vi.fn(),
  requireUser: vi.fn(),
  sameOrigin: vi.fn(),
  idempotencyKey: vi.fn(),
  readJson: vi.fn(),
  from: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/flights/consumer-preview/search-workflow.server", () => ({
  executeFlightConsumerPreviewSearch: mocks.execute,
  recoverFlightConsumerPreviewSearch: mocks.recover,
}));
vi.mock("@/lib/flights/consumer-preview/http.server", () => ({
  validateSameOriginMutation: mocks.sameOrigin,
  readPreviewIdempotencyKey: mocks.idempotencyKey,
  readPreviewJson: mocks.readJson,
  privateNoStoreJson(body: unknown, status = 200) {
    return Response.json(body, {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  },
}));
vi.mock("@/lib/flights/consumer-preview/request-schemas", () => ({
  flightConsumerPreviewSearchUiRequestSchema: {
    safeParse(value: unknown) {
      const record = value as typeof body;
      if (
        record?.origin !== "ORD"
        || record.destination !== "MIA"
        || record.departureDate !== "2026-10-10"
        || record.returnDate !== "2026-10-14"
        || record.cabin !== "economy"
        || record.travelerCount !== 1
      ) return { success: false };
      return {
        success: true,
        data: {
          origin: record.origin,
          destination: record.destination,
          departureDate: record.departureDate,
          returnDate: record.returnDate,
          cabin: record.cabin,
          passengers: { adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0 },
        },
      };
    },
  },
  validateFlightConsumerPreviewTravelWindow: () => true,
}));
vi.mock("@/lib/flights/consumer-preview/schemas", () => ({
  flightConsumerPreviewSearchRequestSchema: {
    safeParse(value: unknown) {
      const candidate = value as Record<string, unknown>;
      return candidate.origin === "ORD" && candidate.destination === "MIA"
        ? { success: true, data: value }
        : { success: false };
    },
  },
}));

import { POST as search } from "../app/api/flights/preview/search/route";
import { POST as recover } from "../app/api/flights/preview/search/[searchId]/recover/route";

const customerId = "11111111-1111-4111-8111-111111111111";
const searchId = "22222222-2222-4222-8222-222222222222";
const idempotencyKey = "33333333-3333-4333-8333-333333333333";
const body = {
  origin: "ORD",
  destination: "MIA",
  departureDate: "2026-10-10",
  returnDate: "2026-10-14",
  cabin: "economy",
  travelerCount: 1,
};

function request(path = "/api/flights/preview/search") {
  return new Request(`https://preview.example.test${path}`, { method: "POST" });
}

describe("Flight Consumer Preview search routes", () => {
  beforeEach(() => {
    mocks.execute.mockReset().mockResolvedValue({ searchId, status: "complete", replay: false });
    mocks.recover.mockReset().mockResolvedValue({ searchId, status: "searching", replay: true });
    mocks.maybeSingle.mockReset().mockResolvedValue({
      data: {
        status: "searching",
        origin_iata: "ORD",
        destination_iata: "MIA",
        departure_date: "2026-10-10",
        return_date: "2026-10-14",
        cabin: "economy",
        adult_count: 1,
        child_count: 0,
        infant_in_seat_count: 0,
        infant_on_lap_count: 0,
        expires_at: "2026-10-10T00:00:00.000Z",
      },
      error: null,
    });
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: mocks.maybeSingle,
    };
    mocks.from.mockReset().mockReturnValue(query);
    mocks.requireUser.mockReset().mockResolvedValue({
      user: { id: customerId },
      supabase: { rpc: vi.fn(), from: mocks.from },
    });
    mocks.sameOrigin.mockReset().mockReturnValue(true);
    mocks.idempotencyKey.mockReset().mockReturnValue(idempotencyKey);
    mocks.readJson.mockReset().mockResolvedValue({ ok: true, value: body });
  });

  it("passes only the authenticated owner, UUID key, and canonical request to orchestration", async () => {
    const response = await search(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({
      data: { searchId, status: "complete", nextAction: "results" },
    });
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({
      customerId,
      idempotencyKey,
      search: {
        origin: "ORD",
        destination: "MIA",
        departureDate: "2026-10-10",
        returnDate: "2026-10-14",
        cabin: "economy",
        passengers: { adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0 },
      },
    }));
  });

  it("returns explicit poll and new-search decisions from durable states", async () => {
    mocks.execute.mockResolvedValueOnce({ searchId, status: "searching", replay: true });
    const pending = await search(request());
    expect(pending.status).toBe(202);
    expect(pending.headers.get("retry-after")).toBe("4");
    await expect(pending.json()).resolves.toEqual({
      data: { searchId, status: "searching", nextAction: "poll" },
    });

    mocks.execute.mockResolvedValueOnce({ searchId, status: "failed", replay: true });
    const failed = await search(request());
    expect(failed.status).toBe(200);
    await expect(failed.json()).resolves.toEqual({
      data: { searchId, status: "failed", nextAction: "new_search" },
    });
  });

  it("fails closed before orchestration for origin, authentication, key, or body failures", async () => {
    mocks.sameOrigin.mockReturnValueOnce(false);
    expect((await search(request())).status).toBe(403);
    mocks.requireUser.mockResolvedValueOnce({ error: "Sign in required.", status: 401 });
    expect((await search(request())).status).toBe(401);
    mocks.idempotencyKey.mockReturnValueOnce(null);
    expect((await search(request())).status).toBe(400);
    mocks.readJson.mockResolvedValueOnce({ ok: true, value: { ...body, origin: "bad" } });
    expect((await search(request())).status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("returns only a generic unavailable result when orchestration throws", async () => {
    mocks.execute.mockRejectedValueOnce(new Error("duffel token raw response"));
    const response = await search(request());
    expect(response.status).toBe(503);
    const responseBody = await response.json();
    expect(responseBody).toEqual({ error: "The Duffel test search could not be completed." });
    expect(JSON.stringify(responseBody)).not.toMatch(/token|raw response/i);
  });

  it("owner-binds recovery, returns 202 while pending, and rejects invalid search identities", async () => {
    const response = await recover(
      request(`/api/flights/preview/search/${searchId}/recover`),
      { params: Promise.resolve({ searchId }) },
    );
    expect(response.status).toBe(202);
    expect(response.headers.get("retry-after")).toBe("4");
    expect(mocks.recover).toHaveBeenCalledWith({
      customerId,
      searchId,
      search: {
        origin: "ORD",
        destination: "MIA",
        departureDate: "2026-10-10",
        returnDate: "2026-10-14",
        cabin: "economy",
        passengers: { adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0 },
      },
      observedStatus: "searching",
      observedExpiresAt: "2026-10-10T00:00:00.000Z",
    });
    await expect(response.json()).resolves.toEqual({
      data: { searchId, status: "searching", nextAction: "poll" },
    });

    const invalid = await recover(request(), { params: Promise.resolve({ searchId: "bad" }) });
    expect(invalid.status).toBe(404);
    expect(mocks.recover).toHaveBeenCalledTimes(1);
  });

  it("does not expose whether an owner-scoped durable search is missing", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const response = await recover(
      request(`/api/flights/preview/search/${searchId}/recover`),
      { params: Promise.resolve({ searchId }) },
    );
    expect(response.status).toBe(404);
    expect(mocks.recover).not.toHaveBeenCalled();
  });
});

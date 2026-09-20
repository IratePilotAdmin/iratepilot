import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import {
  canonicalFlightConsumerPreviewSearchRequest,
  durableFlightConsumerPreviewSearchAttempt,
  requestFlightConsumerPreviewSearch,
  type FlightConsumerPreviewClientSearchRequest,
} from "../components/flights/consumer-preview/search-recovery";
import { requestFlightConsumerPreviewSearchRecovery } from "../components/flights/consumer-preview/search-progress";

const request = Object.freeze({
  origin: "ORD",
  destination: "MIA",
  departureDate: "2026-10-10",
  returnDate: "2026-10-14",
  cabin: "economy",
  travelerCount: 1,
}) satisfies FlightConsumerPreviewClientSearchRequest;
const requestSha256 = "a".repeat(64);
const changedRequestSha256 = "b".repeat(64);
const idempotencyKey = "11111111-1111-4111-8111-111111111111";
const changedIdempotencyKey = "22222222-2222-4222-8222-222222222222";
const searchId = "33333333-3333-4333-8333-333333333333";
type Post = (url: string, init: RequestInit) => Promise<Response>;

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

function searchResponse(status: "searching" | "complete" | "failed", nextAction: "poll" | "results" | "new_search", httpStatus = 200) {
  return Response.json({ data: { searchId, status, nextAction } }, { status: httpStatus });
}

describe("Flight Consumer Preview durable search recovery", () => {
  it("canonicalizes the client request without storing itinerary fields in the durable record", async () => {
    expect(JSON.parse(canonicalFlightConsumerPreviewSearchRequest(request))).toEqual(request);
    const storage = memoryStorage();
    await durableFlightConsumerPreviewSearchAttempt({
      request,
      storage,
      createUuid: () => idempotencyKey,
      digestRequest: async () => requestSha256,
    });
    const retained = [...storage.values.values()][0]!;
    expect(retained).toContain(idempotencyKey);
    expect(retained).toContain(requestSha256);
    expect(retained).not.toMatch(/ORD|MIA|2026-10-10|economy/);
  });

  it("reuses the exact UUID after an indeterminate result and across a remount", async () => {
    const storage = memoryStorage();
    const createUuid = vi.fn(() => idempotencyKey);
    const firstPost = vi.fn<Post>(async () => { throw new Error("provider secret"); });
    await expect(requestFlightConsumerPreviewSearch({
      request,
      storage,
      createUuid,
      digestRequest: async () => requestSha256,
      post: firstPost,
    })).resolves.toEqual({ decision: "unavailable" });

    const secondPost = vi.fn<Post>(async () => searchResponse("searching", "poll", 202));
    await expect(requestFlightConsumerPreviewSearch({
      request,
      storage,
      createUuid,
      digestRequest: async () => requestSha256,
      post: secondPost,
    })).resolves.toMatchObject({ decision: "observed", searchId, nextAction: "poll" });
    expect(createUuid).toHaveBeenCalledTimes(1);
    expect(firstPost).toHaveBeenCalledTimes(1);
    expect(secondPost).toHaveBeenCalledTimes(1);
    const [, init] = secondPost.mock.calls[0]!;
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe(idempotencyKey);
  });

  it("uses a different namespace and UUID when the canonical request changes", async () => {
    const storage = memoryStorage();
    const createUuid = vi.fn()
      .mockReturnValueOnce(idempotencyKey)
      .mockReturnValueOnce(changedIdempotencyKey);
    await durableFlightConsumerPreviewSearchAttempt({
      request,
      storage,
      createUuid,
      digestRequest: async () => requestSha256,
    });
    await durableFlightConsumerPreviewSearchAttempt({
      request: { ...request, destination: "LAX" },
      storage,
      createUuid,
      digestRequest: async () => changedRequestSha256,
    });
    expect(storage.values.size).toBe(2);
    expect(createUuid).toHaveBeenCalledTimes(2);
  });

  it("fails before fetch when local storage cannot retain and reread the UUID", async () => {
    const post = vi.fn();
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => { throw new Error("storage disabled"); }),
      removeItem: vi.fn(),
    };
    await expect(requestFlightConsumerPreviewSearch({
      request,
      storage,
      createUuid: () => idempotencyKey,
      digestRequest: async () => requestSha256,
      post,
    })).rejects.toThrow("storage disabled");
    expect(post).not.toHaveBeenCalled();
  });

  it("fails before fetch when a matching durable record is corrupted", async () => {
    const storage = memoryStorage({
      [`iratepilot:flight-preview:search:v1:${requestSha256}`]: "{not-json",
    });
    const post = vi.fn<Post>();
    await expect(requestFlightConsumerPreviewSearch({
      request,
      storage,
      createUuid: () => idempotencyKey,
      digestRequest: async () => requestSha256,
      post,
    })).rejects.toThrow("identity is unavailable");
    expect(post).not.toHaveBeenCalled();
  });

  it("retains unknown outcomes, clears only terminal observations, and trusts no stored search ID", async () => {
    const storage = memoryStorage();
    await requestFlightConsumerPreviewSearch({
      request,
      storage,
      createUuid: () => idempotencyKey,
      digestRequest: async () => requestSha256,
      post: async () => searchResponse("searching", "poll", 202),
    });
    expect(storage.values.size).toBe(1);

    const unavailablePost = vi.fn<Post>(async () => Response.json({ error: "unavailable" }, { status: 503 }));
    await expect(requestFlightConsumerPreviewSearch({
      request,
      storage,
      digestRequest: async () => requestSha256,
      post: unavailablePost,
    })).resolves.toEqual({ decision: "unavailable" });
    expect(unavailablePost.mock.calls[0]![0]).toBe("/api/flights/preview/search");
    expect(storage.values.size).toBe(1);

    await expect(requestFlightConsumerPreviewSearch({
      request,
      storage,
      digestRequest: async () => requestSha256,
      post: async () => searchResponse("complete", "results"),
    })).resolves.toMatchObject({ decision: "observed", nextAction: "results" });
    expect(storage.values.size).toBe(0);
  });

  it("checks only the owner-scoped recovery route and rejects malformed or unauthenticated observations", async () => {
    const post = vi.fn<Post>(async () => searchResponse("complete", "results"));
    await expect(requestFlightConsumerPreviewSearchRecovery({ searchId, post }))
      .resolves.toMatchObject({ decision: "observed", status: "complete" });
    expect(post.mock.calls[0]![0]).toBe(`/api/flights/preview/search/${searchId}/recover`);
    await expect(requestFlightConsumerPreviewSearchRecovery({
      searchId,
      post: async () => Response.json({ data: { searchId: changedIdempotencyKey, status: "complete", nextAction: "results" } }),
    })).resolves.toEqual({ decision: "unavailable" });
    await expect(requestFlightConsumerPreviewSearchRecovery({
      searchId,
      post: async () => Response.json({ error: "sign in" }, { status: 401 }),
    })).resolves.toEqual({ decision: "unauthenticated" });
  });

  it("keeps route budgets above exact Duffel timeouts and wires bounded recovery UI", () => {
    const searchRoute = readFileSync(resolve(process.cwd(), "app/api/flights/preview/search/route.ts"), "utf8");
    const recoveryRoute = readFileSync(resolve(process.cwd(), "app/api/flights/preview/search/[searchId]/recover/route.ts"), "utf8");
    const repriceRoute = readFileSync(resolve(process.cwd(), "app/api/flights/preview/offers/[offerId]/accept/route.ts"), "utf8");
    const workflow = readFileSync(resolve(process.cwd(), "lib/flights/consumer-preview/search-workflow.server.ts"), "utf8");
    const progress = readFileSync(resolve(process.cwd(), "components/flights/consumer-preview/search-progress.tsx"), "utf8");
    expect(searchRoute).toContain("export const maxDuration = 120");
    expect(recoveryRoute).toContain("export const maxDuration = 120");
    expect(repriceRoute).toContain("export const maxDuration = 60");
    expect(workflow).toContain("get_flight_consumer_search_recovery_v1");
    expect(workflow).toContain('recovery.attempt_state === "prepared"');
    expect(workflow).toContain("complete_flight_provider_request_attempt");
    expect(workflow).toContain("STALE_DISPATCH_GRACE_MS");
    expect(workflow).not.toMatch(/attempt_state\s*===\s*["']dispatching["'][\s\S]{0,200}transport\.execute/);
    expect(progress).toContain("attempts.current < 15");
    expect(progress).toContain("controller.abort()");
  });
});

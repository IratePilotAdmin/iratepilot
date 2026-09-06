import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { submitHotelManagerInterest } from "../lib/hotels/manager-interest-submission";
import {
  HOTEL_MANAGER_INTEREST_RATE_LIMIT_ERROR,
  HOTEL_MANAGER_INTEREST_SUCCESS,
  HOTEL_MANAGER_INTEREST_UNCONFIRMED,
} from "../lib/hotels/intake-response-message";

const interest = {
  hotelName: "Example Hotel", contactName: "Example Manager", role: "general_manager",
  businessEmail: "manager@example.test", businessPhone: "+1 312 555 0100",
  city: "Chicago", region: "Illinois", country: "United States", websiteUrl: "",
  preferredContact: "email", notes: "Please contact me about onboarding.", faxNumber: "",
};
const receipt = { status: "received", intakeMode: "manager_interest" };
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("hotel manager interest submission", () => {
  it("sends the captured values once and confirms the existing receipt contract", async () => {
    fetchMock.mockResolvedValue(Response.json(receipt, { status: 201 }));

    expect(await submitHotelManagerInterest(interest)).toEqual({ received: true, message: HOTEL_MANAGER_INTEREST_SUCCESS });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/hotel-intake/interest", expect.objectContaining({
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(interest),
    }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { status: 201, payload: { status: "received", intakeMode: "full_application" } },
    { status: 202, payload: receipt },
  ])("does not confirm an unrelated successful response (%j)", async ({ status, payload }) => {
    fetchMock.mockResolvedValue(Response.json(payload, { status }));

    expect(await submitHotelManagerInterest(interest)).toEqual({ received: false, message: HOTEL_MANAGER_INTEREST_UNCONFIRMED });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("recovers from malformed receipt JSON", async () => {
    fetchMock.mockResolvedValue(new Response("{invalid", { status: 201 }));

    expect(await submitHotelManagerInterest(interest)).toEqual({ received: false, message: HOTEL_MANAGER_INTEREST_UNCONFIRMED });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps a service failure separate from receipt confirmation", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "Hotel manager interest intake is temporarily unavailable." }, { status: 503 }));

    expect(await submitHotelManagerInterest(interest)).toEqual({
      received: false, message: "Hotel manager interest intake is temporarily unavailable.",
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves readable throttling feedback for a non-JSON response", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Rate limited</html>", { status: 429 }));

    expect(await submitHotelManagerInterest(interest)).toEqual({ received: false, message: HOTEL_MANAGER_INTEREST_RATE_LIMIT_ERROR });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves receipt unconfirmed on network failure without retrying automatically", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await submitHotelManagerInterest(interest)).toEqual({ received: false, message: HOTEL_MANAGER_INTEREST_UNCONFIRMED });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([false, true])("aborts after 30 seconds when headers or body stall (headers received: %s)", async (headersReceived) => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url, init) => {
      signal = init?.signal ?? undefined;
      if (!headersReceived) {
        return new Promise<Response>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        });
      }
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(JSON.stringify(receipt)));
          // Keep EOF pending to exercise the native response.json() body read.
          signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true });
        },
      });
      return Promise.resolve(new Response(body, { status: 201 }));
    });

    let completed = false;
    const pending = submitHotelManagerInterest(interest).then((value) => {
      completed = true;
      return value;
    });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(completed).toBe(false);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    expect(await pending).toEqual({ received: false, message: HOTEL_MANAGER_INTEREST_UNCONFIRMED });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

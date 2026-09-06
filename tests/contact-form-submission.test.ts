import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTACT_SUBMISSION_UNCONFIRMED, submitContactMessage } from "../lib/contact/submission";

const contact = { name: "Example Manager", email: "manager@example.test", message: "Please help with my hotel inquiry." };
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

describe("public contact submission", () => {
  it("sends the captured form values and confirms the endpoint's receipt", async () => {
    fetchMock.mockResolvedValue(Response.json({ status: "received", message: "Untrusted override" }, { status: 201 }));

    expect(await submitContactMessage(contact)).toEqual({
      received: true, message: "Message received. Our team will follow up.",
    });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/contact", expect.objectContaining({
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(contact),
    }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([null, {}, [], { status: "pending" }, { message: "Received" }])(
    "does not clear form data based on an unrelated successful payload (%j)", async (payload) => {
      fetchMock.mockResolvedValue(Response.json(payload, { status: 201 }));

      expect(await submitContactMessage(contact)).toEqual({ received: false, message: CONTACT_SUBMISSION_UNCONFIRMED });
    },
  );

  it.each([200, 202])("does not confirm an unexpected HTTP %s receipt", async (status) => {
    fetchMock.mockResolvedValue(Response.json({ status: "received" }, { status }));

    expect((await submitContactMessage(contact)).received).toBe(false);
  });

  it.each([
    { status: 201, body: "{invalid", contentType: "application/json" },
    { status: 200, body: "<html>Gateway response</html>", contentType: "text/html" },
    { status: 204, body: null, contentType: "application/json" },
  ])("recovers from a malformed or empty response ($status)", async ({ status, body, contentType }) => {
    fetchMock.mockResolvedValue(new Response(body, { status, headers: { "content-type": contentType } }));

    expect(await submitContactMessage(contact)).toEqual({ received: false, message: CONTACT_SUBMISSION_UNCONFIRMED });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves a bounded, top-level application error", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "  Please use the hotel manager intake form.\n " }, { status: 400 }));

    expect(await submitContactMessage(contact)).toEqual({
      received: false, message: "Please use the hotel manager intake form.",
    });
  });

  it.each([{ error: { code: "gateway_error" } }, { error: "x".repeat(301) }, { error: "   " }])(
    "returns plain fallback copy for malformed errors (%j)", async (payload) => {
      fetchMock.mockResolvedValue(Response.json(payload, { status: 503 }));

      expect(await submitContactMessage(contact)).toEqual({
        received: false, message: "Unable to send your message. Please try again.",
      });
    },
  );

  it("handles non-JSON throttling without exposing a gateway response", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Rate limit</html>", { status: 429 }));

    expect(await submitContactMessage(contact)).toEqual({
      received: false, message: "Too many messages were sent. Please wait a few minutes and try again.",
    });
  });

  it("recovers from a network failure without claiming receipt or retrying automatically", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await submitContactMessage(contact)).toEqual({ received: false, message: CONTACT_SUBMISSION_UNCONFIRMED });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("aborts a stalled request after 30 seconds and leaves receipt unconfirmed", async () => {
    let requestSignal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      requestSignal = init?.signal ?? undefined;
      requestSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));

    const result = submitContactMessage(contact);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(requestSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(requestSignal?.aborted).toBe(true);
    expect(await result).toEqual({ received: false, message: CONTACT_SUBMISSION_UNCONFIRMED });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the timeout active while a successful response body is stalled", async () => {
    let requestSignal: AbortSignal | undefined;
    let response: Response | undefined;
    fetchMock.mockImplementation(async (_url, init) => {
      requestSignal = init?.signal ?? undefined;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"status":"received"}'));
          // Native response.json() still awaits EOF; abort must terminate that read.
          requestSignal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true });
        },
      });
      response = new Response(body, { status: 201, headers: { "content-type": "application/json" } });
      return response;
    });

    let completed = false;
    const result = submitContactMessage(contact).then((value) => {
      completed = true;
      return value;
    });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(response?.bodyUsed).toBe(true);
    expect(completed).toBe(false);
    expect(requestSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(requestSignal?.aborted).toBe(true);
    expect(await result).toEqual({ received: false, message: CONTACT_SUBMISSION_UNCONFIRMED });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

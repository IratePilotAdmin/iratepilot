import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SUPPORT_STATUS_UNCONFIRMED, updateSupportCaseStatus, type SupportStatus } from "../lib/support/status-update";

const caseId = "12345678-1234-4234-8234-123456789abc";
const receipt = { data: { id: caseId, status: "resolved" } };
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

describe("support status update confirmation", () => {
  it.each<[SupportStatus, string]>([
    ["new", "Support case reopened."],
    ["in_progress", "Support case marked in progress."],
    ["resolved", "Support case resolved."],
  ])("confirms the matching %s receipt using fixed copy", async (status, message) => {
    fetchMock.mockResolvedValue(Response.json({ data: { id: caseId, status }, message: { unexpected: "object" } }));

    expect(await updateSupportCaseStatus(caseId, status)).toEqual({ confirmed: true, message });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`/api/admin/support/${caseId}`, expect.objectContaining({
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    null, [], {}, { message: { unexpected: "object" } }, { data: [] },
    { data: { id: "different-case", status: "resolved" } },
    { data: { id: caseId, status: "new" }, message: "Support case resolved." },
  ])("leaves unrelated successful responses unconfirmed (%j)", async (payload) => {
    fetchMock.mockResolvedValue(Response.json(payload));

    expect(await updateSupportCaseStatus(caseId, "resolved")).toEqual({ confirmed: false, message: SUPPORT_STATUS_UNCONFIRMED });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([201, 202])("does not confirm an unexpected HTTP %s", async (status) => {
    fetchMock.mockResolvedValue(Response.json(receipt, { status }));

    expect(await updateSupportCaseStatus(caseId, "resolved")).toEqual({ confirmed: false, message: SUPPORT_STATUS_UNCONFIRMED });
  });

  it.each([
    { status: 200, body: "{invalid" },
    { status: 200, body: "<html>Sign in</html>" },
    { status: 204, body: null },
  ])("recovers from malformed or missing JSON (%j)", async ({ status, body }) => {
    fetchMock.mockResolvedValue(new Response(body, { status }));

    expect(await updateSupportCaseStatus(caseId, "resolved")).toEqual({ confirmed: false, message: SUPPORT_STATUS_UNCONFIRMED });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([401, 403, 404, 503])("preserves a bounded application error for HTTP %s", async (status) => {
    fetchMock.mockResolvedValue(Response.json({ error: "  Support case\nnot available. " }, { status }));

    expect(await updateSupportCaseStatus(caseId, "resolved")).toEqual({ confirmed: false, message: "Support case not available." });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([{ error: { message: "nested" } }, { error: "x".repeat(301) }])("returns readable fallback copy for malformed errors (%j)", async (payload) => {
    fetchMock.mockResolvedValue(Response.json(payload, { status: 503 }));

    expect(await updateSupportCaseStatus(caseId, "resolved")).toEqual({
      confirmed: false, message: "Support case could not be updated. Please refresh cases and try again.",
    });
  });

  it("leaves a disconnected update unconfirmed without an automatic retry", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    expect(await updateSupportCaseStatus(caseId, "resolved")).toEqual({ confirmed: false, message: SUPPORT_STATUS_UNCONFIRMED });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([false, true])("ends a stalled update after 30 seconds (headers received: %s)", async (headersReceived) => {
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
          signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true });
        },
      });
      return Promise.resolve(new Response(body));
    });

    let completed = false;
    const pending = updateSupportCaseStatus(caseId, "resolved").then((result) => {
      completed = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(completed).toBe(false);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal?.aborted).toBe(true);
    expect(await pending).toEqual({ confirmed: false, message: SUPPORT_STATUS_UNCONFIRMED });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

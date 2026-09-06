import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadSupportInbox, SUPPORT_LOAD_ERROR, SUPPORT_LOAD_TIMEOUT } from "../lib/support/load-inbox";

const filters = { status: "all", queue: "all", q: "", offset: 0 } as const;
const item = { id: "case-1", name: "Example Manager", email: "manager@example.test", message: "Please contact me.", status: "new", created_at: "2026-09-05T12:00:00.000Z" };
const inbox = () => ({ data: [{ ...item }], summary: { total: 1, new: 1, inProgress: 0, resolved: 0 }, limit: 200, offset: 0, totalMatches: 1, hasMore: false });
const fetchMock = vi.fn<typeof fetch>();
let parent: AbortController;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  parent = new AbortController();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("support inbox loading", () => {
  it("loads a valid page with the requested filters and clears its resources", async () => {
    const body = { ...inbox(), offset: 200, totalMatches: 201 };
    const removeListener = vi.spyOn(parent.signal, "removeEventListener");
    fetchMock.mockResolvedValue(Response.json(body));

    expect(await loadSupportInbox({ status: "new", queue: "hotel_manager_interest", q: "A & B", offset: 200 }, parent.signal)).toEqual(body);
    const [input] = fetchMock.mock.calls[0];
    const url = new URL(String(input), "https://iratepilot.test");
    expect(Object.fromEntries(url.searchParams)).toEqual({ status: "new", queue: "hotel_manager_interest", q: "A & B", offset: "200" });
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("allows the empty out-of-range page used to recover from queue changes", async () => {
    const body = { ...inbox(), data: [], offset: 200, totalMatches: 0 };
    fetchMock.mockResolvedValue(Response.json(body));
    expect(await loadSupportInbox({ ...filters, offset: 200 }, parent.signal)).toEqual(body);
  });

  it("does not demand cross-query summary totals match during concurrent updates", async () => {
    const body = { ...inbox(), summary: { total: 1, new: 2, inProgress: 0, resolved: 0 } };
    fetchMock.mockResolvedValue(Response.json(body));
    expect(await loadSupportInbox(filters, parent.signal)).toEqual(body);
  });

  it("preserves valid Unicode names used in hotel reply links", async () => {
    const body = { ...inbox(), data: [{ ...item, name: "Manager \u{1f3e8}", message: "[HOTEL_MANAGER_INTEREST_V1] Hotel" }] };
    fetchMock.mockResolvedValue(Response.json(body));
    expect(await loadSupportInbox(filters, parent.signal)).toEqual(body);
  });

  it.each([
    null, [], { ...item, name: {} }, { ...item, email: null }, { ...item, message: null },
    { ...item, status: "unknown" }, { ...item, status: null }, { ...item, created_at: "not-a-date" },
    { ...item, created_at: null }, { ...item, id: "" },
    { ...item, name: "\ud800", message: "[HOTEL_MANAGER_INTEREST_V1] Hotel" },
    { ...item, name: "\udc00", message: "[HOTEL_MANAGER_INTEREST_V1] Hotel" },
  ])("rejects an unsafe case before it reaches React (%j)", async (row) => {
    fetchMock.mockResolvedValue(Response.json({ ...inbox(), data: [row] }));
    await expect(loadSupportInbox(filters, parent.signal)).rejects.toThrow(SUPPORT_LOAD_ERROR);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([null, {}, { total: {}, new: 1, inProgress: 0, resolved: 0 }, { total: -1, new: 1, inProgress: 0, resolved: 0 }])(
    "rejects invalid summary values (%j)", async (summary) => {
      fetchMock.mockResolvedValue(Response.json({ ...inbox(), summary }));
      await expect(loadSupportInbox(filters, parent.signal)).rejects.toThrow(SUPPORT_LOAD_ERROR);
    },
  );

  it.each([
    { label: "wrong offset", change: { offset: 200 } },
    { label: "wrong limit", change: { limit: 201 } },
    { label: "negative count", change: { totalMatches: -1 } },
    { label: "invalid next-page flag", change: { hasMore: "yes" } },
    { label: "duplicate cases", change: { data: [item, item] } },
    { label: "too many cases", change: { data: Array.from({ length: 201 }, (_, id) => ({ ...item, id: String(id) })) } },
  ])("rejects $label", async ({ change }) => {
    fetchMock.mockResolvedValue(Response.json({ ...inbox(), ...change }));
    await expect(loadSupportInbox(filters, parent.signal)).rejects.toThrow(SUPPORT_LOAD_ERROR);
  });

  it.each(["{invalid", "<html>Sign in</html>"])("handles non-JSON responses (%s)", async (body) => {
    fetchMock.mockResolvedValue(new Response(body));
    await expect(loadSupportInbox(filters, parent.signal)).rejects.toThrow(SUPPORT_LOAD_ERROR);
  });

  it("does not accept an unrelated successful HTTP status", async () => {
    fetchMock.mockResolvedValue(Response.json(inbox(), { status: 202 }));
    await expect(loadSupportInbox(filters, parent.signal)).rejects.toThrow(SUPPORT_LOAD_ERROR);
  });

  it.each([{ error: "Authentication required." }, { error: { nested: "unsafe" } }, { error: "x".repeat(301) }])(
    "bounds application error messages (%j)", async (body) => {
      fetchMock.mockResolvedValue(Response.json(body, { status: 401 }));
      await expect(loadSupportInbox(filters, parent.signal)).rejects.toThrow(body.error === "Authentication required." ? body.error : SUPPORT_LOAD_ERROR);
    },
  );

  it("cleans up after a network failure without retrying", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(loadSupportInbox(filters, parent.signal)).rejects.toThrow(SUPPORT_LOAD_ERROR);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start a request after its owning load was cancelled", async () => {
    parent.abort();
    await expect(loadSupportInbox(filters, parent.signal)).rejects.toThrow(SUPPORT_LOAD_ERROR);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["parent", "headers", "body"])("cleans up cancellation or timeout while waiting for %s", async (mode) => {
    let signal: AbortSignal | undefined;
    const removeListener = vi.spyOn(parent.signal, "removeEventListener");
    fetchMock.mockImplementation((_input, init) => {
      signal = init?.signal ?? undefined;
      if (mode !== "body") {
        return new Promise<Response>((_resolve, reject) => signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
      }
      return Promise.resolve(new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(JSON.stringify(inbox())));
          signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true });
        },
      })));
    });
    const pending = loadSupportInbox(filters, parent.signal);
    const assertion = expect(pending).rejects.toThrow(mode === "parent" ? SUPPORT_LOAD_ERROR : SUPPORT_LOAD_TIMEOUT);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(signal?.aborted).toBe(false);
    if (mode === "parent") parent.abort();
    else await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(signal?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(removeListener).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });
});

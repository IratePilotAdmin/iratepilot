import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createAdminClient, requireRole } = vi.hoisted(() => ({ createAdminClient: vi.fn(), requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole }));

import { PATCH } from "../app/api/admin/support/[id]/route";

const caseId = "12345678-1234-4234-8234-123456789abc";
const unconfirmed = "This status change could not be confirmed. Refresh cases to check its current status before trying again.";
const validBody = JSON.stringify({ status: "in_progress" });
const context = (id = caseId) => ({ params: Promise.resolve({ id }) });
const request = (body: string | null = validBody, headers: Record<string, string> = {}) => new Request(
  `https://iratepilot.test/api/admin/support/${caseId}`,
  { method: "PATCH", headers: { "content-type": "application/json", ...headers }, body },
);

function database(payload: unknown, status = 200) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => payload instanceof Response ? payload : Response.json(payload, { status }));
  createAdminClient.mockReturnValue(createClient("https://database.example.test", "local-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  }));
  return fetch;
}

beforeEach(() => {
  vi.resetAllMocks();
  requireRole.mockResolvedValue({ user: { id: "admin-user" } });
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("admin support status request boundary", () => {
  it.each([401, 403])("returns authorization failure %s before consuming a valid body", async (status) => {
    requireRole.mockResolvedValue({ error: "Access denied.", status });
    const input = request();
    const response = await PATCH(input, context());

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "Access denied." });
    expect(requireRole).toHaveBeenCalledExactlyOnceWith(["admin"]);
    expect(input.bodyUsed).toBe(false);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("does not let malformed input bypass authorization ordering", async () => {
    requireRole.mockResolvedValue({ error: "Authentication required.", status: 401 });
    const input = request("{invalid");
    const response = await PATCH(input, context("not-a-uuid"));

    expect(response.status).toBe(401);
    expect(input.bodyUsed).toBe(false);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects an unauthorized request without waiting for its open body stream", async () => {
    requireRole.mockResolvedValue({ error: "Authentication required.", status: 401 });
    let source!: ReadableStreamDefaultController<Uint8Array>;
    const input = new Request(`https://iratepilot.test/api/admin/support/${caseId}`, {
      method: "PATCH", body: new ReadableStream<Uint8Array>({ start(controller) { source = controller; } }),
      duplex: "half", headers: { "content-type": "application/json" },
    } as RequestInit);
    const pending = PATCH(input, context());
    try {
      const response = await Promise.race([
        pending,
        new Promise<null>((resolve) => setImmediate(() => resolve(null))),
      ]);
      expect(response?.status).toBe(401);
      expect(input.bodyUsed).toBe(false);
      expect(createAdminClient).not.toHaveBeenCalled();
    } finally {
      source.close();
      await pending;
    }
  });

  it("handles authorization service failure before consuming input", async () => {
    requireRole.mockRejectedValue(new Error("Synthetic authorization failure"));
    const input = request();
    const response = await PATCH(input, context());

    expect(response.status).toBe(503);
    expect(input.bodyUsed).toBe(false);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects an invalid case ID before reading the authorized body", async () => {
    const input = request();
    const response = await PATCH(input, context("not-a-uuid"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid support case ID." });
    expect(requireRole).toHaveBeenCalledExactlyOnceWith(["admin"]);
    expect(input.bodyUsed).toBe(false);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each(["{invalid", "", null])("returns a JSON 400 for invalid JSON (%j)", async (body) => {
    const response = await PATCH(request(body), context());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "The support status update must be valid JSON." });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each([{}, { status: "approved" }, { status: null }])("rejects an unsupported status (%j)", async (body) => {
    const response = await PATCH(request(JSON.stringify(body)), context());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Choose a valid support status." });
    expect(requireRole).toHaveBeenCalledExactlyOnceWith(["admin"]);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared length before consuming the body", async () => {
    const input = request(validBody, { "content-length": "1025" });
    const response = await PATCH(input, context());

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "The support status update is too large." });
    expect(input.bodyUsed).toBe(false);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each<Record<string, string>>([{}, { "content-length": "1" }])("limits actual bytes without trusting the declared length (%j)", async (headers) => {
    const response = await PATCH(request(validBody.padEnd(1025, " "), headers), context());

    expect(response.status).toBe(413);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("cancels an oversized open stream without waiting for its end", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(validBody.padEnd(1024, " ")));
        controller.enqueue(new TextEncoder().encode(" "));
      },
      cancel,
    });
    const response = await PATCH(new Request(`https://iratepilot.test/api/admin/support/${caseId}`, {
      method: "PATCH", body: stream, duplex: "half",
    } as RequestInit), context());

    expect(response.status).toBe(413);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    ["new", "Support case reopened."],
    ["in_progress", "Support case marked in progress."],
    ["resolved", "Support case resolved."],
  ])("updates only the requested case status to %s at the byte limit", async (status, message) => {
    const fetch = database([{ id: caseId, status }]);
    const body = JSON.stringify({ status, name: "Ignored replacement" }).padEnd(1024, " ");
    const response = await PATCH(request(body, { "content-length": "1024" }), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { id: caseId, status }, message });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [input, init] = fetch.mock.calls[0];
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    expect(url.pathname).toBe("/rest/v1/contact_messages");
    expect(url.searchParams.get("id")).toBe(`eq.${caseId}`);
    expect(url.searchParams.get("select")).toBe("id,status");
    expect(init?.method).toBe("PATCH");
    expect(new Headers(init?.headers).get("prefer")).toContain("return=representation");
    expect(JSON.parse(String(init?.body))).toEqual({ status });
  });

  it("returns 404 when the requested case no longer exists", async () => {
    const fetch = database([]);
    const response = await PATCH(request(), context());

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Support case not found." });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("keeps database failures separate from invalid requests", async () => {
    database({ code: "XX000", message: "Synthetic database failure" }, 500);
    const response = await PATCH(request(), context());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: unconfirmed });
  });

  it.each([
    { label: "null data", payload: null },
    { label: "an object instead of a list", payload: { id: caseId, status: "in_progress" } },
    { label: "a null row", payload: [null] },
    { label: "an array row", payload: [[]] },
    { label: "a missing ID", payload: [{ status: "in_progress" }] },
    { label: "a missing status", payload: [{ id: caseId }] },
    { label: "a different case", payload: [{ id: "12345678-1234-4234-8234-123456789def", status: "in_progress" }] },
    { label: "a different status", payload: [{ id: caseId, status: "new" }] },
    { label: "multiple rows", payload: [{ id: caseId, status: "in_progress" }, { id: caseId, status: "in_progress" }] },
  ])("leaves the update unconfirmed for $label without retrying", async ({ payload }) => {
    const fetch = database(payload);
    const response = await PATCH(request(), context());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: unconfirmed });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([200, 204])("does not claim a case is missing after a blank HTTP %s update response", async (status) => {
    const fetch = database(new Response(null, { status }));
    const response = await PATCH(request(), context());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: unconfirmed });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([201, 202])("does not confirm a matching row under unexpected HTTP %s", async (status) => {
    const fetch = database([{ id: caseId, status: "in_progress" }], status);
    const response = await PATCH(request(), context());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: unconfirmed });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("accepts an uppercase request UUID and returns its canonical case receipt", async () => {
    const fetch = database([{ id: caseId, status: "in_progress" }]);
    const response = await PATCH(request(), context(caseId.toUpperCase()));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { id: caseId, status: "in_progress" }, message: "Support case marked in progress.",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [input] = fetch.mock.calls[0];
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    expect(url.searchParams.get("id")).toBe(`eq.${caseId}`);
  });
});

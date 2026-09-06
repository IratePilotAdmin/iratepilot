import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));

import { POST } from "../app/api/contact/route";
import { HOTEL_MANAGER_INTEREST_MESSAGE_PREFIX as hotelTag } from "../lib/hotels/manager-interest";

const originalIntakeFlag = process.env.HOTEL_MANAGER_INTEREST_INTAKE_ENABLED;
const contact = { name: "Example Manager", email: "manager@example.test" };
const insert = vi.fn();

beforeEach(() => {
  createAdminClient.mockReset();
  insert.mockReset().mockResolvedValue({ error: null });
  createAdminClient.mockReturnValue({ from: vi.fn().mockReturnValue({ insert }) });
  process.env.HOTEL_MANAGER_INTEREST_INTAKE_ENABLED = "false";
});

afterEach(() => {
  if (originalIntakeFlag === undefined) delete process.env.HOTEL_MANAGER_INTEREST_INTAKE_ENABLED;
  else process.env.HOTEL_MANAGER_INTEREST_INTAKE_ENABLED = originalIntakeFlag;
});

function request(message: string) {
  return new Request("https://iratepilot.test/api/contact", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...contact, message }),
  });
}

const route = readFileSync(
  new URL("../app/api/contact/route.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../supabase/migrations/202608020012_secure_contact_submissions.sql", import.meta.url),
  "utf8",
);
const schema = readFileSync(
  new URL("../supabase/schema.sql", import.meta.url),
  "utf8",
);

describe("contact submission security", () => {
  const validMessage = "Please help with my hotel inquiry.";
  const validBody = JSON.stringify({ ...contact, message: validMessage });

  function rawRequest(body: string | null, headers: Record<string, string> = {}) {
    return new Request("https://iratepilot.test/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    });
  }

  it.each(["{invalid", "", null])("returns a JSON 400 for an unreadable JSON document (%j)", async (body) => {
    const response = await POST(rawRequest(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "The contact form must be valid JSON." });
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it.each(["null", "[]", "{}"])("keeps schema validation separate from JSON parsing (%s)", async (body) => {
    const response = await POST(rawRequest(body));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Please provide a valid name, email, and message." });
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared body before consuming it", async () => {
    const input = rawRequest(validBody, { "content-length": "24001" });
    const response = await POST(input);

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "The contact form is too large." });
    expect(input.bodyUsed).toBe(false);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each<Record<string, string>>([{}, { "content-length": "1" }])("limits the actual body even when its length is absent or understated (%j)", async (headers) => {
    const response = await POST(rawRequest(validBody.padEnd(24_001, " "), headers));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "The contact form is too large." });
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("counts UTF-8 bytes rather than characters before stripping extra fields", async () => {
    const body = JSON.stringify({ ...contact, message: validMessage, extra: "界".repeat(8_000) });
    expect(body.length).toBeLessThan(24_000);
    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(24_000);

    const response = await POST(rawRequest(body));

    expect(response.status).toBe(413);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("accepts a valid contact at the exact byte limit", async () => {
    const response = await POST(rawRequest(validBody.padEnd(24_000, " "), { "content-length": "24000" }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ status: "received" });
    expect(insert).toHaveBeenCalledExactlyOnceWith({ ...contact, message: validMessage });
  });

  it("preserves maximum-length Unicode fields encoded with JSON escapes", async () => {
    const value = { ...contact, name: "界".repeat(100), message: "界".repeat(3_000) };
    const body = JSON.stringify(value).replace(/界/g, "\\u754c");
    expect(new TextEncoder().encode(body).byteLength).toBeGreaterThan(18_000);

    const response = await POST(rawRequest(body));

    expect(response.status).toBe(201);
    expect(insert).toHaveBeenCalledExactlyOnceWith(value);
  });

  it("cancels a streamed body once it crosses the limit", async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(validBody.padEnd(24_000, " ")));
        controller.enqueue(new TextEncoder().encode(" "));
        // Remain open to prove the route stops reading without waiting for EOF.
      },
      cancel,
    });
    const input = new Request("https://iratepilot.test/api/contact", {
      method: "POST", body: stream, duplex: "half",
      headers: { "content-type": "application/json" },
    } as RequestInit);
    const response = await POST(input);

    expect(response.status).toBe(413);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("returns a JSON error when the request stream fails", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) { controller.error(new Error("Synthetic transport failure")); },
    });
    const response = await POST(new Request("https://iratepilot.test/api/contact", {
      method: "POST", body: stream, duplex: "half",
      headers: { "content-type": "application/json" },
    } as RequestInit));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "The contact form must be valid JSON." });
    expect(stream.locked).toBe(false);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("keeps database failures distinct from invalid request errors", async () => {
    insert.mockResolvedValue({ error: { message: "Synthetic database failure" } });
    const response = await POST(rawRequest(validBody));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Contact service is not configured yet." });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("keeps validated contact writes behind the server-only admin client", () => {
    expect(route).toContain('import { createAdminClient } from "@/lib/supabase/admin"');
    expect(route).toContain("contactSchema.safeParse");
    expect(route).toContain("const admin = createAdminClient()");
    expect(route).toContain('admin.from("contact_messages").insert(parsed.data)');
    expect(route).not.toContain("createClient");
  });

  it("removes direct anonymous contact-message insertion", () => {
    expect(migration).toContain('drop policy if exists "Public can submit contact messages"');
    expect(schema).not.toContain('create policy "Public can submit contact messages"');
  });

  it.each([
    hotelTag,
    `${hotelTag}\nHotel: Example Hotel`,
    `${hotelTag} suffix without newline`,
    ` \t\r\n${hotelTag}\nHotel: Example Hotel \n`,
  ])("rejects a reserved hotel-intake prefix before database access (%j)", async (message) => {
    const response = await POST(request(message));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Please use the hotel manager intake form for hotel onboarding requests.",
    });
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("still reserves the hotel tag when structured intake is enabled", async () => {
    process.env.HOTEL_MANAGER_INTEREST_INTAKE_ENABLED = "true";
    const response = await POST(request(`${hotelTag}\nHotel: Example Hotel`));

    expect(response.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    "Please help me update my business contact details.",
    `Please explain this text: ${hotelTag}\nHotel: Example Hotel`,
    "[HOTELXMANAGERYINTERESTZV1]\nHotel: Example Hotel",
    `${hotelTag.toLowerCase()}\nHotel: Example Hotel`,
  ])("preserves ordinary contact messages as general support (%j)", async (message) => {
    const response = await POST(request(message));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ status: "received" });
    expect(insert).toHaveBeenCalledExactlyOnceWith({ ...contact, message });
  });
});

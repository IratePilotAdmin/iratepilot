import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createAdminClient } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));

import { POST } from "../app/api/hotel-intake/interest/route";
import { hotelManagerInterestResponseMessage, isHotelManagerInterestReceived } from "../lib/hotels/intake-response-message";
import {
  formatHotelManagerInterestMessage,
  HOTEL_MANAGER_INTEREST_MESSAGE_PREFIX,
  hotelManagerInterestSchema,
} from "../lib/hotels/manager-interest";

const endpoint = "https://iratepilot.test/api/hotel-intake/interest";
const originalFlag = process.env.HOTEL_MANAGER_INTEREST_INTAKE_ENABLED;

const validInterest = {
  hotelName: "Harbor House Hotel",
  contactName: "Alex Rivera",
  role: "general_manager",
  businessEmail: "MANAGER@HARBOR.EXAMPLE",
  businessPhone: "+1 312 555 0142",
  city: "Chicago",
  region: "Illinois",
  country: "United States",
  websiteUrl: "https://harbor.example",
  preferredContact: "email",
  notes: "Afternoons work best.",
  faxNumber: "",
};

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://iratepilot.test",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function adminClient(existing: Array<{ id: string; message: string }> = [], openInterestCount: unknown = 0) {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const limit = vi.fn().mockResolvedValue({ data: existing, error: null });
  const inStatus = vi.fn()
    .mockReturnValueOnce({ limit })
    .mockResolvedValueOnce({ count: openInterestCount, error: null });
  const like = vi.fn().mockReturnValue({ in: inStatus });
  const eq = vi.fn().mockReturnValue({ like });
  const select = vi.fn()
    .mockReturnValueOnce({ eq })
    .mockReturnValue({ like });
  const from = vi.fn().mockReturnValue({ select, insert });
  createAdminClient.mockReturnValue({ from });
  return { eq, from, inStatus, insert, like, limit, select };
}

function likeRegex(pattern: string) {
  const literal = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "\\") expression += literal(pattern[++index]);
    else if (character === "%") expression += "[\\s\\S]*";
    else if (character === "_") expression += "[\\s\\S]";
    else expression += literal(character);
  }
  return new RegExp(`${expression}$`);
}

// Exercise the installed Supabase builder and SQL LIKE semantics without network access.
function database(messages: Array<{ id: string; email: string; message: string }>, lookupResponse?: () => Response) {
  const inserted: unknown[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    expect(url.pathname).toBe("/rest/v1/contact_messages");
    if (init?.method === "POST") {
      inserted.push(JSON.parse(String(init.body)));
      return new Response(null, { status: 201 });
    }
    const params = url.searchParams;
    if (params.has("email") && lookupResponse) return lookupResponse();
    expect(params.get("status")).toBe("in.(new,in_progress)");
    const pattern = params.get("message");
    expect(pattern).toMatch(/^like\./);
    let matching = messages.filter((entry) => likeRegex(pattern!.slice(5)).test(entry.message));
    if (params.has("email")) matching = matching.filter((entry) => `eq.${entry.email}` === params.get("email"));
    const count = matching.length;
    if (params.has("limit")) matching = matching.slice(0, Number(params.get("limit")));
    return new Response(init?.method === "HEAD" ? null : JSON.stringify(matching), {
      status: 200,
      headers: { "content-type": "application/json", "content-range": `*/${count}` },
    });
  });
  createAdminClient.mockReturnValue(createClient("https://database.example.test", "local-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  }));
  return { inserted, fetch };
}

beforeEach(() => {
  createAdminClient.mockReset();
  process.env.HOTEL_MANAGER_INTEREST_INTAKE_ENABLED = "true";
});

afterEach(() => {
  if (originalFlag === undefined) delete process.env.HOTEL_MANAGER_INTEREST_INTAKE_ENABLED;
  else process.env.HOTEL_MANAGER_INTEREST_INTAKE_ENABLED = originalFlag;
});

describe("hotel manager interest route", () => {
  it("fails closed before body parsing or database access", async () => {
    process.env.HOTEL_MANAGER_INTEREST_INTAKE_ENABLED = "false";
    const response = await POST(request(validInterest));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects cross-site and invalid submissions before database access", async () => {
    const crossSite = await POST(request(validInterest, {
      origin: "https://attacker.invalid",
      "sec-fetch-site": "cross-site",
    }));
    const invalid = await POST(request({ ...validInterest, bankAccount: "do-not-collect" }));

    expect(crossSite.status).toBe(403);
    expect(invalid.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("stores a normalized, tagged lead without commercial side effects", async () => {
    const admin = adminClient();
    const response = await POST(request(validInterest));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({ status: "received", intakeMode: "manager_interest" });
    expect(admin.from).toHaveBeenCalledTimes(3);
    expect(admin.from).toHaveBeenNthCalledWith(1, "contact_messages");
    expect(admin.from).toHaveBeenNthCalledWith(2, "contact_messages");
    expect(admin.from).toHaveBeenNthCalledWith(3, "contact_messages");
    expect(admin.eq).toHaveBeenCalledWith("email", "manager@harbor.example");
    expect(admin.like).toHaveBeenCalledWith(
      "message",
      "[HOTEL\\_MANAGER\\_INTEREST\\_V1]%",
    );
    expect(admin.inStatus).toHaveBeenCalledWith("status", ["new", "in_progress"]);
    expect(admin.insert).toHaveBeenCalledWith(expect.objectContaining({
      name: "Alex Rivera",
      email: "manager@harbor.example",
      status: "new",
      message: expect.stringContaining("private onboarding interest only"),
    }));
  });

  it("returns the same accepted result without inserting an open duplicate", async () => {
    const existingMessage = formatHotelManagerInterestMessage(
      hotelManagerInterestSchema.parse(validInterest),
    );
    const admin = adminClient([{ id: "existing-lead", message: existingMessage }]);
    const response = await POST(request(validInterest));

    expect(response.status).toBe(201);
    expect(admin.insert).not.toHaveBeenCalled();
  });

  it("accepts a second hotel from the same portfolio manager", async () => {
    const existingMessage = formatHotelManagerInterestMessage(
      hotelManagerInterestSchema.parse(validInterest),
    );
    const admin = adminClient([{ id: "existing-lead", message: existingMessage }]);
    const response = await POST(request({
      ...validInterest,
      hotelName: "Portfolio Hotel B",
    }));

    expect(response.status).toBe(201);
    expect(admin.insert).toHaveBeenCalledWith(expect.objectContaining({
      email: "manager@harbor.example",
      message: expect.stringContaining("Hotel: Portfolio Hotel B"),
    }));
  });

  it.each([
    { city: "Madison" },
    { region: "Wisconsin" },
    { country: "Canada" },
  ])("stores a same-named hotel at a different location (%j)", async (location) => {
    const existingMessage = formatHotelManagerInterestMessage(hotelManagerInterestSchema.parse(validInterest));
    const admin = adminClient([{ id: "existing-lead", message: existingMessage }]);
    const interest = { ...validInterest, ...location };
    const response = await POST(request(interest));

    expect(response.status).toBe(201);
    expect(admin.insert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      email: "manager@harbor.example",
      message: formatHotelManagerInterestMessage(hotelManagerInterestSchema.parse(interest)),
    }));
  });

  it("still deduplicates matching normalized name and location", async () => {
    const message = formatHotelManagerInterestMessage(hotelManagerInterestSchema.parse(validInterest));
    const admin = adminClient([{ id: "existing-lead", message }]);
    const response = await POST(request({
      ...validInterest, hotelName: "  HARBOR   HOUSE HOTEL ", city: "Ｃｈｉｃａｇｏ",
      region: " illinois ", country: "United   States",
    }));

    expect(response.status).toBe(201);
    expect(admin.insert).not.toHaveBeenCalled();
    expect(admin.select).toHaveBeenCalledTimes(1);
  });

  it("keeps comma-containing location fields distinct", async () => {
    const first = { ...validInterest, city: "Alpha, Beta", region: "Gamma", country: "Delta" };
    const message = formatHotelManagerInterestMessage(hotelManagerInterestSchema.parse(first));
    const admin = adminClient([{ id: "existing-lead", message }]);
    const response = await POST(request({ ...first, city: "Alpha", region: "Beta, Gamma" }));

    expect(response.status).toBe(201);
    expect(admin.insert).toHaveBeenCalledTimes(1);
  });

  it("does not claim a legacy location-only record proves the same property", async () => {
    const message = `${HOTEL_MANAGER_INTEREST_MESSAGE_PREFIX}\nHotel: Harbor House Hotel\nLocation: Chicago, Illinois, United States`;
    const admin = adminClient([{ id: "legacy-lead", message }]);
    const response = await POST(request(validInterest));

    expect(response.status).toBe(201);
    expect(admin.insert).toHaveBeenCalledTimes(1);
  });

  it("checks capacity for a new location instead of acknowledging the older hotel", async () => {
    const message = formatHotelManagerInterestMessage(hotelManagerInterestSchema.parse(validInterest));
    const admin = adminClient([{ id: "existing-lead", message }], 100);
    const response = await POST(request({ ...validInterest, city: "Madison" }));

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      code: "hotel_interest_capacity_full",
      error: "Hotel manager interest capacity is temporarily full. Please contact the team.",
    });
    expect(admin.insert).not.toHaveBeenCalled();
  });

  it("protects the shared Support inbox with an open-lead capacity", async () => {
    const admin = adminClient([], 100);
    const response = await POST(request(validInterest));

    expect(response.status).toBe(429);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const payload = await response.json();
    expect(hotelManagerInterestResponseMessage(payload, response))
      .toBe("Hotel manager interest capacity is temporarily full. Please contact the team.");
    expect(isHotelManagerInterestReceived(payload, response)).toBe(false);
    expect(admin.insert).not.toHaveBeenCalled();
  });

  it.each([
    { kind: "lookalike general messages", prefix: "[HOTELXMANAGERYINTERESTZV1]", expectedStatus: 201 },
    { kind: "genuine hotel leads", prefix: HOTEL_MANAGER_INTEREST_MESSAGE_PREFIX, expectedStatus: 429 },
  ])("counts only genuine hotel leads when 100 $kind exist", async ({ prefix, expectedStatus }) => {
    const admin = database(Array.from({ length: 100 }, (_, index) => ({
      id: `existing-${index}`,
      email: `other-${index}@example.test`,
      message: `${prefix}\nHotel: Existing Hotel ${index}`,
    })));
    const response = await POST(request(validInterest));

    expect(response.status).toBe(expectedStatus);
    expect(admin.inserted).toHaveLength(expectedStatus === 201 ? 1 : 0);
  });

  it.each([null, -1, 0.5, Number.NaN, "0"])(
    "does not store a lead when the database returns an invalid capacity count (%s)",
    async (count) => {
      const admin = adminClient([], count);
      const response = await POST(request(validInterest));

      expect(response.status).toBe(503);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({
        error: "Hotel manager interest intake is temporarily unavailable.",
      });
      expect(admin.insert).not.toHaveBeenCalled();
    },
  );

  it("accepts a lead when a valid count is just below capacity", async () => {
    const admin = adminClient([], 99);
    const response = await POST(request(validInterest));

    expect(response.status).toBe(201);
    expect(admin.insert).toHaveBeenCalledTimes(1);
  });

  it("acknowledges an existing lead without needing a capacity count", async () => {
    const message = formatHotelManagerInterestMessage(
      hotelManagerInterestSchema.parse(validInterest),
    );
    const admin = adminClient([{ id: "existing-lead", message }], null);
    const response = await POST(request(validInterest));

    expect(response.status).toBe(201);
    expect(admin.select).toHaveBeenCalledTimes(1);
    expect(admin.insert).not.toHaveBeenCalled();
  });

  it.each([
    { label: "missing data", data: undefined },
    { label: "null data", data: null },
    { label: "object instead of a list", data: {} },
    { label: "null row", data: [null] },
    { label: "missing message", data: [{ id: "existing-lead" }] },
    { label: "non-string message", data: [{ id: "existing-lead", message: 123 }] },
  ])("stops before capacity or insertion for $label in the duplicate lookup", async ({ data }) => {
    const admin = adminClient();
    admin.limit.mockResolvedValue({ data, error: null });
    const response = await POST(request(validInterest));

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Hotel manager interest intake is temporarily unavailable." });
    expect(admin.select).toHaveBeenCalledTimes(1);
    expect(admin.insert).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "   "])("does not acknowledge a matching message without a usable record ID (%j)", async (id) => {
    const message = formatHotelManagerInterestMessage(hotelManagerInterestSchema.parse(validInterest));
    const admin = adminClient();
    admin.limit.mockResolvedValue({ data: [{ id, message }], error: null });
    const response = await POST(request(validInterest));

    expect(response.status).toBe(503);
    expect(admin.select).toHaveBeenCalledTimes(1);
    expect(admin.insert).not.toHaveBeenCalled();
  });

  it("validates the entire lookup before acknowledging its first matching row", async () => {
    const message = formatHotelManagerInterestMessage(hotelManagerInterestSchema.parse(validInterest));
    const admin = adminClient();
    admin.limit.mockResolvedValue({ data: [{ id: "existing-lead", message }, {}], error: null });
    const response = await POST(request(validInterest));

    expect(response.status).toBe(503);
    expect(admin.select).toHaveBeenCalledTimes(1);
    expect(admin.insert).not.toHaveBeenCalled();
  });

  it.each([
    { label: "HTTP 204 without data", response: () => new Response(null, { status: 204 }) },
    { label: "HTTP 200 with JSON null", response: () => Response.json(null) },
  ])("rejects $label from the installed database client", async ({ response: lookupResponse }) => {
    const admin = database([], lookupResponse);
    const response = await POST(request(validInterest));

    expect(response.status).toBe(503);
    expect(admin.fetch).toHaveBeenCalledTimes(1);
    expect(admin.inserted).toHaveLength(0);
  });

  it("keeps a valid empty lookup eligible for a new lead", async () => {
    const admin = database([]);
    const response = await POST(request(validInterest));

    expect(response.status).toBe(201);
    expect(admin.fetch).toHaveBeenCalledTimes(3);
    expect(admin.inserted).toHaveLength(1);
  });

  it("still stops when the duplicate lookup reports a database error", async () => {
    const admin = adminClient();
    admin.limit.mockResolvedValue({ data: [], error: { message: "Synthetic lookup failure" } });
    const response = await POST(request(validInterest));

    expect(response.status).toBe(503);
    expect(admin.select).toHaveBeenCalledTimes(1);
    expect(admin.insert).not.toHaveBeenCalled();
  });
});

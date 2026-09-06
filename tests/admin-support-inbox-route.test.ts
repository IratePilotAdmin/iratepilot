import { createClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createAdminClient, requireRole } = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole }));

import { GET } from "../app/api/admin/support/route";
import { HOTEL_MANAGER_INTEREST_MESSAGE_PREFIX as hotelTag } from "../lib/hotels/manager-interest";

type Message = {
  id: string;
  name: string;
  email: string;
  message: string;
  status: string;
  created_at: string;
};

function row(index: number, changes: Partial<Message> = {}): Message {
  return {
    id: String(index).padStart(5, "0"),
    name: `Person ${index}`,
    email: `person${index}@example.test`,
    message: "General support request",
    status: "resolved",
    created_at: "2026-09-05T12:00:00.000Z",
    ...changes,
  };
}

function request(params: Record<string, string> = {}) {
  return new Request(`https://iratepilot.test/api/admin/support?${new URLSearchParams(params)}`);
}

function literalRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function likeRegex(pattern: string, ignoreCase: boolean) {
  let expression = "^";
  // PostgREST's LIKE alias is intentionally modeled to catch literal '*' regressions.
  const sqlPattern = pattern.replaceAll("*", "%");
  for (let index = 0; index < sqlPattern.length; index += 1) {
    const character = sqlPattern[index];
    if (character === "\\") expression += literalRegex(sqlPattern[++index]);
    else if (character === "%") expression += "[\\s\\S]*";
    else if (character === "_") expression += "[\\s\\S]";
    else expression += literalRegex(character);
  }
  return new RegExp(`${expression}$`, ignoreCase ? "i" : undefined);
}

// Execute the actual installed Supabase builder against a local fetch fixture, so
// URL encoding, quoted OR values, count headers and inclusive ranges are exercised.
function database(messages: Message[], failure?: "data" | "summary" | "count", pageResponse?: () => Response) {
  const urls: URL[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    urls.push(url);
    const params = url.searchParams;
    const isHead = init?.method === "HEAD";
    if ((failure === "data" && !isHead) || (failure === "summary" && isHead)) {
      return Response.json({ message: "Database query rejected" }, { status: 400 });
    }
    if (!isHead && pageResponse) return pageResponse();
    let matching = [...messages];
    const status = params.get("status");
    if (status) {
      expect(status.startsWith("eq.")).toBe(true);
      matching = matching.filter((entry) => entry.status === status.slice(3));
    }
    const messagePattern = params.get("message");
    if (messagePattern) {
      const negate = messagePattern.startsWith("not.like.");
      expect(messagePattern.startsWith(negate ? "not.like." : "like.")).toBe(true);
      const pattern = messagePattern.slice(negate ? 9 : 5);
      const regex = likeRegex(pattern, false);
      matching = matching.filter((entry) => regex.test(entry.message) !== negate);
    }
    const search = params.get("or");
    if (search) {
      expect(search.startsWith("(") && search.endsWith(")")).toBe(true);
      const terms = search.slice(1, -1);
      const rule = /(name|email|message)\.(ilike|imatch)\."((?:[^"\\]|\\[\s\S])*)"(?:,|$)/gy;
      const predicates: Array<(entry: Message) => boolean> = [];
      let consumed = 0;
      for (let match = rule.exec(terms); match; match = rule.exec(terms)) {
        consumed = rule.lastIndex;
        const field = match[1] as "name" | "email" | "message";
        const pattern = match[3].replace(/\\([\s\S])/g, "$1");
        const regex = match[2] === "ilike" ? likeRegex(pattern, true) : new RegExp(pattern, "i");
        predicates.push((entry) => regex.test(entry[field]));
      }
      expect(consumed).toBe(terms.length);
      expect(predicates).toHaveLength(3);
      matching = matching.filter((entry) => predicates.some((predicate) => predicate(entry)));
    }
    const count = matching.length;
    if (!isHead) {
      expect(params.get("order")).toBe("created_at.desc,id.desc");
      matching.sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id));
      const offset = Number(params.get("offset"));
      expect(params.get("limit")).toBe("200");
      if (offset > 0 && offset >= count) {
        return Response.json({ code: "PGRST103", message: "Requested range not satisfiable" }, { status: 416 });
      }
      matching = matching.slice(offset, offset + Number(params.get("limit")));
    }
    return new Response(isHead ? null : JSON.stringify(matching), {
      status: 200,
      headers: {
        "content-type": "application/json",
        ...(failure === "count" ? {} : { "content-range": `*/${count}` }),
      },
    });
  });
  createAdminClient.mockReturnValue(createClient("https://database.example.test", "local-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  }));
  return { urls, fetch };
}

beforeEach(() => {
  vi.resetAllMocks();
  requireRole.mockResolvedValue({ user: { id: "admin-user" } });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => vi.restoreAllMocks());

describe("admin support inbox route", () => {
  it("finds an older open hotel lead behind 200 newer resolved general cases", async () => {
    const oldLead = row(0, {
      status: "new", message: `${hotelTag}\nHotel: Harbor House`, created_at: "2026-08-01T12:00:00.000Z",
    });
    database([oldLead, ...Array.from({ length: 200 }, (_, index) => row(index + 1))]);
    const unfiltered = await (await GET(request())).json();
    expect(unfiltered.data).toHaveLength(200);
    expect(unfiltered.data.some((entry: Message) => entry.id === oldLead.id)).toBe(false);
    expect(unfiltered).toMatchObject({ limit: 200, offset: 0, totalMatches: 201, hasMore: true, truncated: true });

    const response = await GET(request({ status: "new", queue: "hotel_manager_interest", q: "harbor" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      data: [oldLead],
      summary: { total: 201, new: 1, inProgress: 0, resolved: 200 },
      limit: 200, offset: 0, totalMatches: 1, hasMore: false, truncated: false,
    });
  });

  it("pages through all matching cases with a stable id tie-breaker", async () => {
    const cases = Array.from({ length: 405 }, (_, index) => row(index, { status: "in_progress" }));
    const admin = database(cases);
    const pages = [];
    for (const offset of [0, 200, 400, 600]) {
      const response = await GET(request({ status: "in_progress", offset: String(offset) }));
      expect(response.status).toBe(200);
      pages.push(await response.json());
    }
    expect(pages.map((page) => page.data.length)).toEqual([200, 200, 5, 0]);
    expect(pages.map((page) => page.hasMore)).toEqual([true, true, false, false]);
    expect(pages.map((page) => page.offset)).toEqual([0, 200, 400, 600]);
    expect(pages.flatMap((page) => page.data.map((entry: Message) => entry.id)))
      .toEqual(cases.map((entry) => entry.id).reverse());
    expect(admin.urls.filter((url) => url.searchParams.has("offset"))).toHaveLength(4);
  });

  it("keeps global counts independent of filters and unknown status values", async () => {
    database([
      row(1, { status: "new" }), row(2, { status: "in_progress" }), row(3), row(4, { status: "legacy" }),
    ]);
    const body = await (await GET(request({ status: "resolved", q: "no matches" }))).json();
    expect(body).toMatchObject({
      data: [], totalMatches: 0, hasMore: false, summary: { total: 4, new: 1, inProgress: 1, resolved: 1 },
    });
  });

  it("recovers an out-of-range page using the same status, queue and search filters", async () => {
    const lead = row(1, { status: "new", message: `${hotelTag} Harbor` });
    const admin = database([
      lead, row(2), row(3, { status: "new" }), row(4, { message: `${hotelTag} Harbor` }),
    ]);
    const response = await GET(request({ status: "new", queue: "hotel_manager_interest", q: "Harbor", offset: "200" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: [], offset: 200, totalMatches: 1, hasMore: false });
    const recovery = admin.urls.at(-1)!;
    expect(recovery.searchParams.get("status")).toBe("eq.new");
    expect(recovery.searchParams.get("message")).toBe(admin.urls[0].searchParams.get("message"));
    expect(recovery.searchParams.get("or")).toBe(admin.urls[0].searchParams.get("or"));
    expect(recovery.searchParams.has("offset")).toBe(false);
  });

  it("recognizes only the literal, case-sensitive hotel prefix", async () => {
    const messages = [
      row(1, { message: `${hotelTag} a` }),
      row(2, { message: "[HOTELXMANAGERYINTERESTZV1] a" }),
      row(3, { message: `${hotelTag.toLowerCase()} a` }),
      row(4, { message: ` ${hotelTag} a` }),
    ];
    const admin = database(messages);
    const hotel = await (await GET(request({ queue: "hotel_manager_interest" }))).json();
    const general = await (await GET(request({ queue: "general_support" }))).json();
    expect(hotel.data.map((entry: Message) => entry.id)).toEqual([messages[0].id]);
    expect(general.data.map((entry: Message) => entry.id)).toEqual(messages.slice(1).reverse().map((entry) => entry.id));
    expect(admin.urls[0].searchParams.get("message")).toBe("like.[HOTEL\\_MANAGER\\_INTEREST\\_V1]%");
  });

  it.each(["name", "email", "message"] as const)("searches %s case-insensitively after trimming", async (field) => {
    const matching = row(1, { [field]: "prefix Harbor suffix" });
    database([matching, row(2)]);
    const body = await (await GET(request({ q: "  hArBoR  " }))).json();
    expect(body.data).toEqual([matching]);
  });

  it.each([
    "_", "%", "\\", "*", "a*b", 'quote",(status.eq.new)',
    'x_%\\",()y', 'x*_%\\",()[a]{b}.$^+?|y',
  ])("treats search text as a literal substring through Supabase URL encoding (%s)", async (search) => {
    const matching = row(1, { message: `before ${search} after` });
    const decoy = row(2, { message: "before anything after", status: "new" });
    const admin = database([matching, decoy]);
    const response = await GET(request({ q: search }));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual([matching]);
    const expression = admin.urls[0].searchParams.get("or");
    expect(expression).toContain(search.includes("*") ? '.imatch."' : '.ilike."');
    expect(admin.urls[0].searchParams.get("status")).toBeNull();
  });

  it.each<Record<string, string>>([
    { status: "open" }, { status: "" }, { queue: "hotel" }, { queue: "" },
    { q: "x".repeat(201) }, { q: "null\0byte" }, { offset: "-1" }, { offset: "1.5" },
    { offset: "1e3" }, { offset: "" }, { offset: "NaN" }, { offset: " 1 " },
    { offset: String(Number.MAX_SAFE_INTEGER - 198) }, { offset: "99999999999999999999999" },
  ])("rejects invalid query parameters before service-role access (%j)", async (params) => {
    const response = await GET(request(params));
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each(["status", "queue", "q", "offset"])("rejects duplicate %s parameters", async (key) => {
    const response = await GET(new Request(`https://iratepilot.test/api/admin/support?${key}=all&${key}=new`));
    expect(response.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("accepts the defined search and safe range boundaries", async () => {
    const search = "x".repeat(200);
    database([row(1, { message: search })]);
    const response = await GET(request({ q: ` ${search} `, offset: String(Number.MAX_SAFE_INTEGER - 199) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: [], offset: Number.MAX_SAFE_INTEGER - 199, totalMatches: 1, hasMore: false,
    });
  });

  it.each([401, 403])("honors an authorization rejection (%s) before database access", async (status) => {
    requireRole.mockResolvedValue({ error: "Forbidden", status });
    const response = await GET(request({ offset: "invalid" }));
    expect(requireRole).toHaveBeenCalledWith(["admin"]);
    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("does not access the database when authorization fails unexpectedly", async () => {
    requireRole.mockRejectedValue(new Error("Auth unavailable"));
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each(["data", "summary", "count"] as const)("fails visibly when %s cannot be loaded", async (failure) => {
    database([row(1)], failure);
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Support cases could not be loaded." });
  });

  it.each([
    { label: "JSON null with matching cases", payload: null, count: 1 },
    { label: "JSON null with zero matches", payload: null, count: 0 },
    { label: "a false value", payload: false, count: 1 },
    { label: "an empty string", payload: "", count: 1 },
    { label: "an object instead of rows", payload: {}, count: 1 },
  ])("does not report a loaded inbox when the database returns $label", async ({ payload, count }) => {
    const admin = database([row(1)], undefined, () => Response.json(payload, {
      headers: { "content-range": `*/${count}` },
    }));
    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Support cases could not be loaded." });
    expect(admin.fetch).toHaveBeenCalledTimes(5);
  });

  it("rejects a blank successful database response instead of fabricating an empty page", async () => {
    const admin = database([row(1)], undefined, () => new Response(null, {
      status: 204, headers: { "content-range": "*/1" },
    }));
    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Support cases could not be loaded." });
    expect(admin.fetch).toHaveBeenCalledTimes(5);
  });

  it("still reports a genuinely empty queue from a valid empty array", async () => {
    const admin = database([]);
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [], summary: { total: 0, new: 0, inProgress: 0, resolved: 0 },
      limit: 200, offset: 0, totalMatches: 0, hasMore: false, truncated: false,
    });
    expect(admin.fetch).toHaveBeenCalledTimes(5);
  });
});

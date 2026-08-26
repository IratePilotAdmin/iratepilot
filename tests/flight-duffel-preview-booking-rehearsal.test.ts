import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDuffelSandboxOfferRequestPlan } from "../lib/flights/duffel-sandbox-contract";
import { canonicalFlightJson } from "../lib/flights/runtime-safety";

const rehearsal = readFileSync("lib/flights/duffel/preview-booking-rehearsal.server.ts", "utf8");
const ports = readFileSync("lib/flights/duffel/preview-ports.server.ts", "utf8");
const route = readFileSync("app/api/flights/preview-test-booking/route.ts", "utf8");

describe("Duffel Preview booking rehearsal", () => {
  it("is Preview-only, default-off, exact-confirmation, and synthetic-PII-only", () => {
    expect(rehearsal).toContain('const CONFIRMATION = "BOOK_ONE_DUFFEL_TEST_FLIGHT"');
    expect(rehearsal).toContain('process.env.FLIGHT_DUFFEL_TEST_BOOKING_ENABLED !== "true"');
    expect(rehearsal).toContain('process.env.FLIGHT_DUFFEL_TEST_CREDENTIAL_PROBE_ENABLED !== "false"');
    expect(rehearsal).toContain('process.env.VERCEL_ENV !== "preview"');
    expect(rehearsal).toContain('givenName: "Synthetic"');
    expect(rehearsal).toContain('email: "flight.preview.synthetic@example.test"');
    expect(rehearsal).toContain("departureDate: isoDateAfter(72)");
    expect(rehearsal).toContain("projected.evidence[index]?.passengerIdentityDocumentsRequired === false");
    expect(rehearsal).not.toMatch(/request\.(?:json|formData|text)\(/);
    expect(route).toContain("Object.keys(body).length !== 1");
    expect(route).toContain("Exact test-booking confirmation is required.");
    expect(route).toContain('export const maxDuration = 300');
    expect(route).toContain("FLIGHT_DUFFEL_TEST_EXECUTION_NONCE");
    expect(route).toContain('process.env.FLIGHT_DUFFEL_TEST_BOOKING_ENABLED !== "true"');
    expect(route).toContain('request.headers.get("x-iratepilot-flight-test-nonce")');
    expect(route).toContain("timingSafeEqual");
    expect(route).toContain("failureFingerprint");
    expect(route).toContain("causeFingerprint");
    expect(route).toContain('.slice(0, 16)');
    expect(route).toContain('return NextResponse.json({ error: "Not found." }, { status: 404 })');
  });

  it("pins the fresh +72-day booking-search identity", () => {
    const plan = buildDuffelSandboxOfferRequestPlan({
      origin: "ORD",
      destination: "MIA",
      departureDate: "2026-11-05",
      returnDate: null,
      cabin: "economy",
      passengers: { adults: 1, children: 0, infantsInSeat: 0, infantsOnLap: 0 },
    });
    const body = canonicalFlightJson(plan.body as never);
    expect(plan.requestDigest).toBe("afcd87ae7f4c049696231022bdd3f3ea91a773664f3fc4788cfdf04f0f937289");
    expect(Buffer.byteLength(body, "utf8")).toBe(193);
    expect(createHash("sha256").update(body, "utf8").digest("hex"))
      .toBe("5c3f79c04270d8673677c450444f1cd56d593a5002c651755fae5c098d35eb28");
  });

  it("orders gate, durable prepare, credential read, CAS claim, fetch, and terminal completion", () => {
    const transport = readFileSync("lib/flights/duffel/http-transport.server.ts", "utf8");
    const gate = transport.indexOf("this.#authorize(metadata)");
    const prepare = transport.indexOf("this.#journalBegin(");
    const credential = transport.indexOf("this.#readToken(");
    const claim = transport.indexOf("this.#markDispatching(");
    const dispatch = transport.indexOf("this.#dispatch(request)");
    const complete = transport.indexOf("this.#recordClaimedTerminal(");
    expect(gate).toBeGreaterThan(0);
    expect(prepare).toBeGreaterThan(gate);
    expect(credential).toBeGreaterThan(prepare);
    expect(claim).toBeGreaterThan(credential);
    expect(dispatch).toBeGreaterThan(claim);
    expect(complete).toBeGreaterThan(dispatch);
    expect(transport).toContain("isDuffelSandboxOrderCreatePlan(value)");
    expect(transport).toContain('plan.operation === "create_order"');
    expect(transport).toContain("DUFFEL_ORDER_MINIMUM_TIMEOUT_MS");
  });

  it("uses only fixed Preview Supabase and Duffel test bindings", () => {
    expect(ports).toContain('const PREVIEW_PROJECT_REF = "eiqmdldjnedqgbtoozqa"');
    expect(ports).toContain('providerCode: "duffel"');
    expect(ports).toContain('p_execution_mode: "test"');
    expect(ports).toContain('process.env.DUFFEL_TEST_ACCESS_TOKEN');
    expect(ports).not.toContain("DUFFEL_LIVE_ACCESS_TOKEN");
    expect(ports).not.toContain("NEXT_PUBLIC_DUFFEL");
    expect(ports).not.toMatch(/console\.(?:log|error|warn)/);
  });

  it("does not retry a provider request", () => {
    expect(ports.match(/await fetch\(/g)).toHaveLength(1);
    expect(ports).not.toMatch(/\bretry\b/i);
    expect(rehearsal).toContain("automaticRetryAttempted: false");
  });
});

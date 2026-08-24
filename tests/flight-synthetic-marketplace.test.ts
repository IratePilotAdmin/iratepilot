import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildSyntheticFlightOffers,
  evaluateSyntheticFlightPreviewOperation,
  flightSearchQueryString,
  getSyntheticFlightOffer,
  repriceSyntheticFlightOffer,
  searchSyntheticFlightMarketplace,
  syntheticPreviewReference,
} from "../lib/flights/synthetic-marketplace";
import type { FlightPlanningQuery } from "../lib/flights/search";

const oneWay: FlightPlanningQuery = {
  tripType: "oneway",
  origin: "ORD",
  destination: "MIA",
  departureDate: "2027-01-10",
  returnDate: null,
  travelers: 2,
  cabin: "economy",
};

describe("synthetic flight marketplace", () => {
  it("builds deterministic synthetic offers through domain, runtime, and adapter orchestration", async () => {
    const now = new Date("2026-08-23T12:00:00.000Z");
    const first = await searchSyntheticFlightMarketplace(oneWay, now);
    const second = await searchSyntheticFlightMarketplace(oneWay, now);
    expect(first).toEqual(second);
    expect(first.offers).toHaveLength(3);
    expect(first.offers.every((offer) => offer.synthetic && offer.mode === "synthetic_preview_only")).toBe(true);
    expect(first.offers.every((offer) => !offer.bookingAuthorized && !offer.paymentAuthorized && !offer.ticketingAuthorized)).toBe(true);
    expect(first.orchestration).toEqual({
      commerceDomainValidated: true,
      runtimeOperation: "search",
      runtimeAuthorized: true,
      providerId: "synthetic_flight_fixture_v1",
      providerMode: "synthetic_fixture",
      liveProviderBinding: null,
      externalNetworkAccess: false,
      externalSideEffect: false,
    });
    expect(await evaluateSyntheticFlightPreviewOperation("create_order")).toMatchObject({
      authorized: false,
      reasons: expect.arrayContaining(["Flight transaction kill switch is engaged.", "Flight booking operations are disabled."]),
    });
  });

  it("models round trips and prices all travelers without mutating the request", async () => {
    const query = { ...oneWay, tripType: "roundtrip", returnDate: "2027-01-15", travelers: 3 } as const;
    const offers = await buildSyntheticFlightOffers(query, new Date("2026-08-23T12:00:00.000Z"));
    expect(offers.every((offer) => offer.slices.length === 2 && offer.travelerCount === 3)).toBe(true);
    expect(query.returnDate).toBe("2027-01-15");
  });

  it("resolves only an exact synthetic offer for the query", async () => {
    const now = new Date("2026-08-23T12:00:00.000Z");
    const [offer] = await buildSyntheticFlightOffers(oneWay, now);
    expect(offer).toBeDefined();
    expect(await getSyntheticFlightOffer(oneWay, offer!.id, now)).toEqual(offer);
    expect(await getSyntheticFlightOffer(oneWay, "synthetic_wrong", now)).toBeNull();
  });

  it("reprices through the same adapter while retaining every money and ticketing stop", async () => {
    const now = new Date("2026-08-23T12:00:00.000Z");
    const [offer] = await buildSyntheticFlightOffers(oneWay, now);
    const plan = await repriceSyntheticFlightOffer(oneWay, offer!.id, now);
    expect(plan?.receipt).toMatchObject({
      status: "unchanged",
      bookingAuthorized: false,
      paymentAuthorized: false,
      ticketingAuthorized: false,
      orchestration: { runtimeOperation: "reprice", runtimeAuthorized: true, externalNetworkAccess: false },
    });
    expect(plan?.receipt.totalAmount).toBe(offer!.totalAmount);
  });

  it("binds offer identity to cabin, travelers, trip type, and return date", async () => {
    const now = new Date("2026-08-23T12:00:00.000Z");
    const [baseOffer] = await buildSyntheticFlightOffers(oneWay, now);
    const changedQueries: FlightPlanningQuery[] = [
      { ...oneWay, origin: "MDW" },
      { ...oneWay, destination: "LAX" },
      { ...oneWay, departureDate: "2027-01-11" },
      { ...oneWay, cabin: "business" },
      { ...oneWay, travelers: 3 },
      { ...oneWay, tripType: "roundtrip", returnDate: "2027-01-15" },
      { ...oneWay, tripType: "roundtrip", returnDate: "2027-01-16" },
    ];
    for (const changed of changedQueries) {
      const [changedOffer] = await buildSyntheticFlightOffers(changed, now);
      expect(changedOffer?.id).not.toBe(baseOffer?.id);
      expect(await repriceSyntheticFlightOffer(changed, baseOffer!.id, now)).toBeNull();
    }
    await expect(buildSyntheticFlightOffers({ ...oneWay, tripType: "roundtrip", returnDate: null }, now))
      .rejects.toThrow("Trip type and return date");
  });

  it("binds immutable expiry into the offer token and never revives an expired link", async () => {
    const observedAt = new Date("2026-08-23T12:00:00.000Z");
    const [offer] = await buildSyntheticFlightOffers(oneWay, observedAt);
    expect(offer).toBeDefined();
    const expiresAt = new Date(offer!.expiresAt);
    expect(await getSyntheticFlightOffer(oneWay, offer!.id, new Date(expiresAt.getTime() - 1))).toEqual(offer);
    expect(await getSyntheticFlightOffer(oneWay, offer!.id, expiresAt)).toBeNull();
    expect(await repriceSyntheticFlightOffer(oneWay, offer!.id, new Date(expiresAt.getTime() + 60_000))).toBeNull();

    const extendedExpiry = String(expiresAt.getTime() + 60_000);
    const tamperedExpiryId = offer!.id.replace(String(expiresAt.getTime()), extendedExpiry);
    expect(tamperedExpiryId).not.toBe(offer!.id);
    expect(await getSyntheticFlightOffer(oneWay, tamperedExpiryId, observedAt)).toBeNull();
    expect(await repriceSyntheticFlightOffer(oneWay, tamperedExpiryId, observedAt)).toBeNull();
  });

  it("round-trips the non-sensitive search contract into links", () => {
    const params = new URLSearchParams(flightSearchQueryString(oneWay));
    expect(Object.fromEntries(params)).toEqual({ tripType: "oneway", origin: "ORD", destination: "MIA", departureDate: "2027-01-10", travelers: "2", cabin: "economy" });
  });

  it("labels preview references so they cannot be mistaken for provider confirmations", () => {
    expect(syntheticPreviewReference(`offer_syn_${"a".repeat(64)}_1`)).toBe(`PREVIEW-${"A".repeat(64)}-1`);
  });

  it("keeps every traveler page explicit about synthetic and non-bookable status", () => {
    const paths = [
      "app/flights/results/page.tsx",
      "app/flights/offers/[id]/page.tsx",
      "app/flights/checkout/page.tsx",
      "app/flights/confirmation/[reference]/page.tsx",
      "components/flights/synthetic-flight-checkout.tsx",
    ];
    const source = paths.map((path) => readFileSync(path, "utf8")).join("\n");
    expect(source).toMatch(/Synthetic flight marketplace/);
    expect(source).toMatch(/No card fields are rendered/);
    expect(source).toMatch(/not an airline booking reference/);
    expect(source).toMatch(/buildSyntheticFlightOffers/);
    expect(source).toMatch(/repriceSyntheticFlightOffer/);
    expect(source).toMatch(/getSyntheticFlightOffer/);
    expect(source).not.toMatch(/SyntheticFlightProviderAdapter/);
    expect(source).not.toMatch(/fetch\s*\(/);
    expect(source).not.toMatch(/createClient\s*\(/);
    expect(source).not.toMatch(/process\.env/);
  });
});

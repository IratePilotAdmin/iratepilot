import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createFlightBookingConnectorAdapter,
  flightBookingConnectorDefinitions,
  flightBookingConnectorIds,
  getFlightBookingConnectorDefinition,
} from "../lib/flights/booking-connectors";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

describe("flight booking connector catalog", () => {
  it("catalogues every requested GDS, host brand, and aggregator", () => {
    expect(flightBookingConnectorIds).toEqual([
      "sabre",
      "amadeus",
      "travelport",
      "worldspan",
      "abacus",
      "galileo",
      "airgateway",
      "verteil",
      "travelfusion",
    ]);
    expect(flightBookingConnectorDefinitions).toHaveLength(9);
    expect(flightBookingConnectorDefinitions.map(({ id }) => id)).toEqual(
      flightBookingConnectorIds,
    );
  });

  it("keeps every catalog entry dark until separate activation evidence exists", () => {
    for (const definition of flightBookingConnectorDefinitions) {
      expect(definition.lifecycle).toBe("catalogued_not_activated");
      expect(definition.externalNetworkAccess).toBe(false);
      expect(definition.supportsLiveTraffic).toBe(false);
      expect(definition.credentialsConfigured).toBe(false);
      expect(definition.activationRequires)
        .toBe("separate_contract_credentials_certification_and_release_approval");
      expect(definition.plannedOperations.length).toBeGreaterThan(0);
    }
  });

  it("preserves host-brand relationships", () => {
    expect(getFlightBookingConnectorDefinition("worldspan").integrationFamily)
      .toBe("travelport");
    expect(getFlightBookingConnectorDefinition("galileo").integrationFamily)
      .toBe("travelport");
    expect(getFlightBookingConnectorDefinition("abacus").integrationFamily)
      .toBe("sabre");
  });

  it("requires a provider-specific ID when building a guarded adapter", () => {
    const bindings = {
      providerId: "sabre_flight_adapter",
      adapterVersion: "1.0.0",
      adapterSourceDigest: "a".repeat(64),
      accountScopeReceiptDigest: "b".repeat(64),
      pointOfSaleScopeReceiptDigest: "c".repeat(64),
      contentScopeReceiptDigest: "d".repeat(64),
    } as const;
    const execute = async () => { throw new Error("executor must not be called"); };
    expect(() => createFlightBookingConnectorAdapter("sabre", {
      mode: "provider_sandbox",
      executionBinding: bindings,
      paymentExecutionBinding: null,
      settlementExecutionBinding: null,
      execute,
      providerId: "wrong_provider_id",
    })).toThrow("requires provider ID sabre_flight_adapter");
  });

  it("surfaces the catalog in the protected administrator workspace", () => {
    const page = read("app/admin/flights/page.tsx");
    expect(page).toContain("GDS and airline adapter surfaces");
    expect(page).toContain("flightBookingConnectorDefinitions.map");
    expect(page).toContain("Not activated");
    expect(page).not.toContain("connector.externalNetworkAccess = true");
  });
});

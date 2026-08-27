import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createFlightBookingConnectorAdapter,
  flightBookingConnectorDefinitions,
  flightBookingConnectorIds,
  getFlightBookingConnectorDefinition,
} from "../lib/flights/booking-connectors";
import {
  buildFlightConnectorActivationReadiness,
  flightConnectorActivationStages,
  FLIGHT_CONNECTOR_ACTIVATION_MODE,
} from "../lib/flights/connector-activation-readiness";

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
    expect(getFlightBookingConnectorDefinition("amadeus").integrationFamily)
      .toBe("amadeus");
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
    expect(page).toContain("buildFlightConnectorActivationReadiness");
    expect(page).toContain("{connector.completedCount}/{connector.totalCount} gates");
    expect(page).not.toContain("connector.externalNetworkAccess = true");
  });

  it("keeps every connector at zero of ten activation gates by default", () => {
    const readiness = buildFlightConnectorActivationReadiness();
    expect(FLIGHT_CONNECTOR_ACTIVATION_MODE).toBe("catalogued_readiness_only");
    expect(flightConnectorActivationStages).toHaveLength(10);
    expect(readiness.totalConnectors).toBe(9);
    expect(readiness.readyConnectorCount).toBe(0);
    expect(readiness.liveConnectorCount).toBe(0);
    expect(readiness.tracks.every((track) => track.completedCount === 0 && track.totalCount === 10)).toBe(true);
    expect(readiness.tracks.every((track) => !track.externalNetworkAccess && !track.productionTrafficAuthorized)).toBe(true);
  });

  it("does not turn a completed checklist into external authorization", () => {
    const evidence = Object.fromEntries(flightBookingConnectorIds.map((id) => [
      id,
      Object.fromEntries(flightConnectorActivationStages.map((stage) => [stage.id, true])),
    ]));
    const readiness = buildFlightConnectorActivationReadiness(evidence);
    expect(readiness.readyConnectorCount).toBe(9);
    expect(readiness.liveConnectorCount).toBe(0);
    expect(readiness.externalNetworkAccess).toBe(false);
    expect(readiness.productionTrafficAuthorized).toBe(false);
    expect(readiness.ticketingAuthorized).toBe(false);
    expect(readiness.paymentAuthorized).toBe(false);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { carRentalAdapterOperationKinds } from "../lib/cars/provider-adapter-certification";
import {
  buildCarRentalNamedConnectorPlan,
  CAR_RENTAL_NAMED_CONNECTOR_MODE,
  carRentalConnectorProhibitedFields,
  carRentalConnectorRecordedFields,
  carRentalNamedConnectorDefinitions,
  carRentalNamedConnectorFixtures,
  carRentalNamedConnectorGates,
  runCarRentalNamedConnectorOperation,
  validateCarRentalNamedConnectorRecord,
  type CarRentalNamedConnectorRecord,
} from "../lib/cars/provider-connectors";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function cloneRecord(record: CarRentalNamedConnectorRecord): CarRentalNamedConnectorRecord {
  return structuredClone(record);
}

describe("car-rental named connector preparation", () => {
  it("registers exactly Sabre, Travelport, and one unselected aggregator connector", () => {
    expect(CAR_RENTAL_NAMED_CONNECTOR_MODE).toBe("named_connectors_offline_only");
    expect(carRentalNamedConnectorDefinitions.map((connector) => connector.id)).toEqual(["sabre", "travelport", "aggregator"]);
    expect(carRentalNamedConnectorDefinitions.map((connector) => connector.category)).toEqual(["gds", "gds", "aggregator"]);
    expect(carRentalNamedConnectorDefinitions[2]).toMatchObject({ providerBinding: "provider_unselected", label: "Aggregator (runtime provider unselected)" });
  });

  it("keeps every connector offline, unprovisioned, unverified, and disconnected", () => {
    for (const connector of carRentalNamedConnectorDefinitions) {
      expect(connector).toMatchObject({
        implementationState: "offline_contract_only",
        provisioningState: "not_started",
        capabilityVerificationState: "not_verified",
        connectionState: "disabled",
      });
      expect(connector.intendedOperationKinds).toEqual(carRentalAdapterOperationKinds);
    }
  });

  it("starts every local review gate incomplete and every external authority disabled", () => {
    expect(buildCarRentalNamedConnectorPlan()).toMatchObject({
      mode: "named_connectors_offline_only",
      completedCount: 0,
      totalCount: 7,
      localReviewComplete: false,
      provisionedConnectorCount: 0,
      connectedConnectorCount: 0,
      externalRequestCount: 0,
      supplierContactAuthorized: false,
      providerSelected: false,
      providerMappingCreated: false,
      accountCreationAuthorized: false,
      credentialRequestAuthorized: false,
      credentialAcceptanceAuthorized: false,
      credentialMaterialPresent: false,
      capabilityVerified: false,
      sandboxConnectionAuthorized: false,
      externalTrafficAuthorized: false,
      webhookReceiverAuthorized: false,
      reservationMutationAuthorized: false,
      refundExecutionAuthorized: false,
      paymentAuthorized: false,
      productionAuthorized: false,
    });
  });

  it("never converts a completed local review into provider or transaction authority", () => {
    const allEvidence = Object.fromEntries(carRentalNamedConnectorGates.map((gate) => [gate.id, true]));
    const plan = buildCarRentalNamedConnectorPlan(allEvidence);

    expect(plan.localReviewComplete).toBe(true);
    expect(plan.completedCount).toBe(plan.totalCount);
    expect(plan.providerSelected).toBe(false);
    expect(plan.accountCreationAuthorized).toBe(false);
    expect(plan.credentialAcceptanceAuthorized).toBe(false);
    expect(plan.sandboxConnectionAuthorized).toBe(false);
    expect(plan.externalTrafficAuthorized).toBe(false);
    expect(plan.reservationMutationAuthorized).toBe(false);
    expect(plan.paymentAuthorized).toBe(false);
    expect(plan.productionAuthorized).toBe(false);
  });

  it("accepts one sanitized offline fixture per connector", () => {
    expect(carRentalNamedConnectorFixtures).toHaveLength(3);

    for (const fixture of carRentalNamedConnectorFixtures) {
      expect(validateCarRentalNamedConnectorRecord(fixture)).toMatchObject({
        valid: true,
        connectorPrepared: true,
        connectorEnabled: false,
        capabilityVerified: false,
        providerAccountPresent: false,
        externalTrafficAuthorized: false,
        reservationMutationAuthorized: false,
        paymentAuthorized: false,
        productionAuthorized: false,
        errors: [],
      });
    }
  });

  it("fails closed for every connector and every intended operation", () => {
    for (const connector of carRentalNamedConnectorDefinitions) {
      for (const operationKind of carRentalAdapterOperationKinds) {
        expect(runCarRentalNamedConnectorOperation(connector.id, operationKind)).toMatchObject({
          ok: false,
          code: "connector_disabled",
          connectorId: connector.id,
          operationKind,
          externalRequestSent: false,
          reservationChanged: false,
          paymentMoved: false,
        });
      }
    }
  });

  it("rejects released kill switches, malformed evidence, excess fields, and prohibited data", () => {
    const invalid = cloneRecord(carRentalNamedConnectorFixtures[0]);
    invalid.connectorCaseId = "bad";
    invalid.evidenceDigest = "ABC";
    invalid.applicationKillSwitchState = "released";
    invalid.databaseKillSwitchState = "released";
    invalid.recordedFields = [...carRentalConnectorRecordedFields, "api_key", "api_key"];
    invalid.prohibitedDataDetected = true;

    expect(validateCarRentalNamedConnectorRecord(invalid).errors).toEqual(expect.arrayContaining([
      "Connector-case ID must be a stable opaque token.",
      "Connector evidence must be a lowercase 64-character digest.",
      "Application traffic kill switch must remain engaged.",
      "Database traffic kill switch must remain engaged.",
      "Recorded-field inventory cannot contain duplicates.",
      "Recorded-field inventory contains unsupported or prohibited fields.",
      "Recorded-field inventory must exactly match the minimized connector allowlist.",
      "Endpoint, credential, contract, payload, identity, payment, location, or live-reference data blocks connector readiness.",
    ]));
    expect(carRentalConnectorProhibitedFields).toContain("api_key");
    expect(carRentalConnectorRecordedFields).not.toContain("api_key");
  });

  it("keeps the administrator workspace read-only, network-free, and explicit about connector state", () => {
    const page = read("app/admin/cars/page.tsx");
    const connectorDocument = read("docs/CAR_RENTALS_PROVIDER_CONNECTORS.md");
    const roadmap = read("docs/CAR_RENTALS_ROADMAP.md");

    expect(page).toContain("Sabre, Travelport, and aggregator connectors");
    expect(page).toContain("{namedConnectors.provisionedConnectorCount} of {namedConnectors.connectors.length} provisioned");
    expect(page).toContain("disabled local software contracts");
    expect(page).not.toMatch(/fetch\(|createClient\(|<form|<button|use server|use client/);
    expect(connectorDocument).toContain("No aggregator company is contracted or runtime-bound");
    expect(connectorDocument).toContain("no endpoints or credentials");
    expect(roadmap).toContain("Current live commercial-activation completion: **0 of 4 external activation gate groups**");
    expect(roadmap).toContain("Disabled local connector shells now exist for Sabre, Travelport, and one generic unselected aggregator path");
  });
});

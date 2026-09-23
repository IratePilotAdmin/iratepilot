import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { flightBookingConnectorIds } from "../lib/flights/booking-connectors";
import { buildFlightRolloutContractAuthority } from "../lib/flights/rollout-contract-authority";
import { buildFlightRolloutContractEvidenceIntake } from "../lib/flights/rollout-contract-evidence-intake";
import { buildFlightRolloutSandboxCredentialReadiness } from "../lib/flights/rollout-sandbox-credential-readiness";
import { buildFlightRolloutSandboxCertification } from "../lib/flights/rollout-sandbox-certification";
import { buildFlightRolloutPaymentSettlementReadiness } from "../lib/flights/rollout-payment-settlement-readiness";
import { buildFlightRolloutSecurityPrivacyReadiness } from "../lib/flights/rollout-security-privacy-readiness";
import { buildFlightRolloutSupportReleaseReadiness } from "../lib/flights/rollout-support-release-readiness";
import { buildFlightRolloutPreviewReleaseReadiness } from "../lib/flights/rollout-preview-release-readiness";
import { buildFlightRolloutProductionReleaseReadiness } from "../lib/flights/rollout-production-release-readiness";
import { buildFlightRolloutConsumerLaunchActivation } from "../lib/flights/rollout-consumer-launch-activation";

type Manifest = {
  evidence: {
    candidateCatalog: {
      totalConnectors: number;
      activationGates: { complete: number; total: number };
      diligenceWorkstreams: { complete: number; total: number };
      credentialGates: { complete: number; total: number };
      sandboxGates: { complete: number; total: number };
      routingGates: { complete: number; total: number };
      externalNetworkAccess: boolean;
      liveConnectorCount: number;
      connectors: string[];
    };
    routeDecision: {
      primary: string;
      secondary: string;
      alternativeCatalogEntries: string[];
      operationalRouteEnabled: boolean;
      bookingAuthorized: boolean;
      ticketingAuthorized: boolean;
      paymentAuthorized: boolean;
      productionTrafficAuthorized: boolean;
    };
    routePackets: Array<{
      connector: string;
      role: string;
      [key: string]: unknown;
    }>;
  };
};

const manifest = JSON.parse(readFileSync(new URL(
  "../docs/evidence/FLIGHT_CONNECTOR_ROUTE_PACKET_MANIFEST_2026-09-23.json",
  import.meta.url,
), "utf8")) as Manifest;

describe("flight connector route-packet manifest", () => {
  it("covers the complete catalog without enabling any connector", () => {
    const catalog = manifest.evidence.candidateCatalog;
    expect(catalog.totalConnectors).toBe(flightBookingConnectorIds.length);
    expect(catalog.connectors).toEqual([...flightBookingConnectorIds]);
    expect(catalog.activationGates).toEqual({ complete: 0, total: 10 });
    expect(catalog.diligenceWorkstreams).toEqual({ complete: 0, total: 7 });
    expect(catalog.credentialGates).toEqual({ complete: 0, total: 5 });
    expect(catalog.sandboxGates).toEqual({ complete: 0, total: 6 });
    expect(catalog.routingGates).toEqual({ complete: 0, total: 6 });
    expect(catalog.externalNetworkAccess).toBe(false);
    expect(catalog.liveConnectorCount).toBe(0);
  });

  it("matches every selected route packet's current fail-closed builder state", () => {
    const packets = manifest.evidence.routePackets;
    expect(packets.map(({ connector }) => connector)).toEqual(["duffel", "sabre"]);
    expect(packets.map(({ role }) => role)).toEqual(["primary", "secondary"]);

    const authority = buildFlightRolloutContractAuthority();
    const evidence = buildFlightRolloutContractEvidenceIntake();
    const credentials = buildFlightRolloutSandboxCredentialReadiness();
    const certification = buildFlightRolloutSandboxCertification();
    const payment = buildFlightRolloutPaymentSettlementReadiness();
    const security = buildFlightRolloutSecurityPrivacyReadiness();
    const support = buildFlightRolloutSupportReleaseReadiness();
    const preview = buildFlightRolloutPreviewReleaseReadiness();
    const production = buildFlightRolloutProductionReleaseReadiness();
    const activation = buildFlightRolloutConsumerLaunchActivation();

    const expected = [
      ["contractAuthority", authority.records],
      ["contractEvidence", evidence.records],
      ["sandboxCredentials", credentials.records],
      ["sandboxCertification", certification.records],
      ["paymentSettlement", payment.records],
      ["securityPrivacy", security.records],
      ["supportRelease", support.records],
      ["previewRelease", preview.records],
      ["productionRelease", production.records],
      ["consumerActivation", activation.records],
    ] as const;

    for (const [key, records] of expected) {
      for (const [index, record] of records.entries()) {
        const packet = packets[index]!;
        const gate = packet[key] as { complete: number; total: number; state: string };
        expect(gate.complete, `${packet.connector}.${key}.complete`).toBe(record.completedCount);
        expect(gate.total, `${packet.connector}.${key}.total`).toBe(record.totalCount);
        expect(record.completedCount).toBe(0);
        expect(record.externalNetworkAccess).toBe(false);
      }
    }
  });

  it("keeps the route decision and consumer authority closed", () => {
    const decision = manifest.evidence.routeDecision;
    expect(decision.primary).toBe("duffel");
    expect(decision.secondary).toBe("sabre");
    expect(decision.alternativeCatalogEntries).toEqual([
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
    expect(decision.operationalRouteEnabled).toBe(false);
    expect(decision.bookingAuthorized).toBe(false);
    expect(decision.ticketingAuthorized).toBe(false);
    expect(decision.paymentAuthorized).toBe(false);
    expect(decision.productionTrafficAuthorized).toBe(false);
  });
});

import {
  flightBookingConnectorDefinitions,
  type FlightBookingConnectorId,
} from "./booking-connectors";

export const FLIGHT_CONNECTOR_PUBLIC_EVIDENCE_MODE = "official_public_research_only" as const;

export type FlightConnectorPublicEvidenceRecord = Readonly<{
  connectorId: FlightBookingConnectorId;
  label: string;
  evidenceState: "public_research_recorded";
  sourceUrls: readonly string[];
  findings: readonly string[];
  providerVerified: false;
  contractVerified: false;
  credentialsConfigured: false;
  externalNetworkAccess: false;
}>;

const publicEvidenceById: Readonly<Record<FlightBookingConnectorId, Omit<FlightConnectorPublicEvidenceRecord, "connectorId" | "label">>> = {
  sabre: {
    evidenceState: "public_research_recorded",
    sourceUrls: ["https://developer.sabre.com/sites/default/files/2024-04/Sabre%20Offers%20and%20Orders%20APIs%20user%20guide%20v1.6.pdf"],
    findings: ["Public Offers and Orders material describes REST/JSON shopping and order workflows.", "The guide requires valid Sabre credentials and account-manager provisioning; it does not establish iRatePilot entitlement."],
    providerVerified: false,
    contractVerified: false,
    credentialsConfigured: false,
    externalNetworkAccess: false,
  },
  amadeus: {
    evidenceState: "public_research_recorded",
    sourceUrls: ["https://developers.amadeus.com/self-service/apis-docs/guides/developer-guides/faq/", "https://developers.amadeus.com/self-service/apis-docs/guides/developer-guides/"],
    findings: ["Public Self-Service documentation describes flight shopping and Flight Create Orders APIs.", "Production ticket issuance and post-ticket servicing depend on a consolidator arrangement; iRatePilot access remains unverified."],
    providerVerified: false,
    contractVerified: false,
    credentialsConfigured: false,
    externalNetworkAccess: false,
  },
  travelport: {
    evidenceState: "public_research_recorded",
    sourceUrls: ["https://support.travelport.com/webhelp/JSONAPIs/Content/Home.htm", "https://support.travelport.com/webhelp/jsonapis/airv11/content/air11/APIReferences.htm"],
    findings: ["TripServices documentation describes search, pricing, booking, ticketing, exchanges, refunds, and servicing resources.", "The public API requires provisioning and OAuth credentials; iRatePilot access, content, and settlement terms remain unverified."],
    providerVerified: false,
    contractVerified: false,
    credentialsConfigured: false,
    externalNetworkAccess: false,
  },
  worldspan: {
    evidenceState: "public_research_recorded",
    sourceUrls: ["https://support.travelport.com/webhelp/uapi/Content/Getting_Started/Before_You_Begin/Content_Providers_and_Suppliers.htm"],
    findings: ["Travelport public material lists Worldspan as a provider/host and notes that supported functionality varies by provider.", "This is a host-brand research record, not a separate Worldspan contract or entitlement."],
    providerVerified: false,
    contractVerified: false,
    credentialsConfigured: false,
    externalNetworkAccess: false,
  },
  abacus: {
    evidenceState: "public_research_recorded",
    sourceUrls: ["https://investors.sabre.com/static-files/efcf284c-ac43-4eb0-a528-43cc4dd9e48c"],
    findings: ["Sabre public corporate material describes Abacus as a regional Sabre Travel Network operation using Sabre technology.", "The historical host relationship does not establish current product access, contract, coverage, or entitlement for iRatePilot."],
    providerVerified: false,
    contractVerified: false,
    credentialsConfigured: false,
    externalNetworkAccess: false,
  },
  galileo: {
    evidenceState: "public_research_recorded",
    sourceUrls: ["https://support.travelport.com/webhelp/uapi/Content/Getting_Started/Before_You_Begin/Content_Providers_and_Suppliers.htm"],
    findings: ["Travelport public material lists Galileo as a provider/host and documents air shopping and booking workflows.", "This is a host-brand research record, not a separate Galileo contract or entitlement."],
    providerVerified: false,
    contractVerified: false,
    credentialsConfigured: false,
    externalNetworkAccess: false,
  },
  airgateway: {
    evidenceState: "public_research_recorded",
    sourceUrls: ["https://support.airgateway.com/en-US/kb/article/4/introduction-to-airgateway-platform-api"],
    findings: ["AirGateway publicly describes one platform API aggregating NDC, EDIFACT, and LCC content.", "Its public material distinguishes sandbox and live environments and requires certification before live access; no iRatePilot access exists."],
    providerVerified: false,
    contractVerified: false,
    credentialsConfigured: false,
    externalNetworkAccess: false,
  },
  verteil: {
    evidenceState: "public_research_recorded",
    sourceUrls: ["https://www.verteil.com/technology-partner-program"],
    findings: ["Verteil publicly describes a Technology Partner Program with a single API for NDC-enabled airline content and booking lifecycle workflows.", "The program requires partner onboarding and certification; airline coverage and iRatePilot access remain unverified."],
    providerVerified: false,
    contractVerified: false,
    credentialsConfigured: false,
    externalNetworkAccess: false,
  },
  travelfusion: {
    evidenceState: "public_research_recorded",
    sourceUrls: ["https://corporate.travelfusion.com/products-services/tf-new-distribution-capability", "https://www.travelfusion.com/corporate/uploads/Travelfusion%20Airline%20NDC%20API_Brochure_low-res.pdf"],
    findings: ["TravelFusion publicly describes tfNDC airline distribution, booking, and post-ticket servicing for FSC and LCC content.", "Its public material describes carrier coverage and registration/support paths; no iRatePilot contract or entitlement exists."],
    providerVerified: false,
    contractVerified: false,
    credentialsConfigured: false,
    externalNetworkAccess: false,
  },
};

export const flightConnectorPublicEvidenceRecords: readonly FlightConnectorPublicEvidenceRecord[] = Object.freeze(
  flightBookingConnectorDefinitions.map((connector) => Object.freeze({
    connectorId: connector.id,
    label: connector.label,
    ...publicEvidenceById[connector.id],
  })),
);

export function getFlightConnectorPublicEvidence(
  connectorId: FlightBookingConnectorId,
): FlightConnectorPublicEvidenceRecord {
  const record = flightConnectorPublicEvidenceRecords.find((candidate) => candidate.connectorId === connectorId);
  if (!record) throw new Error(`No public evidence record for flight connector: ${connectorId}`);
  return record;
}

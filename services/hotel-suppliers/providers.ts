import type { PmsProviderId, PmsProviderManifest } from "./types";

const fullReservationCapabilities = [
  "availability",
  "rates",
  "inventory",
  "reservations",
  "cancellations",
  "webhooks",
] as const;

const standardConfiguration = ["BASE_URL", "CLIENT_ID", "CLIENT_SECRET"] as const;

export const pmsProviders: readonly PmsProviderManifest[] = [
  {
    id: "oracle-opera",
    name: "Oracle OPERA / OPERA Cloud",
    vendor: "Oracle Hospitality",
    accessModel: "public_partner_platform",
    capabilities: fullReservationCapabilities,
    certificationRequired: true,
    environmentPrefix: "PMS_ORACLE_OPERA",
    requiredConfiguration: [...standardConfiguration, "APP_KEY"],
    documentationUrl: "https://docs.oracle.com/en/industries/hospitality/integration-platform/",
    notes: "Use Oracle Hospitality Integration Platform (OHIP) credentials issued for each approved environment and hotel chain/property scope.",
  },
  {
    id: "hilton-pep",
    name: "Hilton PEP",
    vendor: "Hilton",
    accessModel: "brand_certification",
    capabilities: fullReservationCapabilities,
    certificationRequired: true,
    environmentPrefix: "PMS_HILTON_PEP",
    requiredConfiguration: standardConfiguration,
    notes: "Connectivity is brand-controlled. Activate only after Hilton approves the integration and supplies endpoint, property, and credential details.",
  },
  {
    id: "hilton-onq",
    name: "Hilton OnQ",
    vendor: "Hilton",
    accessModel: "brand_certification",
    capabilities: fullReservationCapabilities,
    certificationRequired: true,
    environmentPrefix: "PMS_HILTON_ONQ",
    requiredConfiguration: standardConfiguration,
    notes: "Legacy OnQ connectivity is property- and brand-controlled and may require a Hilton-approved connectivity intermediary.",
  },
  {
    id: "marriott-fosse",
    name: "FOSSE",
    vendor: "Marriott International",
    accessModel: "brand_certification",
    capabilities: fullReservationCapabilities,
    certificationRequired: true,
    environmentPrefix: "PMS_MARRIOTT_FOSSE",
    requiredConfiguration: standardConfiguration,
    notes: "FOSSE connectivity requires Marriott approval and an issued integration specification or certified connectivity partner.",
  },
  {
    id: "marriott-fs-pms",
    name: "FS-PMS",
    vendor: "Marriott International",
    accessModel: "brand_certification",
    capabilities: fullReservationCapabilities,
    certificationRequired: true,
    environmentPrefix: "PMS_MARRIOTT_FS_PMS",
    requiredConfiguration: standardConfiguration,
    notes: "FS-PMS connectivity requires Marriott approval and property-level authorization before reservation traffic is enabled.",
  },
  {
    id: "hotelkey",
    name: "HotelKey",
    vendor: "HotelKey",
    accessModel: "vendor_partnership",
    capabilities: fullReservationCapabilities,
    certificationRequired: true,
    environmentPrefix: "PMS_HOTELKEY",
    requiredConfiguration: standardConfiguration,
    documentationUrl: "https://www.hotelkeyapp.com/",
    notes: "Activate after HotelKey approves the partnership and supplies production API documentation, credentials, and property mappings.",
  },
] as const;

export function getPmsProvider(providerId: PmsProviderId) {
  return pmsProviders.find((provider) => provider.id === providerId);
}

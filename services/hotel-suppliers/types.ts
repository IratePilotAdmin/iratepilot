export type PmsProviderId =
  | "oracle-opera"
  | "hilton-pep"
  | "hilton-onq"
  | "marriott-fosse"
  | "marriott-fs-pms"
  | "hotelkey"
  | "oracle-opera-5"
  | "infor-hms"
  | "agilysys-pms"
  | "planet-protel"
  | "mews"
  | "stayntouch"
  | "cloudbeds"
  | "sihot"
  | "rms-cloud"
  | "maestro-pms"
  | "apaleo"
  | "shiji-pms"
  | "guestline"
  | "ezee-absolute"
  | "clock-pms-plus"
  | "hotelogix";

export type PmsCapability =
  | "availability"
  | "rates"
  | "inventory"
  | "reservations"
  | "cancellations"
  | "webhooks";

export type PmsAccessModel =
  | "public_partner_platform"
  | "brand_certification"
  | "vendor_partnership";

export type PmsConnectionStatus =
  | "not_configured"
  | "credentials_required"
  | "invalid_configuration"
  | "ready_for_validation";

export type SupplierHotel = {
  id: string;
  name: string;
  currency: string;
};

export type PmsProviderManifest = {
  id: PmsProviderId;
  name: string;
  vendor: string;
  accessModel: PmsAccessModel;
  capabilities: readonly PmsCapability[];
  certificationRequired: boolean;
  environmentPrefix: string;
  requiredConfiguration: readonly string[];
  documentationUrl?: string;
  notes: string;
};

export type PmsProviderReadiness = {
  id: PmsProviderId;
  name: string;
  vendor: string;
  status: PmsConnectionStatus;
  capabilities: readonly PmsCapability[];
  certificationRequired: boolean;
  missingConfiguration: string[];
  invalidConfiguration: string[];
  documentationUrl?: string;
  notes: string;
};

export interface HotelSupplier {
  search(input: unknown): Promise<SupplierHotel[]>;
  book(input: unknown): Promise<unknown>;
  cancel(id: string): Promise<unknown>;
}

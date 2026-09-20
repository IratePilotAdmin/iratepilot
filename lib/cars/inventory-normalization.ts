import { carVehicleClasses, type CarVehicleClass } from "./search";

export const CAR_RENTAL_INVENTORY_NORMALIZATION_MODE = "contract_only" as const;

export const carRentalLocationKinds = ["airport", "neighborhood", "rail", "hotel", "other"] as const;
export const carRentalOperatingDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export const carRentalServiceStates = ["open", "closed", "unknown"] as const;
export const carRentalTransmissions = ["automatic", "manual", "unspecified"] as const;
export const carRentalPowertrains = ["combustion", "hybrid", "plug_in_hybrid", "electric", "unspecified"] as const;
export const carRentalAccessibilityStates = ["confirmed", "unavailable", "unknown"] as const;
export const carRentalAccessibilityFeatures = ["hand_controls", "wheelchair_accessible_vehicle", "swivel_seat", "transfer_board"] as const;
export const carRentalVehicleFeatures = ["air_conditioning", "four_wheel_drive", "gps_navigation", "child_seat_compatible", "snow_equipment_compatible", "toll_transponder_compatible"] as const;

export type CarRentalLocationKind = (typeof carRentalLocationKinds)[number];
export type CarRentalOperatingDay = (typeof carRentalOperatingDays)[number];
export type CarRentalServiceState = (typeof carRentalServiceStates)[number];
export type CarRentalTransmission = (typeof carRentalTransmissions)[number];
export type CarRentalPowertrain = (typeof carRentalPowertrains)[number];
export type CarRentalAccessibilityState = (typeof carRentalAccessibilityStates)[number];
export type CarRentalAccessibilityFeature = (typeof carRentalAccessibilityFeatures)[number];
export type CarRentalVehicleFeature = (typeof carRentalVehicleFeatures)[number];

export type CarRentalInventoryContract = {
  id: "location" | "opening_hours" | "vehicle_class" | "capacity" | "transmission" | "powertrain" | "accessibility" | "features";
  label: string;
  requiredFields: readonly string[];
  normalizationRule: string;
  safetyBoundary: string;
};

export const carRentalInventoryContracts: readonly CarRentalInventoryContract[] = [
  {
    id: "location",
    label: "Location identity",
    requiredFields: ["Stable source ID", "Display name", "Location kind", "ISO country code", "IANA time zone"],
    normalizationRule: "Retain the source identity while mapping the pickup point to a controlled location kind and explicit geography.",
    safetyBoundary: "A normalized location is not proof that inventory can be collected or returned there.",
  },
  {
    id: "opening_hours",
    label: "Opening hours and access",
    requiredFields: ["Day", "Service state", "Local open time", "Local close time", "Pickup instructions"],
    normalizationRule: "Store all seven local operating days and preserve closed or unknown states instead of inventing hours.",
    safetyBoundary: "Hours and access instructions require a fresh supplier confirmation before a reservation can be offered.",
  },
  {
    id: "vehicle_class",
    label: "Vehicle-class equivalency",
    requiredFields: ["Source class code", "Canonical class", "Mapping evidence"],
    normalizationRule: "Map source codes to the existing consumer taxonomy without treating a class as a guaranteed make, model, or powertrain.",
    safetyBoundary: "Class equivalency never guarantees a specific vehicle, brand, model, trim, or upgrade.",
  },
  {
    id: "capacity",
    label: "Passenger and luggage capacity",
    requiredFields: ["Passenger capacity", "Luggage capacity", "Capacity evidence"],
    normalizationRule: "Keep passenger and luggage capacity as separate non-negative whole-number fields.",
    safetyBoundary: "Capacity values are planning attributes and cannot replace supplier confirmation or traveler judgment.",
  },
  {
    id: "transmission",
    label: "Transmission",
    requiredFields: ["Controlled transmission value", "Source value"],
    normalizationRule: "Map only to automatic, manual, or unspecified; never infer a transmission from vehicle class.",
    safetyBoundary: "Unmapped or ambiguous source values remain unspecified and cannot be presented as confirmed.",
  },
  {
    id: "powertrain",
    label: "Fuel or powertrain",
    requiredFields: ["Controlled powertrain value", "Source value"],
    normalizationRule: "Map fuel and energy descriptions to combustion, hybrid, plug-in hybrid, electric, or unspecified.",
    safetyBoundary: "The consumer electric class and a confirmed electric powertrain are distinct facts and require separate evidence.",
  },
  {
    id: "accessibility",
    label: "Accessibility",
    requiredFields: ["Availability state", "Controlled accessibility features", "Confirmation source"],
    normalizationRule: "Represent accessibility as confirmed, unavailable, or unknown and retain only allowlisted feature terms.",
    safetyBoundary: "Unknown is never converted to unavailable or confirmed, and accessibility cannot be guaranteed without supplier confirmation.",
  },
  {
    id: "features",
    label: "Vehicle features",
    requiredFields: ["Controlled feature values", "Source feature values"],
    normalizationRule: "Map only reviewed source terms to the controlled feature vocabulary and remove duplicates.",
    safetyBoundary: "A class-level feature is descriptive only until it is confirmed for the supplied vehicle.",
  },
];

export type CarRentalNormalizationGate = {
  id:
    | "contract_approved"
    | "location_mapping_reviewed"
    | "hours_mapping_reviewed"
    | "class_mapping_reviewed"
    | "capacity_mapping_reviewed"
    | "vehicle_attributes_reviewed"
    | "accessibility_mapping_reviewed"
    | "feature_mapping_reviewed"
    | "fixtures_and_rejections_approved"
    | "inventory_ingest_authorized";
  label: string;
  owner: string;
  detail: string;
};

export const carRentalNormalizationGates: readonly CarRentalNormalizationGate[] = [
  { id: "contract_approved", label: "Canonical contract approved", owner: "Engineering + Product", detail: "Approve field definitions, controlled vocabularies, unknown states, and versioning before any provider mapping." },
  { id: "location_mapping_reviewed", label: "Location mapping reviewed", owner: "Engineering + Operations", detail: "Validate stable identity, geography, location kind, time zone, and pickup instructions against sanitized fixtures." },
  { id: "hours_mapping_reviewed", label: "Opening-hours mapping reviewed", owner: "Engineering + Operations", detail: "Validate all seven local days plus explicit open, closed, and unknown states without inferring missing hours." },
  { id: "class_mapping_reviewed", label: "Vehicle-class mapping reviewed", owner: "Product + Operations", detail: "Approve source-to-canonical class evidence while preserving the no-make-or-model-guarantee boundary." },
  { id: "capacity_mapping_reviewed", label: "Capacity mapping reviewed", owner: "Product + Operations", detail: "Validate passenger and luggage values separately and reject invalid or ambiguous capacity data." },
  { id: "vehicle_attributes_reviewed", label: "Transmission and powertrain reviewed", owner: "Engineering + Product", detail: "Approve controlled mappings and preserve unspecified values when source facts are incomplete." },
  { id: "accessibility_mapping_reviewed", label: "Accessibility mapping reviewed", owner: "Accessibility + Legal", detail: "Approve confirmation states, allowlisted features, wording, and the required supplier-confirmation boundary." },
  { id: "feature_mapping_reviewed", label: "Feature mapping reviewed", owner: "Product + Operations", detail: "Approve allowlisted terms, duplicate handling, and class-level versus vehicle-level disclosure rules." },
  { id: "fixtures_and_rejections_approved", label: "Fixtures and rejection behavior approved", owner: "Engineering + Security", detail: "Record valid, incomplete, conflicting, duplicate, and malformed fixture results without storing provider credentials or personal data." },
  { id: "inventory_ingest_authorized", label: "Inventory ingest separately authorized", owner: "Release approvers", detail: "Require a separate approval after supplier rights, credentials, sandbox isolation, and monitoring are independently complete." },
];

export type CarRentalNormalizationEvidence = Partial<Record<CarRentalNormalizationGate["id"], boolean>>;

export function buildCarRentalInventoryNormalizationPlan(evidence: CarRentalNormalizationEvidence = {}) {
  const gates = carRentalNormalizationGates.map((gate) => ({ ...gate, complete: evidence[gate.id] === true }));
  const completedCount = gates.filter((gate) => gate.complete).length;

  return {
    mode: CAR_RENTAL_INVENTORY_NORMALIZATION_MODE,
    gates,
    completedCount,
    totalCount: gates.length,
    contractReviewComplete: completedCount === gates.length,
    supplierDataIngested: false,
    providerMappingCreated: false,
    liveInventoryAvailable: false,
    credentialAcceptanceAuthorized: false,
    sandboxTrafficAuthorized: false,
    productionTrafficAuthorized: false,
    reservationAuthorized: false,
    paymentAuthorized: false,
  } as const;
}

export type CarRentalOpeningHours = {
  day: CarRentalOperatingDay;
  state: CarRentalServiceState;
  opensAt?: string;
  closesAt?: string;
};

export type CarRentalCanonicalInventoryRecord = {
  location: {
    sourceId: string;
    name: string;
    kind: CarRentalLocationKind;
    countryCode: string;
    timeZone: string;
    pickupInstructions: string;
    openingHours: readonly CarRentalOpeningHours[];
  };
  vehicle: {
    sourceClassCode: string;
    canonicalClass: CarVehicleClass;
    passengerCapacity: number;
    luggageCapacity: number;
    transmission: CarRentalTransmission;
    powertrain: CarRentalPowertrain;
    accessibilityState: CarRentalAccessibilityState;
    accessibilityFeatures: readonly CarRentalAccessibilityFeature[];
    features: readonly CarRentalVehicleFeature[];
  };
};

const localTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function hasDuplicates(values: readonly string[]) {
  return new Set(values).size !== values.length;
}

function isSupportedTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function validateCarRentalInventoryRecord(record: CarRentalCanonicalInventoryRecord) {
  const errors: string[] = [];
  const { location, vehicle } = record;

  if (!location.sourceId.trim()) errors.push("Location source ID is required.");
  if (!location.name.trim()) errors.push("Location name is required.");
  if (!carRentalLocationKinds.includes(location.kind)) errors.push("Location kind is not supported.");
  if (!/^[A-Z]{2}$/.test(location.countryCode)) errors.push("Country code must be a two-letter uppercase ISO code.");
  if (!isSupportedTimeZone(location.timeZone)) errors.push("Time zone must be a supported IANA time zone.");
  if (!location.pickupInstructions.trim()) errors.push("Pickup instructions are required.");

  const days = location.openingHours.map((entry) => entry.day);
  if (location.openingHours.length !== carRentalOperatingDays.length || hasDuplicates(days) || carRentalOperatingDays.some((day) => !days.includes(day))) {
    errors.push("Opening hours must contain each operating day exactly once.");
  }
  location.openingHours.forEach((entry) => {
    if (!carRentalOperatingDays.includes(entry.day)) errors.push("Opening-hours day is not supported.");
    if (!carRentalServiceStates.includes(entry.state)) errors.push(`Service state for ${entry.day} is not supported.`);
    if (entry.state === "open" && (!entry.opensAt || !entry.closesAt || !localTimePattern.test(entry.opensAt) || !localTimePattern.test(entry.closesAt) || entry.opensAt === entry.closesAt)) {
      errors.push(`Open hours for ${entry.day} require distinct valid local opening and closing times.`);
    }
    if (entry.state !== "open" && (entry.opensAt || entry.closesAt)) errors.push(`${entry.day} cannot include times unless its service state is open.`);
  });

  if (!vehicle.sourceClassCode.trim()) errors.push("Vehicle source class code is required.");
  if (!carVehicleClasses.includes(vehicle.canonicalClass)) errors.push("Canonical vehicle class is not supported.");
  if (!Number.isInteger(vehicle.passengerCapacity) || vehicle.passengerCapacity < 1) errors.push("Passenger capacity must be a positive whole number.");
  if (!Number.isInteger(vehicle.luggageCapacity) || vehicle.luggageCapacity < 0) errors.push("Luggage capacity must be a non-negative whole number.");
  if (!carRentalTransmissions.includes(vehicle.transmission)) errors.push("Transmission is not supported.");
  if (!carRentalPowertrains.includes(vehicle.powertrain)) errors.push("Powertrain is not supported.");
  if (!carRentalAccessibilityStates.includes(vehicle.accessibilityState)) errors.push("Accessibility state is not supported.");
  if (vehicle.accessibilityFeatures.some((feature) => !carRentalAccessibilityFeatures.includes(feature))) errors.push("Accessibility features contain an unsupported value.");
  if (vehicle.features.some((feature) => !carRentalVehicleFeatures.includes(feature))) errors.push("Vehicle features contain an unsupported value.");
  if (hasDuplicates(vehicle.accessibilityFeatures)) errors.push("Accessibility features cannot contain duplicates.");
  if (hasDuplicates(vehicle.features)) errors.push("Vehicle features cannot contain duplicates.");
  if (vehicle.accessibilityState !== "confirmed" && vehicle.accessibilityFeatures.length > 0) errors.push("Accessibility features require a confirmed accessibility state.");

  return { valid: errors.length === 0, errors } as const;
}

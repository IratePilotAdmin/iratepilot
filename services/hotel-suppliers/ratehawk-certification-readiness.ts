export const ratehawkCertificationHotelIds = [10004834, 8819557] as const;

export type RatehawkCertificationEvidence = {
  mappedHotelIds?: readonly number[];
  contentImplemented?: boolean;
  searchValidated?: boolean;
  hotelpageImplemented?: boolean;
  prebookValidated?: boolean;
  bookingFormValidated?: boolean;
  bookingFinishValidated?: boolean;
  finalStatusValidated?: boolean;
  cancellationValidated?: boolean;
  checklistSubmitted?: boolean;
  certificationApproved?: boolean;
  productionSmokeValidated?: boolean;
  liveEnabled?: boolean;
};

export type RatehawkLaunchGate =
  | "sandbox_credentials"
  | "certification_hotel_mapping"
  | "content"
  | "search"
  | "hotelpage"
  | "prebook"
  | "booking_form"
  | "booking_finish"
  | "final_status"
  | "cancellation"
  | "checklist"
  | "certification_approval"
  | "production_credentials"
  | "production_smoke"
  | "live_activation"
  | "live";

type Environment = Record<string, string | undefined>;

function configured(environment: Environment, key: string, minimumLength: number) {
  const value = environment[key]?.trim() ?? "";
  return value.length >= minimumLength
    && !/^(?:changeme|example|placeholder|todo|unknown)$/i.test(value);
}

export function evaluateRatehawkCertificationReadiness(
  environment: Environment,
  evidence: RatehawkCertificationEvidence = {},
) {
  const sandboxCredentialsReady = configured(environment, "HOTEL_INVENTORY_RATEHAWK_KEY_ID", 3)
    && configured(environment, "HOTEL_INVENTORY_RATEHAWK_API_KEY", 8)
    && environment.HOTEL_INVENTORY_RATEHAWK_SANDBOX_ENABLED?.trim().toLowerCase() === "true";
  const mapped = new Set(evidence.mappedHotelIds ?? []);
  const certificationHotelsMapped = ratehawkCertificationHotelIds.every((id) => mapped.has(id));
  const sandboxKeyId = environment.HOTEL_INVENTORY_RATEHAWK_KEY_ID?.trim() ?? "";
  const sandboxApiKey = environment.HOTEL_INVENTORY_RATEHAWK_API_KEY?.trim() ?? "";
  const productionKeyId = environment.HOTEL_INVENTORY_RATEHAWK_PRODUCTION_KEY_ID?.trim() ?? "";
  const productionApiKey = environment.HOTEL_INVENTORY_RATEHAWK_PRODUCTION_API_KEY?.trim() ?? "";
  const productionCredentialsReady = configured(
    environment,
    "HOTEL_INVENTORY_RATEHAWK_PRODUCTION_KEY_ID",
    3,
  ) && configured(environment, "HOTEL_INVENTORY_RATEHAWK_PRODUCTION_API_KEY", 8)
    && (productionKeyId !== sandboxKeyId || productionApiKey !== sandboxApiKey);

  const orderedGates: readonly [RatehawkLaunchGate, boolean][] = [
    ["sandbox_credentials", sandboxCredentialsReady],
    ["certification_hotel_mapping", certificationHotelsMapped],
    ["content", evidence.contentImplemented === true],
    ["search", evidence.searchValidated === true],
    ["hotelpage", evidence.hotelpageImplemented === true],
    ["prebook", evidence.prebookValidated === true],
    ["booking_form", evidence.bookingFormValidated === true],
    ["booking_finish", evidence.bookingFinishValidated === true],
    ["final_status", evidence.finalStatusValidated === true],
    ["cancellation", evidence.cancellationValidated === true],
    ["checklist", evidence.checklistSubmitted === true],
    ["certification_approval", evidence.certificationApproved === true],
    ["production_credentials", productionCredentialsReady],
    ["production_smoke", evidence.productionSmokeValidated === true],
    ["live_activation", evidence.liveEnabled === true],
  ];
  const nextGate = orderedGates.find(([, passed]) => !passed)?.[0] ?? "live";

  return {
    nextGate,
    readyForLiveBooking: nextGate === "live",
    sandboxCredentialsReady,
    certificationHotelsMapped,
    productionCredentialsReady,
    gates: Object.fromEntries(orderedGates),
  };
}

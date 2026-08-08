import type { PmsProviderId } from "../types";

export const standardPmsProviderIds = [
  "oracle-opera-5",
  "infor-hms",
  "agilysys-pms",
  "planet-protel",
  "stayntouch",
  "sihot",
  "rms-cloud",
  "maestro-pms",
  "shiji-pms",
  "guestline",
  "ezee-absolute",
  "clock-pms-plus",
  "hotelogix",
] as const satisfies readonly PmsProviderId[];

export type StandardPmsProviderId = (typeof standardPmsProviderIds)[number];

export function isStandardPmsProvider(
  providerId: PmsProviderId,
): providerId is StandardPmsProviderId {
  return standardPmsProviderIds.includes(providerId as StandardPmsProviderId);
}


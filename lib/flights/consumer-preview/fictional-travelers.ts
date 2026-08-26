import { z } from "zod";

import {
  flightConsumerPreviewPassengerSchema,
  type FlightConsumerPreviewPassenger,
} from "./schemas";

export const FLIGHT_CONSUMER_PREVIEW_MAX_FICTIONAL_TRAVELERS = 4 as const;

const fictionalProfiles = Object.freeze([
  Object.freeze({ title: "ms" as const, gender: "f" as const, givenName: "Synthetic", bornOn: "1990-01-01", phoneNumber: "+13125550121" }),
  Object.freeze({ title: "mr" as const, gender: "m" as const, givenName: "Sample", bornOn: "1991-01-01", phoneNumber: "+13125550122" }),
  Object.freeze({ title: "ms" as const, gender: "f" as const, givenName: "Preview", bornOn: "1992-01-01", phoneNumber: "+13125550123" }),
  Object.freeze({ title: "mr" as const, gender: "m" as const, givenName: "Fixture", bornOn: "1993-01-01", phoneNumber: "+13125550124" }),
] as const);

export type FlightConsumerPreviewFictionalTravelerDisclosure = Readonly<{
  travelerSequence: number;
  givenName: string;
  familyName: string;
  bornOn: string;
  email: string;
}>;

export type FlightConsumerPreviewFictionalTraveler = Readonly<{
  travelerSequence: number;
  passenger: FlightConsumerPreviewPassenger;
}>;

export const flightConsumerPreviewFictionalTravelerDisclosureSchema = z.object({
  travelerSequence: z.number().int().min(1).max(FLIGHT_CONSUMER_PREVIEW_MAX_FICTIONAL_TRAVELERS),
  givenName: z.string(),
  familyName: z.string(),
  bornOn: z.string(),
  email: z.string(),
}).strict();

export const flightConsumerPreviewFictionalTravelerDisclosuresSchema = z.array(
  flightConsumerPreviewFictionalTravelerDisclosureSchema,
).min(1).max(FLIGHT_CONSUMER_PREVIEW_MAX_FICTIONAL_TRAVELERS);

function assertCount(count: number) {
  if (!Number.isSafeInteger(count) || count < 1 || count > FLIGHT_CONSUMER_PREVIEW_MAX_FICTIONAL_TRAVELERS) {
    throw new Error("Flight Consumer Preview supports one to four fictional adult travelers.");
  }
}

export function buildFlightConsumerPreviewFictionalTravelers(
  count: number,
): readonly FlightConsumerPreviewFictionalTraveler[] {
  assertCount(count);
  return Object.freeze(fictionalProfiles.slice(0, count).map((profile, index) => Object.freeze({
    travelerSequence: index + 1,
    passenger: Object.freeze(flightConsumerPreviewPassengerSchema.parse({
      title: profile.title,
      gender: profile.gender,
      givenName: profile.givenName,
      familyName: "Traveler",
      bornOn: profile.bornOn,
      email: `flight-test+${index + 1}@example.com`,
      phoneNumber: profile.phoneNumber,
    })),
  })));
}

export function discloseFlightConsumerPreviewFictionalTravelers(
  count: number,
): readonly FlightConsumerPreviewFictionalTravelerDisclosure[] {
  return Object.freeze(buildFlightConsumerPreviewFictionalTravelers(count).map(({ travelerSequence, passenger }) => Object.freeze({
    travelerSequence,
    givenName: passenger.givenName,
    familyName: passenger.familyName,
    bornOn: passenger.bornOn,
    email: passenger.email,
  })));
}

export function verifyFlightConsumerPreviewFictionalTravelerDisclosure(
  value: unknown,
  expectedCount: number,
) {
  const parsed = flightConsumerPreviewFictionalTravelerDisclosuresSchema.safeParse(value);
  if (!parsed.success) return false;
  return JSON.stringify(parsed.data) === JSON.stringify(discloseFlightConsumerPreviewFictionalTravelers(expectedCount));
}

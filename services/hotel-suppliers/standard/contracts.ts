import type { PmsProviderId } from "../types";

export type StandardPmsOperation =
  | "availability"
  | "create_reservation"
  | "cancel_reservation";

export type StandardPmsStay = {
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children?: number;
  rooms?: number;
};

export type StandardPmsAvailabilityRequest = StandardPmsStay & {
  propertyCode: string;
  currency?: string;
};

export type StandardPmsOffer = {
  offerId: string;
  propertyCode: string;
  roomTypeCode: string;
  ratePlanCode: string;
  currency: string;
  totalAmount: number;
  available: boolean;
  raw: unknown;
};

export type StandardPmsCreateReservationRequest = StandardPmsStay & {
  propertyCode: string;
  externalReference: string;
  offerId: string;
  guest: { firstName: string; lastName: string; email?: string; phone?: string };
};

export type StandardPmsReservation = {
  propertyCode: string;
  reservationId: string;
  confirmationNumber?: string;
  externalReference: string;
  status: string;
  raw: unknown;
};

export type StandardPmsCancelReservationRequest = {
  propertyCode: string;
  reservationId: string;
  externalReference: string;
  reason?: string;
};

export type StandardPmsCancellation = {
  propertyCode: string;
  reservationId: string;
  cancellationNumber?: string;
  status: string;
  raw: unknown;
};

export type StandardPmsTransportRequest = {
  providerId: PmsProviderId;
  propertyCode: string;
  operation: StandardPmsOperation;
  requestId: string;
  payload: unknown;
};

export interface StandardPmsTransport {
  execute(request: StandardPmsTransportRequest): Promise<unknown>;
}

export interface StandardPmsMapper {
  availabilityPayload(input: StandardPmsAvailabilityRequest): unknown;
  availabilityResponse(
    payload: unknown,
    input: StandardPmsAvailabilityRequest,
  ): StandardPmsOffer[];
  createReservationPayload(input: StandardPmsCreateReservationRequest): unknown;
  createReservationResponse(
    payload: unknown,
    input: StandardPmsCreateReservationRequest,
  ): StandardPmsReservation;
  cancelReservationPayload(input: StandardPmsCancelReservationRequest): unknown;
  cancelReservationResponse(
    payload: unknown,
    input: StandardPmsCancelReservationRequest,
  ): StandardPmsCancellation;
}


export type MarriottPmsProvider = "marriott-fosse" | "marriott-fs-pms";
export type MarriottOperation = "availability" | "create_reservation" | "cancel_reservation";

export type MarriottStay = {
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children?: number;
  rooms?: number;
};

export type MarriottAvailabilityRequest = MarriottStay & {
  propertyCode: string;
  currency?: string;
};

export type MarriottOffer = {
  offerId: string;
  propertyCode: string;
  roomTypeCode: string;
  ratePlanCode: string;
  currency: string;
  totalAmount: number;
  available: boolean;
  raw: unknown;
};

export type MarriottCreateReservationRequest = MarriottStay & {
  propertyCode: string;
  externalReference: string;
  offerId: string;
  guest: { firstName: string; lastName: string; email?: string; phone?: string };
};

export type MarriottReservation = {
  propertyCode: string;
  reservationId: string;
  confirmationNumber?: string;
  externalReference: string;
  status: string;
  raw: unknown;
};

export type MarriottCancelReservationRequest = {
  propertyCode: string;
  reservationId: string;
  externalReference: string;
  reason?: string;
};

export type MarriottCancellation = {
  propertyCode: string;
  reservationId: string;
  cancellationNumber?: string;
  status: string;
  raw: unknown;
};

export type MarriottTransportRequest = {
  provider: MarriottPmsProvider;
  propertyCode: string;
  operation: MarriottOperation;
  requestId: string;
  payload: unknown;
};

export interface MarriottPmsTransport {
  execute(request: MarriottTransportRequest): Promise<unknown>;
}

export interface MarriottPmsMapper {
  availabilityPayload(input: MarriottAvailabilityRequest): unknown;
  availabilityResponse(payload: unknown, input: MarriottAvailabilityRequest): MarriottOffer[];
  createReservationPayload(input: MarriottCreateReservationRequest): unknown;
  createReservationResponse(payload: unknown, input: MarriottCreateReservationRequest): MarriottReservation;
  cancelReservationPayload(input: MarriottCancelReservationRequest): unknown;
  cancelReservationResponse(payload: unknown, input: MarriottCancelReservationRequest): MarriottCancellation;
}

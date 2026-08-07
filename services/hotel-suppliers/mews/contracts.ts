export type MewsOperation =
  | "availability"
  | "create_reservation"
  | "cancel_reservation";

export type MewsStay = {
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children?: number;
  rooms?: number;
};

export type MewsAvailabilityRequest = MewsStay & {
  propertyCode: string;
  currency?: string;
};

export type MewsOffer = {
  offerId: string;
  propertyCode: string;
  roomTypeCode: string;
  ratePlanCode: string;
  currency: string;
  totalAmount: number;
  available: boolean;
  raw: unknown;
};

export type MewsCreateReservationRequest = MewsStay & {
  propertyCode: string;
  externalReference: string;
  offerId: string;
  guest: { firstName: string; lastName: string; email?: string; phone?: string };
};

export type MewsReservation = {
  propertyCode: string;
  reservationId: string;
  confirmationNumber?: string;
  externalReference: string;
  status: string;
  raw: unknown;
};

export type MewsCancelReservationRequest = {
  propertyCode: string;
  reservationId: string;
  externalReference: string;
  reason?: string;
};

export type MewsCancellation = {
  propertyCode: string;
  reservationId: string;
  cancellationNumber?: string;
  status: string;
  raw: unknown;
};

export type MewsTransportRequest = {
  propertyCode: string;
  operation: MewsOperation;
  requestId: string;
  payload: unknown;
};

export interface MewsTransport {
  execute(request: MewsTransportRequest): Promise<unknown>;
}

export interface MewsMapper {
  availabilityPayload(input: MewsAvailabilityRequest): unknown;
  availabilityResponse(payload: unknown, input: MewsAvailabilityRequest): MewsOffer[];
  createReservationPayload(input: MewsCreateReservationRequest): unknown;
  createReservationResponse(payload: unknown, input: MewsCreateReservationRequest): MewsReservation;
  cancelReservationPayload(input: MewsCancelReservationRequest): unknown;
  cancelReservationResponse(payload: unknown, input: MewsCancelReservationRequest): MewsCancellation;
}

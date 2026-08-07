export type CloudbedsOperation = "availability" | "create_reservation" | "cancel_reservation";

export type CloudbedsStay = {
  arrivalDate: string;
  departureDate: string;
  adults: number;
  children?: number;
  rooms?: number;
};

export type CloudbedsAvailabilityRequest = CloudbedsStay & {
  propertyCode: string;
  currency?: string;
};

export type CloudbedsOffer = {
  offerId: string;
  propertyCode: string;
  roomTypeCode: string;
  ratePlanCode: string;
  currency: string;
  totalAmount: number;
  available: boolean;
  raw: unknown;
};

export type CloudbedsCreateReservationRequest = CloudbedsStay & {
  propertyCode: string;
  externalReference: string;
  offerId: string;
  guest: { firstName: string; lastName: string; email?: string; phone?: string };
};

export type CloudbedsReservation = {
  propertyCode: string;
  reservationId: string;
  confirmationNumber?: string;
  externalReference: string;
  status: string;
  raw: unknown;
};

export type CloudbedsCancelReservationRequest = {
  propertyCode: string;
  reservationId: string;
  externalReference: string;
  reason?: string;
};

export type CloudbedsCancellation = {
  propertyCode: string;
  reservationId: string;
  cancellationNumber?: string;
  status: string;
  raw: unknown;
};

export type CloudbedsTransportRequest = {
  propertyCode: string;
  operation: CloudbedsOperation;
  requestId: string;
  payload: unknown;
};

export interface CloudbedsTransport {
  execute(request: CloudbedsTransportRequest): Promise<unknown>;
}

export interface CloudbedsMapper {
  availabilityPayload(input: CloudbedsAvailabilityRequest): unknown;
  availabilityResponse(payload: unknown, input: CloudbedsAvailabilityRequest): CloudbedsOffer[];
  createReservationPayload(input: CloudbedsCreateReservationRequest): unknown;
  createReservationResponse(payload: unknown, input: CloudbedsCreateReservationRequest): CloudbedsReservation;
  cancelReservationPayload(input: CloudbedsCancelReservationRequest): unknown;
  cancelReservationResponse(payload: unknown, input: CloudbedsCancelReservationRequest): CloudbedsCancellation;
}

export type ApaleoOperation = "availability" | "create_reservation" | "cancel_reservation";
export type ApaleoStay = { arrivalDate: string; departureDate: string; adults: number; children?: number; rooms?: number };
export type ApaleoAvailabilityRequest = ApaleoStay & { propertyCode: string; currency?: string };
export type ApaleoOffer = {
  offerId: string; propertyCode: string; roomTypeCode: string; ratePlanCode: string;
  currency: string; totalAmount: number; available: boolean; raw: unknown;
};
export type ApaleoCreateReservationRequest = ApaleoStay & {
  propertyCode: string; externalReference: string; offerId: string;
  guest: { firstName: string; lastName: string; email?: string; phone?: string };
};
export type ApaleoReservation = {
  propertyCode: string; reservationId: string; confirmationNumber?: string;
  externalReference: string; status: string; raw: unknown;
};
export type ApaleoCancelReservationRequest = {
  propertyCode: string; reservationId: string; externalReference: string; reason?: string;
};
export type ApaleoCancellation = {
  propertyCode: string; reservationId: string; cancellationNumber?: string; status: string; raw: unknown;
};
export type ApaleoTransportRequest = {
  propertyCode: string; operation: ApaleoOperation; requestId: string; payload: unknown;
};
export interface ApaleoTransport { execute(request: ApaleoTransportRequest): Promise<unknown> }
export interface ApaleoMapper {
  availabilityPayload(input: ApaleoAvailabilityRequest): unknown;
  availabilityResponse(payload: unknown, input: ApaleoAvailabilityRequest): ApaleoOffer[];
  createReservationPayload(input: ApaleoCreateReservationRequest): unknown;
  createReservationResponse(payload: unknown, input: ApaleoCreateReservationRequest): ApaleoReservation;
  cancelReservationPayload(input: ApaleoCancelReservationRequest): unknown;
  cancelReservationResponse(payload: unknown, input: ApaleoCancelReservationRequest): ApaleoCancellation;
}

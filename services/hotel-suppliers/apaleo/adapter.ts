import type {
  ApaleoAvailabilityRequest, ApaleoCancellation, ApaleoCancelReservationRequest,
  ApaleoCreateReservationRequest, ApaleoMapper, ApaleoOffer, ApaleoReservation, ApaleoTransport,
} from "./contracts";

export class ApaleoAdapter {
  constructor(private readonly transport: ApaleoTransport, private readonly mapper: ApaleoMapper) {}

  async availability(input: ApaleoAvailabilityRequest): Promise<ApaleoOffer[]> {
    const payload = await this.transport.execute({
      propertyCode: input.propertyCode, operation: "availability",
      requestId: crypto.randomUUID(), payload: this.mapper.availabilityPayload(input),
    });
    return this.mapper.availabilityResponse(payload, input);
  }

  async createReservation(input: ApaleoCreateReservationRequest): Promise<ApaleoReservation> {
    const payload = await this.transport.execute({
      propertyCode: input.propertyCode, operation: "create_reservation",
      requestId: input.externalReference, payload: this.mapper.createReservationPayload(input),
    });
    return this.mapper.createReservationResponse(payload, input);
  }

  async cancelReservation(input: ApaleoCancelReservationRequest): Promise<ApaleoCancellation> {
    const payload = await this.transport.execute({
      propertyCode: input.propertyCode, operation: "cancel_reservation",
      requestId: `cancel:${input.externalReference}`, payload: this.mapper.cancelReservationPayload(input),
    });
    return this.mapper.cancelReservationResponse(payload, input);
  }
}

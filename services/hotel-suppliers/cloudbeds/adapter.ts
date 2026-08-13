import type {
  CloudbedsAvailabilityRequest,
  CloudbedsCancellation,
  CloudbedsCancelReservationRequest,
  CloudbedsCreateReservationRequest,
  CloudbedsMapper,
  CloudbedsOffer,
  CloudbedsReservation,
  CloudbedsTransport,
} from "./contracts";

export class CloudbedsAdapter {
  constructor(
    private readonly transport: CloudbedsTransport,
    private readonly mapper: CloudbedsMapper,
  ) {}

  async availability(input: CloudbedsAvailabilityRequest): Promise<CloudbedsOffer[]> {
    const payload = await this.transport.execute({
      propertyCode: input.propertyCode,
      operation: "availability",
      requestId: crypto.randomUUID(),
      payload: this.mapper.availabilityPayload(input),
    });
    return this.mapper.availabilityResponse(payload, input);
  }

  async createReservation(input: CloudbedsCreateReservationRequest): Promise<CloudbedsReservation> {
    const payload = await this.transport.execute({
      propertyCode: input.propertyCode,
      operation: "create_reservation",
      requestId: input.externalReference,
      payload: this.mapper.createReservationPayload(input),
    });
    return this.mapper.createReservationResponse(payload, input);
  }

  async cancelReservation(input: CloudbedsCancelReservationRequest): Promise<CloudbedsCancellation> {
    const payload = await this.transport.execute({
      propertyCode: input.propertyCode,
      operation: "cancel_reservation",
      requestId: `cancel:${input.externalReference}`,
      payload: this.mapper.cancelReservationPayload(input),
    });
    return this.mapper.cancelReservationResponse(payload, input);
  }
}

import type {
  MewsAvailabilityRequest,
  MewsCancellation,
  MewsCancelReservationRequest,
  MewsCreateReservationRequest,
  MewsMapper,
  MewsOffer,
  MewsReservation,
  MewsTransport,
} from "./contracts";

export class MewsAdapter {
  constructor(
    private readonly transport: MewsTransport,
    private readonly mapper: MewsMapper,
  ) {}

  async availability(input: MewsAvailabilityRequest): Promise<MewsOffer[]> {
    const payload = await this.transport.execute({
      propertyCode: input.propertyCode,
      operation: "availability",
      requestId: crypto.randomUUID(),
      payload: this.mapper.availabilityPayload(input),
    });
    return this.mapper.availabilityResponse(payload, input);
  }

  async createReservation(input: MewsCreateReservationRequest): Promise<MewsReservation> {
    const payload = await this.transport.execute({
      propertyCode: input.propertyCode,
      operation: "create_reservation",
      requestId: input.externalReference,
      payload: this.mapper.createReservationPayload(input),
    });
    return this.mapper.createReservationResponse(payload, input);
  }

  async cancelReservation(input: MewsCancelReservationRequest): Promise<MewsCancellation> {
    const payload = await this.transport.execute({
      propertyCode: input.propertyCode,
      operation: "cancel_reservation",
      requestId: `cancel:${input.externalReference}`,
      payload: this.mapper.cancelReservationPayload(input),
    });
    return this.mapper.cancelReservationResponse(payload, input);
  }
}

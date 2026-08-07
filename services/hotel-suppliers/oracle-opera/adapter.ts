import type { OracleOperaClient } from "./client";
import type {
  OperaAvailabilityRequest,
  OperaCancelReservationRequest,
  OperaCancellation,
  OperaCreateReservationRequest,
  OperaOffer,
  OperaReservation,
  OracleOperaContractMapper,
} from "./contracts";

export class OracleOperaAdapter {
  constructor(
    private readonly client: OracleOperaClient,
    private readonly mapper: OracleOperaContractMapper,
  ) {}

  async availability(input: OperaAvailabilityRequest): Promise<OperaOffer[]> {
    const payload = await this.client.request<unknown>(
      this.mapper.availabilityPath(input),
      {
        method: "POST",
        hotelId: input.hotelId,
        body: this.mapper.availabilityPayload(input) as Record<string, unknown>,
      },
    );
    return this.mapper.availabilityResponse(payload, input);
  }

  async createReservation(input: OperaCreateReservationRequest): Promise<OperaReservation> {
    const payload = await this.client.request<unknown>(
      this.mapper.createReservationPath(input),
      {
        method: "POST",
        hotelId: input.hotelId,
        headers: { "Idempotency-Key": input.externalReference },
        body: this.mapper.createReservationPayload(input) as Record<string, unknown>,
      },
    );
    return this.mapper.createReservationResponse(payload, input);
  }

  async cancelReservation(input: OperaCancelReservationRequest): Promise<OperaCancellation> {
    const payload = await this.client.request<unknown>(
      this.mapper.cancelReservationPath(input),
      {
        method: "POST",
        hotelId: input.hotelId,
        headers: { "Idempotency-Key": `cancel:${input.externalReference}` },
        body: this.mapper.cancelReservationPayload(input) as Record<string, unknown>,
      },
    );
    return this.mapper.cancelReservationResponse(payload, input);
  }
}

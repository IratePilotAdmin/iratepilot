import type { OracleOperaRequestOptions } from "./client";
import type {
  OperaAvailabilityRequest,
  OperaCancelReservationRequest,
  OperaCancellation,
  OperaCreateReservationRequest,
  OperaGetReservationRequest,
  OperaModifyReservationRequest,
  OperaOffer,
  OperaReservation,
  OracleOperaContractMapper,
} from "./contracts";

export class OracleOperaAdapter {
  constructor(
    private readonly client: {
      request<T>(path: string, options?: OracleOperaRequestOptions): Promise<T>;
    },
    private readonly mapper: OracleOperaContractMapper,
  ) {}

  async availability(input: OperaAvailabilityRequest): Promise<OperaOffer[]> {
    const body = this.mapper.availabilityPayload?.(input);
    const payload = await this.client.request<unknown>(
      this.mapper.availabilityPath(input),
      {
        method: this.mapper.availabilityMethod?.(input) ?? "POST",
        hotelId: input.hotelId,
        ...(body === undefined ? {} : { body: body as Record<string, unknown> }),
      },
    );
    return this.mapper.availabilityResponse(payload, input);
  }

  async getReservation(input: OperaGetReservationRequest): Promise<OperaReservation> {
    if (!this.mapper.getReservationPath || !this.mapper.getReservationResponse) {
      throw new Error("Oracle OPERA reservation retrieval is not configured");
    }
    const payload = await this.client.request<unknown>(this.mapper.getReservationPath(input), {
      method: "GET",
      hotelId: input.hotelId,
    });
    return this.mapper.getReservationResponse(payload, input);
  }

  async modifyReservation(input: OperaModifyReservationRequest): Promise<OperaReservation> {
    if (!this.mapper.modifyReservationPath || !this.mapper.modifyReservationPayload || !this.mapper.modifyReservationResponse) {
      throw new Error("Oracle OPERA reservation modification is not configured");
    }
    const payload = await this.client.request<unknown>(this.mapper.modifyReservationPath(input), {
      method: "PUT",
      hotelId: input.hotelId,
      headers: { "Idempotency-Key": `modify:${input.externalReference}` },
      body: this.mapper.modifyReservationPayload(input) as Record<string, unknown>,
    });
    return this.mapper.modifyReservationResponse(payload, input);
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

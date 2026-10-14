import {
  ThinkReservationsClient,
  ThinkReservationsClientError,
  type ThinkReservationsClientConfig,
  type ThinkReservationsFetch,
} from "./client";

export type ThinkReservationsConnectionTestConfig = ThinkReservationsClientConfig & {
  hotelId: string;
};
export type ThinkReservationsConnectionTestResult = { hotelCount: number };

export { ThinkReservationsClientError as ThinkReservationsConnectionTestError };

export async function testThinkReservationsConnection(
  config: ThinkReservationsConnectionTestConfig,
  fetcher: ThinkReservationsFetch = fetch,
): Promise<ThinkReservationsConnectionTestResult> {
  const hotelId = config.hotelId.trim();
  if (!hotelId) throw new Error("ThinkReservations hotel ID is required");
  const hotels = await new ThinkReservationsClient(config, fetcher).listHotels();
  if (!hotels.some((hotel) => hotel.externalId === hotelId)) {
    throw new ThinkReservationsClientError(
      "The selected ThinkReservations hotel is not assigned to this platform credential",
      403,
      "thinkreservations_hotel_not_authorized",
    );
  }
  return { hotelCount: hotels.length };
}

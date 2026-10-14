import {
  ThinkReservationsClient,
  ThinkReservationsClientError,
  type ThinkReservationsClientConfig,
  type ThinkReservationsFetch,
} from "./client";

export type ThinkReservationsConnectionTestConfig = ThinkReservationsClientConfig;
export type ThinkReservationsConnectionTestResult = { hotelCount: number };

export { ThinkReservationsClientError as ThinkReservationsConnectionTestError };

export async function testThinkReservationsConnection(
  config: ThinkReservationsConnectionTestConfig,
  fetcher: ThinkReservationsFetch = fetch,
): Promise<ThinkReservationsConnectionTestResult> {
  const hotels = await new ThinkReservationsClient(config, fetcher).listHotels();
  return { hotelCount: hotels.length };
}

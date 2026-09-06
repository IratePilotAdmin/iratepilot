import {
  HOTEL_MANAGER_INTEREST_UNCONFIRMED,
  hotelManagerInterestResponseMessage,
  isHotelManagerInterestReceived,
} from "@/lib/hotels/intake-response-message";

type InterestSubmissionResult = { received: boolean; message: string };

export async function submitHotelManagerInterest(
  data: Record<string, FormDataEntryValue>,
): Promise<InterestSubmissionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch("/api/hotel-intake/interest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    const result: unknown = await response.json().catch(() => null);
    return {
      received: isHotelManagerInterestReceived(result, response),
      message: hotelManagerInterestResponseMessage(result, response),
    };
  } catch {
    return { received: false, message: HOTEL_MANAGER_INTEREST_UNCONFIRMED };
  } finally {
    clearTimeout(timeout);
  }
}

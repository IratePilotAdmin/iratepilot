const MAX_RESPONSE_MESSAGE_LENGTH = 300;

export const HOTEL_MANAGER_INTEREST_SUCCESS =
  "Your private hotel manager interest request was received.";
export const HOTEL_MANAGER_INTEREST_ERROR =
  "We could not send your interest request. Please review the form and try again.";
export const HOTEL_MANAGER_INTEREST_RATE_LIMIT_ERROR =
  "Too many requests were sent. Please wait a few minutes and try again.";
export const HOTEL_MANAGER_INTEREST_CAPACITY_ERROR =
  "Hotel manager interest capacity is temporarily full. Please contact the team.";
export const HOTEL_MANAGER_INTEREST_UNCONFIRMED =
  "We could not confirm receipt of your interest request. Your details are still in the form. Please try again.";

export const PARTNER_APPLICATION_SUCCESS =
  "Application received for internal verification. No listing, payment, payout, supplier access, or commercial authority was activated.";
export const PARTNER_APPLICATION_ERROR = "Unable to submit the hotel application.";
export const PARTNER_APPLICATION_RATE_LIMIT_ERROR =
  "Too many applications were sent. Please wait a few minutes and try again.";

function boundedMessage(value: unknown) {
  if (typeof value !== "string") return null;
  const message = value.replace(/\s+/g, " ").trim();
  if (!message || message.length > MAX_RESPONSE_MESSAGE_LENGTH) return null;
  return message;
}

function topLevelMessage(payload: unknown, field: "error" | "message") {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  return boundedMessage((payload as Record<string, unknown>)[field]);
}

export function isHotelManagerInterestReceived(
  payload: unknown,
  response: { ok: boolean; status: number },
) {
  if (!response.ok || response.status !== 201) return false;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const receipt = payload as Record<string, unknown>;
  return receipt.status === "received" && receipt.intakeMode === "manager_interest";
}

export function hotelManagerInterestResponseMessage(
  payload: unknown,
  response: { ok: boolean; status: number },
) {
  if (response.ok) {
    if (!isHotelManagerInterestReceived(payload, response)) return HOTEL_MANAGER_INTEREST_UNCONFIRMED;
    return topLevelMessage(payload, "message") ?? HOTEL_MANAGER_INTEREST_SUCCESS;
  }
  if (response.status === 429) {
    if (payload && typeof payload === "object" && !Array.isArray(payload)
      && (payload as Record<string, unknown>).code === "hotel_interest_capacity_full") {
      return HOTEL_MANAGER_INTEREST_CAPACITY_ERROR;
    }
    return HOTEL_MANAGER_INTEREST_RATE_LIMIT_ERROR;
  }
  return topLevelMessage(payload, "error") ?? HOTEL_MANAGER_INTEREST_ERROR;
}

export function partnerApplicationResponseMessage(
  payload: unknown,
  response: { ok: boolean; status: number },
) {
  if (response.ok) return PARTNER_APPLICATION_SUCCESS;
  if (response.status === 429) return PARTNER_APPLICATION_RATE_LIMIT_ERROR;
  return topLevelMessage(payload, "error") ?? PARTNER_APPLICATION_ERROR;
}

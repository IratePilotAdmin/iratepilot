const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DurableStorage = Readonly<{
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}>;

/**
 * Returns an order-scoped browser identity only after exact durable readback.
 * An ephemeral fallback could create a second Stripe identity after a lost
 * response, so storage failures deliberately stop checkout before dispatch.
 */
export function durableFlightConsumerPreviewCheckoutKey(
  orderId: string,
  current: string | null,
  storage: DurableStorage,
  createUuid: () => string,
) {
  if (!uuidPattern.test(orderId)) throw new TypeError("Invalid Preview order identity.");
  if (current) {
    if (!uuidPattern.test(current)) throw new TypeError("Invalid Preview checkout identity.");
    return current.toLowerCase();
  }
  const storageKey = `iratepilot:flight-preview:checkout:${orderId}`;
  const stored = storage.getItem(storageKey);
  if (stored) {
    if (!uuidPattern.test(stored)) throw new TypeError("Invalid Preview checkout identity.");
    return stored.toLowerCase();
  }

  const created = createUuid().toLowerCase();
  if (!uuidPattern.test(created)) throw new TypeError("Invalid Preview checkout identity.");
  storage.setItem(storageKey, created);
  if (storage.getItem(storageKey)?.toLowerCase() !== created) {
    throw new TypeError("Preview checkout identity was not persisted.");
  }
  return created;
}

export function flightConsumerPreviewStripeErrorNeedsDurableRecovery(type: unknown) {
  return type !== "card_error" && type !== "validation_error";
}

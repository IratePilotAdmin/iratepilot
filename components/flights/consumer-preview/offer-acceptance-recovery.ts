const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DurableStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function storageKey(searchId: string, offerId: string, repriceReceiptId: string | null) {
  for (const value of [searchId, offerId]) {
    if (!uuidPattern.test(value)) throw new Error("The test-offer identity is invalid.");
  }
  if (repriceReceiptId !== null && !uuidPattern.test(repriceReceiptId)) {
    throw new Error("The test reprice identity is invalid.");
  }
  return `iratepilot:flight-preview:offer-acceptance:v1:${searchId.toLowerCase()}:${offerId.toLowerCase()}:${repriceReceiptId?.toLowerCase() ?? "initial"}`;
}

export function durableFlightConsumerPreviewOfferAcceptanceKey(input: Readonly<{
  searchId: string;
  offerId: string;
  repriceReceiptId: string | null;
  storage: DurableStorage;
  createUuid?: () => string;
}>) {
  const key = storageKey(input.searchId, input.offerId, input.repriceReceiptId);
  const stored = input.storage.getItem(key);
  if (stored !== null) {
    if (!uuidPattern.test(stored)) throw new Error("The retained test-offer request identity is invalid.");
    return stored.toLowerCase();
  }
  const created = (input.createUuid ?? (() => globalThis.crypto.randomUUID()))().toLowerCase();
  if (!uuidPattern.test(created)) throw new Error("The test-offer request identity is invalid.");
  input.storage.setItem(key, created);
  if (input.storage.getItem(key)?.toLowerCase() !== created) {
    throw new Error("The test-offer request identity could not be retained.");
  }
  return created;
}

export function clearFlightConsumerPreviewOfferAcceptanceKey(input: Readonly<{
  searchId: string;
  offerId: string;
  repriceReceiptId: string | null;
  storage: DurableStorage;
}>) {
  const key = storageKey(input.searchId, input.offerId, input.repriceReceiptId);
  try {
    input.storage.removeItem(key);
  } catch {
    // A server-confirmed terminal response remains authoritative if local cleanup is unavailable.
  }
}

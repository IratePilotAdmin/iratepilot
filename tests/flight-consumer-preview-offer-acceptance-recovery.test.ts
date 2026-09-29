import { describe, expect, it } from "vitest";

import {
  clearFlightConsumerPreviewOfferAcceptanceKey,
  durableFlightConsumerPreviewOfferAcceptanceKey,
} from "../components/flights/consumer-preview/offer-acceptance-recovery";

const searchId = "11111111-1111-4111-8111-111111111111";
const offerId = "22222222-2222-4222-8222-222222222222";
const repriceReceiptId = "33333333-3333-4333-8333-333333333333";
const initialKey = "44444444-4444-4444-8444-444444444444";
const changedPriceKey = "55555555-5555-4555-8555-555555555555";

function storage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe("Consumer Preview offer-acceptance recovery", () => {
  it("reuses the same retained key after browser loss", () => {
    const durable = storage();
    const first = durableFlightConsumerPreviewOfferAcceptanceKey({
      searchId,
      offerId,
      repriceReceiptId: null,
      storage: durable,
      createUuid: () => initialKey,
    });
    const recovered = durableFlightConsumerPreviewOfferAcceptanceKey({
      searchId,
      offerId,
      repriceReceiptId: null,
      storage: durable,
      createUuid: () => { throw new Error("must not create another provider request identity"); },
    });
    expect(first).toBe(initialKey);
    expect(recovered).toBe(initialKey);
  });

  it("uses a distinct durable identity for explicit changed-price acceptance", () => {
    const durable = storage();
    const initial = durableFlightConsumerPreviewOfferAcceptanceKey({
      searchId,
      offerId,
      repriceReceiptId: null,
      storage: durable,
      createUuid: () => initialKey,
    });
    clearFlightConsumerPreviewOfferAcceptanceKey({
      searchId,
      offerId,
      repriceReceiptId: null,
      storage: durable,
    });
    const changed = durableFlightConsumerPreviewOfferAcceptanceKey({
      searchId,
      offerId,
      repriceReceiptId,
      storage: durable,
      createUuid: () => changedPriceKey,
    });
    expect(initial).toBe(initialKey);
    expect(changed).toBe(changedPriceKey);
    expect(changed).not.toBe(initial);
  });

  it("fails closed on a corrupted retained identity", () => {
    const durable = storage();
    durableFlightConsumerPreviewOfferAcceptanceKey({
      searchId,
      offerId,
      repriceReceiptId: null,
      storage: durable,
      createUuid: () => initialKey,
    });
    const retainedKey = [...durable.values.keys()][0]!;
    durable.values.set(retainedKey, "corrupt");
    expect(() => durableFlightConsumerPreviewOfferAcceptanceKey({
      searchId,
      offerId,
      repriceReceiptId: null,
      storage: durable,
    })).toThrow("retained test-offer request identity is invalid");
  });
});

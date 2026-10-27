import "server-only";

import type { InventorySandboxFetch } from "./inventory-sandbox-transport.server";
import { runRatehawkSandboxPrebookValidation } from "./ratehawk-prebook-validation.server";
import { runRatehawkSandboxSearchForPrebook } from "./ratehawk-sandbox-validation.server";

export type RatehawkSandboxPrebookEvidence = {
  testedAt: string;
  checkin: string;
  checkout: string;
  hotelCount: number;
  rateCount: number;
  priceChanged: boolean;
};

export async function runRatehawkSandboxPrebookEvidence(options: {
  environment: Record<string, string | undefined>;
  fetcher?: InventorySandboxFetch;
  now?: Date;
}): Promise<RatehawkSandboxPrebookEvidence> {
  const search = await runRatehawkSandboxSearchForPrebook(options);
  const prebook = await runRatehawkSandboxPrebookValidation({
    environment: options.environment,
    rateHash: search.rateHash,
    fetcher: options.fetcher,
    now: options.now,
  });

  return {
    testedAt: prebook.testedAt,
    checkin: search.checkin,
    checkout: search.checkout,
    hotelCount: prebook.hotelCount,
    rateCount: prebook.rateCount,
    priceChanged: prebook.priceChanged,
  };
}

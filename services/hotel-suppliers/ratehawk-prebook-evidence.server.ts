import "server-only";

import type { InventorySandboxFetch } from "./inventory-sandbox-transport.server";
import { runRatehawkSandboxPrebookValidation } from "./ratehawk-prebook-validation.server";
import { runRatehawkSandboxHotelpageForPrebook } from "./ratehawk-sandbox-validation.server";

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
  const hotelpage = await runRatehawkSandboxHotelpageForPrebook(options);
  const prebook = await runRatehawkSandboxPrebookValidation({
    environment: options.environment,
    rateHash: hotelpage.rateHash,
    fetcher: options.fetcher,
    now: options.now,
  });

  return {
    testedAt: prebook.testedAt,
    checkin: hotelpage.checkin,
    checkout: hotelpage.checkout,
    hotelCount: prebook.hotelCount,
    rateCount: prebook.rateCount,
    priceChanged: prebook.priceChanged,
  };
}

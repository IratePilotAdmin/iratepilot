import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import { createAdminClient } from "../../supabase/admin";
import { resolveFlightConsumerPreviewRuntime } from "./runtime.server";
import { readFlightConsumerPreviewStripeRestrictedKey } from "./stripe-credential.server";

const stripeAccountSchema = z.object({
  id: z.string().regex(/^acct_[A-Za-z0-9]{8,127}$/),
  livemode: z.boolean().optional(),
}).passthrough();

export type FlightConsumerPreviewPreflightResult = Readonly<{
  version: "flight-consumer-preview-preflight-v1";
  ready: boolean;
  checkedAt: string;
  checks: Readonly<{
    databaseAuthority: boolean;
    runtimeConfiguration: boolean;
    stripeTestAccount: boolean;
    stripeAccountBinding: boolean;
  }>;
  stripeAccountId: string | null;
  stripeAccountSha256: string | null;
  issues: readonly string[];
}>;

type Dependencies = Readonly<{
  readDatabaseAuthority: () => Promise<unknown>;
  fetchStripeAccount: (secret: string) => Promise<unknown>;
  now: () => string;
}>;

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function defaultReadDatabaseAuthority() {
  const { data, error } = await createAdminClient().rpc(
    "get_flight_consumer_preview_runtime_authority_v1",
  );
  if (error) return null;
  if (Array.isArray(data)) return data.length === 1 ? data[0] : null;
  return data ?? null;
}

async function defaultFetchStripeAccount(secret: string) {
  const response = await fetch("https://api.stripe.com/v1/account", {
    method: "GET",
    headers: { Authorization: `Bearer ${secret}` },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return null;
  return response.json();
}

export async function inspectFlightConsumerPreviewPreflight(
  env: Readonly<Record<string, string | undefined>> = process.env,
  dependencies: Dependencies = {
    readDatabaseAuthority: defaultReadDatabaseAuthority,
    fetchStripeAccount: defaultFetchStripeAccount,
    now: () => new Date().toISOString(),
  },
): Promise<FlightConsumerPreviewPreflightResult> {
  let authority: unknown = null;
  try {
    authority = await dependencies.readDatabaseAuthority();
  } catch {
    authority = null;
  }
  const runtime = resolveFlightConsumerPreviewRuntime(env, authority);
  const issues = runtime.authorized ? [] : [...runtime.reasons];
  let stripeAccountId: string | null = null;
  let stripeAccountSha256: string | null = null;
  let stripeTestAccount = false;
  let stripeAccountBinding = false;
  try {
    const secret = readFlightConsumerPreviewStripeRestrictedKey(env);
    try {
      const parsed = stripeAccountSchema.safeParse(
        await dependencies.fetchStripeAccount(secret),
      );
      if (parsed.success && parsed.data.livemode !== true) {
        stripeAccountId = parsed.data.id;
        stripeAccountSha256 = sha256(parsed.data.id);
        stripeTestAccount = true;
        stripeAccountBinding = parsed.data.id === env.FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_ID
          && stripeAccountSha256 === env.FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_SHA256
          && (runtime.authorized
            ? stripeAccountSha256 === runtime.binding.paymentAccountSha256
            : true);
      }
    } catch {
      stripeTestAccount = false;
    }
  } catch {
    stripeTestAccount = false;
  }
  if (!stripeTestAccount) issues.push("The Stripe test account identity could not be verified.");
  if (!stripeAccountBinding) issues.push("The Stripe test account is not bound end-to-end.");
  const databaseAuthority = runtime.authorized
    || !runtime.reasons.includes("Verified database runtime authority is unavailable.");
  return Object.freeze({
    version: "flight-consumer-preview-preflight-v1",
    ready: runtime.authorized && stripeTestAccount && stripeAccountBinding,
    checkedAt: dependencies.now(),
    checks: Object.freeze({
      databaseAuthority,
      runtimeConfiguration: runtime.authorized,
      stripeTestAccount,
      stripeAccountBinding,
    }),
    stripeAccountId,
    stripeAccountSha256,
    issues: Object.freeze([...new Set(issues)]),
  });
}

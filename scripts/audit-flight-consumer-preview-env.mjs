import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const PREVIEW_PROJECT_REF = "eiqmdldjnedqgbtoozqa";

const EXACT_VALUES = Object.freeze({
  VERCEL_ENV: "preview",
  PILOT_MODE: "true",
  FLIGHT_CONSUMER_PREVIEW_ENABLED: "true",
  FLIGHT_RUNTIME_MODE: "sandbox",
  FLIGHT_RUNTIME_ENVIRONMENT: "preview",
  FLIGHT_RUNTIME_ENABLED: "true",
  FLIGHT_SYNTHETIC_ADAPTER_ENABLED: "false",
  FLIGHT_PROVIDER_TRAFFIC_ENABLED: "true",
  FLIGHT_BOOKING_ENABLED: "true",
  FLIGHT_PAYMENT_ENABLED: "true",
  FLIGHT_SETTLEMENT_ENABLED: "true",
  FLIGHT_TICKETING_ENABLED: "true",
  FLIGHT_SERVICING_ENABLED: "false",
  FLIGHT_WEBHOOKS_ENABLED: "true",
  FLIGHT_PRODUCTION_TRAFFIC_ENABLED: "false",
  FLIGHT_TRANSACTION_KILL_SWITCH: "disengaged",
  ENABLE_LIVE_BOOKING_PAYMENTS: "false",
  ENABLE_LIVE_STRIPE_WEBHOOKS: "false",
  NEXT_PUBLIC_PUBLIC_BOOKING: "false",
  FLIGHT_DUFFEL_TEST_BOOKING_ENABLED: "false",
  FLIGHT_DUFFEL_TEST_CREDENTIAL_PROBE_ENABLED: "false",
  EMAIL_WORKER_ENABLED: "false",
});

const REQUIRED_PRESENT = Object.freeze([
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "FLIGHT_DUFFEL_TEST_AUTHORITY_SECRET",
  "FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_SECRET",
  "FLIGHT_CONSUMER_PREVIEW_DUFFEL_WEBHOOK_SECRET",
]);

const KEYRINGS = Object.freeze([
  "PII",
  "EVIDENCE",
  "REFERENCE",
]);

const sha256Pattern = /^[0-9a-f]{64}$/;
const base64Url32BytePattern = /^[A-Za-z0-9_-]{43}$/;
const keyVersionPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseDotenvValue(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return JSON.parse(trimmed);
  }
  if (trimmed.length >= 2 && trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseDotenv(text) {
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (match === null) throw new Error("Environment file contains an unsupported line.");
    env[match[1]] = parseDotenvValue(match[2]);
  }
  return env;
}

function issue(issues, variable, reason) {
  issues.push(Object.freeze({ variable, reason }));
}

export function auditFlightConsumerPreviewEnvironment(env) {
  const issues = [];
  for (const [name, expected] of Object.entries(EXACT_VALUES)) {
    if (env[name] !== expected) issue(issues, name, "unexpected_or_missing");
  }
  if (env.NEXT_PUBLIC_SUPABASE_URL !== `https://${PREVIEW_PROJECT_REF}.supabase.co`) {
    issue(issues, "NEXT_PUBLIC_SUPABASE_URL", "not_exact_preview_project");
  }
  for (const name of REQUIRED_PRESENT) {
    if (typeof env[name] !== "string" || env[name].length < 16) {
      issue(issues, name, "missing_or_too_short");
    }
  }
  if (!/^duffel_test_[A-Za-z0-9_-]{16,500}$/.test(env.DUFFEL_TEST_ACCESS_TOKEN ?? "")) {
    issue(issues, "DUFFEL_TEST_ACCESS_TOKEN", "not_test_credential");
  }
  const stripeRestrictedKey =
    env.FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY ?? "";
  if (!/^rk_test_[A-Za-z0-9_]{8,}$/.test(stripeRestrictedKey)) {
    issue(issues, "FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY", "not_restricted_test_credential");
  }
  const stripeRestrictedKeySha256 =
    env.FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY_SHA256 ?? "";
  if (
    !sha256Pattern.test(stripeRestrictedKeySha256)
    || sha256(stripeRestrictedKey) !== stripeRestrictedKeySha256
  ) {
    issue(issues, "FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY_SHA256", "does_not_bind_restricted_key");
  }
  if ((env.STRIPE_SECRET_KEY ?? "").trim().length > 0) {
    issue(issues, "STRIPE_SECRET_KEY", "broad_secret_must_be_absent");
  }
  const stripePublishableKey = env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
  if (!/^pk_test_[A-Za-z0-9_]{8,}$/.test(stripePublishableKey)) {
    issue(issues, "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "not_test_credential");
  }
  const stripePublishableKeySha256 =
    env.FLIGHT_CONSUMER_PREVIEW_STRIPE_PUBLISHABLE_KEY_SHA256 ?? "";
  if (
    !sha256Pattern.test(stripePublishableKeySha256)
    || sha256(stripePublishableKey) !== stripePublishableKeySha256
  ) {
    issue(issues, "FLIGHT_CONSUMER_PREVIEW_STRIPE_PUBLISHABLE_KEY_SHA256", "does_not_bind_publishable_key");
  }
  if (!/^whsec_[A-Za-z0-9_]{16,}$/.test(env.FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_SECRET ?? "")) {
    issue(issues, "FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_SECRET", "invalid_dedicated_secret");
  }
  if (
    typeof env.STRIPE_WEBHOOK_SECRET === "string"
    && env.STRIPE_WEBHOOK_SECRET === env.FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_SECRET
  ) {
    issue(issues, "FLIGHT_CONSUMER_PREVIEW_STRIPE_WEBHOOK_SECRET", "must_differ_from_generic_secret");
  }
  const stripeAccountId = env.FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_ID ?? "";
  if (!/^acct_[A-Za-z0-9]{8,127}$/.test(stripeAccountId)) {
    issue(issues, "FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_ID", "invalid_or_missing");
  }
  const stripeAccountSha256 = env.FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_SHA256 ?? "";
  if (!sha256Pattern.test(stripeAccountSha256) || sha256(stripeAccountId) !== stripeAccountSha256) {
    issue(issues, "FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_SHA256", "does_not_bind_account_id");
  }
  for (const keyring of KEYRINGS) {
    const prefix = `FLIGHT_CONSUMER_PREVIEW_${keyring}`;
    const version = env[`${prefix}_KEY_VERSION`] ?? "";
    const encryption = env[`${prefix}_ENCRYPTION_KEY_BASE64URL`] ?? "";
    const hmac = env[`${prefix}_HMAC_KEY_BASE64URL`] ?? "";
    if (!keyVersionPattern.test(version)) issue(issues, `${prefix}_KEY_VERSION`, "invalid_or_missing");
    if (!base64Url32BytePattern.test(encryption)) {
      issue(issues, `${prefix}_ENCRYPTION_KEY_BASE64URL`, "not_canonical_32_byte_base64url");
    }
    if (!base64Url32BytePattern.test(hmac)) {
      issue(issues, `${prefix}_HMAC_KEY_BASE64URL`, "not_canonical_32_byte_base64url");
    }
    if (encryption.length > 0 && encryption === hmac) {
      issue(issues, `${prefix}_HMAC_KEY_BASE64URL`, "must_differ_from_encryption_key");
    }
  }
  const appUrl = env.NEXT_PUBLIC_APP_URL ?? "";
  try {
    const parsed = new URL(appUrl);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
      throw new Error();
    }
  } catch {
    issue(issues, "NEXT_PUBLIC_APP_URL", "not_stable_https_url");
  }
  return Object.freeze({
    version: "flight-consumer-preview-env-audit-v1",
    target: "preview",
    projectRef: PREVIEW_PROJECT_REF,
    ready: issues.length === 0,
    issues: Object.freeze(issues),
  });
}

export async function verifyStripeTestAccountBinding(env, fetcher = fetch) {
  const audit = auditFlightConsumerPreviewEnvironment(env);
  if (!audit.ready) return Object.freeze({ verified: false, reason: "environment_not_ready" });
  try {
    const response = await fetcher("https://api.stripe.com/v1/account", {
      method: "GET",
      headers: {
        Authorization:
          `Bearer ${env.FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY}`,
      },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return Object.freeze({ verified: false, reason: "stripe_rejected" });
    const body = await response.json();
    if (
      body === null
      || typeof body !== "object"
      || body.livemode === true
      || body.id !== env.FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_ID
      || sha256(body.id) !== env.FLIGHT_CONSUMER_PREVIEW_STRIPE_ACCOUNT_SHA256
    ) return Object.freeze({ verified: false, reason: "account_binding_mismatch" });
    return Object.freeze({ verified: true, reason: "verified" });
  } catch {
    return Object.freeze({ verified: false, reason: "stripe_unavailable" });
  }
}

export async function discoverStripeTestAccountBinding(env, fetcher = fetch) {
  const restrictedKey =
    env.FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY ?? "";
  const restrictedKeySha256 =
    env.FLIGHT_CONSUMER_PREVIEW_STRIPE_RESTRICTED_KEY_SHA256 ?? "";
  if (
    !/^rk_test_[A-Za-z0-9_]{8,}$/.test(restrictedKey)
    || !sha256Pattern.test(restrictedKeySha256)
    || sha256(restrictedKey) !== restrictedKeySha256
  ) {
    return Object.freeze({ discovered: false, reason: "test_secret_unavailable" });
  }
  try {
    const response = await fetcher("https://api.stripe.com/v1/account", {
      method: "GET",
      headers: { Authorization: `Bearer ${restrictedKey}` },
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return Object.freeze({ discovered: false, reason: "stripe_rejected" });
    const body = await response.json();
    if (
      body === null
      || typeof body !== "object"
      || body.livemode === true
      || !/^acct_[A-Za-z0-9]{8,127}$/.test(body.id ?? "")
    ) return Object.freeze({ discovered: false, reason: "invalid_test_account" });
    return Object.freeze({
      discovered: true,
      reason: "discovered",
      accountId: body.id,
      accountSha256: sha256(body.id),
    });
  } catch {
    return Object.freeze({ discovered: false, reason: "stripe_unavailable" });
  }
}

function invocation(argv) {
  const file = argv.find((value) => value.startsWith("--env-file="))?.slice("--env-file=".length);
  const probeStripe = argv.includes("--probe-stripe-account");
  const discoverStripe = argv.includes("--discover-stripe-account");
  if (probeStripe && discoverStripe) throw new Error("Choose one Stripe account audit mode.");
  if (argv.some((value) => !["--probe-stripe-account", "--discover-stripe-account"].includes(value)
    && !value.startsWith("--env-file="))) {
    throw new Error("Unsupported Consumer Preview environment audit argument.");
  }
  return { file, probeStripe, discoverStripe };
}

export async function main(argv = process.argv.slice(2), sourceEnv = process.env) {
  const parsed = invocation(argv);
  const env = parsed.file === undefined
    ? sourceEnv
    : parseDotenv(readFileSync(parsed.file, "utf8"));
  const audit = auditFlightConsumerPreviewEnvironment(env);
  const stripe = parsed.probeStripe
    ? await verifyStripeTestAccountBinding(env)
    : parsed.discoverStripe
      ? await discoverStripeTestAccountBinding(env)
      : Object.freeze({ verified: false, reason: "not_requested" });
  const result = Object.freeze({ ...audit, stripeAccountProbe: stripe });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (
    !audit.ready
    || (parsed.probeStripe && !stripe.verified)
    || (parsed.discoverStripe && !stripe.discovered)
  ) process.exitCode = 1;
  return result;
}

const invokedPath = process.argv[1] === undefined ? "" : pathToFileURL(process.argv[1]).href;
if (import.meta.url === invokedPath) await main();

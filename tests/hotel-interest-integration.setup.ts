import { afterAll, beforeAll } from "vitest";

const originalFetch = globalThis.fetch;
const originalEnvironment = new Map<string, string | undefined>();

const failClosedEnvironment: Record<string, string> = {
  DIRECT_HOTEL_REQUESTS_ENABLED: "false",
  DIRECT_HOTEL_OFFERS_ENABLED: "false",
  DIRECT_HOTEL_EXPIRY_WORKER_ENABLED: "false",
  HOTEL_MANAGER_APPLICATION_INTAKE_ENABLED: "false",
  HOTEL_MANAGER_INTEREST_INTAKE_ENABLED: "false",
  HOTEL_TRANSACTION_KILL_SWITCH: "true",
  LEGACY_HOTEL_BOOKING_FLOW_ENABLED: "false",
  NEXT_PUBLIC_PUBLIC_BOOKING: "false",
  ENABLE_LIVE_BOOKING_PAYMENTS: "false",
  ENABLE_LIVE_PARTNER_PAYOUTS: "false",
  ENABLE_LIVE_STRIPE_WEBHOOKS: "false",
  OPENAI_HOTEL_PLANNER_ENABLED: "false",
  EMAIL_WORKER_ENABLED: "false",
  HOTEL_DEMO_INVENTORY_ENABLED: "false",
};

const credentialEnvironmentKeys = [
  "CRON_SECRET",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "RESEND_WEBHOOK_SECRET",
  "OPENAI_API_KEY",
  "OPENAI_SAFETY_IDENTIFIER_SECRET",
  "PMS_CREDENTIAL_ENCRYPTION_KEY",
  "CRS_SYNXIS_USERNAME",
  "CRS_SYNXIS_PASSWORD",
] as const;

const credentialEnvironmentPatterns = [
  /^(?:PMS_|CRS_SYNXIS_)/,
  /^(?:SUPABASE_|NEXT_PUBLIC_SUPABASE_)/,
  /^(?:STRIPE_|NEXT_PUBLIC_STRIPE_)/,
  /^(?:RESEND_|OPENAI_)/,
  /^(?:DATABASE_URL|POSTGRES_URL|CRON_SECRET|VERCEL_TOKEN)$/,
] as const;

function remember(key: string) {
  if (!originalEnvironment.has(key)) originalEnvironment.set(key, process.env[key]);
}

beforeAll(() => {
  for (const key of Object.keys(process.env)) {
    if (!credentialEnvironmentPatterns.some((pattern) => pattern.test(key))) continue;
    remember(key);
    if (key in failClosedEnvironment) process.env[key] = failClosedEnvironment[key];
    else delete process.env[key];
  }
  for (const [key, value] of Object.entries(failClosedEnvironment)) {
    remember(key);
    process.env[key] = value;
  }
  for (const key of credentialEnvironmentKeys) {
    remember(key);
    delete process.env[key];
  }

  globalThis.fetch = (async () => {
    throw new Error(
      "Hotel foundation verification forbids network, provider, database, and deployment traffic.",
    );
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  for (const [key, value] of originalEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

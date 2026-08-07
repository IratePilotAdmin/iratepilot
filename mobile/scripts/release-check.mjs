const required = [
  "EXPO_PUBLIC_APP_URL",
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY",
];

const missing = required.filter((name) => !process.env[name]?.trim());
const errors = missing.map((name) => `Missing ${name}`);
const appUrl = process.env.EXPO_PUBLIC_APP_URL;
const stripeKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;

if (appUrl && (!appUrl.startsWith("https://") || appUrl.includes("localhost"))) {
  errors.push("EXPO_PUBLIC_APP_URL must be a production HTTPS URL.");
}
if (stripeKey && !/^pk_(test|live)_/.test(stripeKey)) {
  errors.push("EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY must be a Stripe publishable key.");
}
if (Object.keys(process.env).some((name) => /SECRET|SERVICE_ROLE|WEBHOOK_SECRET/.test(name) && name.startsWith("EXPO_PUBLIC_"))) {
  errors.push("A server secret appears to use the EXPO_PUBLIC_ prefix.");
}

if (errors.length) {
  console.error(["Mobile release preflight failed:", ...errors.map((error) => `- ${error}`)].join("\n"));
  process.exit(1);
}

console.log("Mobile release environment contract passed.");

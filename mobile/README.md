# iRatePilot mobile

Cross-platform iOS and Android customer app built with Expo SDK 57, React Native, TypeScript, and Expo Router.

## Current scope

- Native Explore, hotel details, booking requests, Trips, and Account tabs
- Native Supabase authentication with encrypted session storage
- Stripe PaymentSheet for eligible approved reservations with server-authoritative confirmation
- Explicit booking-notification opt-in, safe deep links, and gated server delivery
- iOS bundle identifier and Android application ID reserved as `com.iratepilot.app`
- EAS development, preview, production, and submission profiles

## Local development

1. Copy `.env.example` to `.env`.
2. Add only the public app, Supabase, and Stripe values. Never use service-role, Stripe secret, webhook, or Expo server access tokens.
3. Run `npm install` inside `mobile/`.
4. Run `npm run typecheck`.
5. Run `npm run start` and use a development build for native Stripe and notification testing.

## Release preparation

- Run `npm run release:check` with the selected EAS environment values.
- Use `eas build --profile preview` for internal physical-device QA.
- Use `eas build --profile production` only after the release checklist is approved.
- Review [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) before any TestFlight, Google Play, or production submission.

Authentication and authorization remain enforced by Supabase Auth, row-level security, and server APIs.

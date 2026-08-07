# iRatePilot mobile

Cross-platform iOS and Android customer app built with Expo SDK 57, React Native, TypeScript, and Expo Router.

## Current scope

- Native Explore, Trips, and Account tabs
- Native Supabase email/password registration, sign-in, sign-out, and session restoration
- Encrypted session storage through Expo SecureStore on iOS and Android
- Destination search and authenticated trip handoff to verified production flows
- iOS bundle identifier and Android application ID reserved as `com.iratepilot.app`
- EAS development, preview, production, and submission profiles

## Local development

1. Copy `.env.example` to `.env`.
2. Add the Supabase project URL and publishable client key. Never use the service-role key.
3. Run `npm install` inside `mobile/`.
4. Run `npm run typecheck`.
5. Run `npm run start` and open the project in Expo Go or a development build.

## Planned phases

1. Native hotel search/results and property details backed by iRatePilot APIs.
2. Native trip history, push notifications, and deep links.
3. Native Stripe PaymentSheet checkout with server-enforced booking ownership.
4. App Store and Google Play assets, privacy disclosures, TestFlight/internal testing, and release submission.

Authentication and authorization remain enforced by Supabase Auth, row-level security, and server APIs. Never place Supabase service-role keys, Stripe secret keys, or webhook secrets in the mobile application.

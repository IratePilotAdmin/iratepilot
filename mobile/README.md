# iRatePilot mobile

Cross-platform iOS and Android customer app built with Expo SDK 57, React Native, TypeScript, and Expo Router.

## Phase 1 scope

- Native Explore, Trips, and Account tabs
- Destination search that opens the verified production inventory flow
- Secure handoff to the production sign-in, registration, trip history, and checkout pages
- iOS bundle identifier and Android application ID reserved as `com.iratepilot.app`
- EAS development, preview, production, and submission profiles

## Local development

1. Copy `.env.example` to `.env`.
2. Run `npm install` inside `mobile/`.
3. Run `npm run start`.
4. Open the project in Expo Go or a development build.

## Planned phases

1. Native Supabase authentication and secure token storage.
2. Native hotel search/results and property details backed by iRatePilot APIs.
3. Native trip history, push notifications, and deep links.
4. Native Stripe PaymentSheet checkout with server-enforced booking ownership.
5. App Store and Google Play assets, privacy disclosures, TestFlight/internal testing, and release submission.

Never place Supabase service-role keys, Stripe secret keys, or webhook secrets in the mobile application.

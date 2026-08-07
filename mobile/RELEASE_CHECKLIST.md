# Mobile release checklist

No production build or store submission is approved until every item is complete.

## Repository gates

- [ ] PR #160 merged after its required Vercel check succeeds.
- [ ] PR #161 retargeted to `main` and all required checks pass.
- [ ] Supabase backup verified and migration `202608060030_mobile_push_tokens.sql` applied.
- [ ] Rollback script retained and reviewed.
- [ ] `npm run typecheck` and `npm run release:check` pass inside `mobile/`.

## EAS and credentials

- [ ] Expo/EAS project is linked and its project ID is present in generated app configuration.
- [ ] Development, preview, and production EAS environments contain only the required public mobile values.
- [ ] Apple APNs credential is configured for `com.iratepilot.app`.
- [ ] Firebase Cloud Messaging V1 credential is configured for `com.iratepilot.app`.
- [ ] Stripe publishable key matches the approved server payment mode.
- [ ] Server-only `EXPO_ACCESS_TOKEN` is stored outside the mobile build environment.

## Physical-device acceptance

- [ ] iOS sign-up, sign-in, search, request, Trips, payment, sign-out.
- [ ] Android sign-up, sign-in, search, request, Trips, payment, sign-out.
- [ ] Notification opt-in and opt-out on both platforms.
- [ ] Approved, declined, paid, cancelled, and refunded notification deep links.
- [ ] Invalid/revoked device token is disabled.
- [ ] Accessibility labels, large text, dark mode, offline/error behavior.
- [ ] Test Stripe charge only; do not perform an unapproved live charge.

## Store materials and compliance

- [ ] Final 1024×1024 app icon, Android adaptive foreground, splash image, and screenshots.
- [ ] App Store privacy details and Google Play Data safety answers reviewed.
- [ ] Privacy policy, terms, support URL, and account-deletion path verified.
- [ ] TestFlight and Play internal-testing builds approved before production submission.

# Mobile release checklist

No production build or store submission is approved until every item is complete.

## Repository gates

- [x] Mobile application foundation and release workflows merged to `main`.
- [x] Supabase backup verified and migration `202608060030_mobile_push_tokens.sql` applied.
- [x] Rollback script retained and reviewed.
- [x] iOS production build uploaded successfully to App Store Connect.
- [x] App Store Connect application record created (`6799150724`).
- [ ] Build version `1.0.0` after this release-alignment change is merged.
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

## Current store blockers

- [ ] Select the new `1.0.0` iOS build in App Store Connect.
- [ ] Upload final iPhone screenshots and complete App Store metadata.
- [ ] Complete App Review contact, reviewer account, privacy, accessibility, and export-compliance answers.
- [ ] Create the Android production AAB and upload it to the Google Play internal track as a draft.
- [ ] Complete Google Play app access, Data safety, content rating, ads, and target API declarations.

# Mobile store submission status

Last verified: August 7, 2026.

## Apple App Store

- App Store Connect application: `6799150724`
- Bundle identifier: `com.iratepilot.app`
- Store version: `1.0` — Prepare for Submission
- Latest successful upload: `0.4.0 (4)`
- Next required build: `1.0.0` with an auto-incremented build number
- EAS submission `97125e5b-2574-4a2f-8e0f-9ff34df8140b`: Success

The existing `0.4.0` upload is not the final release candidate because the App Store version record is `1.0`. Build and upload `1.0.0`, then select that build only after physical-device acceptance passes.

## Google Play

- Package name: `com.iratepilot.app`
- Internal preview APK builds: available
- Production AAB: not built
- Play submission: not started

The production submit profile targets the Play internal track and creates a draft release. Store promotion or production rollout requires a separate explicit approval after device testing and policy review.

## Safety boundaries

- Do not commit App Store Connect keys, Google service-account JSON, passwords, reviewer credentials, or store session tokens.
- Do not submit for review until screenshots, disclosures, reviewer access, and physical-device tests are complete.
- Do not enable automatic release; use a controlled manual release after approval.

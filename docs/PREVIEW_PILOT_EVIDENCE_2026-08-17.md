# Private-pilot Preview evidence — 2026-08-17

This record captures the verified Preview-only baseline for the first hotel-manager pilot. It contains no credentials, personal data, or production authorization.

## Verified source and deployment

- Git branch: `agent/align-homepage-pilot-claims`
- Verified source commit: `32ec17d854c395b498ef878f032447c0322cba27`
- Vercel project: `iratepilotadmin`
- Preview deployment: `dpl_5xA2SR8nAg8J7Sjrm2tY2fveeHCr`
- Preview deployment state: `READY`
- Deployment target: Preview only; no production alias
- Framework: Next.js

## Verified Preview database

- Supabase project name: `iratepilot-preview-20260817`
- Supabase project reference: `eiqmdldjnedqgbtoozqa`
- Latest recorded migration: `202608170062`
- Recorded repository migration count: 73
- Hotel-intake columns and `review_partner_application` function verified present

The Preview database was initialized from the repository's canonical schema, and the repository migration history was recorded through migration 062. The environment is isolated from production.

## Acceptance evidence

- `/hotel-intake` rendered successfully with the complete manager form.
- A clearly labelled synthetic hotel intake returned the expected receipt message.
- The resulting application remained `pending`.
- No property draft or public property was created by submission.
- All three required authority, content-rights, and accuracy confirmations were stored.
- The synthetic intake was deleted after verification and its removal was confirmed.
- The public home page rendered successfully.
- No Vercel runtime error or warning was found during the verification window.
- The repository passed lint, TypeScript, automated tests, and the Next.js build before deployment.
- A local commercial sandbox preflight reported `ready: true`, `networkRequestsMade: 0`, `liveTransactions: disabled`, and `synxisTraffic: disabled` using non-secret placeholder configuration.

## Safety boundary

This evidence does not authorize a production database change, production deployment, live booking, live payment, payout, supplier request, manager invitation, transactional email, or publication of a real hotel. Those actions retain their separate approval gates.

## Remaining external evidence

- A real authorized hotel representative must supply and attest to the hotel's information.
- iRatePilot must independently verify the representative, hotel identity, content rights, and commercial approvals.
- The contact/support and transactional-email paths must be exercised in Preview under a separately approved external-email test.
- A verified pilot partner must complete the partner-portal acceptance workflow.
- Stripe, supplier/PMS, Resend, legal, and production-release evidence remains provider- or operator-dependent.

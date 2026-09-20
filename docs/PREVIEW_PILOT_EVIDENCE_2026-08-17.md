# Private-pilot Preview evidence — 2026-08-17

This record captures the verified Preview-only baseline for the first hotel-manager pilot. It contains no credentials, personal data, or production authorization.

## Verified source and deployment

- Git branch: `agent/align-homepage-pilot-claims`
- Verified base commit: `d6b11b676b3e9aced6207b16afbf46163aabf6a4`
- Deployment source: Git commit `d6b11b676b3e9aced6207b16afbf46163aabf6a4`; later local working-tree changes are not included
- Vercel project: `iratepilotadmin`
- Preview deployment: `dpl_6KEyjrRpFVG9JMdQXnVdStipzaSk`
- Generated Preview URL: `https://iratepilotadmin-ggtxs87qr-irate-pilot.vercel.app`
- Preview deployment state: `READY`
- Stable Preview alias: `https://iratepilotadmin-preview-20260817.vercel.app`
- Stable Preview alias assignment: points to `dpl_6KEyjrRpFVG9JMdQXnVdStipzaSk`
- Deployment target: Preview only; no production deployment, promotion, or production alias change
- Framework: Next.js

## Verified Preview database

- Supabase project name: `iratepilot-preview-20260817`
- Supabase project reference: `eiqmdldjnedqgbtoozqa`
- Latest recorded migration: `202608170063`
- Recorded repository migration count: 74
- Hotel-intake columns and `review_partner_application` function verified present

The Preview database is isolated from production. A live runtime audit found that its original baseline process had recorded several historical migrations without creating every corresponding database object. A guarded Preview-only reconciliation restored the physical contracts while preserving the existing migration ledger at 063.

## Preview schema reconciliation

- The preflight found 13 recorded-but-missing tables across booking cancellation and messaging, mobile push, Stripe event reconciliation, PMS readiness, and SynXis certification support.
- The repair ran as one transaction and required the exact Preview ledger at 063 plus empty booking and booking-financial ledgers.
- The repair created no booking, payment, payout, hotel, supplier, or migration-history row.
- The post-check reported zero missing tables and restored the required booking, refund, rate-limit, and SynXis request-journal functions.
- Every migration 026-through-038 contract check returned `true` after reconciliation.
- The authenticated PMS readiness API returned all 22 registered providers with no connection records.
- The authenticated SynXis readiness API returned successfully with `liveEnabled: false`.
- No Preview error or warning was recorded during the post-repair verification window.

## Acceptance evidence

- `/hotel-intake` rendered successfully with the complete manager form.
- Empty-form validation remained on the intake page and created no receipt or application.
- `/admin/partners` loaded the hotel-intake review queue without errors and confirmed that no real intake exists yet.
- `/admin/support` loaded the support workflow without errors.
- A clearly labelled synthetic hotel intake returned the expected receipt message.
- The resulting application remained `pending`.
- No property draft or public property was created by submission.
- All three required authority, content-rights, and accuracy confirmations were stored.
- The synthetic intake was deleted after verification and its removal was confirmed.
- A clearly labelled synthetic contact message returned the expected receipt message and appeared in the authenticated support inbox.
- Support routing was exercised through `new`, `in_progress`, `resolved`, reopened, and finally `resolved`; the final database status was confirmed.
- The synthetic contact message and hotel application were deleted by exact fixture identifiers after verification; follow-up queries confirmed that neither fixture remained.
- Preview platform readiness reported 14 ready, 0 needing attention, and 4 intentionally disabled after enabling the transactional-email worker in Preview only.
- The admin test reused the single previously queued email job instead of creating a duplicate.
- The Preview worker completed the approved transactional-email test with `status: sent`, `delivery_status: sent`, one attempt, a recorded Resend message identifier, and no persisted error.
- The email-outbox record was preserved as operational evidence. No Resend delivery webhook event arrived during the immediate observation window, so this record proves provider acceptance rather than independently verified inbox delivery.
- The public home page rendered successfully.
- The consumer home and rewards pages show a 0% traveler service fee, Basic 5%/2× benefits, and Business 10%/3× benefits; the prior transparent-economics fee card is absent.
- No Vercel runtime error or warning was found during the verification window.
- The repository passed lint, TypeScript, automated tests, and the Next.js build before deployment.
- A local commercial sandbox preflight reported `ready: true`, `networkRequestsMade: 0`, `liveTransactions: disabled`, and `synxisTraffic: disabled` using non-secret placeholder configuration.

## Safety boundary

This evidence records exactly one approved Preview transactional-email test. It does not authorize any additional email, production database change, production deployment, live booking, live payment, payout, supplier request, manager invitation, or publication of a real hotel. Those actions retain their separate approval gates.

## Remaining external evidence

- A real authorized hotel representative must supply and attest to the hotel's information.
- iRatePilot must independently verify the representative, hotel identity, content rights, and commercial approvals.
- Resend delivery-webhook or intended-inbox receipt should be observed during ongoing pilot monitoring; the immediate acceptance test confirmed provider acceptance only.
- A verified pilot partner must complete the partner-portal acceptance workflow.
- Stripe, supplier/PMS, Resend, legal, and production-release evidence remains provider- or operator-dependent.

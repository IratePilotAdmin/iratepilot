# Private hotel onboarding drafts

This bounded first onboarding slice lets a verified account save private hotel
details and submit them into the **existing pending partner application queue**.
It does not promote customer accounts to partners, create or activate properties,
approve applications, enable booking/payment, or execute commercial agreements.
Hotel eligibility remains four or five stars.

## Database contract

Apply `supabase/hotel-migrations/202609160140_partner_self_service_drafts.sql`
explicitly to a reviewed isolated target with the canonical commercial intake
schema already installed. The migration checks the canonical submit RPC and
compatibility columns before creating anything. It is outside the flight
installer's pinned migration directory and does not alter that installer.

`partner_onboarding_controls` starts disabled. Enabling the separately configured
application feature does not override this database control. Only a trusted
operator can change the database control; browser users cannot read or update it.
Do not enable either gate until application and database checks pass in Preview.

The server setting is `PARTNER_SELF_SERVICE_ONBOARDING_ENABLED=true` (default
`false` in `.env.example`). The public landing and registration routes are
`/partners` and `/partners/register`; returning applicants sign in to
`/partner/dashboard?setup=1`. When the feature is enabled, `/partner` renders the
same landing page and the previous anonymous `/api/partners/apply` endpoint
returns 410 with the registration path before reading or writing an application.
Existing partner operating routes retain their existing access requirements.

Short registration uses the existing Supabase signup and confirmation callback.
Configure and test the Preview redirect allowlist and confirmation emails before
opening signup. User metadata retains short registration inputs for the first
verified sign-in; it grants no role, ownership or approval privileges. Passwords
are only passed to Supabase Auth, and application email comes from verified
account identity rather than the saved registration document.

`partner_onboarding_drafts` stores owner identity, immutable short registration,
saved detail JSON, optimistic revision, draft/submitted status, timestamps and a
unique link to an existing application. Both JSON documents have exact field
allowlists. Registration JSONB is bounded to 4,000 bytes and details to 16,000;
client bounds must allow for JSONB formatting overhead and UTF-8 multibyte text.

Authenticated users can read their own drafts; admins can read all drafts.
All direct client insert/update/delete access is denied. The three mutations are:

- `create_partner_onboarding_draft(uuid,jsonb)`: verified owner is derived from
  `auth.uid()`. A repeated registration key returns the original row. An owner
  advisory transaction lock protects the maximum of ten saved registrations.
- `save_partner_onboarding_draft(uuid,integer,jsonb)`: replace the partial detail
  document at the expected revision. Empty or incomplete typed values can be
  saved within bounds; star rating remains restricted to four or five. Stale
  revisions fail with SQLSTATE `PT409` after follow-up migration 141 instead
  of overwriting a newer edit. Original migration 140 used `40001`.
- `submit_partner_onboarding_draft(uuid,integer)`: validate completeness, current
  disclosure acknowledgements, HTTPS URLs without credentials or backslashes,
  and support email. Lock the draft, call canonical `submit_partner_application`,
  and link the returned pending application atomically. A prior pending application
  must match every normalized submitted field and must not belong to another
  draft; otherwise submission returns a conflict rather than pretending new
  details were submitted. Repeat submission returns the linked result.

Every mutation checks the database gate and confirmed nonempty account email.
The account row is shared-locked during the transaction so email verification
cannot change midway through submission. RPC responses use snake_case draft
fields and omit `owner_id`. Submitted drafts are read-only through these RPCs.

SQLSTATEs: `42501` unauthorized/unverified, `55000` disabled or immutable state,
`22023` validation, `PT409` stale revision after migration 141, `23505` existing property/application
conflict, and `54000` owner capacity. No RPC accepts a client-supplied owner or email.

## Existing intake integration

The canonical RPC owns its existing global/per-email intake quotas and pending
application deduplication. Short-registration email is the verified account email.
For newly created applications only, the wrapper fills the old admin queue's
`country`, `photo_source_url`, and `hotel_authorized` compatibility fields.
Existing application rows are never overwritten by linking.

The acknowledgement records
`hotel_partner_fee_disclosure_13_3_2026-08-22_v1` and server time. It is disclosure
acceptance only. The existing executed-agreement evidence, verification, approval,
connectivity and activation controls remain required and unchanged.

## Rollback and validation

`supabase/hotel-rollbacks/202609160140_partner_self_service_drafts.rollback.sql`
disables mutations and preserves all drafts, owner reads and linked applications.
Disable the application feature too. Reopening requires a reviewed control
change; this CREATE TABLE migration must not be replayed as an enable switch.
Both SQL packages bound lock waits to five seconds and statements to 60 seconds.

The repeatable local runner is
`node scripts/verify-partner-self-service-drafts.mjs <absolute-local-PGlite-module>`.
It uses only a new in-memory database, the actual canonical submit RPC extracted
from the schema, real `anon`/`authenticated` roles, and RLS. Its fixtures cover
gate-off behavior, anonymous/unverified refusal, owner/admin reads, direct DML
refusal, idempotent registration, multiple properties, optimistic revision,
partial saves, eligibility, submission completeness, safe URL handling, normalized
spaces, canonical queue linking, duplicate conflicts and matching prior records,
rechecked email verification, capacity, preserved rollback, and absence of role,
property, or executed-agreement creation.

These are actual PostgreSQL function/RLS tests on minimal tables; they are not
full-schema or hosted Supabase acceptance, and the in-memory runner does not
prove simultaneous connection races. Advisory and row locks implement those
boundaries; managed Preview concurrency verification remains part of rollout.
No remote database migration or feature enablement was performed locally.

## Release prerequisites discovered in hosted Preview

Deploy the API's PT409 handling before applying
`202609160141_partner_draft_terminal_conflicts.sql`. PostgREST can retry 40001;
the follow-up migration gives stale edits a terminal HTTP 409 response.

Password recovery requires server-only `AUTH_RECOVERY_SIGNING_SECRET` when
`SUPABASE_SERVICE_ROLE_KEY` is absent. Generate a strong random secret (at least
32 random bytes encoded as hex), keep it stable for the target environment, and
configure exact email callback destinations. The implementation retains the
legacy service-role fallback; do not add an administrator key merely for recovery.

An approved owner's checklist uses the session client and existing row-level
security. Pending-owner and delegated-manager paths still use their existing
privileged read configuration and require separate acceptance.

Verify the canonical `review_partner_application(uuid,text)` function and its
administrator check exist before testing admin decisions. The isolated Preview
needed this function restored from migration 062. Do not blindly replay that
entire migration on another database with existing constraints.

Finance reports require authenticated SELECT on booking_financials, alongside
the reviewed admin/approved-owner RLS policies. Preview needed this grant restored;
anonymous access remained denied. Inspect target policies before granting access.
Neither this read permission nor application approval enables payouts/publication.

These prerequisites document Preview findings, not instructions to enable
production automatically. Review the target schema, permissions, rollback and
release evidence separately. Synthetic records and example.com photo fixtures
must not be treated as real hotel verification or publishable content.

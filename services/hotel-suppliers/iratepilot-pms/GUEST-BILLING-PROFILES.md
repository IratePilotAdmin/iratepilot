# Property-scoped guest and billing contacts — destination migration161

Migration161 adds optional contacts for hotel and whole-home reservations. It is a source-only backend module until the public RPCs are connected to a reviewed UI. It does not send messages, verify email ownership, process payments, create invoices, collect identity documents or share guest profiles between properties. Existing reservation names, pricing snapshots, folios and closed service-day entries remain unchanged.

## Data and authorization

Contact fields are flat optional strings: `display_name`, `legal_name`, `email`, `phone`, `company_name`, `address_line1`, `address_line2`, `city`, `region`, `postal_code`, `country_code`. Reusable profiles require a nonblank display name. Stay-local contacts may omit it. Billing parties use the same fields except `display_name`; billing is entered independently and never automatically copied from a guest profile.

Missing/blank values normalize to null; surrounding spaces are trimmed. Names, company and address lines are limited to200 characters, email254, phone40, city/region100, postal code32 and country code2. Country codes are normalized to uppercase letters. Email uses a simple bounded syntax check with no delivery or ownership claim. Unknown fields, arrays/objects in scalar fields, control characters and objects over8192 bytes fail before persistence. Passport, tax-identity, card and free-form sensitive-note fields are not accepted.

Owner, manager and staff may read and save contacts within their existing property scope. Tenant-share locks precede property read/write locks, followed by an authorization recheck. Membership removal therefore prevents further reads, writes and receipt replay. Anonymous users and service-role public RPC calls are denied. Authenticated clients cannot query the underlying guest tables directly. Privileged server/database administrators retain explicit service read access; no such credential belongs in a browser.

`guest_profiles` and `reservation_parties` have composite tenant/property keys and scoped foreign keys. A profile in one property cannot be searched, read, linked or updated through another property's scope, even within the same organization. Profiles are never automatically merged by name, phone or email; shared contact information does not establish identity.

## Public RPC contracts

All names below have the `public.irp_pms_pilot_` prefix. Tenant, property, request, reservation and guest IDs are UUIDs. Version arguments are bigint.

`guest_profile(p_tenant, p_property, p_guest)` returns:

```text
{id, version, data, created_at, updated_at}
```

`search_guests(p_tenant, p_property, p_query text, p_limit integer DEFAULT 20)` returns:

```text
{
  guests: [{id, version, display_name, legal_name, email, phone, company_name, updated_at}],
  query, limit, has_more
}
```

The query accepts zero to100 characters; an empty query lists recent profiles. Limits are1–50. Search matches case-insensitive literal substrings in the displayed name, legal name, email, phone or company. `%` and `_` are literal characters. Results are ordered by latest update and ID; one internal sentinel determines `has_more` and is never returned. Search summaries exclude postal addresses and reservation billing information. The caller must narrow a search when `has_more` is true; this is a bounded picker, not a complete guest export.

`save_guest_profile(p_tenant, p_property, p_request, p_guest, p_expected_version, p_data jsonb)` creates with null guest/version or updates an existing scoped profile with its exact version. It returns:

```text
{guest_id, version, created, replayed}
```

Saving normalized identical data preserves the version and update time. A real change advances the version. A stale version fails with SQLSTATE40001. Saving a reusable profile is an explicit opt-in action; saving a stay contact alone never creates one.

`reservation_guest(p_tenant, p_property, p_reservation)` returns:

```text
{
  reservation_id, reservation_name, recorded, version,
  guest_id, guest_profile_version, linked_profile_current_version,
  linked_profile_changed, contact, billing_party, updated_at
}
```

Before any save, version is0 and `recorded` is false. The contact display name is a read-only hint based on the booked name; legacy control characters are replaced with spaces only in that hint. `reservation_name` always preserves the historical value. No contact record is created by reading.

`save_reservation_guest(p_tenant, p_property, p_reservation, p_request, p_expected_version, p_guest, p_guest_expected_version, p_contact jsonb, p_billing_party jsonb, p_keep_existing_contact boolean DEFAULT false)` returns:

```text
{reservation_id, version, guest_id, guest_profile_version, replayed}
```

Use version0 for the first save. For a stay-local contact, pass null guest/profile-version and an explicit contact object. For a reusable-profile link, pass the guest ID and its exact current version, with `p_contact = NULL`; the server copies that profile into the stay record. Always supply an independent billing object, which may be empty. Competing profile IDs and contact overrides are rejected.

For a billing-only change, pass `p_keep_existing_contact = true` and null guest ID, guest version and contact arguments. An existing saved stay contact is required. The server preserves its exact contact snapshot, linked guest ID and original copied profile version, even when that profile has since changed. Only explicitly supplied billing details change. This mode shares the same optimistic stay version and idempotent receipt checks. A UI should default recorded stays to “Keep saved contact,” with separate explicit choices to edit/detach the stay contact or copy/refresh a chosen profile.

Profile edits never propagate into existing stays. A linked stay reports `linked_profile_changed` when the reusable profile advances. Refreshing it requires another explicit link save with both current stay and profile versions. Detaching requires a null guest and explicit stay-local contact. Billing changes share the stay contact's optimistic version so concurrent edits cannot silently overwrite each other. These explicit metadata saves are permitted for historical stays too, but do not rename the reservation, change a financial amount or rewrite issued service-day evidence.

## Retry and UI behavior

Each property/request identity is shared between profile and stay-contact commands. Receipts bind the actor to a SHA256 hash of the normalized command and contain only result IDs, versions and flags. They do not duplicate contact/billing payloads or keep a second plaintext history of addresses. Activity details similarly contain IDs and version metadata only.

`guest_request_status(p_tenant, p_property, p_request)` reads a receipt using only its request ID. The original actor receives `{found: true, action, result}`; `action` is exactly `save_guest_profile` or `save_reservation_guest`. Missing requests and requests belonging to another actor both return only `{found: false}`. It uses the same scope/lock/recheck rules and remains readable during a write shutdown. No command hash or contact payload is returned.

An exact canonical retry returns its original metadata before later version changes are checked. A changed actor or payload cannot reuse the identity. A response may therefore describe a successfully saved older version while current data has advanced. **Read the current guest/stay record after a successful save or recovered receipt.** Never replace live fields with invented payloads from a metadata-only receipt. The UI can persist only the unresolved request ID, action and target IDs, without saving email/address payloads in browser storage. If status is not found, retain that same request ID for resumed/reentered input: a delayed original command and a resumed command cannot both create records under that identity. If the original later wins with different data, recover its result and let the user review the current record before issuing a separate new edit. Stale-version errors require refreshed data and an explicit new save.

Stay records contain explicit contact snapshots, independently editable through their own version. Existing financial snapshots retain booked names and amounts; changing guest contacts does not trigger financial repricing/reconciliation. Later invoice generation must deliberately snapshot billing details at issue time; this module itself does not issue invoices.

## Verification and shutdown

Run `scripts/verify-iratepilot-pms-guests.mjs` with `PGLITE_DIST` pointing to the PGlite distribution. It applies the destination stack through161 and verifies guest scope, legacy-name compatibility, whitelist/no-persistence failures, exact and conflicting retries, minimal receipts, stale versions, explicit profile copy/refresh/detach, whole-home contacts, independent billing, revoked members, bounded literal search, rollback on receipt failure and unchanged folio/closed allocations.

The161 shutdown revokes the two save RPCs while retaining authenticated scoped reads and stored evidence. It does not delete contacts or modify historical stays. Provider activation, messaging, marketing consent, regulated identity collection and jurisdiction-specific billing requirements are separate work.

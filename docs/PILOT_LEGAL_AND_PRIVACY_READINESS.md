# Private-Pilot Legal and Privacy Readiness

This checklist defines the minimum legal, disclosure, consent, privacy, and records controls required before inviting any hotel partner or customer tester into the iRatePilot private pilot.

This is an operational readiness checklist, not a substitute for advice from qualified legal counsel.

## Current scope

- Private pilot only.
- Invite-only participants.
- Stripe test mode only.
- No real reservations, charges, settlements, or automated partner payouts.
- No public booking launch.
- No unapproved hotel content or inventory.

## Required participant documents

Before activation, prepare and approve:

- [ ] Private-pilot customer terms.
- [ ] Private-pilot partner participation agreement.
- [ ] Privacy notice describing pilot data collection and use.
- [ ] Test-payment and simulated-booking disclosure.
- [ ] Feedback and communications consent.
- [ ] Acceptable-use and prohibited-activity rules.
- [ ] Confidentiality expectations for nonpublic pilot features.
- [ ] Pilot suspension and termination language.
- [ ] Contact information for privacy, support, and legal notices.

## Customer disclosures

Every invited customer must be told clearly before creating an account:

- [ ] The service is a limited private pilot.
- [ ] Reservations may be simulated and are not guaranteed real stays.
- [ ] Only approved Stripe test cards may be used.
- [ ] No real card details should be entered.
- [ ] Test charges have no cash value.
- [ ] Rewards, discounts, credits, and balances are test records only.
- [ ] Features may change, fail, or be suspended without notice.
- [ ] The participant may withdraw from the pilot.
- [ ] Support and privacy contact methods are provided.

Do not use language that could reasonably cause a tester to believe a test reservation is a confirmed real-world hotel booking.

## Partner disclosures and permissions

Before a property is activated, obtain written confirmation that the partner:

- [ ] Has authority to provide the property information and participate.
- [ ] Grants permission to use approved names, descriptions, photos, rates, amenities, and policies for the pilot.
- [ ] Identifies which content is real, test-only, or prohibited from publication.
- [ ] Understands that bookings and payments are simulated.
- [ ] Understands that no settlement or payout will occur.
- [ ] Will keep rates, inventory, taxes, fees, and policies accurate during testing.
- [ ] Will identify trademark, franchise, management-company, or brand restrictions.
- [ ] Will promptly request correction or removal of unauthorized content.

Do not copy property content from another OTA or hotel website without permission or a valid license.

## Privacy data map

Document each category of pilot data, including:

- Account identifiers and email addresses.
- Partner business and property records.
- Test booking and payment identifiers.
- Messages between customers and partners.
- Support tickets and feedback.
- Application, audit, security, email, and webhook logs.
- Device, browser, IP, and diagnostic information where collected.
- Rewards and reconciliation records.

For each category, record:

- [ ] Purpose of collection.
- [ ] System of record.
- [ ] Who can access it.
- [ ] Service provider or processor involved.
- [ ] Retention period.
- [ ] Deletion or anonymization process.
- [ ] Whether it may contain sensitive information.

## Data minimization

- Collect only data needed for the approved pilot workflow.
- Do not collect government identification, tax IDs, bank credentials, or real payment-card data through GitHub, support messages, or test forms.
- Do not store passwords, access tokens, API keys, service-role keys, or webhook secrets in participant records.
- Redact personal information from screenshots, defects, logs, and release evidence.
- Use booking and user reference IDs instead of names where practical.

## Consent and version evidence

For each participant, retain a secrets-safe record of:

- Participant type: customer or partner.
- Document version accepted.
- Acceptance date and UTC timestamp.
- Account or business reference ID.
- Method of acceptance.
- Withdrawal, suspension, or termination date if applicable.

Do not record full participant personal details in GitHub issues.

## Communications controls

- Separate transactional messages from marketing messages.
- Send pilot invitations only to individually selected participants.
- Do not enroll participants in promotional email without separate consent where required.
- Provide a clear way to stop nonessential pilot communications.
- Do not make claims of guaranteed revenue, savings, occupancy, availability, or public launch status.
- Do not publish participant testimonials, logos, or results without permission.

## Children and restricted use

- The private pilot is not intended for children.
- Do not knowingly invite or activate anyone under the approved minimum age.
- Do not test prohibited, unlawful, fraudulent, abusive, or deceptive transactions.
- Immediately suspend accounts used for unauthorized access, scraping, credential sharing, or real-payment attempts.

## Security and incident notice readiness

Before activation:

- [ ] Name the security and privacy owner.
- [ ] Document how participants report privacy or security concerns.
- [ ] Confirm audit logs exist for privileged operations.
- [ ] Confirm access can be revoked quickly.
- [ ] Confirm participant data can be located and exported where required.
- [ ] Confirm participant data can be deleted or anonymized where appropriate.
- [ ] Document escalation for suspected unauthorized access or disclosure.
- [ ] Prepare participant-notice language, subject to legal review, for a material incident.

## Vendor and processor review

Inventory all providers that may receive pilot data, including at minimum:

- Vercel.
- Supabase.
- Stripe test environment.
- Email delivery provider.
- AI provider, if participant content is submitted to AI features.
- Monitoring, analytics, and logging providers.

For each provider:

- [ ] Confirm the approved account and environment.
- [ ] Review relevant data-processing and security terms.
- [ ] Limit data sent to the minimum required.
- [ ] Disable unnecessary tracking or data sharing.
- [ ] Record the owner responsible for the relationship.

## AI-specific controls

Where AI features process participant content:

- Tell participants that an AI system may generate or assist with responses.
- Do not represent AI output as guaranteed accurate.
- Do not submit secrets, payment credentials, sensitive identification, or unrelated personal information.
- Provide human escalation for booking, payment, cancellation, refund, privacy, and safety decisions.
- Record which workflows may use AI and which must remain human-controlled.

## Records and retention

Define pilot retention periods for:

- Participant acceptance records.
- Account and property records.
- Test bookings and payments.
- Messages and support tickets.
- Audit, security, and webhook logs.
- Feedback and defect evidence.
- Release and reconciliation evidence.

At pilot completion:

- [ ] Decide which records must be retained.
- [ ] Delete or anonymize unnecessary test data.
- [ ] Revoke dormant accounts and credentials.
- [ ] Remove unapproved property content.
- [ ] Document the cleanup result.

## Legal review gate

Before inviting external participants, a qualified reviewer should confirm the pilot documents fit the actual business model, entities, jurisdictions, data practices, and participant types.

At minimum, record:

- Reviewer name or role.
- Review date.
- Documents and versions reviewed.
- Required changes.
- Approval scope and limitations.

## Activation gate

No external participant may be activated until:

- Required disclosures and agreements are approved.
- Privacy and support contacts are active.
- Consent evidence can be recorded.
- The data map and retention rules are documented.
- Vendor and AI data flows are reviewed.
- Issue #127 database and smoke-test gates are complete.
- Issue #128 branch protection is active.
- Issue #130 ownership assignments are complete.
- A written **GO FOR PRIVATE PILOT ONLY** decision is recorded.

## Prohibited launch representations

Until separately approved, do not state that:

- iRatePilot is publicly launched.
- Test inventory is real availability.
- Test bookings create enforceable hotel reservations.
- Test payments are real charges.
- Partners will receive payouts.
- Rewards or balances have cash value.
- Participation guarantees revenue, occupancy, savings, or distribution.

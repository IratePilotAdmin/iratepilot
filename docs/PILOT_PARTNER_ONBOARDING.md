# Private-Pilot Partner Onboarding

Use this checklist for each hotel or vacation-rental partner admitted to the iRatePilot private pilot.

## Eligibility

- Property is a real operating business with an authorized representative.
- The representative agrees to private-pilot limitations and test-mode payments.
- Inventory, room types, rates, taxes, fees, cancellation rules, and property details are accurate.
- No demonstration, copied, scraped, or unauthorized inventory is used.
- The property has a named operations contact and escalation contact.

## Required records

Record the following in the approved internal system, not in public GitHub comments:

- Legal business name
- Property name and address
- Authorized representative
- Operations contact
- Support and escalation contact
- Tax and fee configuration owner
- Inventory source and update method
- Pilot start and planned review date

Do not place bank credentials, passwords, Stripe secrets, Supabase keys, or sensitive identity documents in GitHub.

## Onboarding sequence

1. Partner submits an application.
2. Admin verifies the business and authorized representative.
3. Admin approves the partner only after verification is complete.
4. Partner creates the property record.
5. Partner adds room types, occupancy rules, amenities, photographs, and policies.
6. Partner creates rates and confirms whether taxes and fees are included or added separately.
7. Partner loads a limited private-pilot inventory window.
8. Admin reviews property content, rates, restrictions, and inventory.
9. Partner and admin complete one end-to-end test booking.
10. Partner confirms receipt of booking notifications and access to the reservation workflow.
11. Admin records the partner as pilot-ready.

## Inventory controls

- Load only inventory the partner is authorized to sell.
- Start with a limited date range and unit count.
- Confirm check-in, check-out, occupancy, minimum-stay, and cancellation rules.
- Do not expose zero-rate, negative-rate, duplicate, expired, or demonstration inventory.
- Pause the property immediately if inventory cannot be trusted.

## Payment controls

- Stripe remains in test mode.
- No real guest funds are collected.
- Automated partner payouts remain disabled.
- Test refunds and financial reconciliation must pass before the property is considered pilot-ready.
- Do not collect bank-account information until a separately approved payout-onboarding process exists.

## Access controls

- Each user has an individual account.
- Shared admin or partner accounts are prohibited.
- Confirm the partner can view only its own properties, inventory, messages, reservations, and financial records.
- Confirm the partner cannot approve itself or access admin-only tools.

## Readiness acceptance

A property is pilot-ready only when all of the following are true:

- Partner approval is complete.
- Property content is reviewed.
- Rates, taxes, fees, and cancellation terms are verified.
- Inventory is real, limited, and current.
- Search visibility is correct.
- Test booking, messaging, cancellation, refund, notification, and reconciliation flows pass.
- The operations and escalation contacts acknowledge the support process.

## Pause triggers

Immediately remove or hide the property from pilot search when:

- inventory accuracy is disputed;
- unauthorized availability appears;
- rates, taxes, or fees are materially wrong;
- access isolation fails;
- booking, cancellation, refund, webhook, or notification processing is unreliable;
- the partner asks to pause participation;
- a Severity 0 or Severity 1 incident affects the property.

Reactivation requires documented remediation and a repeat of the affected readiness tests.

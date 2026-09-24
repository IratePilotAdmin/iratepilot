# Duffel onboarding requirements — read-only evidence

Checked: 2026-09-23 (America/Chicago)

Source: [Duffel — Getting started with Duffel](https://duffel.com/guides/getting-started)

This note records public documentation only. No Duffel account mutation, token
creation, balance top-up, payment setup, provider request, booking, or ticketing
was performed.

## Requirements observed

1. **Activate the account before Live Mode.** Duffel describes email verification
   followed by business/personal verification and KYC information as the account
   activation sequence.
2. **Choose the settlement/payment path.** The guide describes either Duffel
   Payments or a funded Duffel Balance while using the Flights API.
3. **Create a Live access token only after activation.** Duffel distinguishes
   Live tokens from test tokens and states that Live tokens can be created with
   read-only or read-write access. The consumer flight package requires a
   separately approved read-write credential before any booking path could be
   enabled.
4. **Use Duffel support for operational questions.** The guide points to the
   Help Centre and Travel Ops support for post-ticket servicing and refunds.

## Mapping to the flight launch gate

- Account activation, commercial/content/ticketing scope, settlement terms,
  support entitlement, and sandbox certification remain external approval gates.
- The repository may prepare the credential handoff and digest contract, but it
  must not read, create, or deploy a Live token without explicit authority.
- This evidence does not authorize provider traffic, booking, payment,
  ticketing, Production deployment, or consumer release.

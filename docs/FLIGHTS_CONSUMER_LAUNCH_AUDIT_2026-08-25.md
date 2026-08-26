# Flights Consumer Launch Audit — 2026-08-25

## Scope and safety

This was a read-only release audit of public DNS, HTTP/TLS behavior, Vercel project/domain state, and high-level email DNS for `iratepilot.com`. Checks were performed on 2026-08-25 at approximately 19:04–19:10 UTC.

**No DNS record, nameserver, Vercel domain, deployment, environment variable, certificate, email configuration, or application code was added, changed, deleted, promoted, or deployed.** The only resulting mutation is this evidence document.

## Decision

**Domain transport gate: PASS. Flight consumer production launch: BLOCKED.**

The website domain is correctly delegated, resolves to Vercel, redirects to the canonical `www` host, and serves valid HTTPS. However, the current Production deployment does not contain the consumer flight package: every public flight page and API route tested returned `404`. Email authentication also lacks DMARC, and Google Workspace DKIM has not been proven.

## Verified web and DNS evidence

| Check | Exact result | Assessment |
| --- | --- | --- |
| Authoritative DNS | `nsa1.squarespacedns.com` through `nsa4.squarespacedns.com`; all four returned identical audited records | Pass |
| Apex address | `iratepilot.com A 216.198.79.1`, TTL 3600 | Pass; accepted by Vercel |
| Canonical host | `www.iratepilot.com CNAME ff6d255199b5c462.vercel-dns-017.com`, TTL 3600 | Pass; exact Vercel-recommended project CNAME |
| Vercel attachment | Both apex and `www` are `verified: true` on project `prj_qFxx3L5PiFgr0S1bNPmzvetGdKRW` | Pass |
| Vercel configuration | Apex and `www`: `misconfigured: false`, `conflicts: []`; `www` has `ipStatus: no-change` | Pass |
| Canonical redirect | Vercel project config sets apex to `https://www.iratepilot.com` with status `308` | Pass |
| HTTP behavior | HTTP apex → HTTPS apex `308`; HTTPS apex → HTTPS `www` `308`; HTTP `www` → HTTPS `www` `308`; HTTPS `www` → `200` | Pass |
| TLS | TLS 1.3; separate Let's Encrypt certificates for apex and `www`, valid 2026-07-28 through 2026-10-26 | Pass now; continue renewal monitoring |
| DNSSEC | Registry delegation is signed; Google DNS returned `AD=true` for A, MX, and DNSKEY responses | Pass |
| Registration | Registered 2026-07-07; registry expiration 2027-07-07; `client delete prohibited` and `client transfer prohibited` | Pass now; auto-renew/recovery must be confirmed in registrar account |

The apex API status is `ipStatus: optional-change`: Vercel currently accepts `216.198.79.1` and reports no misconfiguration, while its API advertises a newer preferred IPv4 pair. This is not a launch blocker and must not be changed during release without a separately approved migration and rollback plan.

Relevant primary guidance: [Vercel custom-domain configuration](https://vercel.com/docs/domains/working-with-domains/add-a-domain) and [Vercel's recommended apex-to-www design](https://vercel.com/docs/domains/working-with-domains/deploying-and-redirecting).

## Production flight-package blocker

The Vercel Production target was `dpl_GoB3DF9SmRu8ZQgyhe7C8sdb1SYb`, created 2026-08-22T21:24:25.407Z, with `readyState: READY`. The canonical website returned the title `iRatePilot | Book Hotels & Vacation Homes` and did not expose the flight package.

The following read-only GET requests all returned `404`:

- `https://www.iratepilot.com/flights`
- `https://www.iratepilot.com/flights/results`
- `https://www.iratepilot.com/flights/checkout`
- `https://www.iratepilot.com/api/flights/search`
- `https://www.iratepilot.com/api/flights/orders`

Production cannot be described as consumer flight-booking ready until an independently approved, flight-enabled Production deployment is promoted and the entire custom-domain flow is reverified end to end. This audit did not promote a deployment.

## Email DNS evidence

| Purpose | Published record | Assessment |
| --- | --- | --- |
| Google Workspace inbound | `iratepilot.com MX 1 smtp.google.com` | Correct current Google Workspace MX; no conflicting root MX |
| Google Workspace SPF | `v=spf1 include:_spf.google.com ~all` at the apex | Correct for Google-only root-domain sending; exactly one SPF record |
| Resend return path | `send.mail.iratepilot.com MX 10 feedback-smtp.us-east-1.amazonses.com` | Matches Resend's documented shape |
| Resend SPF | `v=spf1 include:amazonses.com ~all` at `send.mail.iratepilot.com` | Matches Resend's documented shape; exactly one SPF record |
| Resend DKIM | Public RSA key at `resend._domainkey.mail.iratepilot.com` | Present; decoded key size is 1024 bits |
| DMARC | `_dmarc.iratepilot.com` and `_dmarc.mail.iratepilot.com` both returned NXDOMAIN from every authoritative server | **Blocker** |
| Google Workspace DKIM | Common/default selectors `google._domainkey` and `default._domainkey` returned NXDOMAIN | **Unproven**; a custom selector may exist |
| Mail transport hardening | `_mta-sts`, `mta-sts`, and `_smtp._tls` returned NXDOMAIN | Optional hardening gap |

The single `smtp.google.com` MX is valid for current Google Workspace accounts; it is not a DNS error. Resend's MX lives on `send.mail`, so it does not conflict with the Google MX at the apex.

The Vercel project contains `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `RESEND_WEBHOOK_SECRET` metadata for Preview and Production, but this audit did not read secret values or send email. DNS publication alone does not prove provider verification, signing alignment, mailbox delivery, or webhook processing.

Primary guidance: [Google Workspace MX](https://support.google.com/a/answer/87127), [Google SPF](https://support.google.com/a/answer/33786), [Google DKIM](https://support.google.com/a/answer/174124), [Gmail sender requirements](https://support.google.com/mail/answer/81126), [Resend domain verification](https://resend.com/docs/dashboard/domains/introduction), and [Resend DMARC rollout](https://resend.com/docs/dashboard/domains/dmarc).

## Remaining external release gates

### Required before consumer Production launch

1. Promote an approved flight-enabled Production deployment; verify `/flights`, search, reprice, authenticated checkout, payment, order finalization, confirmation, and My Trips on `https://www.iratepilot.com` without creating an unintended supplier order.
2. Publish DMARC only after inventorying every legitimate sender. Start with reporting (`p=none`), verify alignment, then stage enforcement according to Google/Resend guidance.
3. Prove Google Workspace outbound DKIM using the actual selector and an external recipient's `Authentication-Results` header.
4. Prove one production-shaped Resend transactional email has aligned SPF/DKIM/DMARC, correct From and Return-Path domains, inbox delivery, and working bounce/complaint webhook handling.
5. Confirm registrar auto-renew, current payment method, recovery contacts, MFA, and renewal monitoring before the 2027-07-07 expiration.
6. Re-run DNS, redirect, TLS, security-header, and route checks immediately after Production promotion.

### Hardening before declaring 100% launch readiness

- Add and validate a Content-Security-Policy for the consumer and checkout surfaces; the audited canonical `200` response had no CSP header.
- Consider CAA restrictions after confirming every certificate issuer used by Vercel and other subdomains; no CAA record is currently published.
- Consider MTA-STS and TLS reporting for inbound mail.
- Ask Resend whether a provider-managed 2048-bit DKIM key is available; do not rotate the current provider key manually.
- Confirm any Vercel-recommended apex-IP migration in a controlled maintenance window rather than changing a currently healthy record during launch.

Provider commercial approvals, live Duffel credentials, payment production approval, privacy/compliance, customer support operations, and incident monitoring are outside this DNS/domain audit and remain separate release gates.

# iRatePilot

iRatePilot is a premium travel marketplace for hotel and vacation-home discovery, booking experiences, partner operations, and hospitality revenue tools.

[Visit the live website](https://www.iratepilot.com/)

## Product surfaces

- Hotel and vacation-home search, property details, and checkout flows
- Customer accounts, trips, rewards, payments, and support
- AI-assisted travel planning
- Property-partner onboarding, inventory, rates, reservations, payouts, and analytics
- Administrative booking, customer, finance, property, content, and support tools
- Revenue recommendations, reporting, and upload workflows
- API routes and helpers for Supabase, Stripe, email, and external inventory adapters

The repository includes mock and integration-ready flows. It is not connected to Expedia, Booking.com, Hotels.com, or another hotel supplier by default, and the production-readiness work below remains required before accepting real bookings.

## Technology

- Next.js 16 App Router, React 19, and TypeScript
- Tailwind CSS
- Supabase PostgreSQL and authentication helpers
- Stripe and Stripe Connect helpers
- Vitest and ESLint
- Vercel deployment

## Local development

Use a current Node.js release compatible with Next.js 16 and npm.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Configure only the values needed for the flow you are developing, using test credentials and non-production data. The available settings and safe defaults are documented in [`.env.example`](.env.example).

Database-backed development requires a Supabase project with [`supabase/schema.sql`](supabase/schema.sql) applied.

## Validation

Run the complete repository gate before opening a pull request:

```bash
npm run check
```

The command runs linting, TypeScript checks, the Vitest suite, and a production build. Individual commands are also available:

| Command | Purpose |
| --- | --- |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Check TypeScript without emitting files |
| `npm test` | Run the Vitest suite once |
| `npm run build` | Create a production Next.js build |

## Project documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Booking lifecycle](docs/BOOKING-LIFECYCLE.md)
- [Payments](docs/PAYMENTS.md)
- [Supplier integration](docs/SUPPLIER-INTEGRATION.md)
- [Compliance considerations](docs/COMPLIANCE.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Roadmap](docs/ROADMAP.md)

## Before accepting real bookings

1. Provision Supabase, apply the schema, and configure row-level security and production access controls.
2. Replace mock inventory with a licensed supplier API or direct hotel contracts.
3. Complete Stripe Connect onboarding, production webhook verification, refund handling, and payout operations.
4. Obtain legal review for seller-of-travel requirements, terms, privacy, accessibility, cancellations, taxes, and chargebacks.
5. Configure transactional email, monitoring, incident response, backups, and customer-support procedures.
6. Complete end-to-end tests with supplier and payment sandboxes before enabling public booking flags.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) for the development and pull-request workflow. Report suspected vulnerabilities privately as described in [SECURITY.md](SECURITY.md); do not open a public issue for an unpatched security problem.

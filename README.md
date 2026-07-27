# iRatePilot Starter

A production-oriented starter for an online travel marketplace focused on 4- and 5-star hotels and vacation homes.

## Included

- Customer booking website
- Hotel search and property pages
- Mock checkout flow
- Customer account area
- Hotel partner dashboard
- Admin dashboard
- Revenue management dashboard
- API route stubs for search, bookings, partners, AI, and Stripe
- Supabase and Stripe helper modules
- Database schema
- Seed data and reusable UI components

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Before accepting real bookings

1. Create a Supabase project and run `supabase/schema.sql`.
2. Add your environment variables.
3. Replace mock inventory with a licensed hotel supplier API or direct hotel contracts.
4. Complete Stripe Connect onboarding and webhook verification.
5. Add seller-of-travel registrations where required.
6. Add legal review for terms, privacy, cancellations, taxes, and chargebacks.
7. Set up transactional email and 24/7 customer-service procedures.

This starter is not connected to Expedia, Booking.com, Hotels.com, or any other supplier by default.

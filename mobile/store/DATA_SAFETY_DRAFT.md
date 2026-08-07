# Mobile privacy and data-safety working draft

This is an engineering inventory, not legal advice. The product owner must verify it against production configuration, vendor contracts, retention rules, and store definitions before submission.

| Data | Purpose | Handling | Store disclosure review |
|---|---|---|---|
| Email address and Supabase user ID | Authentication and account management | Supabase Auth; encrypted session token stored on device | Personal info; account management |
| Booking dates, guests, property, room, status, confirmation code | Provide and manage reservations | iRatePilot/Supabase | App activity and purchase-related functionality |
| Reservation totals and Stripe payment references | Process and reconcile eligible payments | iRatePilot stores references/status; Stripe processes card data | Financial/purchase data; verify Stripe SDK answers |
| Expo push token and platform | Optional booking notifications | Stored under authenticated user with opt-out and RLS | Device or other identifiers; app functionality |
| Destination search text | Return hotel results | Sent to iRatePilot search API | Search history/app activity; verify retention and logging |
| Diagnostic/network metadata | Security, reliability, hosting | May be processed by Vercel, Supabase, Stripe, Expo, and platform providers | Verify provider settings and production logs |

## Current engineering safeguards

- No Supabase service-role, Stripe secret, webhook secret, or Expo server access token is placed in the app.
- Card details are entered in Stripe PaymentSheet.
- Push notification permission is optional and user initiated.
- Push tokens are user owned under row-level security and removable from the device.
- Production push delivery is disabled by default.
- Notification routes accept only an internal Trips route or a validated UUID booking route.

## Decisions still requiring owner/legal review

- Exact retention and deletion periods for accounts, bookings, payments, logs, and push tokens
- Whether data is linked to identity under Apple’s definitions
- Whether any data qualifies as collected, shared, or ephemeral under Google Play definitions
- Stripe, Supabase, Expo, and Vercel privacy disclosures and data-processing terms
- Account deletion entry point, completion timing, and legally required record retention
- Regional consent, age rating, tax, and travel-marketplace obligations
- Whether analytics, crash reporting, advertising, or tracking SDKs are added before release

# Flights Phase 1 Preview acceptance evidence

Recorded: August 18, 2026

## Scope

This acceptance applies only to the isolated Vercel project `iratepilotadmin-private-preview`. It does not authorize or record a change to the main `iratepilotadmin` project, `iratepilot.com`, airline or ticketing providers, environment variables, database migrations, payments, or Production traffic.

## Deployment

- Project ID: `prj_pasFoRHteHE1W0YZzQwjZrONDrNc`.
- Deployment ID: `ByA1VjmgenzEL9itMxJsx81cgX2q`.
- Deployment URL: `https://iratepilotadmin-private-preview-h7tffoh5c-irate-pilot.vercel.app`.
- Environment: Preview.
- Status: Ready.
- Framework Preset: Next.js.
- Build duration: 48 seconds.
- Source branch: `agent/align-homepage-pilot-claims`.
- Source commit: `6dcc07e82c00b5693ec6c532df7a0bbb33078d81` (`Add supplier-offline flight planning`).

The approved Git push triggered this deployment automatically. No manual redeploy, alias promotion, environment-variable change, database migration, provider credential, airline traffic, or Production change was required.

## Browser acceptance

The exact Preview deployment was opened at `/flights` and confirmed to:

- render the Flights navigation entry and supplier-offline Phase 1 planning page;
- accept `ORD` to `MIA`, departure September 10, 2026, return September 14, 2026, two travelers, and Business cabin;
- preserve those inputs in the request query;
- render the validated `ORD → MIA` planning summary;
- display `Live fares are unavailable` and state that nothing was searched externally or booked;
- state that no airline API request, payment, reservation, fare quote, or charge is made; and
- render with no Next.js error overlay or visible application-error state.

All airline content, live schedules, fares, availability, ticketing, payment, and Production traffic remain disabled pending the separate external activation gates.

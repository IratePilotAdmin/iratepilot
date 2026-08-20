# iRatePilot Car Rentals — Phase 1

Status: **Software complete locally; commit, private push, isolated Preview deployment, browser acceptance, supplier connectivity, reservations, payment, and Production remain pending**

## Purpose

Phase 1 adds an honest consumer car-rental planning surface at `/cars`. Travelers can prepare pickup and return locations, dates, times, a driver age range, and a preferred vehicle class. The request is validated locally and rendered as a planning summary only.

## Safety boundary

This phase contains no rental company, broker, aggregator, GDS, payment, protection-product, or reservation adapter. It cannot:

- query vehicles, fleets, locations, availability, rates, taxes, fees, mileage, fuel, deposits, protection products, or policies;
- claim a supplier relationship or quote a live, total, guaranteed, or bookable price;
- verify driver identity, age, license, residency, eligibility, or payment authorization;
- hold, reserve, modify, cancel, refund, or service a rental;
- collect payment, license images, passport data, or sensitive driver records; or
- send traveler data or make an external network request.

## Software acceptance gates

- [x] Add `/cars` to customer navigation, the footer, and the sitemap.
- [x] Validate location, date, time, return-location, driver-age-band, duration, and vehicle-class input without external traffic.
- [x] Display a validated planning summary while clearly stating that live vehicles, rates, policies, reservations, and payments are unavailable.
- [x] Add focused tests proving supplier-offline behavior and consumer disclosure coverage.
- [x] Pass ESLint, TypeScript, 1,108 tests across 249 files, and the optimized 114-page Next.js build.

## Release gates

- [ ] Commit and push the approved laptop changes after separate approval.
- [ ] Deploy to the isolated Preview project after separate approval.
- [ ] Complete browser acceptance at `/cars` without adding provider credentials or traffic.

## External activation gates

- [ ] Select and contract an authorized car-rental inventory and booking path.
- [ ] Receive sandbox credentials through an approved secure channel and define allowed endpoints.
- [ ] Complete provider certification for location search, availability, total pricing, policies, repricing, reservation, modification, cancellation, refund, and webhook security.
- [ ] Approve driver-data, eligibility, protection-product, deposit, payment, fraud, refund, dispute, accessibility, legal, support, and incident-response procedures.
- [ ] Complete controlled sandbox acceptance with recorded evidence and rollback support.
- [ ] Make a separate Production decision before enabling supplier traffic, reservations, or car-rental payments.

Software completion never authorizes a provider connection or live car-rental sale.

The complete planned development sequence is recorded in `docs/CAR_RENTALS_ROADMAP.md`.

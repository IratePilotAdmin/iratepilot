# iRatePilot Car Rentals — Phase 2

Status: **Software complete and repository-verified locally; commit, private publication, isolated Preview deployment, browser acceptance, and every external activation remain pending**

## Purpose

Phase 2 adds a protected, read-only supplier-readiness workspace at `/admin/cars`. It gives administrators a neutral framework for evaluating direct rental-company, broker, aggregator, and global-distribution-system paths without naming a preferred provider or implying a supplier relationship.

The workspace records the capabilities that later phases must certify and the eleven separately owned gates that must be satisfied before controlled integration work can advance.

## Safety boundary

Phase 2 is an evaluation model only. It cannot:

- contact, select, recommend, endorse, or claim a relationship with a supplier;
- send a message, submit a form, create a supplier account, accept terms, sign a contract, or make a payment;
- receive, store, expose, or use provider credentials;
- make a provider API or other external network request;
- search live locations, vehicles, availability, rates, taxes, fees, deposits, protection products, or policies;
- create, confirm, change, cancel, refund, reconcile, or service a reservation;
- modify the database or apply a migration; or
- authorize a Preview deployment, Production deployment, supplier traffic, reservation, or payment.

Even if evidence is recorded for all eleven gates, the model keeps supplier contact, account creation, credential acceptance, sandbox traffic, Production traffic, reservations, and payments disabled.

## Software acceptance gates

- [x] Add a protected `/admin/cars` route to administrator navigation only.
- [x] Define neutral direct-rental-company, broker, aggregator, and GDS evaluation paths without provider claims.
- [x] Define location and inventory, total pricing and policy, reservation lifecycle, and operational-control capability groups.
- [x] Define eleven independently owned activation gates that start incomplete.
- [x] Keep the workspace read-only and free of provider links, network calls, environment-secret access, server actions, and transactional controls.
- [x] Pass focused tests, ESLint, TypeScript, 1,113 tests across 250 files, and the optimized 115-page Next.js build.

## Release gates

- [ ] Commit the approved Phase 2 source after separate approval.
- [ ] Reconcile and push the approved private branch without force-push after separate approval.
- [ ] Deploy only to the isolated Preview project after separate approval.
- [ ] Complete authenticated browser acceptance at `/admin/cars` and record evidence after separate approval.

## External activation gates

- [ ] Approve a separate supplier-research boundary before researching named providers.
- [ ] Approve a separate contact boundary before sending any provider message or form.
- [ ] Select and contract an authorized inventory and reservation path.
- [ ] Receive sandbox credentials through an approved secret channel and define the exact endpoint allowlist.
- [ ] Complete inventory, total-price, policy, reservation-lifecycle, driver-data, payment, security, support, and sandbox certification.
- [ ] Complete controlled Preview and pilot evidence with observability, incident response, and rollback support.
- [ ] Make a separate Production decision before enabling any supplier traffic, reservation, or car-rental payment.

Software completion never authorizes supplier contact or live car-rental commerce.

# iRatePilot PMS Operating Manual

**Status:** Pilot draft; not yet an approved operating procedure for live guest stays. This guide describes workflows requested for the Red Roof Inn Ridgeland, Mississippi test property. Screen labels can change between releases.

### What is verified and what is still a demo

- The currently inspectable PMS screen at `iratepilot-recovery-20260923-pms-current.iratepilot-recovery-7561.workers.dev/demo` is a **sample demo** for “The Linden Hotel” (12 rooms). Its edits stay in the page and reset on reload. Do not use it to manage real reservations, guest records, room status, or folios.
- This manual is a guided draft, not proof that every workflow is enabled on the live Red Roof account. Confirm each action in the signed-in Red Roof property before using it operationally.
- Room status, reservation creation/assignment, walk-in, housekeeping, reports, payments, and ID capture still require end-to-end verification against the live PMS and its database. In particular, a visible camera preview does not prove that ID data was recognized or saved.
- The native iRatePilot.com connector has a Vercel Preview build, but that preview is protected by sign-in and its OTA routes have not been verified end to end. The live OTA API did not expose the expected connector routes in the last check. No real iRatePilot.com reservation should be expected to reach the PMS until sandbox round-trip testing succeeds.
- A production AI Hotel Assistant connected to authorized, live PMS data is not verified. Use the PMS records and reports as the source of truth.

Use the following steps for training and test records only until the owner confirms the corresponding workflow has passed a live, non-production test. Never test by changing or charging a real guest stay.

## 1. Sign in and choose the property

1. Open the PMS address supplied by iRatePilot and sign in with your work email and password.
2. Select the correct property from the property selector before changing rooms, reservations, rates, or reports.
3. Check the property name and local date at the top of the page. The operating date follows the property's configured time zone.
4. Use **Property settings** to review the property name, time zone, operating model, room setup, and other property-level details. Save only information that belongs to this property.

If access is denied, confirm that you are using the PMS account created for this property and that the owner or administrator has assigned your account the correct property and role.

## 2. Set up rooms and room types

An owner or authorized manager should configure the property before taking reservations.

1. Open **Property settings** and confirm the property uses **Hotel — individually bookable rooms**.
2. Open **Inventory** to review room types and physical room numbers.
3. Add or edit each room type with its name, occupancy limit, and inventory count.
4. Add the physical room numbers that belong to each room type. Keep room numbers unique within the property.
5. Save, refresh, and verify the total room count on the property dashboard.

When changing the total room count, make sure the physical room list agrees with the inventory count. Do not delete a room that has an active stay or future reservation; move or resolve those reservations first.

## 3. Configure rates, taxes, and fees

1. Open **Rates & plans** and create or review an active rate plan, such as **BAR Rate**.
2. Set the nightly rate for the relevant room type and effective dates. A reservation should load the saved rate for the selected room type and stay date; review the quoted total before booking.
3. Configure applicable taxes and fees in the property's tax and fee settings. Use separate entries for city tax, state tax, lodging tax, resort fee, and technology fee when they apply.
4. Set each tax or fee's calculation method, amount or percentage, applicability, and whether it is per night or per stay.
5. Save and verify a sample one-night quote, including the nightly price, taxes, fees, and total.

Tax names and rates depend on the property's jurisdiction. Have the property owner or tax professional confirm the actual rates and rules before taking real payments.

If the quote shows **No active plan** or **Capacity is not configured**, check that a rate plan is active for the stay date and that capacity is configured for every date and room type in the requested stay.

## 4. Read the daily dashboard and room rack

The **Today** page summarizes the property's operating day. Review the arrival date and selected property first.

- **In house** shows guests currently checked in.
- **Arrivals today** shows reservations expected to arrive today.
- **Departures today** shows guests expected to check out today.
- **Rooms to prepare** highlights rooms that need turnover work.

Use the room rack filters to view **All**, **Ready**, **In house**, **To prepare**, **Clean**, **Dirty**, or **Maintenance** rooms. Select a room number to open that room's actions and details. If multi-room selection is available, verify the selected room numbers before applying a bulk status change.

## 5. Make a reservation or walk-in

### Book a future stay

1. Select **New reservation** or **Book from a rate plan**.
2. Select the room type, active rate plan, arrival and departure dates, and guest count.
3. Refresh the price if you change room type, rate plan, or dates. Review the nightly price, tax, fee, and total breakdown.
4. Enter the primary guest's details and billing details. Billing details are for the party responsible for payment; use **Same as guest** when the guest is also paying, if that option is shown.
5. Review the cancellation and payment terms, required acknowledgements, and stay dates. Submit **Book this stay** once.
6. Confirm that a reservation number appears before creating another booking.
7. Use the reservation's room assignment action to assign a physical room now or leave it unassigned for later, according to property policy.

If booking reports that capacity is not configured for a date, stop and correct inventory for that date. A quote does not hold a room until the reservation is successfully booked.

### Walk-in from a room

1. Select an available room number from the room rack and choose **Walk-in check-in**.
2. Enter the guest's legal name and required contact details. Use the ID or passport scan option only where permitted by local law and property policy.
3. On a tablet, allow camera access and use the rear camera when available. On a computer, use the connected webcam or upload a clear image. Keep the full document inside the frame and avoid glare.
4. Capture or upload the document image, review every suggested field, and correct mistakes before saving. Add phone and email separately when they are not read from the document.
5. Do not save a full document image, document number, or birth date unless the property has a lawful reason and an approved retention policy. Do not treat OCR suggestions as verified identity.
6. Confirm the room type, room number, dates, guest count, automatic rate, taxes, fees, and total.
7. Review the folio/payment step. Record only a payment processed through the configured provider or an authorized cashier method. Never type raw card numbers into notes or the guest profile.
8. Complete check-in only after the guest details and payment/deposit state are correct. Confirm the room shows **In house**.

If the camera preview opens but no fields populate, the scan has not been verified. Use the upload/manual-entry path and contact the PMS owner before relying on automatic ID capture.

## 6. Assign or change a room

For a future reservation, open the reservation and choose **Assign room**. Select a physical room of the correct room type that is not occupied or blocked for the stay dates. Review date overlap and room status before saving.

To move an in-house guest, open the reservation, choose **Room move**, select the destination room, and confirm the effective time. Verify that the old and new room statuses are correct afterward.

Rooms marked **Dirty** or **Maintenance** should normally be excluded from assignment. Use an override only if the PMS presents one, the property policy permits it, and a manager confirms the room can be safely occupied. Never check in a guest to a room that is unsafe or unavailable.

## 7. Check in, take payment, and check out

### Check in

1. Open **Arrivals today** or find the reservation.
2. Verify the guest, stay dates, assigned room, occupancy, registration details, and deposit/payment balance.
3. Complete the property's registration and identity checks.
4. Record any authorized payment or deposit in the folio.
5. Select **Check in** and confirm the guest appears in **In house**.

### Folio and payment

Use the reservation's folio to review room charges, taxes, resort/technology fees, payments, deposits, adjustments, and balance. Explain charges to the guest before collecting. Use the configured payment provider or approved cashier procedure. A PMS folio entry by itself does not prove that a card was charged or that funds settled.

### Check out

1. Open **Departures today** or the guest's reservation.
2. Review the folio, room nights, fees, payments, refunds, and outstanding balance.
3. Resolve the balance using an authorized payment or adjustment workflow.
4. Select **Check out** and confirm the reservation is no longer in house.
5. Confirm the room changes to the property's turnover status so housekeeping can prepare it.

Do not issue a refund from the folio unless the payment provider confirms the refund workflow and the user has the required permission.

## 8. Housekeeping and maintenance

Select the room number and choose its status or work action.

- **Dirty:** the room needs cleaning.
- **Clean:** housekeeping has completed the clean.
- **Ready:** the room has completed the property's required readiness/inspection check and may be assigned.
- **Maintenance:** the room is unavailable because an issue needs resolution.

When a room is dirty, create or assign the housekeeping task, clean it, and update its status only after the work is complete. When an issue is found, place the room in maintenance, record a concise work order, and keep it unavailable until an authorized person resolves and inspects it. Add the completion note and return the room to the proper clean/ready state.

For bulk room updates, confirm the selected room list and target status before saving. Never bulk-mark occupied rooms clean or ready.

## 9. Reports and end-of-day review

Open **Reports** for the daily statistics and select the operating date and property. Compare arrivals, departures, occupancy, room revenue, taxes/fees, payment totals, cancellations, and no-shows against the room rack and folios. Use **Folio reports**, **Balance follow-up**, **Security deposits**, and **Service-day close** for their named tasks when available.

Before closing the service day, reconcile cash/card totals with the payment provider or cashier records, investigate unpaid balances and unmatched payments, review room-status exceptions, and record manager notes. A report is not a substitute for provider settlement or bank reconciliation.

## 10. Users, permissions, and audit trail

Owners should grant each staff member the least access needed for their role. Managers should review property scope and role before editing rooms, rates, reservations, balances, or staff access. Use the activity/audit view to check who made an important change and when. Do not share accounts or passwords.

## 11. iRatePilot.com and other OTA connections

The native iRatePilot.com connector is a separate integration setup from ordinary PMS reservations. A saved connection is not automatically live. Before expecting a web booking to reach the PMS, an administrator must verify the OTA property listing, property/room/rate mapping, connector migrations, sandbox settings, and the end-to-end reservation acknowledgement. Keep the connector disabled until the sandbox round trip is accepted.

This connector does not by itself activate Expedia, Booking.com, Agoda, Airbnb, Google Hotel, or a chain CRS. Those require their own provider authorization, mappings, testing, and certification.

## 12. Revenue recommendations, AI Hotel Assistant, and known limitations

The iRatePilot.com Partner Center includes a pilot revenue recommendation workflow. It reads property-authorized daily input rows for a 90-day window and creates recommendations for manager review. The current recommendation formula is deterministic and uses supplied occupancy, current rate, optional competitor rate, prior-year occupancy, and event notes; it is **not yet a validated machine-learning demand forecast**. Automatic price changes are disabled. Review the reason and rate before approving any recommendation. Approval may update iRatePilot.com inventory and does not by itself prove that a rate was synchronized to the PMS or another channel. A new atomic generation and tenant-scope database migration is currently on the protected Preview branch only; it has not been applied to a hosted database, so its release still requires isolated staging verification.

The product goal includes an AI Hotel Assistant that answers questions from the signed-in user's authorized property data. **A production-ready assistant connected to live PMS data has not been verified in this pilot.** Until the assistant is visible and its property scoping is tested, use the dashboard and reports as the source of operational counts. Never rely on an AI response to approve a payment, refund, room safety decision, or destructive change without checking the PMS record and required manager authorization.

## 13. Quick troubleshooting

| What you see | What to check |
| --- | --- |
| **No active plan** | Active rate plan, room-type rate, and effective date range. |
| **Capacity is not configured** | Inventory/capacity for every night and selected room type. |
| **Room cannot be assigned** | Room type, date overlap, room status, and current reservation assignment. |
| **Book this stay appears to do nothing** | Read any validation message, confirm required fields/acknowledgements, refresh the quote, then check the reservation list before retrying. |
| **ID scan preview appears but fields stay blank** | Capture/upload a clear document image; review suggestions; enter fields manually if OCR did not run. |
| **Payment or balance is unclear** | Check the folio and payment-provider status; do not repeat a charge until you confirm whether the first attempt succeeded. |
| **OTA booking does not appear** | Check that listing, mapping, sandbox connection, capture/delivery controls, and the source booking acknowledgement are all enabled and accepted. |

For an unresolved problem, note the property, room or reservation reference, date/time, screen, and exact message. Do not include passwords, card numbers, full ID images, or full document numbers in a support request.

## 14. Supervised pilot acceptance checklist

Run this checklist only in a named, isolated non-production property with synthetic guest data and test payment credentials. Do not use a live guest stay as a test. Record evidence references without guest names, identity data, payment details, or secrets. An item remains **Not tested** until its end-to-end result is observed in the application and confirmed in the relevant property record or provider sandbox.

| Area | Acceptance check | Result / evidence reference |
| --- | --- | --- |
| Access | Owner, manager, and front-desk roles can sign in; a user cannot access another property outside their assigned scope. | Not tested |
| Property setup | Property time zone, hotel operating model, room types, unique room numbers, occupancy limits, and capacity agree. | Not tested |
| Rates and charges | An active rate returns the expected nightly price; city/state/lodging taxes and resort/technology fees calculate correctly for one night and multiple nights. | Not tested |
| Reservation lifecycle | Create, retrieve, modify, assign, cancel, and no-show a synthetic booking; retries do not create duplicate reservations. | Not tested |
| Room assignment | Assign a future reservation, reject an overlapping assignment, and move a test stay while preserving the audit trail. | Not tested |
| Walk-in and ID capture | Complete a synthetic walk-in; test camera and image upload separately; verify any extracted fields are reviewable and only permitted fields are saved. | Not tested |
| Payment and folio | In the provider's test mode, verify authorization/deposit, payment failure, duplicate-submit handling, folio balance, refund or void, and reconciliation. No raw card data may enter PMS fields. | Not tested |
| Check-in and checkout | Complete a synthetic arrival and departure; confirm reservation, folio, payment state, room state, and timestamps agree afterward. | Not tested |
| Housekeeping and maintenance | Change a vacant room through dirty, clean/inspected, ready, and maintenance states; test bulk selection on multiple test rooms and confirm occupied rooms are protected. | Not tested |
| Reports and service-day close | Compare occupancy, ADR, RevPAR, revenue, taxes/fees, payment totals, arrivals/departures, cancellations, and no-shows with the underlying synthetic reservations and folios. | Not tested |
| OTA round trip | In a sandbox only, publish test ARI, create a synthetic OTA booking, confirm PMS acknowledgement and mapping, then modify and cancel it; confirm idempotency and audit records. | Not tested |
| Mobile and browsers | Repeat core arrival, room status, and reservation checks in desktop Chrome, iPad Safari, and Android Chrome at supported viewport sizes. | Not tested |
| Backup and recovery | Complete an isolated backup restore drill and verify restored records, tenant boundaries, and recovery evidence before any production cutover. | Not tested |

**Pilot decision:** Not accepted. A launch owner should record the test date, build/version, isolated property reference, operator, blocking findings, remediation owner, and final approval after the required checks pass. A Preview build, local automated tests, or a demo walkthrough alone does not pass this checklist.

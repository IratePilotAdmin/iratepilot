# Private-Pilot Customer Onboarding

Use this checklist for each customer invited to test iRatePilot during the private pilot.

## Eligibility

- Customer is specifically invited by the pilot team.
- Customer understands that the service is in private pilot and uses test-mode payments.
- Customer agrees not to treat test confirmations as real travel reservations.
- Customer has a valid email address and an individual account.

## Invitation sequence

1. Send a private invitation that identifies the pilot as test-only.
2. Explain that no real travel purchase is being made and no real hotel stay is guaranteed.
3. Provide the approved support channel and expected response times.
4. Customer creates an individual account and verifies email access.
5. Customer reviews the pilot privacy, communication, and acceptable-use notice.
6. Customer completes one guided search and booking-request flow.
7. Customer completes Stripe test checkout only with approved test credentials.
8. Customer verifies Trips, payment history, notifications, and booking messages.
9. Customer tests cancellation or refund only when assigned as part of the pilot script.
10. Record completion and any defects in the release or pilot evidence log.

## Customer safety notices

Every invited customer must be told:

- the pilot does not accept real payment cards;
- confirmations are test records unless explicitly stated otherwise after a future public-launch approval;
- demonstration or pilot bookings must not be used for actual travel;
- passwords, card details, identity documents, and secret keys must never be sent through support messages;
- support may ask for a booking code or account email but not a password or full card number.

## Access controls

- Each customer uses a separate account.
- Customers can view only their own trips, messages, payments, rewards, and notifications.
- Customers cannot access partner or admin functions.
- Test accounts must not use another person's identity or email without authorization.

## Test scenarios

Assign only the minimum scenarios needed for validation:

- Registration and login
- Search and property details
- Booking request
- Partner approval or rejection
- Stripe test checkout
- Confirmation and Trips display
- Customer-partner messaging
- Unpaid booking cancellation
- Paid test-booking refund
- Notification and email delivery

Do not ask every customer to perform destructive or financial test cases. Coordinate cancellation and refund tests to avoid duplicate inventory changes.

## Feedback collection

Collect:

- task completed;
- device and browser;
- page or workflow involved;
- expected result;
- actual result;
- booking or test reference code;
- screenshot only when it contains no secrets, payment data, or unnecessary personal information.

Classify urgent security, payment-integrity, inventory, or access-isolation defects using `docs/INCIDENT_SEVERITY.md`.

## Removal and pause

Immediately suspend an account from pilot activity when:

- unauthorized access or account sharing is suspected;
- real payment information is entered or requested;
- the customer attempts to use a test booking for real travel;
- repeated abusive, fraudulent, or unsafe activity occurs;
- a Severity 0 or Severity 1 incident requires customer access to be paused.

## Completion criteria

Customer onboarding is complete when:

- invitation and test-only disclosure are acknowledged;
- account and email verification work;
- assigned test scenarios are completed;
- feedback is recorded;
- no unresolved security, privacy, payment, or access-isolation issue affects the account.

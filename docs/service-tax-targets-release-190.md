# Named service tax targets

Migration 190 calculates fixed city, state, lodging and legacy tax targets from the folio opening and effective reversal classifications. Unresolved classification returns no fixed target. The forward preview includes target tax balances and suggested signed changes in its review fingerprint. A before-insert guard prevents approving a forward correction that does not reach each known target, even when its aggregate tax amount is correct.

Local tests against the numbered migration cover hotel and home legacy corrections through service close, journal posting, trial balance and accounting-period closure. Named-tax tests cover city/state changes, unchanged lodging targets, rejection of an incorrect category split, approval of the correct split, and distinct ledger source components after service close. Original service records are historical test fixtures; approval and subsequent close/posting operations use application APIs.

Installation tests preserve existing records, restore the previous preview function after an injected failure, and verify that helper functions remain inaccessible to application roles.

Not installed live. Frontend display of tax targets, named-tax journal account coverage, concurrency with classification changes, and individual resort/technology/cleaning fee reconciliation still require work. No jurisdiction-specific tax rules have been certified by these tests.
